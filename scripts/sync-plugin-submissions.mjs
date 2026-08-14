import { execFile } from 'node:child_process';
import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { createSubmissionUpdate } from './lib/plugin-submission.mjs';
import { loadMergedSubmissionRequest } from './lib/plugin-submission-sync.mjs';

const execFileAsync = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const paths = {
  catalog: join(root, 'packages/catalog/src/community.generated.json'),
  registry: join(root, 'apps/server/src/installable-slugs.generated.json'),
  sources: join(root, 'packages/catalog/src/community.sources.json'),
  submissions: join(root, 'submissions'),
};

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const writeJson = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
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
const gitCommit = async (path) => {
  const { stdout } = await execFileAsync(
    'git',
    ['log', '--diff-filter=A', '--format=%H%x09%aI', '-1', '--', path],
    { cwd: root },
  );
  const [sha, date] = stdout.trim().split('\t');
  return { date, sha };
};

if (process.env.GITHUB_REPOSITORY !== 'dsh-pub/dsh-pub') {
  throw new Error('GITHUB_REPOSITORY must be dsh-pub/dsh-pub.');
}

const names = (await readdir(paths.submissions))
  .filter((name) => /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?--[a-z0-9._-]+\.json$/.test(name))
  .sort();
let communityCatalog = await readJson(paths.catalog);
let communitySources = await readJson(paths.sources);
let registry = await readJson(paths.registry);
let changed = false;
for (const name of names) {
  const relativePath = `submissions/${name}`;
  const content = await readFile(join(paths.submissions, name), 'utf8');
  const request = await loadMergedSubmissionRequest({
    content,
    fetch,
    gitCommit,
    path: relativePath,
    token: process.env.GITHUB_TOKEN,
  });
  const update = await createSubmissionUpdate({
    communityCatalog,
    communitySources,
    fetch,
    request,
    registry,
    token: process.env.GITHUB_TOKEN,
  });
  communityCatalog = update.communityCatalog;
  communitySources = update.communitySources;
  registry = update.registry;
  changed ||= update.changed;
}

if (changed) {
  await writeJson(paths.catalog, communityCatalog);
  await writeJson(paths.sources, communitySources);
  await writeJson(paths.registry, registry);
  await execFileAsync(
    process.execPath,
    ['--experimental-strip-types', join(root, 'apps/dsh-plugin/scripts/generate-catalog.ts')],
    { cwd: root },
  );
}
await writeOutput({ changed });
console.log(JSON.stringify({ changed, submissions: names.length }));
