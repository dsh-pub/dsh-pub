import { parseSubmissionFile, submissionFilePath, SubmissionError } from './plugin-submission.mjs';

const SHA_PATTERN = /^[a-f0-9]{40}$/;

export async function loadMergedSubmissionRequest({
  content,
  fetch: fetcher,
  gitCommit,
  path,
  token,
}) {
  const submission = parseSubmissionFile(content);
  if (path !== submissionFilePath(submission)) {
    throw new SubmissionError(
      'invalid_submission_path',
      'Submission filename must match the normalized repository coordinate.',
    );
  }
  const commit = await gitCommit(path);
  if (
    !SHA_PATTERN.test(commit?.sha ?? '') ||
    typeof commit?.date !== 'string' ||
    !Number.isFinite(Date.parse(commit.date))
  ) {
    throw new SubmissionError(
      'missing_submission_commit',
      'Submission file does not have a valid introducing commit.',
    );
  }

  const response = await fetcher(
    `https://api.github.com/repos/dsh-pub/dsh-pub/commits/${commit.sha}/pulls`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: globalThis.AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) {
    throw new SubmissionError(
      'github_unavailable',
      `GitHub merged pull request lookup failed with status ${response.status}.`,
    );
  }
  const pullRequests = await response.json();
  const matches = Array.isArray(pullRequests)
    ? pullRequests.filter(
        (pullRequest) =>
          pullRequest?.base?.ref === 'main' &&
          typeof pullRequest?.created_at === 'string' &&
          typeof pullRequest?.merged_at === 'string' &&
          /^https:\/\/github\.com\/dsh-pub\/dsh-pub\/pull\/[1-9][0-9]*$/.test(
            pullRequest?.html_url ?? '',
          ),
      )
    : [];
  if (matches.length !== 1) {
    throw new SubmissionError(
      'missing_submission_pull_request',
      'Every merged submission file must be traceable to one pull request targeting main.',
    );
  }
  const [pullRequest] = matches;
  return {
    content,
    createdAt: pullRequest.created_at,
    path,
    updatedAt: pullRequest.merged_at,
    url: pullRequest.html_url,
  };
}
