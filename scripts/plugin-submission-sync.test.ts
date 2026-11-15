import { describe, expect, it, vi } from 'vitest';

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
  const options = {
    content,
    gitCommit: async () => ({ date: '2026-08-14T06:10:00Z', sha: 'a'.repeat(40) }),
    path: 'submissions/example--dsh-clock.json',
    token: 'test-token',
  };

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

  it.each([500, 502, 503, 504])('recovers from a transient HTTP %s', async (status) => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('Unavailable', { status }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              base: { ref: 'main' },
              created_at: '2026-08-14T06:00:00Z',
              html_url: 'https://github.com/dsh-pub/dsh-pub/pull/42',
              merged_at: '2026-08-14T06:10:00Z',
            },
          ]),
        ),
      );
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(loadMergedSubmissionRequest({ ...options, fetch, sleep })).resolves.toMatchObject({
      url: 'https://github.com/dsh-pub/dsh-pub/pull/42',
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledExactlyOnceWith(1_000);
  });

  it('stops after three server failures without bypassing provenance', async () => {
    const fetch = vi.fn(async () => new Response('Unavailable', { status: 500 }));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(loadMergedSubmissionRequest({ ...options, fetch, sleep })).rejects.toMatchObject({
      code: 'github_unavailable',
    });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[1_000], [2_000]]);
  });

  it.each([401, 403, 404])('rejects HTTP %s without retrying', async (status) => {
    const fetch = vi.fn(async () => new Response('Denied', { status }));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(loadMergedSubmissionRequest({ ...options, fetch, sleep })).rejects.toMatchObject({
      code: 'github_unavailable',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('still rejects an unverified response after a transient failure', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('Unavailable', { status: 500 }))
      .mockResolvedValueOnce(new Response('[]'));

    await expect(
      loadMergedSubmissionRequest({ ...options, fetch, sleep: async () => {} }),
    ).rejects.toMatchObject({ code: 'missing_submission_pull_request' });
  });
});
