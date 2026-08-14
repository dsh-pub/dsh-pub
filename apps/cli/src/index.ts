import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';

import { parseDocument, type ScalarTag } from 'yaml';

const DEFAULT_PROFILE = 'web';
const DEFAULT_REGISTRY = 'https://dsh.pub';
const TELEMETRY_TIMEOUT_MS = 2_000;

const dshJsExpressionTag: ScalarTag = {
  tag: 'tag:yaml.org,2002:js',
  resolve: (value) => value,
};

export interface GitHubRepository {
  cloneUrl: string;
  repository: string;
}

export interface AddCommandOptions {
  command: 'add';
  dryRun: boolean;
  path?: string;
  profile: string;
  ref?: string;
  registry: string;
  repository: GitHubRepository;
}

export interface ProcessResult {
  exitCode: number;
}

export interface AddCommandDependencies {
  env: NodeJS.ProcessEnv;
  fetch: typeof globalThis.fetch;
  log: (message: string) => void;
  removeDirectory: (directory: string) => Promise<void>;
  runProcess: (command: string, args: string[]) => Promise<ProcessResult>;
}

const usage = `Usage:
  npx dshpub add owner/repo [--ref tag] [--path subdir] [--profile web] [--registry URL] [--dry-run]`;

const optionNames = new Set(['--ref', '--path', '--profile', '--registry']);

const readOption = (args: string[], index: number) => {
  const name = args[index];
  const value = args[index + 1];
  if (!name || !optionNames.has(name)) {
    throw new Error(`Unknown option: ${name ?? ''}\n\n${usage}`);
  }
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${name}\n\n${usage}`);
  }
  return value;
};

export const normalizeGitHubRepository = (input: string): GitHubRepository => {
  let repository = input.trim();

  if (repository.startsWith('git@github.com:')) {
    repository = repository.slice('git@github.com:'.length);
  } else if (/^https?:\/\//i.test(repository)) {
    let url: URL;
    try {
      url = new URL(repository);
    } catch {
      throw new Error(`Invalid GitHub repository: ${input}`);
    }
    if (url.hostname.toLowerCase() !== 'github.com' || url.username || url.password) {
      throw new Error(`Only github.com repository URLs are supported: ${input}`);
    }
    if (url.search || url.hash) {
      throw new Error(`GitHub repository URLs cannot include a query or fragment: ${input}`);
    }
    repository = url.pathname.replace(/^\//, '');
  }

  repository = repository.replace(/\.git$/i, '').replace(/\/$/, '');
  const parts = repository.split('/');
  if (
    parts.length !== 2 ||
    parts.some((part) => !/^[A-Za-z0-9_.-]+$/.test(part) || part === '.' || part === '..')
  ) {
    throw new Error(`Expected a GitHub repository in owner/repo form: ${input}`);
  }

  const normalized = `${parts[0]}/${parts[1]}`;
  return {
    cloneUrl: `https://github.com/${normalized}.git`,
    repository: normalized,
  };
};

const normalizeRegistry = (input: string) => {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error(`Invalid registry URL: ${input}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Registry URL must use http or https');
  }
  return url.toString().replace(/\/$/, '');
};

const validateRelativePath = (path: string) => {
  const parts = path.split(/[\\/]/);
  if (
    isAbsolute(path) ||
    parts.some(
      (part) =>
        !part || part === '.' || part === '..' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part),
    )
  ) {
    throw new Error('--path must be a relative path inside the repository');
  }
  return parts.join('/');
};

const validateGitRef = (ref: string) => {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/.test(ref) ||
    ref.includes('..') ||
    ref.includes('//') ||
    ref.endsWith('/') ||
    ref.endsWith('.') ||
    ref.endsWith('.lock')
  ) {
    throw new Error('--ref must be a safe Git branch, tag, or commit');
  }
  return ref;
};

export const parseCliArgs = (args: string[]): AddCommandOptions => {
  if (args[0] !== 'add' || !args[1] || args[1].startsWith('--')) {
    throw new Error(usage);
  }

  let dryRun = false;
  let path: string | undefined;
  let profile = DEFAULT_PROFILE;
  let ref: string | undefined;
  let registry = DEFAULT_REGISTRY;

  for (let index = 2; index < args.length; index += 1) {
    const name = args[index];
    if (name === '--dry-run') {
      dryRun = true;
      continue;
    }
    const value = readOption(args, index);
    index += 1;
    if (name === '--ref') {
      ref = validateGitRef(value);
    }
    if (name === '--path') path = validateRelativePath(value);
    if (name === '--profile') profile = value;
    if (name === '--registry') registry = normalizeRegistry(value);
  }

  return {
    command: 'add',
    dryRun,
    ...(path ? { path } : {}),
    profile,
    ...(ref ? { ref } : {}),
    registry,
    repository: normalizeGitHubRepository(args[1]),
  };
};

export const assertInstallableTarget = async (target: string) => {
  let manifest: unknown;
  try {
    manifest = JSON.parse(await readFile(join(target, 'package.json'), 'utf8')) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : '';
    throw new Error(`Install target must contain a valid package.json${detail}`);
  }

  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    !('dsh' in manifest) ||
    typeof manifest.dsh !== 'object' ||
    manifest.dsh === null ||
    !('bundle' in manifest.dsh) ||
    typeof manifest.dsh.bundle !== 'object' ||
    manifest.dsh.bundle === null ||
    !('patch' in manifest.dsh.bundle) ||
    typeof manifest.dsh.bundle.patch !== 'string' ||
    manifest.dsh.bundle.patch.trim() === ''
  ) {
    throw new Error('Install target package.json must declare dsh.bundle.patch');
  }

  const patch = manifest.dsh.bundle.patch.trim();
  if (isAbsolute(patch)) {
    throw new Error('dsh.bundle.patch must be a relative path inside the install target');
  }

  const targetRealPath = await realpath(target);
  const declaredPatch = resolve(targetRealPath, patch);
  const declaredRelativePath = relative(targetRealPath, declaredPatch);
  if (declaredRelativePath.startsWith('..') || isAbsolute(declaredRelativePath)) {
    throw new Error('dsh.bundle.patch must stay inside the install target');
  }

  let patchRealPath: string;
  try {
    patchRealPath = await realpath(declaredPatch);
  } catch {
    throw new Error('The file declared by dsh.bundle.patch must exist');
  }
  const patchRelativePath = relative(targetRealPath, patchRealPath);
  if (patchRelativePath.startsWith('..') || isAbsolute(patchRelativePath)) {
    throw new Error('dsh.bundle.patch must stay inside the install target');
  }
  if (!(await stat(patchRealPath)).isFile()) {
    throw new Error('dsh.bundle.patch must point to a regular file');
  }

  const patchDocument = parseDocument(await readFile(patchRealPath, 'utf8'), {
    customTags: [dshJsExpressionTag],
  });
  const yamlIssue = patchDocument.errors[0] ?? patchDocument.warnings[0];
  if (yamlIssue) {
    throw new Error(`dsh.bundle.patch must contain valid DSH YAML: ${yamlIssue}`);
  }
  const patchEntries = patchDocument.toJS() as unknown;
  if (
    !Array.isArray(patchEntries) ||
    patchEntries.some(
      (entry) => typeof entry !== 'object' || entry === null || Array.isArray(entry),
    )
  ) {
    throw new Error('dsh.bundle.patch must contain an array of patch entries');
  }
};

const defaultRunProcess: AddCommandDependencies['runProcess'] = (command, args) =>
  new Promise((resolveProcess, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${command} terminated by signal ${signal}`));
        return;
      }
      resolveProcess({ exitCode: code ?? 1 });
    });
  });

const isTelemetryDisabled = (env: NodeJS.ProcessEnv) =>
  Boolean(env.DO_NOT_TRACK) || Boolean(env.DISABLE_TELEMETRY);

const postTelemetry = async (
  fetchImplementation: typeof globalThis.fetch,
  url: string,
  body: Record<string, string>,
) => {
  try {
    const response = await fetchImplementation(url, {
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      signal: AbortSignal.timeout(TELEMETRY_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Registry returned HTTP ${response.status}`);
  } catch {
    // Install telemetry is best-effort and must never change the local install result.
  }
};

const slugPart = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const createInstallSlug = (repository: string, path?: string) => {
  const repositorySlug = repository.split('/').map(slugPart).join('--');
  const pathSlug = path?.split('/').map(slugPart).filter(Boolean).join('--');
  return pathSlug ? `${repositorySlug}--${pathSlug}` : repositorySlug;
};

export const createGitInstallSpec = (cloneUrl: string, commit: string, path?: string) =>
  `${cloneUrl}#${commit}${path ? `&path:/${path}` : ''}`;

const resolveTarget = async (cloneDirectory: string, path?: string) => {
  const target = resolve(cloneDirectory, path ?? '.');
  const [cloneRealPath, targetRealPath] = await Promise.all([
    realpath(cloneDirectory),
    realpath(target),
  ]);
  const targetRelativePath = relative(cloneRealPath, targetRealPath);
  if (targetRelativePath.startsWith('..') || isAbsolute(targetRelativePath)) {
    throw new Error('--path must stay inside the cloned repository');
  }
  return targetRealPath;
};

export const runAddCommand = async (
  options: AddCommandOptions,
  dependencyOverrides: Partial<AddCommandDependencies> = {},
) => {
  const dependencies: AddCommandDependencies = {
    env: process.env,
    fetch: globalThis.fetch,
    log: console.log,
    removeDirectory: (directory) => rm(directory, { force: true, recursive: true }),
    runProcess: defaultRunProcess,
    ...dependencyOverrides,
  };
  const slug = createInstallSlug(options.repository.repository, options.path);
  const eventId = randomUUID();
  const telemetryEnabled = !isTelemetryDisabled(dependencies.env);

  if (options.dryRun) {
    const refDescription = options.ref ? ` at ref ${options.ref}` : '';
    dependencies.log(
      `Would fetch ${options.repository.cloneUrl}${refDescription} into a temporary validation checkout.`,
    );
    dependencies.log(
      `Would validate ${options.path ?? '.'}/package.json declares dsh.bundle.patch.`,
    );
    dependencies.log(
      `Would run: dsh plugin --profile ${options.profile} add <exact Git commit spec>`,
    );
    dependencies.log(
      telemetryEnabled
        ? `Would report an anonymous install intent and, only after success, completion to ${options.registry}.`
        : 'Telemetry is disabled; no registry requests would be sent.',
    );
    return;
  }

  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'dsh-pub-'));
  const cloneDirectory = join(temporaryDirectory, 'repository');
  let commit: string;
  try {
    const gitCommands = [
      ['init', cloneDirectory],
      [
        '-C',
        cloneDirectory,
        'fetch',
        '--depth',
        '1',
        options.repository.cloneUrl,
        options.ref ?? 'HEAD',
      ],
      ['-C', cloneDirectory, 'checkout', '--detach', 'FETCH_HEAD'],
    ];
    for (const args of gitCommands) {
      const result = await dependencies.runProcess('git', args);
      if (result.exitCode !== 0) {
        throw new Error(
          `git ${args.includes('fetch') ? 'fetch' : args.at(-2)} failed with exit code ${result.exitCode}`,
        );
      }
    }

    const target = await resolveTarget(cloneDirectory, options.path);
    await assertInstallableTarget(target);
    commit = (await readFile(join(cloneDirectory, '.git', 'HEAD'), 'utf8')).trim().toLowerCase();
    if (!/^[0-9a-f]{40}$/.test(commit)) {
      throw new Error('Git checkout did not resolve to an exact commit');
    }
  } finally {
    await dependencies.removeDirectory(temporaryDirectory);
  }

  if (telemetryEnabled) {
    await postTelemetry(dependencies.fetch, `${options.registry}/api/install-intents`, {
      eventId,
      slug,
      version: commit,
    });
  }

  const installSpec = createGitInstallSpec(options.repository.cloneUrl, commit, options.path);
  const installResult = await dependencies.runProcess('dsh', [
    'plugin',
    '--profile',
    options.profile,
    'add',
    installSpec,
  ]);
  if (installResult.exitCode !== 0) {
    throw new Error(`dsh plugin add failed with exit code ${installResult.exitCode}`);
  }

  if (telemetryEnabled) {
    await postTelemetry(dependencies.fetch, `${options.registry}/api/install-completions`, {
      eventId,
    });
  }
  dependencies.log(
    `Installed ${options.repository.repository}${options.path ? `/${options.path}` : ''}.`,
  );
};

export const runCli = async (args: string[]) => runAddCommand(parseCliArgs(args));

export { usage };
