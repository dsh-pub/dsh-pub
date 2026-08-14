import { describe, expect, it } from 'vitest';

import {
  buildSubmissionArtifacts,
  createPluginSubmission,
  getPluginSubmissionConfig,
  getPluginSubmission,
  normalizeGitHubRepository,
} from './submission.js';

describe('plugin submission artifacts', () => {
  it('normalizes a public GitHub repository', () => {
    expect(normalizeGitHubRepository('https://github.com/Example/dsh-clock.git/')).toEqual({
      coordinate: 'Example/dsh-clock',
      owner: 'Example',
      repository: 'https://github.com/Example/dsh-clock',
      repo: 'dsh-clock',
    });
    expect(normalizeGitHubRepository('Example/dsh-clock').coordinate).toBe('Example/dsh-clock');
  });

  it('rejects non-GitHub repositories', () => {
    expect(() => normalizeGitHubRepository('https://gitlab.com/example/plugin')).toThrow('GitHub');
    expect(() => normalizeGitHubRepository('https://github.com/example/plugin/issues')).toThrow(
      'repository',
    );
  });

  it('builds live badge snippets without a GitHub handoff', () => {
    const artifacts = buildSubmissionArtifacts({
      repository: 'https://github.com/Example/dsh-clock',
    });

    expect(artifacts.badgeUrl).toBe('https://dsh.pub/api/badges/Example/dsh-clock.svg');
    expect(artifacts.markdown).toContain('[![dsh.pub registry status](');
    expect(artifacts.markdown).toContain('https://dsh.pub/en/plugins/?q=Example%2Fdsh-clock');
    expect(artifacts.html).toContain('<img src="https://dsh.pub/api/badges/Example/dsh-clock.svg');
  });

  it('creates an asynchronous submission with a normalized repository', async () => {
    const requests: Request[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      const request = new Request(new URL(String(input), 'https://dsh.pub'), init);
      requests.push(request);
      return Response.json(
        {
          id: 'submission-123',
          status: 'queued',
          statusUrl: '/api/submissions/submission-123',
        },
        { status: 202 },
      );
    };

    await expect(
      createPluginSubmission(
        'https://github.com/Example/dsh-clock.git/',
        'turnstile-test-token',
        fetcher,
        '796c8a18-d7f3-47e1-9b91-a290d1ad44f8',
      ),
    ).resolves.toEqual({
      id: 'submission-123',
      status: 'queued',
      statusUrl: '/api/submissions/submission-123',
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe('https://dsh.pub/api/submissions');
    expect(requests[0]?.method).toBe('POST');
    expect(requests[0]?.headers.get('Idempotency-Key')).toBe(
      '796c8a18-d7f3-47e1-9b91-a290d1ad44f8',
    );
    await expect(requests[0]?.json()).resolves.toEqual({
      repository: 'https://github.com/Example/dsh-clock',
      turnstileToken: 'turnstile-test-token',
    });
  });

  it('loads the public Turnstile site key', async () => {
    await expect(
      getPluginSubmissionConfig(async () =>
        Response.json({ turnstileSiteKey: '1x00000000000000000000AA' }),
      ),
    ).resolves.toEqual({ turnstileSiteKey: '1x00000000000000000000AA' });
    await expect(
      getPluginSubmissionConfig(async () => Response.json({ turnstileSiteKey: '' })),
    ).rejects.toThrow('invalid response');
  });

  it('reads a completed pull request state and rejects malformed API responses', async () => {
    const completed = await getPluginSubmission('/api/submissions/submission-123', async () =>
      Response.json({
        id: 'submission-123',
        prUrl: 'https://github.com/dsh-pub/dsh-pub/pull/42',
        status: 'pr_created',
        statusUrl: '/api/submissions/submission-123',
      }),
    );
    expect(completed.prUrl).toBe('https://github.com/dsh-pub/dsh-pub/pull/42');
    await expect(
      getPluginSubmission('/api/submissions/submission-123', async () =>
        Response.json({
          id: 'submission-123',
          status: 'already_submitted',
          statusUrl: '/api/submissions/submission-123',
        }),
      ),
    ).resolves.toMatchObject({ status: 'already_submitted' });
    await expect(
      getPluginSubmission('/api/submissions/submission-123', async () =>
        Response.json({
          errorCode: 'submission_automation_failed',
          id: 'submission-123',
          status: 'failed',
          statusUrl: '/api/submissions/submission-123',
        }),
      ),
    ).resolves.toMatchObject({
      errorCode: 'submission_automation_failed',
      status: 'failed',
    });
    await expect(
      getPluginSubmission('/api/submissions/submission-123', async () =>
        Response.json({
          errorCode: 'github_private_error',
          id: 'submission-123',
          status: 'failed',
          statusUrl: '/api/submissions/submission-123',
        }),
      ),
    ).resolves.toEqual({
      id: 'submission-123',
      status: 'failed',
      statusUrl: '/api/submissions/submission-123',
    });

    await expect(
      createPluginSubmission('example/dsh-clock', 'turnstile-test-token', async () =>
        Response.json({ status: 'queued' }, { status: 202 }),
      ),
    ).rejects.toThrow('invalid response');
    await expect(
      getPluginSubmission('/api/submissions/submission-123', async () =>
        Response.json({ error: 'workflow_failed' }, { status: 500 }),
      ),
    ).rejects.toThrow('workflow_failed');
  });
});
