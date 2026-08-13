import assert from 'node:assert/strict';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { runCommand } from '../support/run-command.mjs';
import { createTempWorkspace } from '../support/temp-workspace.mjs';

const orchestrator = resolve('scripts/run-app-e2e.mjs');

test('[template.e2e-active-apps] root orchestration runs only active app E2E scripts', async (t) => {
  const workspace = await createTempWorkspace('onee-app-e2e-');
  t.after(workspace.cleanup);
  const root = workspace.root;
  const bin = join(root, 'bin');
  const npmLog = join(root, 'npm.log');

  await mkdir(join(root, 'apps/web'), { recursive: true });
  await mkdir(join(root, 'apps/server'), { recursive: true });
  await mkdir(join(root, 'packages/ui'), { recursive: true });
  await mkdir(bin);
  await writeFile(
    join(root, 'apps/web/package.json'),
    `${JSON.stringify({ name: '@example/web', scripts: { e2e: 'playwright test' } })}\n`,
  );
  await writeFile(
    join(root, 'apps/server/package.json'),
    `${JSON.stringify({ name: '@example/server' })}\n`,
  );
  await writeFile(
    join(root, 'packages/ui/package.json'),
    `${JSON.stringify({ name: '@example/ui', scripts: { e2e: 'unexpected' } })}\n`,
  );
  await writeFile(npmLog, '');
  const npm = join(bin, 'npm');
  await writeFile(npm, '#!/usr/bin/env bash\nprintf "%s\\n" "$*" >>"$NPM_LOG"\n');
  await chmod(npm, 0o755);

  const result = runCommand(process.execPath, [orchestrator, '--root', root], {
    env: {
      ...process.env,
      NPM_LOG: npmLog,
      PATH: `${bin}:${process.env.PATH}`,
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(npmLog, 'utf8'), 'run e2e --workspace apps/web\n');
});
