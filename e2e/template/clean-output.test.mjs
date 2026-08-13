import assert from 'node:assert/strict';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { runCommand } from '../support/run-command.mjs';
import { createTempWorkspace } from '../support/temp-workspace.mjs';

const cleanScript = resolve('scripts/clean.mjs');

test('[template.clean-preserves-research] clean removes test evidence without deleting research', async (t) => {
  const workspace = await createTempWorkspace('onee-clean-');
  t.after(workspace.cleanup);
  const research = join(workspace.root, '.cache/research/study.md');
  const evidence = join(workspace.root, '.cache/test-results/e2e/result.xml');

  await mkdir(join(workspace.root, 'apps'), { recursive: true });
  await mkdir(join(workspace.root, 'packages'), { recursive: true });
  await mkdir(join(workspace.root, 'coverage'), { recursive: true });
  await mkdir(join(workspace.root, 'dist'), { recursive: true });
  await mkdir(join(workspace.root, '.cache/research'), { recursive: true });
  await mkdir(join(workspace.root, '.cache/test-results/e2e'), { recursive: true });
  await writeFile(research, 'keep this research\n');
  await writeFile(evidence, '<testsuites />\n');

  const result = runCommand(process.execPath, [cleanScript], { cwd: workspace.root });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(research, 'utf8'), 'keep this research\n');
  await assert.rejects(access(evidence), { code: 'ENOENT' });
  await assert.rejects(access(join(workspace.root, 'coverage')), { code: 'ENOENT' });
  await assert.rejects(access(join(workspace.root, 'dist')), { code: 'ENOENT' });
});
