import { describe, expect, it } from 'vitest';

import { loadPullRequestSubmission } from './lib/plugin-submission-pr.mjs';

const content = `${JSON.stringify(
  {
    repository: 'https://github.com/example/dsh-clock',
    schemaVersion: 1,
  },
  null,
  2,
)}\n`;

const event = {
  pull_request: {
    base: { ref: 'main', sha: 'b'.repeat(40) },
    changed_files: 1,
    created_at: '2026-08-14T06:00:00Z',
    draft: false,
    head: {
      repo: { full_name: 'contributor/dsh-pub' },
      sha: 'a'.repeat(40),
    },
    html_url: 'https://github.com/dsh-pub/dsh-pub/pull/42',
    number: 42,
    updated_at: '2026-08-14T06:05:00Z',
  },
  repository: { full_name: 'dsh-pub/dsh-pub' },
};

const response = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });

const fetchPullRequest: typeof fetch = async (input) => {
  const url = new URL(String(input));
  if (url.pathname === '/repos/dsh-pub/dsh-pub/pulls/42/files') {
    return response([{ filename: 'submissions/example--dsh-clock.json', status: 'added' }]);
  }
  if (
    url.pathname === '/repos/contributor/dsh-pub/contents/submissions/example--dsh-clock.json' &&
    url.searchParams.get('ref') === 'a'.repeat(40)
  ) {
    return response({
      content: Buffer.from(content).toString('base64'),
      encoding: 'base64',
      size: Buffer.byteLength(content),
      type: 'file',
    });
  }
  return new Response('{}', { status: 404 });
};

describe('plugin submission pull request boundary', () => {
  it('loads one added submission file at the exact fork head SHA', async () => {
    await expect(
      loadPullRequestSubmission({ event, fetch: fetchPullRequest, token: 'test-token' }),
    ).resolves.toEqual({
      baseSha: 'b'.repeat(40),
      headSha: 'a'.repeat(40),
      number: 42,
      request: {
        content,
        createdAt: '2026-08-14T06:00:00Z',
        path: 'submissions/example--dsh-clock.json',
        updatedAt: '2026-08-14T06:05:00Z',
        url: 'https://github.com/dsh-pub/dsh-pub/pull/42',
      },
    });
  });

  it('rejects pull requests that change anything outside the one submission file', async () => {
    await expect(
      loadPullRequestSubmission({
        event: {
          ...event,
          pull_request: { ...event.pull_request, changed_files: 2 },
        },
        fetch: fetchPullRequest,
        token: 'test-token',
      }),
    ).rejects.toThrow('exactly one file');
  });
});
