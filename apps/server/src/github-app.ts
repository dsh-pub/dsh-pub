const encoder = new TextEncoder();
const API_HEADERS = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'dsh.pub-plugin-submission',
  'X-GitHub-Api-Version': '2026-03-10',
} as const;

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

class GitHubApiError extends Error {
  constructor(readonly status: number) {
    super(`GitHub API request failed with status ${status}.`);
  }
}

const base64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/g, '');

const encodedJson = (value: unknown) => base64Url(encoder.encode(JSON.stringify(value)));
const base64 = (value: string) => btoa(String.fromCharCode(...encoder.encode(value)));

const pkcs8Bytes = (pemValue: string) => {
  const pem = pemValue.replaceAll('\\n', '\n').trim();
  const match =
    /^-----BEGIN PRIVATE KEY-----\s+([A-Za-z0-9+/=\s]+)\s+-----END PRIVATE KEY-----$/.exec(pem);
  if (!match?.[1]) throw new Error('GitHub App private key must be PKCS8 PEM.');
  const binary = atob(match[1].replace(/\s+/g, ''));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

export async function createGitHubAppJwt({
  clientId,
  nowMs = Date.now(),
  privateKeyPkcs8Pem,
}: {
  clientId: string;
  nowMs?: number;
  privateKeyPkcs8Pem: string;
}) {
  if (!clientId) throw new Error('GitHub App client ID is required.');
  const issuedAt = Math.floor(nowMs / 1_000);
  const encodedHeader = encodedJson({ alg: 'RS256', typ: 'JWT' });
  const encodedPayload = encodedJson({
    exp: issuedAt + 540,
    iat: issuedAt - 60,
    iss: clientId,
  });
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8Bytes(privateKeyPkcs8Pem),
    { hash: 'SHA-256', name: 'RSASSA-PKCS1-v1_5' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    encoder.encode(signingInput),
  );
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
}

export async function createInstallationToken({
  fetcher = fetch,
  installationId,
  jwt,
  repositoryId,
}: {
  fetcher?: Fetcher;
  installationId: string;
  jwt: string;
  repositoryId: number;
}) {
  if (!/^[1-9][0-9]*$/.test(installationId) || !Number.isSafeInteger(repositoryId)) {
    throw new Error('GitHub App installation and repository IDs are invalid.');
  }
  const response = await fetcher(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      body: JSON.stringify({
        permissions: { contents: 'write', pull_requests: 'write' },
        repository_ids: [repositoryId],
      }),
      headers: {
        ...API_HEADERS,
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) {
    throw new Error(`GitHub installation token request failed with status ${response.status}.`);
  }
  const value: unknown = await response.json();
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof (value as { token?: unknown }).token !== 'string' ||
    typeof (value as { expires_at?: unknown }).expires_at !== 'string'
  ) {
    throw new Error('GitHub installation token response is invalid.');
  }
  return {
    expiresAt: (value as { expires_at: string }).expires_at,
    token: (value as { token: string }).token,
  };
}

const githubJson = async (
  fetcher: Fetcher,
  token: string,
  url: string,
  init: { body?: unknown; method?: string } = {},
) => {
  const response = await fetcher(url, {
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    headers: {
      ...API_HEADERS,
      Authorization: `Bearer ${token}`,
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    method: init.method ?? 'GET',
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 404) return { found: false as const, value: undefined };
  if (!response.ok) throw new GitHubApiError(response.status);
  return { found: true as const, value: (await response.json()) as unknown };
};

const objectValue = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('GitHub API response is invalid.');
  }
  return value as Record<string, unknown>;
};

const canonicalSubmissionContent = (repository: string) =>
  `${JSON.stringify({ repository, schemaVersion: 1 }, null, 2)}\n`;

const githubFileContent = (value: unknown) => {
  const file = objectValue(value);
  if (file.type !== 'file' || file.encoding !== 'base64' || typeof file.content !== 'string') {
    throw new Error('GitHub submission file is invalid.');
  }
  return new TextDecoder().decode(
    Uint8Array.from(atob(file.content.replace(/\s+/g, '')), (character) => character.charCodeAt(0)),
  );
};

export async function ensureSubmissionPullRequest({
  fetcher = fetch,
  owner,
  repo,
  repository,
  submissionId,
  token,
}: {
  fetcher?: Fetcher;
  owner: string;
  repo: string;
  repository: string;
  submissionId: string;
  token: string;
}) {
  const api = 'https://api.github.com/repos/dsh-pub/dsh-pub';
  const repositoryKey = `${owner.toLocaleLowerCase()}/${repo.toLocaleLowerCase()}`;
  const branch = `submission/${base64Url(encoder.encode(repositoryKey))}`;
  const path = `submissions/${owner.toLocaleLowerCase()}--${repo.toLocaleLowerCase()}.json`;
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const mainFile = await githubJson(fetcher, token, `${api}/contents/${encodedPath}?ref=main`);
  if (mainFile.found) {
    if (githubFileContent(mainFile.value) !== canonicalSubmissionContent(repository)) {
      throw new Error('GitHub main branch contains a conflicting file.');
    }
    return {
      branch,
      commitSha: null,
      created: false,
      prNumber: null,
      prUrl: null,
      status: 'already_submitted' as const,
    };
  }

  const mainRef = objectValue(
    (await githubJson(fetcher, token, `${api}/git/ref/heads/main`)).value,
  );
  const mainObject = objectValue(mainRef.object);
  const baseSha = mainObject.sha;
  if (typeof baseSha !== 'string' || !/^[a-f0-9]{40}$/.test(baseSha)) {
    throw new Error('GitHub main branch response is invalid.');
  }
  let branchSha = baseSha;
  try {
    await githubJson(fetcher, token, `${api}/git/refs`, {
      body: { ref: `refs/heads/${branch}`, sha: baseSha },
      method: 'POST',
    });
  } catch (error) {
    if (!(error instanceof GitHubApiError) || error.status !== 422) throw error;
    const branchRef = objectValue(
      (await githubJson(fetcher, token, `${api}/git/ref/heads/${encodeURIComponent(branch)}`))
        .value,
    );
    const branchObject = objectValue(branchRef.object);
    if (typeof branchObject.sha !== 'string' || !/^[a-f0-9]{40}$/.test(branchObject.sha)) {
      throw new Error('GitHub submission branch response is invalid.');
    }
    branchSha = branchObject.sha;
  }

  const branchFile = await githubJson(
    fetcher,
    token,
    `${api}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`,
  );
  let commitSha: string;
  if (branchFile.found) {
    if (githubFileContent(branchFile.value) !== canonicalSubmissionContent(repository)) {
      throw new Error('GitHub submission branch contains a conflicting file.');
    }
    commitSha = branchSha;
  } else {
    const content = canonicalSubmissionContent(repository);
    const createdFile = objectValue(
      (
        await githubJson(fetcher, token, `${api}/contents/${encodedPath}`, {
          body: {
            branch,
            content: base64(content),
            message: `submit: ${owner}/${repo}`,
          },
          method: 'PUT',
        })
      ).value,
    );
    const commit = objectValue(createdFile.commit);
    if (typeof commit.sha !== 'string' || !/^[a-f0-9]{40}$/.test(commit.sha)) {
      throw new Error('GitHub submission commit response is invalid.');
    }
    commitSha = commit.sha;
  }

  const pullQuery = new URL(`${api}/pulls`);
  pullQuery.searchParams.set('state', 'open');
  pullQuery.searchParams.set('head', `dsh-pub:${branch}`);
  pullQuery.searchParams.set('base', 'main');
  const existingPulls = (await githubJson(fetcher, token, String(pullQuery))).value;
  if (!Array.isArray(existingPulls)) throw new Error('GitHub pull request list is invalid.');
  const created = existingPulls.length === 0;
  const pullValue = created
    ? (
        await githubJson(fetcher, token, `${api}/pulls`, {
          body: {
            base: 'main',
            body: `Submitted through dsh.pub.\n\n<!-- dsh-pub-submission:${submissionId} -->`,
            draft: false,
            head: branch,
            title: `[Plugin submission] ${owner}/${repo}`,
          },
          method: 'POST',
        })
      ).value
    : existingPulls[0];
  const pull = objectValue(pullValue);
  if (
    typeof pull.number !== 'number' ||
    !Number.isSafeInteger(pull.number) ||
    typeof pull.html_url !== 'string' ||
    !/^https:\/\/github\.com\/dsh-pub\/dsh-pub\/pull\/[1-9][0-9]*$/.test(pull.html_url)
  ) {
    throw new Error('GitHub pull request response is invalid.');
  }
  return {
    branch,
    commitSha,
    created,
    prNumber: pull.number,
    prUrl: pull.html_url,
    status: 'pr_created' as const,
  };
}
