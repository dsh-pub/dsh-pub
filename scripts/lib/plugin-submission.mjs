import { Buffer } from 'node:buffer';

import { parseDocument } from 'yaml';

const CATEGORY_VALUES = new Set([
  'ui',
  'tool',
  'model',
  'storage',
  'workflow',
  'session',
  'runtime',
  'other',
]);
const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;
const SHA_PATTERN = /^[a-f0-9]{40}$/;
const PATH_SEGMENT_PATTERN = /^[A-Za-z0-9._@-]+$/;
const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;
const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,127}$/;
const LICENSE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 .()+-]{0,63}$/;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_FILE_BYTES = 1_000_000;
const MAX_PATH_LENGTH = 512;
const MAX_PATH_SEGMENT_LENGTH = 100;
const DSH_JS_EXPRESSION_TAG = {
  tag: 'tag:yaml.org,2002:js',
  resolve: (value) => value,
};

export class SubmissionError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const submissionError = (code, message) => {
  throw new SubmissionError(code, message);
};

const slugPart = (value) =>
  value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const normalizeRepository = (value) => {
  const input = value.trim();
  let coordinate = input;
  if (input.includes('://')) {
    let url;
    try {
      url = new URL(input);
    } catch {
      submissionError('invalid_repository', 'GitHub repository URL is invalid.');
    }
    if (url.protocol !== 'https:' || url.hostname.toLocaleLowerCase() !== 'github.com') {
      submissionError('invalid_repository', 'Only public GitHub repositories are supported.');
    }
    if (url.search || url.hash) {
      submissionError('invalid_repository', 'Repository URL must not contain query or hash.');
    }
    coordinate = url.pathname.replace(/^\/+|\/+$/g, '');
  }
  coordinate = coordinate.replace(/\.git$/i, '');
  const parts = coordinate.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    submissionError('invalid_repository', 'Repository must use owner/repository form.');
  }
  const [owner, repo] = parts;
  if (
    !OWNER_PATTERN.test(owner) ||
    !REPOSITORY_PATTERN.test(repo) ||
    repo === '.' ||
    repo === '..'
  ) {
    submissionError('invalid_repository', 'Repository owner or name is invalid.');
  }
  return {
    owner,
    repo,
    repository: `https://github.com/${owner}/${repo}`,
  };
};

const normalizePath = (value, { allowEmpty = true } = {}) => {
  const input = value.trim().replace(/\/+$/g, '');
  if (!input && allowEmpty) return '';
  if (
    !input ||
    input.startsWith('/') ||
    input.length > MAX_PATH_LENGTH ||
    input.includes('\\') ||
    input.includes('?') ||
    input.includes('#')
  ) {
    submissionError('invalid_path', 'Package path must be a safe relative repository path.');
  }
  const segments = input.split('/');
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment.length > MAX_PATH_SEGMENT_LENGTH ||
        segment === '.' ||
        segment === '..' ||
        !PATH_SEGMENT_PATTERN.test(segment),
    )
  ) {
    submissionError('invalid_path', 'Package path must be a safe relative repository path.');
  }
  return segments.join('/');
};

const repositoryPath = (...values) => values.filter(Boolean).join('/');

const issueSections = (body) => {
  if (typeof body !== 'string' || body.length > 8_000) {
    submissionError('invalid_issue', 'Issue body is missing or too large.');
  }
  const sections = new Map();
  let heading;
  let lines = [];
  const finish = () => {
    if (!heading) return;
    if (sections.has(heading)) submissionError('invalid_issue', `Duplicate section: ${heading}.`);
    sections.set(heading, lines.join('\n').trim());
  };
  for (const line of body.split(/\r?\n/)) {
    if (line.startsWith('### ')) {
      finish();
      heading = line.slice(4).trim();
      lines = [];
    } else if (heading) {
      lines.push(line);
    }
  }
  finish();
  return sections;
};

export function parseSubmissionIssue(body) {
  const sections = issueSections(body);
  const required = (name) => {
    const value = sections.get(name)?.trim();
    if (!value) submissionError('missing_field', `Missing Issue section: ${name}.`);
    return value;
  };
  const repository = normalizeRepository(required('GitHub repository'));
  const pathValue = required('Package path');
  const directory =
    pathValue === '_root_' || pathValue === '_No response_' ? '' : normalizePath(pathValue);
  const descriptionEn = required('English summary');
  const descriptionZhValue = required('Chinese summary');
  const descriptionZh =
    descriptionZhValue === '_Not provided_' || descriptionZhValue === '_No response_'
      ? ''
      : descriptionZhValue;
  if (descriptionEn.length < 12 || descriptionEn.length > MAX_DESCRIPTION_LENGTH) {
    submissionError('invalid_description', 'English summary must contain 12–500 characters.');
  }
  if (descriptionZh.length > MAX_DESCRIPTION_LENGTH) {
    submissionError('invalid_description', 'Chinese summary must contain at most 500 characters.');
  }
  const category = required('Category');
  if (!CATEGORY_VALUES.has(category)) {
    submissionError('invalid_category', 'Category is not supported.');
  }
  const contract = required('Submission contract');
  if (contract !== 'Accepted by submitting this Issue.') {
    submissionError('contract_not_accepted', 'Submission contract must be accepted.');
  }
  return {
    category,
    descriptionEn,
    descriptionZh,
    directory,
    ...repository,
  };
}

const githubRequest = async (url, { fetch: fetcher, token }, notFoundCode) => {
  const response = await fetcher(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: globalThis.AbortSignal.timeout(15_000),
  });
  if (response.status === 404 && notFoundCode) return undefined;
  if (!response.ok) {
    submissionError(
      'github_unavailable',
      `GitHub API request failed with status ${response.status}.`,
    );
  }
  return response.json();
};

const contentUrl = (owner, repo, path, commit) => {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const url = new URL(`https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`);
  url.searchParams.set('ref', commit);
  return String(url);
};

const getFile = async (inspection, path, { required = true } = {}) => {
  const treeEntry = inspection.tree.get(path);
  if (!treeEntry) {
    if (required) submissionError('missing_file', `Required source file is missing: ${path}.`);
    return undefined;
  }
  if (treeEntry.type !== 'blob' || (treeEntry.mode !== '100644' && treeEntry.mode !== '100755')) {
    submissionError('invalid_file', `Source path must be a regular committed file: ${path}.`);
  }
  const value = await githubRequest(
    contentUrl(inspection.owner, inspection.repo, path, inspection.commit),
    inspection,
    'not_found',
  );
  if (!value) submissionError('missing_file', `Required source file is missing: ${path}.`);
  if (
    typeof value !== 'object' ||
    value === null ||
    value.type !== 'file' ||
    value.encoding !== 'base64' ||
    typeof value.content !== 'string'
  ) {
    submissionError('invalid_file', `Source path is not a regular file: ${path}.`);
  }
  if (typeof value.size === 'number' && value.size > MAX_FILE_BYTES) {
    submissionError('file_too_large', `Source file is too large to inspect: ${path}.`);
  }
  const content = Buffer.from(value.content.replaceAll('\n', ''), 'base64');
  if (content.byteLength > MAX_FILE_BYTES) {
    submissionError('file_too_large', `Source file is too large to inspect: ${path}.`);
  }
  return { content: content.toString('utf8'), path };
};

const findFile = async (inspection, paths) => {
  for (const path of paths) {
    const file = await getFile(inspection, path, { required: false });
    if (file) return file;
  }
  submissionError('missing_file', `Required source file is missing: ${paths.join(' or ')}.`);
};

const resolveExport = (value) => {
  if (typeof value === 'string') return value;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  for (const key of ['import', 'default', 'require', 'node']) {
    const candidate = resolveExport(value[key]);
    if (candidate) return candidate;
  }
  return undefined;
};

const runtimeEntry = (manifest) => {
  const candidate =
    (typeof manifest.main === 'string' ? manifest.main : undefined) ??
    resolveExport(
      typeof manifest.exports === 'object' ? manifest.exports?.['.'] : manifest.exports,
    );
  if (!candidate) {
    submissionError(
      'missing_runtime',
      'package.json must declare a committed main or export entry.',
    );
  }
  return normalizePath(candidate.replace(/^\.\//, ''), { allowEmpty: false });
};

const assertPatch = (content) => {
  const document = parseDocument(content, { customTags: [DSH_JS_EXPRESSION_TAG] });
  const issue = document.errors[0] ?? document.warnings[0];
  if (issue) submissionError('invalid_patch', 'dsh.bundle.patch must contain valid DSH YAML.');
  const entries = document.toJS();
  if (
    !Array.isArray(entries) ||
    entries.some((entry) => typeof entry !== 'object' || entry === null || Array.isArray(entry))
  ) {
    submissionError('invalid_patch', 'dsh.bundle.patch must be an array of patch entries.');
  }
};

const manifestMetadata = (manifest) => {
  const name = typeof manifest.name === 'string' ? manifest.name.trim() : '';
  const version = typeof manifest.version === 'string' ? manifest.version.trim() : '';
  const license = typeof manifest.license === 'string' ? manifest.license.trim() : '';
  if (
    name.length > 214 ||
    !PACKAGE_NAME_PATTERN.test(name) ||
    !VERSION_PATTERN.test(version) ||
    !LICENSE_PATTERN.test(license)
  ) {
    submissionError(
      'invalid_manifest',
      'package metadata must contain bounded npm name, version, and license strings.',
    );
  }
  return { license, name, version };
};

const inspectSubmission = async (submission, options) => {
  const apiBase = `https://api.github.com/repos/${submission.owner}/${submission.repo}`;
  const repository = await githubRequest(apiBase, options);
  if (!repository || repository.private || repository.archived || !repository.default_branch) {
    submissionError(
      'repository_unavailable',
      'Repository must be public, active, and have a default branch.',
    );
  }
  const commitData = await githubRequest(
    `${apiBase}/commits/${encodeURIComponent(repository.default_branch)}`,
    options,
  );
  const commit = commitData?.sha;
  if (typeof commit !== 'string' || !SHA_PATTERN.test(commit)) {
    submissionError('invalid_commit', 'GitHub did not return a pinned commit.');
  }
  const treeSha = commitData?.commit?.tree?.sha;
  if (typeof treeSha !== 'string' || !SHA_PATTERN.test(treeSha)) {
    submissionError('invalid_commit', 'GitHub did not return a pinned source tree.');
  }
  const treeData = await githubRequest(`${apiBase}/git/trees/${treeSha}?recursive=1`, options);
  if (treeData?.truncated || !Array.isArray(treeData?.tree) || treeData.tree.length > 100_000) {
    submissionError('invalid_tree', 'GitHub source tree is incomplete or too large to inspect.');
  }
  const tree = new Map(
    treeData.tree
      .filter(
        (entry) =>
          typeof entry?.path === 'string' &&
          typeof entry?.mode === 'string' &&
          typeof entry?.type === 'string',
      )
      .map((entry) => [entry.path, entry]),
  );
  const inspection = { ...options, ...submission, commit, tree };
  const manifestPath = repositoryPath(submission.directory, 'package.json');
  const manifestFile = await getFile(inspection, manifestPath);
  let manifest;
  try {
    manifest = JSON.parse(manifestFile.content);
  } catch {
    submissionError('invalid_manifest', 'package.json must contain valid JSON.');
  }
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
    submissionError('invalid_manifest', 'package.json must contain a JSON object.');
  }
  const metadata = manifestMetadata(manifest);
  const patchValue = manifest.dsh?.bundle?.patch;
  if (typeof patchValue !== 'string' || !patchValue.trim()) {
    submissionError('invalid_manifest', 'package.json must declare dsh.bundle.patch.');
  }
  const patchRelativePath = normalizePath(patchValue.replace(/^\.\//, ''), { allowEmpty: false });
  const bundlePatchPath = repositoryPath(submission.directory, patchRelativePath);
  const patch = await getFile(inspection, bundlePatchPath);
  assertPatch(patch.content);

  const runtimeRelativePath = runtimeEntry(manifest);
  const runtimeEntryPath = repositoryPath(submission.directory, runtimeRelativePath);
  await getFile(inspection, runtimeEntryPath);

  let clientEntryPath;
  if (manifest.dsh?.client !== undefined) {
    if (typeof manifest.dsh.client !== 'string' || !manifest.dsh.client.trim()) {
      submissionError('invalid_client', 'dsh.client must point to a committed client entry file.');
    }
    const clientRelativePath = normalizePath(manifest.dsh.client.replace(/^\.\//, ''), {
      allowEmpty: false,
    });
    clientEntryPath = repositoryPath(submission.directory, clientRelativePath);
    await getFile(inspection, clientEntryPath);
  }

  const readme = await findFile(inspection, [
    repositoryPath(submission.directory, 'README.md'),
    'README.md',
  ]);
  const readmeZh = await findFile(inspection, [
    repositoryPath(submission.directory, 'README.zh-CN.md'),
    repositoryPath(submission.directory, 'README.zh.md'),
    'README.zh-CN.md',
    'README.zh.md',
    readme.path,
  ]);
  const license = await findFile(inspection, [
    repositoryPath(submission.directory, 'LICENSE'),
    repositoryPath(submission.directory, 'LICENSE.md'),
    'LICENSE',
    'LICENSE.md',
  ]);

  return {
    ...submission,
    bundlePatchPath,
    clientEntryPath,
    commit,
    license: metadata.license,
    licensePath: license.path,
    manifestPath,
    packageName: metadata.name,
    readmePath: readme.path,
    readmeZhPath: readmeZh.path,
    runtimeEntryPath,
    version: metadata.version,
  };
};

const installMetricSlug = ({ owner, repo, directory }) =>
  [owner, repo, ...directory.split('/')].map(slugPart).filter(Boolean).join('--');

const uniquePageSlug = (submission, entries) => {
  const packageSlug = slugPart(submission.packageName.replace(/^@[^/]+\//, ''));
  const used = new Set(entries.map((entry) => entry.slug));
  if (!used.has(packageSlug)) return packageSlug;
  const ownerSlug = slugPart(`${submission.owner}-${submission.packageName}`);
  if (!used.has(ownerSlug)) return ownerSlug;
  return slugPart(`${submission.owner}-${submission.repo}-${submission.directory}`);
};

const sourceCoordinate = ({ owner, repo, directory }) =>
  `github:${owner}/${repo}${directory ? `#${directory}` : ''}`;

const submittedEntry = (submission, issue, slug) => {
  const submittedAt = issue.createdAt.slice(0, 10);
  const descriptionZh = submission.descriptionZh || submission.descriptionEn;
  const statement = {
    en: 'Submitted through the public Issue queue. Automated checks verified the public bundle contract and committed files, but did not inspect runtime capabilities. This is not a human review, security audit, publisher identity check, or official endorsement.',
    zh: '通过公开 Issue 队列提名。自动检查验证了公开组合包契约与已提交文件，但未核对运行时能力；这不等于人工审核、安全审计、发布者身份验证或官方背书。',
  };
  return {
    id: sourceCoordinate(submission),
    slug,
    name: submission.packageName,
    version: submission.version,
    license: submission.license,
    type: 'bundle',
    category: submission.category,
    builtIn: false,
    provenance: {
      status: 'community-submitted',
      submittedVia: 'github-issue',
      submittedAt,
      issue: issue.url,
      statement,
    },
    description: { en: submission.descriptionEn, zh: descriptionZh },
    source: {
      repository: submission.repository,
      directory: submission.directory,
      commit: submission.commit,
    },
    runtime: {
      hostLoadable: null,
      configurable: null,
      client: null,
    },
    capabilities: { tools: null, uiContributions: null, uiSlotsDeclared: null },
    availability: {
      profiles: null,
      defaultWeb: null,
      bundles: [submission.packageName],
    },
    distribution: {
      installable: true,
      mode: 'git-bundle',
      activation: 'profile-layer',
      note: statement,
    },
    docs: {
      readmePath: submission.readmePath,
      readmeZhPath: submission.readmeZhPath,
      readme: {
        en: `## Submitter-provided summary\n\n${submission.descriptionEn}`,
        zh: `## 提名者提供的简介\n\n${descriptionZh}`,
      },
      modelExperience: {
        en: 'Not inspected by the automated submission check; inspect the pinned source for model-facing behavior.',
        zh: '自动提交检查未核对模型侧行为；请查看固定版本的源码。',
      },
      limitations: statement,
    },
  };
};

const sourceRecord = (submission, issue) => ({
  repository: submission.repository,
  commit: submission.commit,
  directory: submission.directory,
  packageName: submission.packageName,
  manifestPath: submission.manifestPath,
  bundlePatchPath: submission.bundlePatchPath,
  runtimeEntryPath: submission.runtimeEntryPath,
  readmePath: submission.readmePath,
  licensePath: submission.licensePath,
  submission: {
    issue: issue.url,
    submittedAt: issue.createdAt.slice(0, 10),
    category: submission.category,
    description: { en: submission.descriptionEn, zh: submission.descriptionZh },
  },
});

export async function createSubmissionUpdate({
  communityCatalog,
  communitySources,
  fetch: fetcher,
  issue,
  registry,
  token,
}) {
  const submission = parseSubmissionIssue(issue.body);
  const coordinateMatches = (entry) =>
    entry.source.repository.toLocaleLowerCase() === submission.repository.toLocaleLowerCase() &&
    entry.source.directory === submission.directory;
  const existingIndex = communityCatalog.entries.findIndex(coordinateMatches);
  const existing = communityCatalog.entries[existingIndex];
  if (existing) {
    return {
      changed: false,
      communityCatalog,
      communitySources,
      entry: existing,
      registry,
    };
  }

  const inspected = await inspectSubmission(submission, { fetch: fetcher, token });

  const slug = uniquePageSlug(inspected, communityCatalog.entries);
  const entry = submittedEntry(inspected, issue, slug);
  const catalogEntries = [...communityCatalog.entries];
  catalogEntries.push(entry);

  const sourceIndex = communitySources.entries.findIndex(
    (candidate) =>
      candidate.repository.toLocaleLowerCase() === inspected.repository.toLocaleLowerCase() &&
      candidate.directory === inspected.directory,
  );
  const sourceEntries = [...communitySources.entries];
  const source = sourceRecord(inspected, issue);
  if (sourceIndex >= 0) {
    submissionError('catalog_conflict', 'Catalog source coordinate is already registered.');
  }
  sourceEntries.push(source);

  const reviewed = catalogEntries.filter(
    (candidate) => candidate.provenance?.status === 'community-reviewed',
  ).length;
  const submitted = catalogEntries.filter(
    (candidate) => candidate.provenance?.status === 'community-submitted',
  ).length;
  const slugs = catalogEntries.map((candidate) =>
    installMetricSlug({
      owner: new URL(candidate.source.repository).pathname.split('/').filter(Boolean)[0],
      repo: new URL(candidate.source.repository).pathname.split('/').filter(Boolean)[1],
      directory: candidate.source.directory,
    }),
  );

  return {
    changed: true,
    communityCatalog: {
      ...communityCatalog,
      source: {
        repository: 'https://github.com/dsh-pub/dsh-pub/issues',
        generatedAt: new Date(issue.updatedAt).toISOString(),
        policy: 'pinned-source-contracts',
      },
      totals: { reviewed, submitted, installable: catalogEntries.length },
      entries: catalogEntries,
    },
    communitySources: {
      ...communitySources,
      schemaVersion: 2,
      intake: 'https://github.com/dsh-pub/dsh-pub/issues/new?template=plugin-submission.yml',
      entries: sourceEntries,
    },
    entry,
    registry: {
      ...registry,
      slugs: [...new Set(slugs)].sort(),
    },
  };
}
