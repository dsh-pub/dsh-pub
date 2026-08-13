import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import test from 'node:test';

import { runCommand } from './run-command.mjs';
import { createTempWorkspace } from './temp-workspace.mjs';

test('[support.run-command-result] runCommand preserves argv boundaries and captures the process result', () => {
  const result = runCommand(process.execPath, [
    '-e',
    'process.stdout.write(process.argv[1]); process.stderr.write("diagnostic")',
    'value with spaces',
  ]);

  assert.equal(result.status, 0);
  assert.equal(result.signal, null);
  assert.equal(result.stdout, 'value with spaces');
  assert.equal(result.stderr, 'diagnostic');
  assert.equal(result.timedOut, false);
  assert.ok(result.durationMs >= 0);
});

test('[support.temp-workspace-cleanup] createTempWorkspace returns an isolated directory with idempotent cleanup', async () => {
  const workspace = await createTempWorkspace('onee-e2e-support-');

  assert.equal((await stat(workspace.root)).isDirectory(), true);

  await workspace.cleanup();
  await workspace.cleanup();

  await assert.rejects(stat(workspace.root), { code: 'ENOENT' });
});

test('[support.run-command-timeout] runCommand reports a timed-out child process', () => {
  const result = runCommand(process.execPath, ['-e', 'setTimeout(() => {}, 10_000)'], {
    timeoutMs: 50,
  });

  assert.equal(result.status, null);
  assert.equal(result.timedOut, true);
  assert.ok(result.signal);
});
