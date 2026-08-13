import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { runCommand } from '../support/run-command.mjs';
import { createTempWorkspace } from '../support/temp-workspace.mjs';

const script = resolve('scripts/update-quality-baselines.mjs');

function metric(total, covered) {
  return {
    covered,
    pct: total === 0 ? 'Unknown' : (covered / total) * 100,
    skipped: 0,
    total,
  };
}

function coverage({ branches, functions, lines, statements }) {
  return {
    branches: metric(...branches),
    functions: metric(...functions),
    lines: metric(...lines),
    statements: metric(...statements),
  };
}

test('[template.coverage-baseline-modules] coverage summary is persisted per app and package module', async (t) => {
  const workspace = await createTempWorkspace('onee-quality-baseline-');
  const { root } = workspace;
  t.after(workspace.cleanup);

  await mkdir(join(root, 'apps/ios'), { recursive: true });
  await mkdir(join(root, 'apps/server/src'), { recursive: true });
  await mkdir(join(root, 'packages/utils/src'), { recursive: true });
  await mkdir(join(root, 'coverage'), { recursive: true });
  await writeFile(
    join(root, 'coverage/coverage-summary.json'),
    `${JSON.stringify({
      total: coverage({
        branches: [6, 4],
        functions: [4, 3],
        lines: [12, 8],
        statements: [12, 8],
      }),
      [join(root, 'apps/server/src/index.ts')]: coverage({
        branches: [4, 2],
        functions: [2, 1],
        lines: [10, 5],
        statements: [10, 5],
      }),
      [join(root, 'packages/utils/src/index.ts')]: coverage({
        branches: [2, 2],
        functions: [2, 2],
        lines: [2, 2],
        statements: [2, 2],
      }),
    })}\n`,
  );

  const result = runCommand(
    process.execPath,
    [script, '--root', root, '--summary', 'coverage/coverage-summary.json'],
    { encoding: 'utf8', env: { ...process.env, CI: '' } },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /apps\/server\s+50\.00%\s+50\.00%/);
  assert.match(result.stdout, /packages\/utils\s+100\.00%\s+100\.00%/);

  const server = JSON.parse(
    await readFile(join(root, 'apps/server/.quality-baseline/test-coverage.json'), 'utf8'),
  );
  assert.equal(server.status, 'measured');
  assert.deepEqual(server.coverage.lines, { covered: 5, pct: 50, total: 10 });

  const ios = JSON.parse(
    await readFile(join(root, 'apps/ios/.quality-baseline/test-coverage.json'), 'utf8'),
  );
  assert.equal(ios.status, 'no-measurable-source');
  assert.deepEqual(ios.coverage.lines, { covered: 0, pct: null, total: 0 });

  const currentInCi = runCommand(
    process.execPath,
    [script, '--root', root, '--summary', 'coverage/coverage-summary.json'],
    { encoding: 'utf8', env: { ...process.env, CI: '1' } },
  );
  assert.equal(currentInCi.status, 0, currentInCi.stderr);

  const summaryPath = join(root, 'coverage/coverage-summary.json');
  const changedSummary = JSON.parse(await readFile(summaryPath, 'utf8'));
  const serverPath = join(root, 'apps/server/src/index.ts');
  changedSummary[serverPath].lines.covered = 4;
  changedSummary[serverPath].statements.covered = 4;
  await writeFile(summaryPath, `${JSON.stringify(changedSummary)}\n`);

  const staleInCi = runCommand(
    process.execPath,
    [script, '--root', root, '--summary', 'coverage/coverage-summary.json'],
    { encoding: 'utf8', env: { ...process.env, CI: '1' } },
  );
  assert.equal(staleInCi.status, 1);
  assert.match(staleInCi.stderr, /Coverage baselines are stale/);
});
