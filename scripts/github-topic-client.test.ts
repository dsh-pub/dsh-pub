import { describe, expect, it } from 'vitest';

import { createGitHubTopicClient } from './lib/github-topic-client.mjs';

const response = (data: unknown) =>
  new Response(JSON.stringify({ data }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });

const repositoryNode = ({
  commit,
  nameWithOwner,
  updatedAt,
}: {
  commit: string;
  nameWithOwner: string;
  updatedAt: string;
}) => ({
  defaultBranchRef: { name: 'main', target: { oid: commit } },
  description: `${nameWithOwner} description`,
  isArchived: false,
  isPrivate: false,
  nameWithOwner,
  updatedAt,
  url: `https://github.com/${nameWithOwner}`,
});

describe('GitHub Topic GraphQL client', () => {
  it('paginates the complete topic and reads candidate files at pinned commits', async () => {
    const calls: Array<{ query: string; variables: Record<string, unknown> }> = [];
    const pages = [
      response({
        rateLimit: { cost: 1, remaining: 999, resetAt: '2026-08-14T02:00:00Z' },
        topic: {
          repositories: {
            nodes: [
              repositoryNode({
                commit: '1'.repeat(40),
                nameWithOwner: 'example/one',
                updatedAt: '2026-08-14T00:00:00Z',
              }),
            ],
            pageInfo: { endCursor: 'cursor-1', hasNextPage: true },
            totalCount: 2,
          },
        },
      }),
      response({
        rateLimit: { cost: 1, remaining: 998, resetAt: '2026-08-14T02:00:00Z' },
        topic: {
          repositories: {
            nodes: [
              repositoryNode({
                commit: '2'.repeat(40),
                nameWithOwner: 'example/two',
                updatedAt: '2026-08-14T00:30:00Z',
              }),
            ],
            pageInfo: { endCursor: 'cursor-2', hasNextPage: false },
            totalCount: 2,
          },
        },
      }),
      response({
        m0: {
          object: { byteSize: 14, oid: '9'.repeat(40), text: '{"name":"one"}' },
        },
        m1: {
          object: { byteSize: 14, oid: 'a'.repeat(40), text: '{"name":"two"}' },
        },
        rateLimit: { cost: 1, remaining: 997, resetAt: '2026-08-14T02:00:00Z' },
      }),
      response({
        r0: {
          client: { byteSize: 20, oid: '3'.repeat(40) },
          license: { byteSize: 11, oid: '4'.repeat(40) },
          licenseMd: null,
          patch: { byteSize: 20, oid: '5'.repeat(40), text: '- name: plugin\n' },
          readme: { byteSize: 20, oid: '6'.repeat(40), text: '# Plugin' },
          readmeZh: null,
          readmeZhCn: { byteSize: 20, oid: '7'.repeat(40), text: '# 插件' },
          runtime: { byteSize: 20, oid: '8'.repeat(40) },
        },
        rateLimit: { cost: 1, remaining: 996, resetAt: '2026-08-14T02:00:00Z' },
      }),
    ];
    const client = createGitHubTopicClient({
      fetch: async (_input, init) => {
        const body = JSON.parse(String(init?.body));
        calls.push(body);
        const next = pages.shift();
        if (!next) throw new Error('Unexpected GraphQL request.');
        return next;
      },
      now: () => new Date('2026-08-14T00:30:00Z'),
      sleep: async () => {},
      token: 'test-token',
    });

    const discovery = await client.discoverTopic('dsh-plugin');
    expect(discovery).toMatchObject({
      snapshotAt: '2026-08-14T00:30:00.000Z',
      totalCount: 2,
    });
    expect(discovery.repositories.map((repository) => repository.nameWithOwner)).toEqual([
      'example/one',
      'example/two',
    ]);
    expect(discovery.repositories.map((repository) => repository.manifest)).toEqual([
      '{"name":"one"}',
      '{"name":"two"}',
    ]);
    expect(calls[0].query).toContain('topic(name: $topic)');
    expect(calls[0].query).toContain('orderBy: { field: UPDATED_AT, direction: DESC }');
    expect(calls[1].variables.cursor).toBe('cursor-1');
    expect(calls[2].variables).toMatchObject({
      manifest0: `${'1'.repeat(40)}:package.json`,
      manifest1: `${'2'.repeat(40)}:package.json`,
    });

    const candidate = {
      contract: {
        client: { descriptor: { platform: 'web' }, entryPath: 'lib/client.js' },
        patchPath: 'cordis.patch.yml',
        runtimePath: 'lib/index.js',
      },
      repository: discovery.repositories[0],
    };
    const inspected = await client.inspectBundles([candidate]);
    expect(inspected.get('https://github.com/example/one')).toMatchObject({
      client: { oid: '3'.repeat(40) },
      license: { path: 'LICENSE' },
      patch: { text: '- name: plugin\n' },
      readme: { path: 'README.md', text: '# Plugin' },
      readmeZh: { path: 'README.zh-CN.md', text: '# 插件' },
      runtime: { oid: '8'.repeat(40) },
    });
    expect(calls[3].variables).toMatchObject({
      client0: `${'1'.repeat(40)}:lib/client.js`,
      patch0: `${'1'.repeat(40)}:cordis.patch.yml`,
      runtime0: `${'1'.repeat(40)}:lib/index.js`,
    });
  });

  it('marks an empty drifting Topic pass as incomplete', async () => {
    const client = createGitHubTopicClient({
      fetch: async () =>
        response({
          rateLimit: { cost: 1, remaining: 999, resetAt: '2026-08-14T02:00:00Z' },
          topic: {
            repositories: {
              nodes: [],
              pageInfo: { endCursor: null, hasNextPage: false },
              totalCount: 2,
            },
          },
        }),
      now: () => new Date('2026-08-14T00:30:00Z'),
      sleep: async () => {},
      token: 'test-token',
    });

    await expect(client.discoverTopic('dsh-plugin')).resolves.toMatchObject({
      complete: false,
      observedTotalCount: 2,
      totalCount: 0,
      unresolvedCount: 2,
    });
  });

  it('marks a non-empty terminal page as incomplete when it is below totalCount', async () => {
    const client = createGitHubTopicClient({
      fetch: async () =>
        response({
          rateLimit: { cost: 1, remaining: 999, resetAt: '2026-08-14T02:00:00Z' },
          topic: {
            repositories: {
              nodes: [
                repositoryNode({
                  commit: '1'.repeat(40),
                  nameWithOwner: 'example/one',
                  updatedAt: '2026-08-14T00:00:00Z',
                }),
              ],
              pageInfo: { endCursor: null, hasNextPage: false },
              totalCount: 2,
            },
          },
        }),
      now: () => new Date('2026-08-14T00:30:00Z'),
      sleep: async () => {},
      token: 'test-token',
    });

    await expect(client.discoverTopic('dsh-plugin')).resolves.toMatchObject({
      complete: false,
      observedTotalCount: 2,
      repositories: [expect.objectContaining({ repository: 'https://github.com/example/one' })],
      totalCount: 1,
      unresolvedCount: 1,
    });
  });

  it('restarts Topic pagination after a transient count drift', async () => {
    let requests = 0;
    const client = createGitHubTopicClient({
      fetch: async () => {
        requests += 1;
        return response({
          rateLimit: { cost: 1, remaining: 999, resetAt: '2026-08-14T02:00:00Z' },
          topic: {
            repositories: {
              nodes: [],
              pageInfo: { endCursor: null, hasNextPage: false },
              totalCount: requests === 1 ? 1 : 0,
            },
          },
        });
      },
      now: () => new Date('2026-08-14T00:30:00Z'),
      sleep: async () => {},
      token: 'test-token',
    });

    await expect(client.discoverTopic('dsh-plugin')).resolves.toMatchObject({
      complete: true,
      totalCount: 0,
      unresolvedCount: 0,
    });
    expect(requests).toBe(2);
  });

  it('uses a cutoff snapshot and defers repositories updated during the run', async () => {
    const pages = [
      response({
        rateLimit: { cost: 1, remaining: 999, resetAt: '2026-08-14T02:00:00Z' },
        topic: {
          repositories: {
            nodes: [
              repositoryNode({
                commit: '1'.repeat(40),
                nameWithOwner: 'example/one',
                updatedAt: '2026-08-14T00:00:00Z',
              }),
              repositoryNode({
                commit: '1'.repeat(40),
                nameWithOwner: 'example/two',
                updatedAt: '2026-08-14T00:31:00Z',
              }),
            ],
            pageInfo: { endCursor: null, hasNextPage: false },
            totalCount: 2,
          },
        },
      }),
      response({
        m0: { object: { byteSize: 2, oid: '3'.repeat(40), text: '{}' } },
        rateLimit: { cost: 1, remaining: 997, resetAt: '2026-08-14T02:00:00Z' },
      }),
    ];
    const client = createGitHubTopicClient({
      fetch: async () => {
        const next = pages.shift();
        if (!next) throw new Error('Unexpected GraphQL request.');
        return next;
      },
      now: () => new Date('2026-08-14T00:30:00Z'),
      token: 'test-token',
    });

    await expect(client.discoverTopic('dsh-plugin')).resolves.toMatchObject({
      deferredRepositories: [
        expect.objectContaining({ repository: 'https://github.com/example/two' }),
      ],
      observedTotalCount: 2,
      snapshotAt: '2026-08-14T00:30:00.000Z',
      totalCount: 1,
    });
  });

  it('retries a transient GitHub gateway failure', async () => {
    let requests = 0;
    const client = createGitHubTopicClient({
      fetch: async () => {
        requests += 1;
        if (requests === 1) return new Response('Bad Gateway', { status: 502 });
        return response({
          rateLimit: { cost: 1, remaining: 999, resetAt: '2026-08-14T02:00:00Z' },
          topic: {
            repositories: {
              nodes: [],
              pageInfo: { endCursor: null, hasNextPage: false },
              totalCount: 0,
            },
          },
        });
      },
      now: () => new Date('2026-08-14T00:30:00Z'),
      sleep: async () => {},
      token: 'test-token',
    });

    await expect(client.discoverTopic('dsh-plugin')).resolves.toMatchObject({ totalCount: 0 });
    expect(requests).toBe(2);
  });

  it('retries an HTTP rate limit response and honors Retry-After', async () => {
    let requests = 0;
    const waits: number[] = [];
    const client = createGitHubTopicClient({
      fetch: async () => {
        requests += 1;
        if (requests === 1) {
          return new Response(JSON.stringify({ message: 'secondary rate limit' }), {
            headers: { 'Content-Type': 'application/json', 'Retry-After': '2' },
            status: 403,
          });
        }
        return response({
          rateLimit: { cost: 1, remaining: 999, resetAt: '2026-08-14T02:00:00Z' },
          topic: {
            repositories: {
              nodes: [],
              pageInfo: { endCursor: null, hasNextPage: false },
              totalCount: 0,
            },
          },
        });
      },
      now: () => new Date('2026-08-14T00:30:00Z'),
      sleep: async (milliseconds) => {
        waits.push(milliseconds);
      },
      token: 'test-token',
    });

    await expect(client.discoverTopic('dsh-plugin')).resolves.toMatchObject({ totalCount: 0 });
    expect(requests).toBe(2);
    expect(waits).toEqual([2_000]);
  });

  it('retries GraphQL rate limit errors returned with HTTP 200', async () => {
    let requests = 0;
    const waits: number[] = [];
    const client = createGitHubTopicClient({
      fetch: async () => {
        requests += 1;
        if (requests === 1) {
          return new Response(
            JSON.stringify({
              data: null,
              errors: [{ message: 'API rate limit exceeded for this resource.' }],
            }),
            { headers: { 'Content-Type': 'application/json' }, status: 200 },
          );
        }
        return response({
          rateLimit: { cost: 1, remaining: 999, resetAt: '2026-08-14T02:00:00Z' },
          topic: {
            repositories: {
              nodes: [],
              pageInfo: { endCursor: null, hasNextPage: false },
              totalCount: 0,
            },
          },
        });
      },
      now: () => new Date('2026-08-14T00:30:00Z'),
      sleep: async (milliseconds) => {
        waits.push(milliseconds);
      },
      token: 'test-token',
    });

    await expect(client.discoverTopic('dsh-plugin')).resolves.toMatchObject({ totalCount: 0 });
    expect(requests).toBe(2);
    expect(waits).toEqual([60_000]);
  });

  it('keeps the snapshot when a repository disappears before manifest inspection', async () => {
    const pages = [
      response({
        rateLimit: { cost: 1, remaining: 999, resetAt: '2026-08-14T02:00:00Z' },
        topic: {
          repositories: {
            nodes: [
              repositoryNode({
                commit: '1'.repeat(40),
                nameWithOwner: 'example/removed',
                updatedAt: '2026-08-14T00:00:00Z',
              }),
            ],
            pageInfo: { endCursor: null, hasNextPage: false },
            totalCount: 1,
          },
        },
      }),
      new Response(
        JSON.stringify({
          data: { m0: null },
          errors: [
            {
              message: "Could not resolve to a Repository with the name 'example/removed'.",
              path: ['m0'],
            },
          ],
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 },
      ),
    ];
    const client = createGitHubTopicClient({
      fetch: async () => {
        const next = pages.shift();
        if (!next) throw new Error('Unexpected GraphQL request.');
        return next;
      },
      now: () => new Date('2026-08-14T00:30:00Z'),
      token: 'test-token',
    });

    const discovery = await client.discoverTopic('dsh-plugin');
    expect(discovery.repositories[0]).toMatchObject({
      manifest: null,
      repository: 'https://github.com/example/removed',
    });
  });
});
