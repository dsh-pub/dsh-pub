import { execFile } from 'node:child_process';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { createSubmissionUpdate, SubmissionError } from './lib/plugin-submission.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const paths = {
  catalog: join(root, 'packages/catalog/src/community.generated.json'),
  directorySnapshot: join(root, 'apps/dsh-plugin/src/client/catalog.generated.json'),
  registry: join(root, 'apps/server/src/installable-slugs.generated.json'),
  sources: join(root, 'packages/catalog/src/community.sources.json'),
};
const generateDirectorySnapshot = promisify(execFile);
const cacheRoot = join(root, '.cache/plugin-submission');
const resultPath = join(cacheRoot, 'result.json');
const commentPath = join(cacheRoot, 'comment.md');
const artifactRoot = join(cacheRoot, 'artifact');

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

const writeResult = async (result, comment) => {
  await mkdir(cacheRoot, { recursive: true });
  await writeJson(resultPath, result);
  await writeFile(commentPath, `${comment.trim()}\n`);
};

const eventPath = process.env.GITHUB_EVENT_PATH ?? process.argv[2];
if (!eventPath) throw new Error('GITHUB_EVENT_PATH is required.');

try {
  const event = await readJson(eventPath);
  const issueNumber = event.issue?.number;
  if (!Number.isSafeInteger(issueNumber) || issueNumber < 1) {
    throw new SubmissionError('invalid_event', 'GitHub event does not contain an Issue number.');
  }
  if (
    typeof event.issue?.body !== 'string' ||
    typeof event.issue?.html_url !== 'string' ||
    typeof event.issue?.created_at !== 'string' ||
    typeof event.issue?.updated_at !== 'string'
  ) {
    throw new SubmissionError('invalid_event', 'GitHub event does not contain a complete Issue.');
  }

  const update = await createSubmissionUpdate({
    communityCatalog: await readJson(paths.catalog),
    communitySources: await readJson(paths.sources),
    fetch,
    issue: {
      body: event.issue.body,
      createdAt: event.issue.created_at,
      number: issueNumber,
      updatedAt: event.issue.updated_at,
      url: event.issue.html_url,
    },
    registry: await readJson(paths.registry),
    token: process.env.GITHUB_TOKEN,
  });
  const status = update.changed ? 'ready' : 'already-listed';
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
    issue: issueNumber,
    markdownBadge: `[![dsh.pub registry status](${badgeUrl})](${catalogUrl})`,
    pageSlug: update.entry.slug,
    status,
    ...(run ? { run } : {}),
  };

  if (update.changed) {
    await writeJson(paths.catalog, update.communityCatalog);
    await writeJson(paths.sources, update.communitySources);
    await writeJson(paths.registry, update.registry);
    await generateDirectorySnapshot(
      process.execPath,
      ['--experimental-strip-types', join(root, 'apps/dsh-plugin/scripts/generate-catalog.ts')],
      { cwd: root },
    );
    for (const [sourcePath, relativePath] of [
      [paths.catalog, 'packages/catalog/src/community.generated.json'],
      [paths.sources, 'packages/catalog/src/community.sources.json'],
      [paths.registry, 'apps/server/src/installable-slugs.generated.json'],
      [paths.directorySnapshot, 'apps/dsh-plugin/src/client/catalog.generated.json'],
    ]) {
      const target = join(artifactRoot, relativePath);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, await readFile(sourcePath));
    }
  }

  const comment = update.changed
    ? `The public bundle contract passed automated checks. Integration is being prepared.${run ? `\n\nWorkflow: ${run}` : ''}`
    : `This plugin is already listed on dsh.pub.${run ? `\n\nWorkflow: ${run}` : ''}`;
  await writeResult(result, comment);
  await writeOutput({ changed: update.changed, page_slug: update.entry.slug, valid: true });
  console.log(JSON.stringify({ changed: update.changed, status }));
} catch (error) {
  const code = error instanceof SubmissionError ? error.code : 'internal_error';
  const run = workflowUrl();
  await writeResult(
    { changed: false, code, status: 'invalid', ...(run ? { run } : {}) },
    `Submission was not integrated.\n\nCode: \`${code}\`${run ? `\n\nWorkflow: ${run}` : ''}\n\nOpen a corrected submission to try again.`,
  );
  await writeOutput({ changed: false, error_code: code, valid: false });
  console.error(JSON.stringify({ code, status: 'invalid' }));
  process.exitCode = 1;
}
