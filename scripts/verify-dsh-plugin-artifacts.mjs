import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { relative } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = new URL('..', import.meta.url);
const artifactFiles = [
  new URL('../apps/dsh-plugin/lib/index.js', import.meta.url),
  new URL('../apps/dsh-plugin/lib/client.js', import.meta.url),
  new URL('../apps/dsh-plugin/src/client/catalog.generated.json', import.meta.url),
];
const declarationRoot = new URL('../apps/dsh-plugin/lib/types/', import.meta.url);

async function filesUnder(path) {
  const statEntries = await readdir(path, { withFileTypes: true });
  const files = [];
  for (const entry of statEntries.sort((left, right) => left.name.localeCompare(right.name))) {
    const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), path);
    if (entry.isDirectory()) files.push(...(await filesUnder(child)));
    else files.push(child);
  }
  return files;
}

async function digestArtifacts() {
  const hash = createHash('sha256');
  const declarations = (await filesUnder(declarationRoot)).filter((file) =>
    file.pathname.endsWith('.d.ts'),
  );
  for (const file of [...artifactFiles, ...declarations]) {
    hash.update(relative(new URL('.', root).pathname, file.pathname));
    hash.update(await readFile(file));
  }
  return hash.digest('hex');
}

const before = await digestArtifacts();
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('npm_execpath is required to verify generated DSH plugin artifacts.');
await run(process.execPath, [npmCli, 'run', 'build', '--workspace', '@dsh-pub/plugin-directory'], {
  cwd: root,
});
const after = await digestArtifacts();

if (before !== after) {
  throw new Error(
    'DSH plugin generated artifacts were stale and have been regenerated. Review and commit them.',
  );
}
