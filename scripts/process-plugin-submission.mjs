import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSubmissionUpdate, SubmissionError } from './lib/plugin-submission.mjs';
import { loadPullRequestSubmission } from './lib/plugin-submission-pr.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const paths = {
  catalog: join(root, 'packages/catalog/src/community.generated.json'),
  registry: join(root, 'apps/server/src/installable-slugs.generated.json'),
  sources: join(root, 'packages/catalog/src/community.sources.json'),
};
const cacheRoot = join(root, '.cache/plugin-submission');
const resultPath = join(cacheRoot, 'result.json');

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const writeJson = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
};

const workflowUrl = () => {
  const server = process.env.GITHUB_SERVER_URL;
  const repository = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  return server && repository && runId
    ? `${server}/${repository}/actions/runs/${runId}`
    : undefined;
};

const writeOutput = async (values) => {
  if (!process.env.GITHUB_OUTPUT) return;
  const lines = Object.entries(values)
    .map(([key, value]) => `${key}=${String(value)}\n`)
    .join('');
  await appendFile(process.env.GITHUB_OUTPUT, lines);
};

const writeResult = async (result) => {
  await mkdir(cacheRoot, { recursive: true });
  await writeJson(resultPath, result);
};

const eventPath = process.env.GITHUB_EVENT_PATH ?? process.argv[2];
if (!eventPath) throw new Error('GITHUB_EVENT_PATH is required.');

try {
  const event = await readJson(eventPath);
  const pullRequest = await loadPullRequestSubmission({
    event,
    fetch,
    token: process.env.GITHUB_TOKEN,
  });

  const update = await createSubmissionUpdate({
    communityCatalog: await readJson(paths.catalog),
    communitySources: await readJson(paths.sources),
    fetch,
    request: pullRequest.request,
    registry: await readJson(paths.registry),
    token: process.env.GITHUB_TOKEN,
  });
  if (!update.changed) {
    throw new SubmissionError('already_listed', 'This repository is already listed.');
  }
  const status = 'ready';
  const run = workflowUrl();
  const source = new URL(update.entry.source.repository);
  const sourceParts = source.pathname.split('/').filter(Boolean);
  const badgeUrl = new URL(`https://dsh.pub/api/badges/${sourceParts[0]}/${sourceParts[1]}.svg`);
  if (update.entry.source.directory)
    badgeUrl.searchParams.set('path', update.entry.source.directory);
  const catalogUrl = `https://dsh.pub/en/plugins/${update.entry.slug}/`;
  const result = {
    badgeUrl: String(badgeUrl),
    catalogUrl,
    changed: update.changed,
    htmlBadge: `<a href="${catalogUrl}"><img src="${badgeUrl}" alt="dsh.pub registry status"></a>`,
    pullRequest: pullRequest.number,
    markdownBadge: `[![dsh.pub registry status](${badgeUrl})](${catalogUrl})`,
    pageSlug: update.entry.slug,
    status,
    ...(run ? { run } : {}),
  };

  await writeJson(paths.catalog, update.communityCatalog);
  await writeJson(paths.sources, update.communitySources);
  await writeJson(paths.registry, update.registry);

  await writeResult(result);
  await writeOutput({
    base_sha: pullRequest.baseSha,
    changed: true,
    head_sha: pullRequest.headSha,
    page_slug: update.entry.slug,
    valid: true,
  });
  console.log(JSON.stringify({ changed: update.changed, status }));
} catch (error) {
  const code = error instanceof SubmissionError ? error.code : 'internal_error';
  const run = workflowUrl();
  await writeResult({ changed: false, code, status: 'invalid', ...(run ? { run } : {}) });
  await writeOutput({ changed: false, error_code: code, valid: false });
  console.error(JSON.stringify({ code, status: 'invalid' }));
  process.exitCode = 1;
}
