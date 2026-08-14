export interface GitHubRepositoryCoordinate {
  coordinate: string;
  owner: string;
  repo: string;
  repository: string;
}

export interface SubmissionInput {
  repository: string;
}

export interface SubmissionArtifacts {
  badgeUrl: string;
  catalogUrl: string;
  html: string;
  markdown: string;
}

export type PluginSubmissionStatus =
  'queued' | 'creating_pr' | 'pr_created' | 'already_submitted' | 'failed';

export type PublicSubmissionErrorCode = 'submission_automation_failed' | 'submission_start_failed';

export interface PluginSubmissionState {
  errorCode?: PublicSubmissionErrorCode;
  id: string;
  prUrl?: string;
  status: PluginSubmissionStatus;
  statusUrl: string;
}

export interface PluginSubmissionConfig {
  turnstileSiteKey: string;
}

const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

export function normalizeGitHubRepository(value: string): GitHubRepositoryCoordinate {
  const input = value.trim();
  if (!input) throw new Error('Enter a public GitHub repository.');

  let coordinate = input;
  if (input.includes('://')) {
    let url: URL;
    try {
      url = new URL(input);
    } catch {
      throw new Error('Enter a valid GitHub repository URL.');
    }
    if (url.protocol !== 'https:' || url.hostname.toLocaleLowerCase() !== 'github.com') {
      throw new Error('Only public GitHub repositories are supported.');
    }
    if (url.search || url.hash) throw new Error('Use the repository URL without query or hash.');
    coordinate = url.pathname.replace(/^\/+|\/+$/g, '');
  }

  coordinate = coordinate.replace(/\.git$/i, '');
  const parts = coordinate.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error('Use a GitHub repository in owner/repository form.');
  }
  const [owner, repo] = parts;
  if (
    !owner ||
    !repo ||
    !OWNER_PATTERN.test(owner) ||
    !REPOSITORY_PATTERN.test(repo) ||
    repo === '.' ||
    repo === '..'
  ) {
    throw new Error('Use a valid GitHub owner and repository name.');
  }

  return {
    coordinate: `${owner}/${repo}`,
    owner,
    repo,
    repository: `https://github.com/${owner}/${repo}`,
  };
}

const escapeAttribute = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

export function buildSubmissionArtifacts(input: SubmissionInput): SubmissionArtifacts {
  const repository = normalizeGitHubRepository(input.repository);
  const badgeUrl = new URL(`https://dsh.pub/api/badges/${repository.owner}/${repository.repo}.svg`);
  const catalogUrl = new URL('https://dsh.pub/en/plugins/');
  catalogUrl.searchParams.set('q', repository.coordinate);
  const markdown = `[![dsh.pub registry status](${badgeUrl})](${catalogUrl})`;
  const html = `<a href="${escapeAttribute(String(catalogUrl))}"><img src="${escapeAttribute(String(badgeUrl))}" alt="dsh.pub registry status"></a>`;

  return {
    badgeUrl: String(badgeUrl),
    catalogUrl: String(catalogUrl),
    html,
    markdown,
  };
}

const submissionStatuses = new Set<PluginSubmissionStatus>([
  'queued',
  'creating_pr',
  'pr_created',
  'already_submitted',
  'failed',
]);
const publicSubmissionErrorCodes = new Set<PublicSubmissionErrorCode>([
  'submission_automation_failed',
  'submission_start_failed',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const responseError = async (response: Response) => {
  let detail: unknown;
  try {
    detail = await response.json();
  } catch {
    // The public API may fail before it can produce a JSON body.
  }
  if (isRecord(detail)) {
    const message =
      (typeof detail.message === 'string' && detail.message) ||
      (typeof detail.error === 'string' && detail.error);
    if (message) return new Error(message);
  }
  return new Error(`Submission request failed with status ${response.status}.`);
};

const parseSubmissionState = async (response: Response): Promise<PluginSubmissionState> => {
  if (!response.ok) throw await responseError(response);
  const value: unknown = await response.json();
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !value.id ||
    typeof value.status !== 'string' ||
    !submissionStatuses.has(value.status as PluginSubmissionStatus) ||
    typeof value.statusUrl !== 'string' ||
    !/^\/api\/submissions\/[^/?#]+$/.test(value.statusUrl) ||
    (value.prUrl !== undefined &&
      (typeof value.prUrl !== 'string' ||
        !/^https:\/\/github\.com\/dsh-pub\/dsh-pub\/pull\/[1-9][0-9]*$/.test(value.prUrl))) ||
    (value.errorCode !== undefined && typeof value.errorCode !== 'string')
  ) {
    throw new Error('Submission API returned an invalid response.');
  }
  if (value.status === 'pr_created' && value.prUrl === undefined) {
    throw new Error('Submission API returned an invalid response.');
  }
  return {
    ...(typeof value.errorCode === 'string' &&
    publicSubmissionErrorCodes.has(value.errorCode as PublicSubmissionErrorCode)
      ? { errorCode: value.errorCode as PublicSubmissionErrorCode }
      : {}),
    id: value.id,
    ...(typeof value.prUrl === 'string' ? { prUrl: value.prUrl } : {}),
    status: value.status as PluginSubmissionStatus,
    statusUrl: value.statusUrl,
  };
};

export async function createPluginSubmission(
  repositoryValue: string,
  turnstileToken: string,
  fetcher: typeof fetch = fetch,
  idempotencyKey: string = crypto.randomUUID(),
): Promise<PluginSubmissionState> {
  const repository = normalizeGitHubRepository(repositoryValue);
  if (!turnstileToken) throw new Error('Complete the security check before submitting.');
  const response = await fetcher('/api/submissions', {
    body: JSON.stringify({ repository: repository.repository, turnstileToken }),
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    method: 'POST',
  });
  return parseSubmissionState(response);
}

export async function getPluginSubmissionConfig(
  fetcher: typeof fetch = fetch,
): Promise<PluginSubmissionConfig> {
  const response = await fetcher('/api/submission-config', { method: 'GET' });
  if (!response.ok) throw await responseError(response);
  const value: unknown = await response.json();
  if (
    !isRecord(value) ||
    typeof value.turnstileSiteKey !== 'string' ||
    !/^[A-Za-z0-9_-]{1,200}$/.test(value.turnstileSiteKey)
  ) {
    throw new Error('Submission API returned an invalid response.');
  }
  return { turnstileSiteKey: value.turnstileSiteKey };
}

export async function getPluginSubmission(
  statusUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<PluginSubmissionState> {
  if (!/^\/api\/submissions\/[^/?#]+$/.test(statusUrl)) {
    throw new Error('Submission status URL is invalid.');
  }
  return parseSubmissionState(await fetcher(statusUrl, { method: 'GET' }));
}
