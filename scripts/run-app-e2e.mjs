import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

import { runCommand } from '../e2e/support/run-command.mjs';

const APP_TIMEOUT_MS = 15 * 60_000;

function rootFromArgs(args) {
  const rootIndex = args.indexOf('--root');
  if (rootIndex === -1) return resolve(process.cwd());
  if (!args[rootIndex + 1]) throw new Error('--root requires a path');
  return resolve(args[rootIndex + 1]);
}

async function activeAppWorkspaces(root) {
  const appsRoot = join(root, 'apps');
  const entries = await readdir(appsRoot, { withFileTypes: true }).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const workspaces = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory()) continue;
    const appRoot = join(appsRoot, entry.name);
    let manifest;
    try {
      manifest = JSON.parse(await readFile(join(appRoot, 'package.json'), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (typeof manifest.scripts?.e2e !== 'string' || manifest.scripts.e2e.trim() === '') {
      continue;
    }
    workspaces.push(relative(root, appRoot).split(sep).join('/'));
  }

  return workspaces;
}

async function main() {
  const root = rootFromArgs(process.argv.slice(2));
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

  for (const workspace of await activeAppWorkspaces(root)) {
    console.log(`Running ${workspace} E2E`);
    const result = runCommand(npm, ['run', 'e2e', '--workspace', workspace], {
      cwd: root,
      env: process.env,
      timeoutMs: APP_TIMEOUT_MS,
    });
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    if (result.status !== 0) {
      process.exitCode = result.status ?? 1;
      return;
    }
  }
}

main().catch((error) => {
  console.error(`run-app-e2e: ${error.message}`);
  process.exitCode = 1;
});
