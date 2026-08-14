import { appendFile, readFile } from 'node:fs/promises';

import {
  DeploymentVerificationError,
  verifyPluginDeployment,
} from './lib/deployment-verification.mjs';

const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SHA_PATTERN = /^[a-f0-9]{40}$/;
const PAGE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const repository = process.env.GITHUB_REPOSITORY ?? '';
const token = process.env.GITHUB_TOKEN;
const resultPath = process.env.SUBMISSION_RESULT_PATH;
const commitSha = process.env.INTEGRATED_COMMIT_SHA ?? '';
const requireCheck = process.env.SUBMISSION_CHANGED === 'true';
const timeoutMs = Number(process.env.DEPLOYMENT_TIMEOUT_MS ?? 12 * 60_000);

if (!REPOSITORY_PATTERN.test(repository) || !token || !resultPath) {
  throw new Error('Deployment verification environment is incomplete.');
}
if (requireCheck && !SHA_PATTERN.test(commitSha)) {
  throw new Error('Integrated commit SHA is missing or invalid.');
}
if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 15 * 60_000) {
  throw new Error('DEPLOYMENT_TIMEOUT_MS is invalid.');
}

const result = JSON.parse(await readFile(resultPath, 'utf8'));
if (
  typeof result.pageSlug !== 'string' ||
  !PAGE_SLUG_PATTERN.test(result.pageSlug) ||
  typeof result.catalogUrl !== 'string' ||
  typeof result.badgeUrl !== 'string'
) {
  throw new Error('Submission result does not contain valid live coordinates.');
}
const catalogUrl = new URL(result.catalogUrl);
const badgeUrl = new URL(result.badgeUrl);
if (
  catalogUrl.origin !== 'https://dsh.pub' ||
  catalogUrl.pathname !== `/en/plugins/${result.pageSlug}/` ||
  badgeUrl.origin !== 'https://dsh.pub' ||
  !badgeUrl.pathname.startsWith('/api/badges/')
) {
  throw new Error('Submission result live coordinates are outside dsh.pub.');
}

const githubHeaders = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
};

const getCheckRuns = async (sha) => {
  const response = await fetch(
    `https://api.github.com/repos/${repository}/commits/${sha}/check-runs?per_page=100`,
    {
      headers: githubHeaders,
      signal: globalThis.AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) throw new Error(`GitHub checks request failed with status ${response.status}.`);
  const value = await response.json();
  if (!Array.isArray(value?.check_runs)) throw new Error('GitHub checks response is invalid.');
  return value.check_runs;
};

const readLive = async (input) => {
  const url = new URL(input);
  url.searchParams.set(
    '_deployment_verification',
    commitSha || process.env.GITHUB_RUN_ID || 'live',
  );
  const response = await fetch(url, {
    headers: { 'Cache-Control': 'no-cache' },
    redirect: 'error',
    signal: globalThis.AbortSignal.timeout(15_000),
  });
  return {
    body: await response.text(),
    contentType: response.headers.get('Content-Type') ?? '',
    status: response.status,
  };
};

const writeOutput = async (values) => {
  if (!process.env.GITHUB_OUTPUT) return;
  await appendFile(
    process.env.GITHUB_OUTPUT,
    Object.entries(values)
      .map(([key, value]) => `${key}=${String(value)}\n`)
      .join(''),
  );
};

try {
  const verified = await verifyPluginDeployment({
    badgeUrl: String(badgeUrl),
    catalogUrl: String(catalogUrl),
    commitSha,
    getCheckRuns,
    pageSlug: result.pageSlug,
    readBadge: readLive,
    readCatalog: readLive,
    requireCheck,
    timeoutMs,
  });
  await writeOutput({
    deployment_error_code: '',
    deployment_verified: true,
    ...(verified.checkId ? { deployment_check_id: verified.checkId } : {}),
  });
  console.log(JSON.stringify({ live: true, pageSlug: result.pageSlug }));
} catch (error) {
  const code =
    error instanceof DeploymentVerificationError ? error.code : 'deployment_internal_error';
  await writeOutput({ deployment_error_code: code, deployment_verified: false });
  console.error(JSON.stringify({ code, live: false }));
  process.exitCode = 1;
}
