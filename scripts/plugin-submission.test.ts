import { describe, expect, it } from 'vitest';

import {
  createSubmissionUpdate,
  parseSubmissionFile,
  submissionFilePath,
} from './lib/plugin-submission.mjs';

const submissionContent = `${JSON.stringify(
  {
    repository: 'https://github.com/example/dsh-clock',
    schemaVersion: 1,
  },
  null,
  2,
)}\n`;
const request = {
  content: submissionContent,
  createdAt: '2026-08-14T06:00:00Z',
  path: 'submissions/example--dsh-clock.json',
  updatedAt: '2026-08-14T06:05:00Z',
  url: 'https://github.com/dsh-pub/dsh-pub/pull/42',
};

const githubResponse = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });

const fileResponse = (content = '') =>
  githubResponse({
    content: Buffer.from(content).toString('base64'),
    encoding: 'base64',
    type: 'file',
  });

const manifest = JSON.stringify({
  description: 'Adds a clock tool to DeepSeek Harness.',
  dsh: { bundle: { patch: 'cordis.patch.yml' }, client: 'lib/client.js' },
  license: 'MIT',
  main: 'lib/index.js',
  name: '@example/dsh-clock',
  version: '1.2.3',
});

const fetchGitHub: typeof fetch = async (input) => {
  const url = new URL(String(input));
  if (url.pathname === '/repos/example/dsh-clock') {
    return githubResponse({ archived: false, default_branch: 'main', private: false });
  }
  if (url.pathname === '/repos/example/dsh-clock/commits/main') {
    return githubResponse({ commit: { tree: { sha: 'b'.repeat(40) } }, sha: 'a'.repeat(40) });
  }
  if (url.pathname === `/repos/example/dsh-clock/git/trees/${'b'.repeat(40)}`) {
    return githubResponse({
      tree: [
        'package.json',
        'cordis.patch.yml',
        'README.md',
        'LICENSE',
        'lib/index.js',
        'lib/client.js',
      ].map((path) => ({ mode: '100644', path, type: 'blob' })),
      truncated: false,
    });
  }
  const contentPath = decodeURIComponent(
    url.pathname.replace('/repos/example/dsh-clock/contents/', ''),
  );
  if (contentPath === 'package.json') return fileResponse(manifest);
  if (contentPath === 'cordis.patch.yml') return fileResponse('- name: dsh-clock\n  config: {}\n');
  if (contentPath === 'README.md') return fileResponse('# dsh-clock');
  if (contentPath === 'LICENSE') return fileResponse('MIT License');
  if (contentPath === 'lib/index.js' || contentPath === 'lib/client.js') {
    return fileResponse('export default function plugin() {}');
  }
  return githubResponse({ message: 'Not Found' }, 404);
};

const submissionUpdateInput = (fetcher: typeof fetch) => ({
  communityCatalog: {
    entries: [],
    source: {
      generatedAt: '2026-08-14T00:00:00.000Z',
      policy: 'pinned-source-contracts',
      repository: 'https://github.com/dsh-pub/dsh-pub',
    },
    totals: { installable: 0, reviewed: 0, submitted: 0 },
  },
  communitySources: {
    entries: [],
    policy: {},
    reviewedAt: '2026-08-14',
    schemaVersion: 2,
    topic: 'dsh-plugin',
  },
  fetch: fetcher,
  request,
  registry: { generatedFrom: 'packages/catalog/src/community.generated.json', slugs: [] },
  token: 'test-token',
});

describe('GitHub pull request plugin integration', () => {
  it('parses the single-file submission contract', () => {
    const submission = parseSubmissionFile(submissionContent);
    expect(submission).toEqual({
      directory: '',
      owner: 'example',
      repo: 'dsh-clock',
      repository: 'https://github.com/example/dsh-clock',
    });
    expect(submissionFilePath(submission)).toBe('submissions/example--dsh-clock.json');
  });

  it('rejects extra fields and repository path segments', () => {
    expect(() =>
      parseSubmissionFile(
        submissionContent.replace(
          'example/dsh-clock',
          'example/dsh-clock/tree/main/packages/plugin',
        ),
      ),
    ).toThrow('owner/repository');
    expect(() =>
      parseSubmissionFile(
        JSON.stringify({
          repository: 'https://github.com/example/dsh-clock',
          schemaVersion: 1,
          title: 'submitter-controlled metadata',
        }),
      ),
    ).toThrow('only schemaVersion and repository');
  });

  it('pins and machine-validates the bundle without executing repository code', async () => {
    const update = await createSubmissionUpdate({
      communityCatalog: {
        entries: [],
        source: {
          generatedAt: '2026-08-14T00:00:00.000Z',
          policy: 'pinned-source-contracts',
          repository: 'https://github.com/dsh-pub/dsh-pub',
        },
        totals: { installable: 0, reviewed: 0, submitted: 0 },
      },
      communitySources: {
        entries: [],
        policy: {},
        reviewedAt: '2026-08-14',
        schemaVersion: 2,
        topic: 'dsh-plugin',
      },
      fetch: fetchGitHub,
      request,
      registry: { generatedFrom: 'packages/catalog/src/community.generated.json', slugs: [] },
      token: 'test-token',
    });

    expect(update.changed).toBe(true);
    expect(update.entry).toMatchObject({
      category: 'ui',
      description: {
        en: 'Adds a clock tool to DeepSeek Harness.',
        zh: 'Adds a clock tool to DeepSeek Harness.',
      },
      name: '@example/dsh-clock',
      provenance: {
        pullRequest: 'https://github.com/dsh-pub/dsh-pub/pull/42',
        status: 'community-submitted',
        submittedVia: 'github-pull-request',
      },
      source: { commit: 'a'.repeat(40), directory: '' },
      version: '1.2.3',
    });
    expect(update.entry).toMatchObject({
      availability: { defaultWeb: null, profiles: null },
      capabilities: { tools: null, uiContributions: null, uiSlotsDeclared: null },
      runtime: { client: null, configurable: null, hostLoadable: null },
    });
    expect(update.communityCatalog.totals).toEqual({
      automated: 0,
      installable: 1,
      reviewed: 0,
      submitted: 1,
    });
    expect(update.registry.slugs).toEqual(['example--dsh-clock']);
    expect(update.communitySources.entries[0]).toMatchObject({
      bundlePatchPath: 'cordis.patch.yml',
      commit: 'a'.repeat(40),
      runtimeEntryPath: 'lib/index.js',
    });
  });

  it('accepts the official object-form client contract and inspects its exported bundle', async () => {
    const objectClientManifest = JSON.stringify({
      ...JSON.parse(manifest),
      dsh: {
        bundle: { patch: 'cordis.patch.yml' },
        client: { immediately: true, inject: [], platform: 'web' },
      },
      exports: { '.': './lib/index.js', './client': './lib/client.js' },
    });
    let clientReads = 0;
    const objectClientFetch: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/contents/package.json')) {
        return fileResponse(objectClientManifest);
      }
      if (url.pathname.endsWith('/contents/lib/client.js')) clientReads += 1;
      return fetchGitHub(input, init);
    };

    const update = await createSubmissionUpdate(submissionUpdateInput(objectClientFetch));

    expect(clientReads).toBe(1);
    expect(update.entry.category).toBe('ui');
  });

  it.each([
    ['a missing ./client export', { '.': './lib/index.js' }],
    [
      'an import-only ./client export',
      { '.': './lib/index.js', './client': { import: './lib/client.js' } },
    ],
  ])('rejects object-form client metadata with %s', async (_label, exportsField) => {
    const invalidClientManifest = JSON.stringify({
      ...JSON.parse(manifest),
      dsh: {
        bundle: { patch: 'cordis.patch.yml' },
        client: { platform: 'web' },
      },
      exports: exportsField,
    });
    const invalidClientFetch: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/contents/package.json')) {
        return fileResponse(invalidClientManifest);
      }
      return fetchGitHub(input, init);
    };

    await expect(
      createSubmissionUpdate(submissionUpdateInput(invalidClientFetch)),
    ).rejects.toMatchObject({ code: 'invalid_client' });
  });

  it('rejects a submission path that does not match the normalized repository', async () => {
    await expect(
      createSubmissionUpdate({
        communityCatalog: {
          entries: [],
          source: {
            generatedAt: '2026-08-14T00:00:00.000Z',
            policy: 'pinned-source-contracts',
            repository: 'https://github.com/dsh-pub/dsh-pub',
          },
          totals: { installable: 0, reviewed: 0, submitted: 0 },
        },
        communitySources: {
          entries: [],
          policy: {},
          reviewedAt: '2026-08-14',
          schemaVersion: 2,
          topic: 'dsh-plugin',
        },
        fetch: fetchGitHub,
        request: { ...request, path: 'submissions/someone--else.json' },
        registry: { generatedFrom: 'packages/catalog/src/community.generated.json', slugs: [] },
        token: 'test-token',
      }),
    ).rejects.toThrow('Submission filename');
  });

  it('rejects symlinked contract files from the fixed Git tree', async () => {
    const symlinkFetch: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === `/repos/example/dsh-clock/git/trees/${'b'.repeat(40)}`) {
        const response = await fetchGitHub(input, init);
        const tree = await response.json();
        tree.tree = tree.tree.map((entry: { mode: string; path: string; type: string }) =>
          entry.path === 'cordis.patch.yml' ? { ...entry, mode: '120000', type: 'blob' } : entry,
        );
        return githubResponse(tree);
      }
      return fetchGitHub(input, init);
    };

    await expect(
      createSubmissionUpdate({
        communityCatalog: {
          entries: [],
          source: {
            generatedAt: '2026-08-14T00:00:00.000Z',
            policy: 'pinned-source-contracts',
            repository: 'https://github.com/dsh-pub/dsh-pub',
          },
          totals: { installable: 0, reviewed: 0, submitted: 0 },
        },
        communitySources: {
          entries: [],
          policy: {},
          reviewedAt: '2026-08-14',
          schemaVersion: 2,
          topic: 'dsh-plugin',
        },
        fetch: symlinkFetch,
        request,
        registry: { generatedFrom: 'packages/catalog/src/community.generated.json', slugs: [] },
        token: 'test-token',
      }),
    ).rejects.toThrow('regular committed file');
  });

  it('keeps existing coordinates immutable without inspecting the remote repository again', async () => {
    const first = await createSubmissionUpdate({
      communityCatalog: {
        entries: [],
        source: {
          generatedAt: '2026-08-14T00:00:00.000Z',
          policy: 'pinned-source-contracts',
          repository: 'https://github.com/dsh-pub/dsh-pub',
        },
        totals: { installable: 0, reviewed: 0, submitted: 0 },
      },
      communitySources: {
        entries: [],
        policy: {},
        reviewedAt: '2026-08-14',
        schemaVersion: 2,
        topic: 'dsh-plugin',
      },
      fetch: fetchGitHub,
      request,
      registry: { generatedFrom: 'packages/catalog/src/community.generated.json', slugs: [] },
      token: 'test-token',
    });
    let fetches = 0;
    const second = await createSubmissionUpdate({
      communityCatalog: first.communityCatalog,
      communitySources: first.communitySources,
      fetch: async () => {
        fetches += 1;
        throw new Error('existing coordinates must not fetch');
      },
      request: {
        ...request,
        createdAt: '2026-08-14T07:00:00Z',
        updatedAt: '2026-08-14T07:05:00Z',
        url: 'https://github.com/dsh-pub/dsh-pub/pull/43',
      },
      registry: first.registry,
      token: 'test-token',
    });

    expect(fetches).toBe(0);
    expect(second.changed).toBe(false);
    expect(second.entry.description.en).toBe('Adds a clock tool to DeepSeek Harness.');
  });

  it('rejects unbounded package metadata', async () => {
    const oversizedManifest = JSON.stringify({
      ...JSON.parse(manifest),
      name: `@example/${'a'.repeat(220)}`,
    });
    const metadataFetch: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/contents/package.json')) {
        return fileResponse(oversizedManifest);
      }
      return fetchGitHub(input, init);
    };

    await expect(
      createSubmissionUpdate({
        communityCatalog: {
          entries: [],
          source: {
            generatedAt: '2026-08-14T00:00:00.000Z',
            policy: 'pinned-source-contracts',
            repository: 'https://github.com/dsh-pub/dsh-pub',
          },
          totals: { installable: 0, reviewed: 0, submitted: 0 },
        },
        communitySources: {
          entries: [],
          policy: {},
          reviewedAt: '2026-08-14',
          schemaVersion: 2,
          topic: 'dsh-plugin',
        },
        fetch: metadataFetch,
        request,
        registry: { generatedFrom: 'packages/catalog/src/community.generated.json', slugs: [] },
        token: 'test-token',
      }),
    ).rejects.toThrow('package metadata');
  });
});
