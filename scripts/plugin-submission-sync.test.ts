import { describe, expect, it } from 'vitest';

import { loadMergedSubmissionRequest } from './lib/plugin-submission-sync.mjs';

const content = `${JSON.stringify(
  {
    repository: 'https://github.com/example/dsh-clock',
    schemaVersion: 1,
  },
  null,
  2,
)}\n`;

describe('merged plugin submission provenance', () => {
  it('binds the merged file to the pull request that introduced its exact commit', async () => {
    const request = await loadMergedSubmissionRequest({
      content,
      fetch: async (input) => {
        const url = new URL(String(input));
        expect(url.pathname).toBe(`/repos/dsh-pub/dsh-pub/commits/${'a'.repeat(40)}/pulls`);
        return new Response(
          JSON.stringify([
            {
              base: { ref: 'main' },
              created_at: '2026-08-14T06:00:00Z',
              html_url: 'https://github.com/dsh-pub/dsh-pub/pull/42',
              merged_at: '2026-08-14T06:10:00Z',
            },
          ]),
          { status: 200 },
        );
      },
      gitCommit: async () => ({ date: '2026-08-14T06:10:00Z', sha: 'a'.repeat(40) }),
      path: 'submissions/example--dsh-clock.json',
      token: 'test-token',
    });

    expect(request).toEqual({
      content,
      createdAt: '2026-08-14T06:00:00Z',
      path: 'submissions/example--dsh-clock.json',
      updatedAt: '2026-08-14T06:10:00Z',
      url: 'https://github.com/dsh-pub/dsh-pub/pull/42',
    });
  });
});
