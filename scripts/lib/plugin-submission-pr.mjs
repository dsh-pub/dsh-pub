import { Buffer } from 'node:buffer';

import { parseSubmissionFile, submissionFilePath, SubmissionError } from './plugin-submission.mjs';

const SHA_PATTERN = /^[a-f0-9]{40}$/;
const MAX_SUBMISSION_BYTES = 2_048;

const invalidEvent = (message) => {
  throw new SubmissionError('invalid_pull_request', message);
};

const githubJson = async (url, { fetch: fetcher, token }) => {
  const response = await fetcher(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: globalThis.AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new SubmissionError(
      'github_unavailable',
      `GitHub pull request request failed with status ${response.status}.`,
    );
  }
  return response.json();
};

export async function loadPullRequestSubmission({ event, fetch: fetcher, token }) {
  const pullRequest = event?.pull_request;
  const number = pullRequest?.number;
  const baseSha = pullRequest?.base?.sha;
  const headSha = pullRequest?.head?.sha;
  const headRepository = pullRequest?.head?.repo?.full_name;
  if (
    event?.repository?.full_name !== 'dsh-pub/dsh-pub' ||
    pullRequest?.base?.ref !== 'main' ||
    !Number.isSafeInteger(number) ||
    number < 1 ||
    !SHA_PATTERN.test(baseSha ?? '') ||
    !SHA_PATTERN.test(headSha ?? '') ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(headRepository ?? '') ||
    pullRequest?.changed_files !== 1 ||
    typeof pullRequest?.html_url !== 'string' ||
    typeof pullRequest?.created_at !== 'string' ||
    typeof pullRequest?.updated_at !== 'string'
  ) {
    invalidEvent('A plugin submission pull request must change exactly one file on main.');
  }

  const filesUrl = new URL(`https://api.github.com/repos/dsh-pub/dsh-pub/pulls/${number}/files`);
  filesUrl.searchParams.set('per_page', '2');
  const files = await githubJson(filesUrl, { fetch: fetcher, token });
  if (
    !Array.isArray(files) ||
    files.length !== 1 ||
    files[0]?.status !== 'added' ||
    typeof files[0]?.filename !== 'string'
  ) {
    invalidEvent('A plugin submission pull request must add exactly one submission file.');
  }
  const path = files[0].filename;
  if (!/^submissions\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?--[a-z0-9._-]+\.json$/.test(path)) {
    invalidEvent('The pull request may only add a canonical submissions/*.json file.');
  }

  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const contentUrl = new URL(
    `https://api.github.com/repos/${headRepository}/contents/${encodedPath}`,
  );
  contentUrl.searchParams.set('ref', headSha);
  const file = await githubJson(contentUrl, { fetch: fetcher, token });
  if (
    typeof file !== 'object' ||
    file === null ||
    file.type !== 'file' ||
    file.encoding !== 'base64' ||
    typeof file.content !== 'string' ||
    (typeof file.size === 'number' && file.size > MAX_SUBMISSION_BYTES)
  ) {
    invalidEvent('The submission path must be a small regular JSON file.');
  }
  const contentBuffer = Buffer.from(file.content.replaceAll('\n', ''), 'base64');
  if (contentBuffer.byteLength > MAX_SUBMISSION_BYTES) {
    invalidEvent('The submission path must be a small regular JSON file.');
  }
  const content = contentBuffer.toString('utf8');
  const submission = parseSubmissionFile(content);
  if (path !== submissionFilePath(submission)) {
    invalidEvent('The submission filename must match its normalized repository coordinate.');
  }

  return {
    baseSha,
    headSha,
    number,
    request: {
      content,
      createdAt: pullRequest.created_at,
      path,
      updatedAt: pullRequest.updated_at,
      url: pullRequest.html_url,
    },
  };
}
