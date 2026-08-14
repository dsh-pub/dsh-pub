import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { format } from 'prettier';

import { createGitHubTopicClient } from './lib/github-topic-client.mjs';
import { syncTopicCatalogData } from './lib/topic-catalog-sync.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const paths = {
  analysis: join(root, 'packages/catalog/src/topic-analysis.generated.json'),
  catalog: join(root, 'packages/catalog/src/community.generated.json'),
  registry: join(root, 'apps/server/src/installable-slugs.generated.json'),
  sources: join(root, 'packages/catalog/src/community.sources.json'),
};
const dryRun = process.argv.includes('--dry-run');
const unknownArguments = process.argv.slice(2).filter((argument) => argument !== '--dry-run');
if (unknownArguments.length) throw new Error(`Unknown arguments: ${unknownArguments.join(', ')}`);

const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
if (!token) throw new Error('GITHUB_TOKEN or GH_TOKEN is required.');

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const formattedJson = (value) => format(JSON.stringify(value), { parser: 'json', printWidth: 100 });
const current = {
  analysis: await readJson(paths.analysis),
  catalog: await readJson(paths.catalog),
  registry: await readJson(paths.registry),
  sources: await readJson(paths.sources),
};
const officialCatalog = await readJson(join(root, 'packages/catalog/src/catalog.generated.json'));
const result = await syncTopicCatalogData({
  ...current,
  github: createGitHubTopicClient({ fetch, token }),
  now: new Date(),
  reservedSlugs: officialCatalog.entries.map((entry) => entry.slug),
  topic: current.sources.topic ?? 'dsh-plugin',
});

const changed = [];
for (const [key, path] of Object.entries(paths)) {
  const next = await formattedJson(result[key]);
  const before = await readFile(path, 'utf8');
  if (next === before) continue;
  changed.push(path.slice(root.length + 1));
  if (!dryRun) await writeFile(path, next);
}

const summary = {
  changed: changed.length > 0,
  changedFiles: changed.length,
  dryRun,
  ...result.analysis.totals,
};
if (process.env.GITHUB_OUTPUT) {
  await appendFile(
    process.env.GITHUB_OUTPUT,
    Object.entries(summary)
      .map(([key, value]) => `${key}=${value}\n`)
      .join(''),
  );
}
console.log(JSON.stringify(summary));
