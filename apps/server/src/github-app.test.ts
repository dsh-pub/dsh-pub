import { Buffer } from 'node:buffer';

import { describe, expect, it } from 'vitest';

import {
  createGitHubAppJwt,
  createInstallationToken,
  ensureSubmissionPullRequest,
} from './github-app.js';

const base64UrlBytes = (value: string) =>
  Uint8Array.from(Buffer.from(value.replaceAll('-', '+').replaceAll('_', '/'), 'base64'));

const base64UrlJson = (value: string) =>
  JSON.parse(Buffer.from(base64UrlBytes(value)).toString('utf8')) as Record<string, unknown>;

const pem = (bytes: ArrayBuffer) => {
  const content =
    Buffer.from(bytes)
      .toString('base64')
      .match(/.{1,64}/g)
      ?.join('\n') ?? '';
  return `-----BEGIN PRIVATE KEY-----\n${content}\n-----END PRIVATE KEY-----`;
};

const submissionId = '796c8a18-d7f3-47e1-9b91-a290d1ad44f8';
const retrySubmissionId = '0efde98d-99a8-485f-9c62-b5c34f8a01f0';
const stableBranch = 'submission/ZXhhbXBsZS9kc2gtY2xvY2s';

describe('GitHub App authentication', () => {
  it('creates a short-lived RS256 JWT from a PKCS8 private key', async () => {
    const keys = await crypto.subtle.generateKey(
      {
        hash: 'SHA-256',
        modulusLength: 2_048,
        name: 'RSASSA-PKCS1-v1_5',
        publicExponent: new Uint8Array([1, 0, 1]),
      },
      true,
      ['sign', 'verify'],
    );
    const privateKey = pem(await crypto.subtle.exportKey('pkcs8', keys.privateKey));
    const nowMs = Date.UTC(2026, 7, 15, 1, 2, 3);

    const jwt = await createGitHubAppJwt({
      clientId: 'Iv1.dshpub',
      nowMs,
      privateKeyPkcs8Pem: privateKey,
    });

    const [encodedHeader, encodedPayload, encodedSignature] = jwt.split('.');
    expect(base64UrlJson(encodedHeader ?? '')).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(base64UrlJson(encodedPayload ?? '')).toEqual({
      exp: Math.floor(nowMs / 1_000) + 540,
      iat: Math.floor(nowMs / 1_000) - 60,
      iss: 'Iv1.dshpub',
    });
    await expect(
      crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        keys.publicKey,
        base64UrlBytes(encodedSignature ?? ''),
        new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
      ),
    ).resolves.toBe(true);
  });

  it('mints a repository-scoped installation token with only PR write permissions', async () => {
    const calls: Array<{ init: RequestInit | undefined; url: string }> = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ init, url: String(input) });
      return Response.json(
        { expires_at: '2026-08-15T02:02:03Z', token: 'ghs_ephemeral' },
        { status: 201 },
      );
    };

    const token = await createInstallationToken({
      fetcher,
      installationId: '1234',
      jwt: 'header.payload.signature',
      repositoryId: 5678,
    });

    expect(token).toEqual({ expiresAt: '2026-08-15T02:02:03Z', token: 'ghs_ephemeral' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.github.com/app/installations/1234/access_tokens');
    expect(calls[0]?.init).toMatchObject({
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer header.payload.signature',
        'Content-Type': 'application/json',
        'User-Agent': 'dsh.pub-plugin-submission',
        'X-GitHub-Api-Version': '2026-03-10',
      },
      method: 'POST',
    });
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      permissions: { contents: 'write', pull_requests: 'write' },
      repository_ids: [5678],
    });
  });

  it('creates one canonical submission file and pull request on a deterministic branch', async () => {
    const baseSha = '1'.repeat(40);
    const commitSha = '2'.repeat(40);
    const calls: Array<{ init: RequestInit | undefined; url: string }> = [];
    const responses = [
      new Response(null, { status: 404 }),
      Response.json({ object: { sha: baseSha } }),
      Response.json(
        { object: { sha: baseSha }, ref: `refs/heads/${stableBranch}` },
        { status: 201 },
      ),
      new Response(null, { status: 404 }),
      Response.json({ commit: { sha: commitSha } }, { status: 201 }),
      Response.json([]),
      Response.json(
        { html_url: 'https://github.com/dsh-pub/dsh-pub/pull/42', number: 42 },
        { status: 201 },
      ),
    ];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ init, url: String(input) });
      const response = responses.shift();
      if (!response) throw new Error(`Unexpected request: ${String(input)}`);
      return response;
    };

    const result = await ensureSubmissionPullRequest({
      fetcher,
      owner: 'Example',
      repo: 'dsh-clock',
      repository: 'https://github.com/Example/dsh-clock',
      submissionId,
      token: 'ghs_ephemeral',
    });

    expect(result).toEqual({
      branch: stableBranch,
      commitSha,
      created: true,
      prNumber: 42,
      prUrl: 'https://github.com/dsh-pub/dsh-pub/pull/42',
      status: 'pr_created',
    });
    expect(calls.map(({ init, url }) => `${init?.method ?? 'GET'} ${url}`)).toEqual([
      'GET https://api.github.com/repos/dsh-pub/dsh-pub/contents/submissions/example--dsh-clock.json?ref=main',
      'GET https://api.github.com/repos/dsh-pub/dsh-pub/git/ref/heads/main',
      'POST https://api.github.com/repos/dsh-pub/dsh-pub/git/refs',
      `GET https://api.github.com/repos/dsh-pub/dsh-pub/contents/submissions/example--dsh-clock.json?ref=${encodeURIComponent(stableBranch)}`,
      'PUT https://api.github.com/repos/dsh-pub/dsh-pub/contents/submissions/example--dsh-clock.json',
      `GET https://api.github.com/repos/dsh-pub/dsh-pub/pulls?state=open&head=${encodeURIComponent(`dsh-pub:${stableBranch}`)}&base=main`,
      'POST https://api.github.com/repos/dsh-pub/dsh-pub/pulls',
    ]);
    const fileRequest = JSON.parse(String(calls[4]?.init?.body));
    expect(fileRequest).toMatchObject({
      branch: stableBranch,
      message: 'submit: Example/dsh-clock',
    });
    expect(Buffer.from(fileRequest.content, 'base64').toString('utf8')).toBe(
      `${JSON.stringify(
        { repository: 'https://github.com/Example/dsh-clock', schemaVersion: 1 },
        null,
        2,
      )}\n`,
    );
    expect(JSON.parse(String(calls[6]?.init?.body))).toMatchObject({
      base: 'main',
      draft: false,
      head: stableBranch,
      title: '[Plugin submission] Example/dsh-clock',
    });
  });

  it('reuses an existing canonical repository branch and PR across submission IDs', async () => {
    const baseSha = '1'.repeat(40);
    const branchSha = '3'.repeat(40);
    const content = `${JSON.stringify(
      { repository: 'https://github.com/Example/dsh-clock', schemaVersion: 1 },
      null,
      2,
    )}\n`;
    const calls: string[] = [];
    const responses = [
      new Response(null, { status: 404 }),
      Response.json({ object: { sha: baseSha } }),
      Response.json({ message: 'Reference already exists' }, { status: 422 }),
      Response.json({ object: { sha: branchSha }, ref: `refs/heads/${stableBranch}` }),
      Response.json({
        content: Buffer.from(content).toString('base64'),
        encoding: 'base64',
        sha: '4'.repeat(40),
        type: 'file',
      }),
      Response.json([{ html_url: 'https://github.com/dsh-pub/dsh-pub/pull/42', number: 42 }]),
    ];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${String(input)}`);
      const response = responses.shift();
      if (!response) throw new Error(`Unexpected request: ${String(input)}`);
      return response;
    };

    const result = await ensureSubmissionPullRequest({
      fetcher,
      owner: 'Example',
      repo: 'dsh-clock',
      repository: 'https://github.com/Example/dsh-clock',
      submissionId: retrySubmissionId,
      token: 'ghs_ephemeral',
    });

    expect(result).toEqual({
      branch: stableBranch,
      commitSha: branchSha,
      created: false,
      prNumber: 42,
      prUrl: 'https://github.com/dsh-pub/dsh-pub/pull/42',
      status: 'pr_created',
    });
    expect(calls).toContain(
      `GET https://api.github.com/repos/dsh-pub/dsh-pub/git/ref/heads/${encodeURIComponent(stableBranch)}`,
    );
    expect(calls).not.toContain(
      'PUT https://api.github.com/repos/dsh-pub/dsh-pub/contents/submissions/example--dsh-clock.json',
    );
    expect(calls).not.toContain('POST https://api.github.com/repos/dsh-pub/dsh-pub/pulls');
  });

  it('returns already_submitted only when main contains the exact canonical record', async () => {
    const content = `${JSON.stringify(
      { repository: 'https://github.com/Example/dsh-clock', schemaVersion: 1 },
      null,
      2,
    )}\n`;
    const fetcher = async () =>
      Response.json({
        content: Buffer.from(content).toString('base64'),
        encoding: 'base64',
        type: 'file',
      });

    await expect(
      ensureSubmissionPullRequest({
        fetcher,
        owner: 'Example',
        repo: 'dsh-clock',
        repository: 'https://github.com/Example/dsh-clock',
        submissionId,
        token: 'ghs_ephemeral',
      }),
    ).resolves.toEqual({
      branch: stableBranch,
      commitSha: null,
      created: false,
      prNumber: null,
      prUrl: null,
      status: 'already_submitted',
    });
  });

  it('fails closed when the canonical main record has conflicting content', async () => {
    const fetcher = async () =>
      Response.json({
        content: Buffer.from('{"repository":"https://github.com/attacker/repo"}\n').toString(
          'base64',
        ),
        encoding: 'base64',
        type: 'file',
      });

    await expect(
      ensureSubmissionPullRequest({
        fetcher,
        owner: 'Example',
        repo: 'dsh-clock',
        repository: 'https://github.com/Example/dsh-clock',
        submissionId,
        token: 'ghs_ephemeral',
      }),
    ).rejects.toThrow('conflicting file');
  });
});
