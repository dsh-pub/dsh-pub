import { describe, expect, it } from 'vitest';

import { normalizeCommunitySlugs, syncTopicCatalogData } from './lib/topic-catalog-sync.mjs';

const reviewedEntry = {
  id: 'github:example/reviewed',
  slug: 'reviewed',
  name: 'reviewed',
  version: '1.0.0',
  license: 'MIT',
  type: 'bundle',
  category: 'other',
  builtIn: false,
  provenance: {
    status: 'community-reviewed',
    discoveredVia: 'github-topic:dsh-plugin',
    reviewedAt: '2026-08-13',
    statement: { en: 'Reviewed.', zh: '已审核。' },
  },
  description: { en: 'A reviewed plugin.', zh: '一个已审核插件。' },
  source: {
    repository: 'https://github.com/example/reviewed',
    directory: '',
    commit: '1'.repeat(40),
  },
  runtime: { hostLoadable: true, configurable: null, client: false },
  capabilities: { tools: [], uiContributions: [], uiSlotsDeclared: [] },
  availability: { profiles: null, defaultWeb: null, bundles: ['reviewed'] },
  distribution: {
    installable: true,
    mode: 'git-bundle',
    activation: 'profile-layer',
    note: { en: 'Reviewed.', zh: '已审核。' },
  },
  docs: {
    readmePath: 'README.md',
    readmeZhPath: 'README.md',
    readme: { en: 'Reviewed.', zh: '已审核。' },
    modelExperience: { en: '', zh: '' },
    limitations: { en: '', zh: '' },
  },
};

const sourceRecord = {
  repository: reviewedEntry.source.repository,
  commit: reviewedEntry.source.commit,
  directory: '',
  packageName: reviewedEntry.name,
  manifestPath: 'package.json',
  bundlePatchPath: 'cordis.patch.yml',
  runtimeEntryPath: 'lib/index.js',
  readmePath: 'README.md',
  licensePath: 'LICENSE',
};

const validManifest = JSON.stringify({
  name: '@example/dsh-clock',
  version: '1.2.3',
  license: 'MIT',
  description: 'Adds a clock panel to DeepSeek Harness.',
  exports: { '.': './lib/index.js', './client': './lib/client.js' },
  dsh: {
    bundle: { patch: './cordis.patch.yml' },
    client: { platform: 'web', inject: ['@deepseek-ai/dsh-client-runtime'] },
  },
});

describe('GitHub Topic catalog sync', () => {
  it('renames community slugs that collide with reserved official slugs', () => {
    const reserved = ['acp', 'reviewed'];
    const entries = normalizeCommunitySlugs(
      [
        {
          ...reviewedEntry,
          slug: 'acp',
        },
        {
          ...reviewedEntry,
          slug: 'reviewed',
          source: {
            ...reviewedEntry.source,
            repository: 'https://github.com/example/another-reviewed',
          },
          name: '@example/another-reviewed',
        },
      ],
      reserved,
    );

    expect(entries.map((entry) => entry.slug)).toEqual(['example-reviewed', 'another-reviewed']);
    expect(new Set(entries.map((entry) => entry.slug)).size).toBe(2);
    expect(entries.every((entry) => !reserved.includes(entry.slug))).toBe(true);
  });

  it('preserves reviewed entries, lists verified bundles, and records rejected analysis', async () => {
    const github = {
      discoverTopic: async () => ({
        repositories: [
          {
            archived: false,
            commit: '2'.repeat(40),
            description: 'Adds a clock panel to DeepSeek Harness.',
            manifest: validManifest,
            nameWithOwner: 'example/dsh-clock',
            repository: 'https://github.com/example/dsh-clock',
            updatedAt: '2026-08-14T00:30:00Z',
          },
          {
            archived: false,
            commit: '3'.repeat(40),
            description: 'Not a plugin bundle.',
            manifest: JSON.stringify({ name: 'not-a-bundle', version: '1.0.0' }),
            nameWithOwner: 'example/not-a-bundle',
            repository: 'https://github.com/example/not-a-bundle',
            updatedAt: '2026-08-14T00:20:00Z',
          },
          {
            archived: false,
            commit: reviewedEntry.source.commit,
            description: 'A reviewed plugin.',
            manifest: '{}',
            nameWithOwner: 'example/reviewed',
            repository: reviewedEntry.source.repository,
            updatedAt: '2026-08-14T00:10:00Z',
          },
        ],
        snapshotAt: '2026-08-14T00:30:00.000Z',
        totalCount: 3,
      }),
      inspectBundles: async () =>
        new Map([
          [
            'https://github.com/example/dsh-clock',
            {
              client: { byteSize: 20, oid: '4'.repeat(40) },
              license: { byteSize: 11, oid: '5'.repeat(40) },
              patch: {
                byteSize: 28,
                oid: '6'.repeat(40),
                text: '- name: dsh-clock\n  config: {}\n',
              },
              readme: {
                byteSize: 92,
                oid: '7'.repeat(40),
                text: '# dsh-clock\n\n![pixel](https://tracker.example/pixel.gif)\n<img src="https://tracker.example/raw.gif">\nAdds a clock panel.\n\n## Known limitations\n\nWeb only.',
              },
              readmeZh: null,
              runtime: { byteSize: 20, oid: '8'.repeat(40) },
            },
          ],
        ]),
    };
    const result = await syncTopicCatalogData({
      analysis: { entries: [], schemaVersion: 1, topic: 'dsh-plugin', totals: {} },
      catalog: {
        entries: [reviewedEntry],
        source: {
          generatedAt: '2026-08-13T00:00:00.000Z',
          policy: 'curated-pinned-source-contracts',
          repository: 'https://github.com/topics/dsh-plugin',
        },
        totals: { installable: 1, reviewed: 1, submitted: 0 },
      },
      github,
      now: new Date('2026-08-14T01:00:00+08:00'),
      reservedSlugs: ['dsh-clock'],
      registry: { generatedFrom: 'packages/catalog/src/community.generated.json', slugs: [] },
      sources: {
        entries: [sourceRecord],
        intake: 'https://dsh.pub/en/submit/',
        policy: {},
        reviewedAt: '2026-08-14',
        schemaVersion: 2,
        topic: 'dsh-plugin',
      },
      topic: 'dsh-plugin',
    });

    expect(result.catalog.totals).toEqual({
      automated: 1,
      installable: 2,
      reviewed: 1,
      submitted: 0,
    });
    expect(result.catalog.entries).toHaveLength(2);
    expect(result.catalog.entries[0]).toEqual(reviewedEntry);
    expect(result.catalog.entries[1]).toMatchObject({
      analysis: {
        method: 'automated-static-contract',
        revision: 1,
        status: 'verified',
        checks: {
          bundleManifest: true,
          committedClient: true,
          committedRuntime: true,
          license: true,
          pinnedCommit: true,
          publicRepository: true,
          readme: true,
          safeBundlePatch: true,
        },
      },
      category: 'client-ui',
      name: '@example/dsh-clock',
      slug: 'example-dsh-clock',
      provenance: {
        analyzedAt: '2026-08-14',
        discoveredVia: 'github-topic:dsh-plugin',
        status: 'community-automated',
      },
      runtime: {
        client: { inject: ['@deepseek-ai/dsh-client-runtime'], platform: 'web' },
        configurable: null,
        hostLoadable: true,
      },
      source: { commit: '2'.repeat(40) },
    });
    expect(result.catalog.entries[1].docs.readme.en).toBe(
      `https://raw.githubusercontent.com/example/dsh-clock/${'2'.repeat(40)}/README.md`,
    );
    expect(result.analysis).toMatchObject({
      schemaVersion: 1,
      snapshotAt: '2026-08-14T00:30:00.000Z',
      topic: 'dsh-plugin',
      totals: { discovered: 3, listed: 1, preserved: 1, rejected: 1 },
    });
    expect(result.analysis.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          repository: reviewedEntry.source.repository,
          status: 'preserved',
        }),
        expect.objectContaining({
          code: 'missing_bundle_manifest',
          repository: 'https://github.com/example/not-a-bundle',
          status: 'rejected',
        }),
        expect.objectContaining({
          repository: 'https://github.com/example/dsh-clock',
          status: 'listed',
        }),
      ]),
    );
    expect(result.sources.entries).toHaveLength(2);
    expect(result.sources.entries[1]).toMatchObject({
      automation: {
        analyzedAt: '2026-08-14',
        method: 'automated-static-contract',
      },
      bundlePatchPath: 'cordis.patch.yml',
      clientEntryPath: 'lib/client.js',
      packageName: '@example/dsh-clock',
      runtimeEntryPath: 'lib/index.js',
    });
    expect(result.registry.slugs).toEqual(['example--dsh-clock', 'example--reviewed']);

    const rerun = await syncTopicCatalogData({
      analysis: result.analysis,
      catalog: result.catalog,
      github: { ...github, inspectBundles: async () => new Map() },
      now: new Date('2026-08-15T01:00:00+08:00'),
      reservedSlugs: ['dsh-clock'],
      registry: result.registry,
      sources: result.sources,
      topic: 'dsh-plugin',
    });
    expect(rerun.catalog.entries[1].provenance.analyzedAt).toBe('2026-08-14');
    expect(rerun.sources.entries[1].automation.analyzedAt).toBe('2026-08-14');

    const deferred = await syncTopicCatalogData({
      analysis: rerun.analysis,
      catalog: rerun.catalog,
      github: {
        discoverTopic: async () => ({
          deferredRepositories: [
            {
              commit: '9'.repeat(40),
              nameWithOwner: 'example/dsh-clock',
              repository: 'https://github.com/example/dsh-clock',
              updatedAt: '2026-08-16T00:31:00Z',
            },
          ],
          observedTotalCount: 1,
          repositories: [],
          snapshotAt: '2026-08-16T00:30:00.000Z',
          totalCount: 0,
        }),
        inspectBundles: async () => new Map(),
      },
      now: new Date('2026-08-16T01:00:00+08:00'),
      reservedSlugs: ['dsh-clock'],
      registry: rerun.registry,
      sources: rerun.sources,
      topic: 'dsh-plugin',
    });
    expect(deferred.catalog.entries).toHaveLength(2);
    expect(deferred.catalog.entries[1].source.commit).toBe('2'.repeat(40));
    expect(deferred.sources.entries[1].commit).toBe('2'.repeat(40));
    expect(deferred.analysis).toMatchObject({
      totals: { deferred: 1, discovered: 0, observed: 1 },
    });
    expect(deferred.analysis.entries).toContainEqual({
      commit: '9'.repeat(40),
      previousCommit: '2'.repeat(40),
      repository: 'https://github.com/example/dsh-clock',
      status: 'deferred',
    });

    const unresolved = await syncTopicCatalogData({
      analysis: rerun.analysis,
      catalog: rerun.catalog,
      github: {
        discoverTopic: async () => ({
          complete: false,
          deferredRepositories: [],
          observedTotalCount: 1,
          repositories: [],
          snapshotAt: '2026-08-16T00:30:00.000Z',
          totalCount: 0,
          unresolvedCount: 1,
        }),
        inspectBundles: async () => new Map(),
      },
      now: new Date('2026-08-16T01:00:00+08:00'),
      reservedSlugs: ['dsh-clock'],
      registry: rerun.registry,
      sources: rerun.sources,
      topic: 'dsh-plugin',
    });
    expect(unresolved.catalog.entries).toHaveLength(2);
    expect(unresolved.catalog.entries[1].source.commit).toBe('2'.repeat(40));
    expect(unresolved.analysis).toMatchObject({
      complete: false,
      totals: { retainedUnresolved: 1, unresolved: 1 },
    });
    expect(unresolved.analysis.entries).toContainEqual({
      commit: '2'.repeat(40),
      repository: 'https://github.com/example/dsh-clock',
      status: 'unresolved',
    });
  });
});
