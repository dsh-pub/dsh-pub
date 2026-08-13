#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

import { bootstrapProject } from './bootstrap-project.mjs';

const TEMPLATE_NAME = 'onee-product-template';

function configureGitHooks(root) {
  spawnSync('git', ['config', 'core.hooksPath', '.githooks'], {
    cwd: root,
    stdio: 'ignore',
  });
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}.`);
  }
}

async function main() {
  const root = resolve(process.cwd());
  configureGitHooks(root);

  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  if (manifest.name !== TEMPLATE_NAME) return;

  const name = process.env.ONEE_PROJECT_NAME || basename(root);
  if (name === TEMPLATE_NAME) return;

  const changedPaths = await bootstrapProject({
    name,
    root,
    scope: process.env.ONEE_PROJECT_SCOPE || '',
    title: process.env.ONEE_PROJECT_TITLE || '',
  });

  if (changedPaths.length > 0) {
    run('npm', ['install', '--ignore-scripts'], root);
    console.log('Next required setup step: complete Project Context in AGENTS.md.');
  }
}

main().catch((error) => {
  console.error(`prepare-project: ${error.message}`);
  process.exitCode = 1;
});
