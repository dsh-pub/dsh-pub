import { describe, expect, it } from 'vitest';

import { createSubmissionUpdate, parseSubmissionIssue } from './lib/plugin-submission.mjs';

const issueBody = `### GitHub repository
https://github.com/example/dsh-clock

### Package path
_root_

### English summary
Adds a clock tool to DeepSeek Harness.

### Chinese summary
为 DeepSeek Harness 增加时钟工具。

### Category
tool

### Submission contract
Accepted by submitting this Issue.`;

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

describe('GitHub Issue plugin integration', () => {
  it('parses the deterministic Issue Form contract', () => {
    expect(parseSubmissionIssue(issueBody)).toEqual({
      category: 'tool',
      descriptionEn: 'Adds a clock tool to DeepSeek Harness.',
      descriptionZh: '为 DeepSeek Harness 增加时钟工具。',
      directory: '',
      owner: 'example',
      repo: 'dsh-clock',
      repository: 'https://github.com/example/dsh-clock',
    });
  });

  it('accepts GitHub Issue Form empty-value markers', () => {
    const formBody = issueBody
      .replace('### Package path\n_root_', '### Package path\n_No response_')
      .replace(
        '### Chinese summary\n为 DeepSeek Harness 增加时钟工具。',
        '### Chinese summary\n_No response_',
      );

    expect(parseSubmissionIssue(formBody)).toMatchObject({
      descriptionZh: '',
      directory: '',
    });
  });

  it('pins and machine-validates the bundle without executing repository code', async () => {
    const update = await createSubmissionUpdate({
      communityCatalog: {
        entries: [],
        source: {
          generatedAt: '2026-08-14T00:00:00.000Z',
          policy: 'pinned-source-contracts',
          repository: 'https://github.com/dsh-pub/dsh-pub/issues',
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
      issue: {
        body: issueBody,
        createdAt: '2026-08-14T06:00:00Z',
        number: 42,
        updatedAt: '2026-08-14T06:05:00Z',
        url: 'https://github.com/dsh-pub/dsh-pub/issues/42',
      },
      registry: { generatedFrom: 'packages/catalog/src/community.generated.json', slugs: [] },
      token: 'test-token',
    });

    expect(update.changed).toBe(true);
    expect(update.entry).toMatchObject({
      name: '@example/dsh-clock',
      provenance: {
        issue: 'https://github.com/dsh-pub/dsh-pub/issues/42',
        status: 'community-submitted',
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

  it('rejects unchecked contracts before any repository inspection', async () => {
    const invalid = issueBody.replace(
      'Accepted by submitting this Issue.',
      'I do not accept the submission boundary.',
    );
    expect(() => parseSubmissionIssue(invalid)).toThrow('Submission contract');
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
            repository: 'https://github.com/dsh-pub/dsh-pub/issues',
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
        issue: {
          body: issueBody,
          createdAt: '2026-08-14T06:00:00Z',
          number: 42,
          updatedAt: '2026-08-14T06:05:00Z',
          url: 'https://github.com/dsh-pub/dsh-pub/issues/42',
        },
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
          repository: 'https://github.com/dsh-pub/dsh-pub/issues',
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
      issue: {
        body: issueBody,
        createdAt: '2026-08-14T06:00:00Z',
        number: 42,
        updatedAt: '2026-08-14T06:05:00Z',
        url: 'https://github.com/dsh-pub/dsh-pub/issues/42',
      },
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
      issue: {
        body: issueBody.replace(
          'Adds a clock tool to DeepSeek Harness.',
          'A different submitter tries to replace this summary.',
        ),
        createdAt: '2026-08-14T07:00:00Z',
        number: 43,
        updatedAt: '2026-08-14T07:05:00Z',
        url: 'https://github.com/dsh-pub/dsh-pub/issues/43',
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
            repository: 'https://github.com/dsh-pub/dsh-pub/issues',
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
        issue: {
          body: issueBody,
          createdAt: '2026-08-14T06:00:00Z',
          number: 42,
          updatedAt: '2026-08-14T06:05:00Z',
          url: 'https://github.com/dsh-pub/dsh-pub/issues/42',
        },
        registry: { generatedFrom: 'packages/catalog/src/community.generated.json', slugs: [] },
        token: 'test-token',
      }),
    ).rejects.toThrow('package metadata');
  });
});
