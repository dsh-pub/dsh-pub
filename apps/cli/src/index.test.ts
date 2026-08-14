import { access, mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  assertInstallableTarget,
  createGitInstallSpec,
  normalizeGitHubRepository,
  parseCliArgs,
  runAddCommand,
  type AddCommandDependencies,
  type AddCommandOptions,
  usage,
} from './index.js';

const temporaryDirectories: string[] = [];
const resolvedCommit = '0123456789abcdef0123456789abcdef01234567';

const createTemporaryDirectory = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-pub-test-'));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('GitHub repository input', () => {
  it('documents the canonical npm command', () => {
    expect(usage).toContain('npx dshpub add owner/repo');
    expect(usage).not.toContain('https://dsh.pub/cli/');
  });

  it.each([
    ['owner/repo', 'owner/repo'],
    ['https://github.com/owner/repo', 'owner/repo'],
    ['https://github.com/owner/repo.git', 'owner/repo'],
    ['git@github.com:owner/repo.git', 'owner/repo'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeGitHubRepository(input)).toEqual({
      cloneUrl: 'https://github.com/owner/repo.git',
      repository: expected,
    });
  });

  it('parses the documented add command', () => {
    expect(
      parseCliArgs([
        'add',
        'owner/repo',
        '--ref',
        'v1.2.0',
        '--path',
        'packages/web',
        '--profile',
        'web',
        '--registry',
        'https://registry.example/',
      ]),
    ).toEqual({
      command: 'add',
      dryRun: false,
      path: 'packages/web',
      profile: 'web',
      ref: 'v1.2.0',
      registry: 'https://registry.example',
      repository: {
        cloneUrl: 'https://github.com/owner/repo.git',
        repository: 'owner/repo',
      },
    });
  });

  it('rejects non-GitHub URLs and paths that can escape the clone', () => {
    expect(() => normalizeGitHubRepository('https://example.com/owner/repo')).toThrow(
      'Only github.com',
    );
    expect(() => parseCliArgs(['add', 'owner/repo', '--path', '../outside'])).toThrow(
      '--path must be a relative path',
    );
    expect(() => parseCliArgs(['add', 'owner/repo', '--path', 'packages/web&path:/other'])).toThrow(
      '--path must be a relative path',
    );
    expect(() => parseCliArgs(['add', 'owner/repo', '--ref', 'main&path:/other'])).toThrow(
      '--ref must be a safe Git',
    );
  });

  it('creates a commit-pinned pnpm Git subdirectory spec', () => {
    expect(
      createGitInstallSpec('https://github.com/owner/repo.git', resolvedCommit, 'packages/web'),
    ).toBe(`https://github.com/owner/repo.git#${resolvedCommit}&path:/packages/web`);
  });
});

describe('installable target validation', () => {
  it('requires package.json to declare a patch file inside the install target', async () => {
    const directory = await createTemporaryDirectory();
    await writeFile(
      join(directory, 'package.json'),
      JSON.stringify({ dsh: { bundle: { patch: './dsh.patch.json' } } }),
    );
    await writeFile(
      join(directory, 'dsh.patch.json'),
      '- id: test-bundle\n  config: !!js |\n    ({ enabled: true })\n',
    );

    await expect(assertInstallableTarget(directory)).resolves.toBeUndefined();

    await writeFile(join(directory, 'package.json'), JSON.stringify({ dsh: { bundle: {} } }));
    await expect(assertInstallableTarget(directory)).rejects.toThrow('dsh.bundle.patch');

    await writeFile(
      join(directory, 'package.json'),
      JSON.stringify({ dsh: { bundle: { patch: null } } }),
    );
    await expect(assertInstallableTarget(directory)).rejects.toThrow('dsh.bundle.patch');
  });

  it('rejects a missing, absolute, or escaping bundle patch', async () => {
    const directory = await createTemporaryDirectory();
    const manifest = (patch: string) =>
      writeFile(join(directory, 'package.json'), JSON.stringify({ dsh: { bundle: { patch } } }));

    await manifest('./missing.patch.yml');
    await expect(assertInstallableTarget(directory)).rejects.toThrow('must exist');

    await manifest('/tmp/outside.patch.yml');
    await expect(assertInstallableTarget(directory)).rejects.toThrow('relative path');

    await manifest('../outside.patch.yml');
    await expect(assertInstallableTarget(directory)).rejects.toThrow('inside the install target');
  });

  it('rejects a bundle patch symlink that escapes the install target', async () => {
    const directory = await createTemporaryDirectory();
    const outside = await createTemporaryDirectory();
    await writeFile(join(outside, 'outside.patch.yml'), '{}');
    await writeFile(
      join(directory, 'package.json'),
      JSON.stringify({ dsh: { bundle: { patch: './cordis.patch.yml' } } }),
    );
    await symlink(join(outside, 'outside.patch.yml'), join(directory, 'cordis.patch.yml'));

    await expect(assertInstallableTarget(directory)).rejects.toThrow('inside the install target');
  });

  it('rejects a bundle patch path that resolves to a directory', async () => {
    const directory = await createTemporaryDirectory();
    await mkdir(join(directory, 'cordis.patch.yml'));
    await writeFile(
      join(directory, 'package.json'),
      JSON.stringify({ dsh: { bundle: { patch: './cordis.patch.yml' } } }),
    );

    await expect(assertInstallableTarget(directory)).rejects.toThrow('regular file');
  });

  it.each([
    ['malformed YAML', '[', 'valid DSH YAML'],
    ['an unknown scalar tag', '- id: test\n  config: !js expression\n', 'valid DSH YAML'],
    ['a non-scalar !!js tag', '- id: test\n  config: !!js [1, 2]\n', 'valid DSH YAML'],
    ['an object root', 'id: not-a-list\n', 'array'],
    ['a scalar list entry', '- invalid\n', 'array'],
  ])('rejects %s before installation', async (_label, patch, expected) => {
    const directory = await createTemporaryDirectory();
    await writeFile(
      join(directory, 'package.json'),
      JSON.stringify({ dsh: { bundle: { patch: './cordis.patch.yml' } } }),
    );
    await writeFile(join(directory, 'cordis.patch.yml'), patch);

    await expect(assertInstallableTarget(directory)).rejects.toThrow(expected);
  });

  it('accepts an empty DSH patch list', async () => {
    const directory = await createTemporaryDirectory();
    await writeFile(
      join(directory, 'package.json'),
      JSON.stringify({ dsh: { bundle: { patch: './cordis.patch.yml' } } }),
    );
    await writeFile(join(directory, 'cordis.patch.yml'), '[]\n');

    await expect(assertInstallableTarget(directory)).resolves.toBeUndefined();
  });
});

const options: AddCommandOptions = {
  command: 'add',
  dryRun: false,
  path: 'packages/web',
  profile: 'web',
  ref: 'v1.2.0',
  registry: 'https://registry.example',
  repository: {
    cloneUrl: 'https://github.com/owner/repo.git',
    repository: 'owner/repo',
  },
};

const setupWorkflow = async (dshExitCode = 0) => {
  const events: string[] = [];
  let clonedTo: string | undefined;
  const fetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body)) as { eventId: string };
    events.push(
      url.endsWith('install-intents') ? `intent:${body.eventId}` : `complete:${body.eventId}`,
    );
    return new Response(null, { status: 204 });
  });
  const runProcess: AddCommandDependencies['runProcess'] = vi.fn(async (command, args) => {
    events.push(`${command}:${args.join(' ')}`);
    if (command === 'git' && args[0] === 'init') {
      const cloneDirectory = args[1];
      if (!cloneDirectory) throw new Error('missing clone directory');
      clonedTo = cloneDirectory;
      const target = join(cloneDirectory, 'packages/web');
      await mkdir(join(cloneDirectory, '.git'), { recursive: true });
      await mkdir(target, { recursive: true });
      await writeFile(join(cloneDirectory, '.git', 'HEAD'), `${resolvedCommit}\n`);
      await writeFile(
        join(target, 'package.json'),
        JSON.stringify({ dsh: { bundle: { patch: './dsh.patch.json' } } }),
      );
      await writeFile(join(target, 'dsh.patch.json'), '- id: test-bundle\n  config: {}\n');
    }
    return { exitCode: command === 'dsh' ? dshExitCode : 0 };
  });
  const dependencies: Partial<AddCommandDependencies> = {
    env: {},
    fetch,
    log: vi.fn(),
    removeDirectory: async (directory) => {
      const { rm } = await import('node:fs/promises');
      await rm(directory, { force: true, recursive: true });
    },
    runProcess,
  };
  return { dependencies, events, fetch, getCloneDirectory: () => clonedTo, runProcess };
};

describe('add workflow', () => {
  it('reports completion only after dsh installs successfully', async () => {
    const { dependencies, events, fetch, getCloneDirectory } = await setupWorkflow();

    await expect(runAddCommand(options, dependencies)).resolves.toBeUndefined();

    expect(events).toHaveLength(6);
    expect(events[0]).toMatch(/^git:init .*\/repository$/);
    expect(events[1]).toContain('git:-C');
    expect(events[1]).toContain('fetch --depth 1 https://github.com/owner/repo.git v1.2.0');
    expect(events[2]).toContain('checkout --detach FETCH_HEAD');
    expect(events[3]).toMatch(/^intent:[0-9a-f-]{36}$/);
    expect(events[4]).toBe(
      `dsh:plugin --profile web add https://github.com/owner/repo.git#${resolvedCommit}&path:/packages/web`,
    );
    expect(events[5]).toBe(`complete:${events[3]?.slice('intent:'.length)}`);
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
      eventId: events[3]?.slice('intent:'.length),
      slug: 'owner--repo--packages--web',
      version: resolvedCommit,
    });
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toEqual({
      eventId: events[3]?.slice('intent:'.length),
    });
    await expect(access(getCloneDirectory() ?? '')).rejects.toThrow();
  });

  it.each(['DO_NOT_TRACK', 'DISABLE_TELEMETRY'])('honors %s', async (variable) => {
    const { dependencies, fetch, runProcess } = await setupWorkflow();
    dependencies.env = { [variable]: '1' };

    await runAddCommand(options, dependencies);

    expect(fetch).not.toHaveBeenCalled();
    expect(runProcess).toHaveBeenCalledTimes(4);
  });

  it('does not report completion after a failed install', async () => {
    const { dependencies, fetch } = await setupWorkflow(17);

    await expect(runAddCommand(options, dependencies)).rejects.toThrow(
      'dsh plugin add failed with exit code 17',
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]?.[0])).toContain('/api/install-intents');
  });

  it('does not report completion when cleanup fails', async () => {
    const { dependencies, fetch } = await setupWorkflow();
    dependencies.removeDirectory = vi.fn(async (directory) => {
      const { rm } = await import('node:fs/promises');
      await rm(directory, { force: true, recursive: true });
      throw new Error('cleanup failed');
    });

    await expect(runAddCommand(options, dependencies)).rejects.toThrow('cleanup failed');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects an install target symlink that escapes the clone', async () => {
    const outside = await createTemporaryDirectory();
    await writeFile(
      join(outside, 'package.json'),
      JSON.stringify({ dsh: { bundle: { patch: './dsh.patch.json' } } }),
    );
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    const runProcess: AddCommandDependencies['runProcess'] = vi.fn(async (command, args) => {
      if (command === 'git' && args[0] === 'init') {
        const cloneDirectory = args[1];
        if (!cloneDirectory) throw new Error('missing clone directory');
        await mkdir(join(cloneDirectory, '.git'), { recursive: true });
        await mkdir(join(cloneDirectory, 'packages'), { recursive: true });
        await writeFile(join(cloneDirectory, '.git', 'HEAD'), `${resolvedCommit}\n`);
        await symlink(outside, join(cloneDirectory, 'packages/web'));
      }
      return { exitCode: 0 };
    });

    await expect(
      runAddCommand(options, { env: {}, fetch, log: vi.fn(), runProcess }),
    ).rejects.toThrow('--path must stay inside the cloned repository');
    expect(runProcess).toHaveBeenCalledTimes(3);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not let telemetry failure block installation', async () => {
    const { dependencies, runProcess } = await setupWorkflow();
    dependencies.fetch = vi.fn(async () => {
      throw new Error('registry unavailable');
    });

    await expect(runAddCommand(options, dependencies)).resolves.toBeUndefined();
    expect(runProcess).toHaveBeenCalledTimes(4);
  });

  it('prints a safe dry-run plan without network or subprocesses', async () => {
    const { dependencies, fetch, runProcess } = await setupWorkflow();
    const log = vi.fn();
    dependencies.log = log;

    await runAddCommand({ ...options, dryRun: true }, dependencies);

    expect(fetch).not.toHaveBeenCalled();
    expect(runProcess).not.toHaveBeenCalled();
    expect(log.mock.calls.join('\n')).toContain('dsh plugin --profile web add');
  });
});
