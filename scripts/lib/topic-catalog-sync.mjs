import { parseDocument } from 'yaml';

const SHA_PATTERN = /^[a-f0-9]{40}$/;
const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;
const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,127}$/;
const LICENSE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 .()+-]{0,63}$/;
const PATH_SEGMENT_PATTERN = /^[A-Za-z0-9._@-]+$/;
const MAX_FILE_BYTES = 1_000_000;
const MAX_DESCRIPTION_LENGTH = 500;
const DSH_JS_EXPRESSION_TAG = {
  tag: 'tag:yaml.org,2002:js',
  resolve: (value) => value,
};

class TopicAnalysisError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const reject = (code, message) => {
  throw new TopicAnalysisError(code, message);
};

const normalizePath = (value) => {
  const input = value.trim().replace(/^\.\//, '').replace(/\/+$/g, '');
  const segments = input.split('/');
  if (
    !input ||
    input.startsWith('/') ||
    input.length > 512 ||
    input.includes('\\') ||
    input.includes('?') ||
    input.includes('#') ||
    segments.some(
      (segment) =>
        !segment ||
        segment.length > 100 ||
        segment === '.' ||
        segment === '..' ||
        !PATH_SEGMENT_PATTERN.test(segment),
    )
  ) {
    reject('invalid_path', 'Bundle paths must be safe repository-relative paths.');
  }
  return segments.join('/');
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

const clientContract = (manifest) => {
  const client = manifest.dsh?.client;
  if (client === undefined || client === false) return { descriptor: false };
  if (typeof client === 'string') {
    return { descriptor: { platform: 'web' }, entryPath: normalizePath(client) };
  }
  if (typeof client !== 'object' || client === null || Array.isArray(client)) {
    reject('invalid_client', 'dsh.client must be a path or a client metadata object.');
  }
  const entry = resolveExport(manifest.exports?.['./client']);
  if (!entry) reject('invalid_client', 'Object-form dsh.client requires a ./client export.');
  const descriptor = {
    platform:
      typeof client.platform === 'string' && client.platform.trim()
        ? client.platform.trim()
        : 'web',
  };
  for (const field of ['inject', 'injects']) {
    if (client[field] === undefined) continue;
    if (
      !Array.isArray(client[field]) ||
      client[field].some((value) => typeof value !== 'string' || !value.trim())
    ) {
      reject('invalid_client', `dsh.client.${field} must be an array of package names.`);
    }
    descriptor[field] = client[field].map((value) => value.trim());
  }
  return { descriptor, entryPath: normalizePath(entry) };
};

const manifestContract = (repository) => {
  let manifest;
  try {
    manifest = JSON.parse(repository.manifest);
  } catch {
    reject('invalid_manifest', 'Root package.json must contain valid JSON.');
  }
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
    reject('invalid_manifest', 'Root package.json must contain a JSON object.');
  }
  const patch = manifest.dsh?.bundle?.patch;
  if (typeof patch !== 'string' || !patch.trim()) {
    reject('missing_bundle_manifest', 'Root package.json does not declare dsh.bundle.patch.');
  }
  const name = typeof manifest.name === 'string' ? manifest.name.trim() : '';
  const version = typeof manifest.version === 'string' ? manifest.version.trim() : '';
  const license = typeof manifest.license === 'string' ? manifest.license.trim() : '';
  if (
    name.length > 214 ||
    !PACKAGE_NAME_PATTERN.test(name) ||
    !VERSION_PATTERN.test(version) ||
    !LICENSE_PATTERN.test(license)
  ) {
    reject(
      'invalid_manifest',
      'Root package.json must contain bounded npm name, version, and license strings.',
    );
  }
  const runtime =
    (typeof manifest.main === 'string' ? manifest.main : undefined) ??
    resolveExport(
      typeof manifest.exports === 'object' ? manifest.exports?.['.'] : manifest.exports,
    );
  if (!runtime) reject('missing_runtime', 'Root package.json does not declare a runtime entry.');
  return {
    client: clientContract(manifest),
    description:
      [manifest.description, repository.description]
        .find(
          (value) =>
            typeof value === 'string' &&
            value.trim().length >= 12 &&
            value.trim().length <= MAX_DESCRIPTION_LENGTH,
        )
        ?.trim() ?? `${name} is an automatically discovered DeepSeek Harness plugin bundle.`,
    license,
    manifest,
    name,
    patchPath: normalizePath(patch),
    runtimePath: normalizePath(runtime),
    version,
  };
};

const assertBlob = (blob, code, message, { text = false } = {}) => {
  if (
    !blob ||
    typeof blob.oid !== 'string' ||
    !SHA_PATTERN.test(blob.oid) ||
    !Number.isSafeInteger(blob.byteSize) ||
    blob.byteSize < 0 ||
    blob.byteSize > MAX_FILE_BYTES ||
    (text && typeof blob.text !== 'string')
  ) {
    reject(code, message);
  }
};

const assertPatch = (blob) => {
  assertBlob(blob, 'invalid_patch', 'The declared dsh.bundle.patch file is missing or too large.', {
    text: true,
  });
  const document = parseDocument(blob.text, { customTags: [DSH_JS_EXPRESSION_TAG] });
  const issue = document.errors[0] ?? document.warnings[0];
  if (issue) reject('invalid_patch', 'The declared dsh.bundle.patch file is not valid DSH YAML.');
  const entries = document.toJS();
  if (
    !Array.isArray(entries) ||
    entries.some((entry) => typeof entry !== 'object' || entry === null || Array.isArray(entry))
  ) {
    reject('invalid_patch', 'The declared dsh.bundle.patch file must contain patch rows.');
  }
};

const firstParagraph = (markdown) => {
  const paragraph = [];
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!paragraph.length && (!line || line.startsWith('#'))) continue;
    if (!line && paragraph.length) break;
    if (line) paragraph.push(line);
  }
  return paragraph
    .join(' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/!\[[^\]]*]\[[^\]]*]/g, '')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2_000);
};

const section = (markdown, headings) => {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => {
    const match = /^(#{2,6})\s+(.+?)\s*$/.exec(line);
    return match && headings.some((heading) => match[2].toLowerCase().includes(heading));
  });
  if (start === -1) return '';
  const level = /^(#+)/.exec(lines[start])?.[1].length ?? 2;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const next = /^(#{1,6})\s+/.exec(lines[index]);
    if (next && next[1].length <= level) {
      end = index;
      break;
    }
  }
  return lines
    .slice(start + 1, end)
    .join('\n')
    .trim()
    .slice(0, 4_000);
};

const slugPart = (value) =>
  value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const uniqueSlug = (name, repository, entries, reservedSlugs) => {
  const packageSlug = slugPart(name.replace(/^@[^/]+\//, ''));
  const used = new Set([...reservedSlugs, ...entries.map((entry) => entry.slug)]);
  if (!used.has(packageSlug)) return packageSlug;
  const [owner, repo] = new URL(repository).pathname.split('/').filter(Boolean);
  for (const candidate of [
    slugPart(`${owner}-${packageSlug}`),
    slugPart(`${owner}-${repo}-${packageSlug}`),
  ]) {
    if (!used.has(candidate)) return candidate;
  }
  reject('catalog_conflict', `No unique catalog slug is available for ${repository}.`);
};

const sourceCoordinate = (repository) => {
  const [owner, repo] = new URL(repository).pathname.split('/').filter(Boolean);
  return `github:${owner}/${repo}`;
};

const localDate = (now) =>
  new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
  }).format(now);

const statement = {
  en: 'Automatically discovered through the dsh-plugin GitHub Topic. Static checks verified a pinned public root bundle contract and committed files without executing third-party code. This is not a human review, security audit, runtime smoke test, publisher identity check, or official endorsement.',
  zh: '通过 GitHub dsh-plugin Topic 自动发现。静态检查在不执行第三方代码的前提下，验证了固定公开版本的根目录 bundle 契约与已提交文件；这不等于人工审核、安全审计、运行时冒烟测试、发布者身份验证或官方背书。',
};

const automatedEntry = ({ contract, files, repository }, entries, analyzedAt, reservedSlugs) => {
  assertPatch(files.patch);
  assertBlob(files.runtime, 'missing_runtime', 'The declared runtime entry is not committed.');
  if (contract.client.entryPath) {
    assertBlob(files.client, 'invalid_client', 'The declared client entry is not committed.');
  }
  assertBlob(files.readme, 'missing_readme', 'A committed root README is required.', {
    text: true,
  });
  assertBlob(files.license, 'missing_license', 'A committed root license file is required.');
  const readmeZh = files.readmeZh?.text || files.readme.text;
  const readmeEn = files.readme.text;
  const slug = uniqueSlug(contract.name, repository.repository, entries, reservedSlugs);
  const checks = {
    publicRepository: true,
    pinnedCommit: true,
    bundleManifest: true,
    safeBundlePatch: true,
    committedRuntime: true,
    committedClient: Boolean(contract.client.entryPath),
    readme: true,
    license: true,
  };
  return {
    analysis: {
      checks,
      method: 'automated-static-contract',
      revision: 1,
      status: 'verified',
    },
    id: sourceCoordinate(repository.repository),
    slug,
    name: contract.name,
    version: contract.version,
    license: contract.license,
    type: 'bundle',
    category: contract.client.entryPath ? 'client-ui' : 'bundles',
    builtIn: false,
    provenance: {
      status: 'community-automated',
      discoveredVia: 'github-topic:dsh-plugin',
      analyzedAt,
      statement,
    },
    description: { en: contract.description, zh: contract.description },
    source: { repository: repository.repository, directory: '', commit: repository.commit },
    runtime: {
      hostLoadable: true,
      configurable: null,
      client: contract.client.descriptor,
    },
    capabilities: { tools: null, uiContributions: null, uiSlotsDeclared: null },
    availability: {
      profiles: null,
      defaultWeb: contract.client.entryPath ? 'conditional' : null,
      bundles: [contract.name],
    },
    distribution: {
      installable: true,
      mode: 'git-bundle',
      activation: 'profile-layer',
      note: statement,
    },
    docs: {
      readmePath: 'README.md',
      readmeZhPath: files.readmeZh ? files.readmeZh.path : 'README.md',
      readme: {
        en: firstParagraph(readmeEn) || contract.description,
        zh: firstParagraph(readmeZh) || contract.description,
      },
      modelExperience: {
        en: section(readmeEn, ['model experience']),
        zh: section(readmeZh, ['模型体验', 'model experience']),
      },
      limitations: {
        en: section(readmeEn, ['known limitations', 'limitations']),
        zh: section(readmeZh, ['已知限制', '已知局限', 'known limitations', 'limitations']),
      },
    },
  };
};

const sourceRecord = ({ contract, files, repository }, analyzedAt) => ({
  repository: repository.repository,
  commit: repository.commit,
  directory: '',
  packageName: contract.name,
  manifestPath: 'package.json',
  bundlePatchPath: contract.patchPath,
  runtimeEntryPath: contract.runtimePath,
  ...(contract.client.entryPath ? { clientEntryPath: contract.client.entryPath } : {}),
  readmePath: 'README.md',
  licensePath: files.license.path,
  automation: { analyzedAt, method: 'automated-static-contract' },
});

const metricSlug = (entry) => {
  const repository = new URL(entry.source.repository).pathname.split('/').filter(Boolean);
  return [...repository, ...entry.source.directory.split('/')]
    .map(slugPart)
    .filter(Boolean)
    .join('--');
};

const totals = (entries) => ({
  reviewed: entries.filter((entry) => entry.provenance?.status === 'community-reviewed').length,
  submitted: entries.filter((entry) => entry.provenance?.status === 'community-submitted').length,
  automated: entries.filter((entry) => entry.provenance?.status === 'community-automated').length,
  installable: entries.filter((entry) => entry.distribution.installable).length,
});

export async function syncTopicCatalogData({
  catalog,
  github,
  now,
  registry,
  reservedSlugs = [],
  sources,
  topic,
}) {
  const discovery = await github.discoverTopic(topic);
  if (
    !Number.isSafeInteger(discovery.totalCount) ||
    discovery.totalCount !== discovery.repositories.length
  ) {
    throw new Error('GitHub Topic discovery is incomplete; refusing to update generated data.');
  }
  const deferredRepositories = discovery.deferredRepositories ?? [];
  const unresolvedCount = discovery.unresolvedCount ?? 0;
  if (
    !Array.isArray(deferredRepositories) ||
    !Number.isSafeInteger(unresolvedCount) ||
    unresolvedCount < 0 ||
    (discovery.observedTotalCount !== undefined &&
      discovery.observedTotalCount !==
        discovery.totalCount + deferredRepositories.length + unresolvedCount)
  ) {
    throw new Error(
      'GitHub Topic cutoff snapshot is incomplete; refusing to update generated data.',
    );
  }

  const analyzedAt = localDate(now);
  const reservedSlugSet = new Set(reservedSlugs);
  const preservedEntries = catalog.entries.filter(
    (entry) => entry.provenance?.status !== 'community-automated',
  );
  const preservedSources = sources.entries.filter((entry) => !entry.automation);
  const previousAutomatedEntries = new Map(
    catalog.entries
      .filter((entry) => entry.provenance?.status === 'community-automated')
      .map((entry) => [entry.source.repository.toLocaleLowerCase(), entry]),
  );
  const previousAutomatedSources = new Map(
    sources.entries
      .filter((entry) => entry.automation)
      .map((entry) => [entry.repository.toLocaleLowerCase(), entry]),
  );
  const cachedEntries = [];
  const cachedSources = [];
  const deferredEntries = [];
  const deferredSources = [];
  const unresolvedEntries = [];
  const unresolvedSources = [];
  const preservedCoordinates = new Set(
    preservedEntries.map((entry) => entry.source.repository.toLocaleLowerCase()),
  );
  const analysisEntries = [];
  const candidates = [];
  const visibleCoordinates = new Set(
    [...discovery.repositories, ...deferredRepositories].map((repository) =>
      repository.repository.toLocaleLowerCase(),
    ),
  );

  if (discovery.complete === false) {
    for (const [coordinate, previousEntry] of previousAutomatedEntries) {
      if (visibleCoordinates.has(coordinate)) continue;
      const previousSource = previousAutomatedSources.get(coordinate);
      if (!previousSource) {
        throw new Error(
          `Previous automated source is missing for ${previousEntry.source.repository}.`,
        );
      }
      unresolvedEntries.push(previousEntry);
      unresolvedSources.push(previousSource);
      analysisEntries.push({
        commit: previousEntry.source.commit,
        repository: previousEntry.source.repository,
        status: 'unresolved',
      });
    }
  }

  for (const repository of deferredRepositories) {
    const coordinate = repository.repository.toLocaleLowerCase();
    const previousEntry = previousAutomatedEntries.get(coordinate);
    const previousSource = previousAutomatedSources.get(coordinate);
    if (previousEntry && previousSource) {
      deferredEntries.push(previousEntry);
      deferredSources.push(previousSource);
    }
    analysisEntries.push({
      commit: repository.commit,
      ...(previousEntry ? { previousCommit: previousEntry.source.commit } : {}),
      repository: repository.repository,
      status: 'deferred',
    });
  }

  for (const repository of [...discovery.repositories].sort((a, b) =>
    a.repository.localeCompare(b.repository),
  )) {
    if (preservedCoordinates.has(repository.repository.toLocaleLowerCase())) {
      analysisEntries.push({
        commit: repository.commit,
        repository: repository.repository,
        status: 'preserved',
      });
      continue;
    }
    try {
      if (repository.archived) {
        reject('repository_unavailable', 'Repository is archived.');
      }
      if (!SHA_PATTERN.test(repository.commit)) {
        reject('invalid_commit', 'Repository does not expose a pinned default-branch commit.');
      }
      if (typeof repository.manifest !== 'string') {
        reject('missing_manifest', 'Repository does not contain a root package.json.');
      }
      const previousEntry = previousAutomatedEntries.get(repository.repository.toLocaleLowerCase());
      const previousSource = previousAutomatedSources.get(
        repository.repository.toLocaleLowerCase(),
      );
      if (
        previousEntry?.source.commit === repository.commit &&
        previousSource?.commit === repository.commit &&
        previousEntry.analysis?.revision === 1 &&
        !reservedSlugSet.has(previousEntry.slug)
      ) {
        cachedEntries.push(previousEntry);
        cachedSources.push(previousSource);
        analysisEntries.push({
          cached: true,
          commit: repository.commit,
          repository: repository.repository,
          status: 'listed',
        });
        continue;
      }
      candidates.push({ contract: manifestContract(repository), repository });
    } catch (error) {
      if (!(error instanceof TopicAnalysisError)) throw error;
      analysisEntries.push({
        code: error.code,
        commit: repository.commit,
        message: error.message,
        repository: repository.repository,
        status: 'rejected',
      });
    }
  }

  const inspected = await github.inspectBundles(candidates);
  const automatedEntries = [];
  const automatedSources = [];
  for (const candidate of candidates) {
    try {
      const files = inspected.get(candidate.repository.repository);
      if (!files) {
        throw new Error(`GitHub inspection did not return ${candidate.repository.repository}.`);
      }
      const input = { ...candidate, files };
      const entry = automatedEntry(
        input,
        [...preservedEntries, ...cachedEntries, ...automatedEntries],
        analyzedAt,
        reservedSlugSet,
      );
      automatedEntries.push(entry);
      automatedSources.push(sourceRecord(input, analyzedAt));
      analysisEntries.push({
        commit: candidate.repository.commit,
        repository: candidate.repository.repository,
        status: 'listed',
      });
    } catch (error) {
      if (!(error instanceof TopicAnalysisError)) throw error;
      analysisEntries.push({
        code: error.code,
        commit: candidate.repository.commit,
        message: error.message,
        repository: candidate.repository.repository,
        status: 'rejected',
      });
    }
  }

  const entries = [
    ...preservedEntries,
    ...deferredEntries,
    ...unresolvedEntries,
    ...cachedEntries,
    ...automatedEntries,
  ];
  const nextAnalysis = {
    schemaVersion: 1,
    topic,
    snapshotAt: discovery.snapshotAt,
    complete: discovery.complete ?? true,
    totals: {
      discovered: discovery.totalCount,
      observed: discovery.observedTotalCount ?? discovery.totalCount,
      listed: analysisEntries.filter((entry) => entry.status === 'listed').length,
      preserved: analysisEntries.filter((entry) => entry.status === 'preserved').length,
      deferred: analysisEntries.filter((entry) => entry.status === 'deferred').length,
      unresolved: unresolvedCount,
      retainedUnresolved: unresolvedEntries.length,
      rejected: analysisEntries.filter((entry) => entry.status === 'rejected').length,
    },
    entries: analysisEntries.sort((a, b) => a.repository.localeCompare(b.repository)),
  };
  return {
    analysis: nextAnalysis,
    catalog: {
      ...catalog,
      source: {
        repository: `https://github.com/topics/${topic}`,
        generatedAt: discovery.snapshotAt,
        policy: 'automated-pinned-source-contracts',
      },
      totals: totals(entries),
      entries,
    },
    sources: {
      ...sources,
      topic,
      entries: [
        ...preservedSources,
        ...deferredSources,
        ...unresolvedSources,
        ...cachedSources,
        ...automatedSources,
      ],
    },
    registry: {
      ...registry,
      slugs: entries
        .filter((entry) => entry.distribution.installable)
        .map(metricSlug)
        .sort(),
    },
  };
}
