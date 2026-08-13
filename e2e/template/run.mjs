import { mkdir, readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

import { runCommand } from '../support/run-command.mjs';

const TEST_TIMEOUT_MS = 10 * 60_000;

async function testFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.mjs'))
    .map((entry) => join(directory, entry.name));
}

async function main() {
  const root = resolve(process.cwd());
  const evidenceDirectory = join(root, '.cache/test-results/e2e/node-test');
  const junitPath = join(evidenceDirectory, 'results.junit.xml');
  await mkdir(evidenceDirectory, { recursive: true });

  const files = [
    ...(await testFiles(join(root, 'e2e/template'))),
    ...(await testFiles(join(root, 'e2e/support'))),
  ].map((path) => relative(root, path));

  const result = runCommand(
    process.execPath,
    [
      '--test',
      '--test-reporter=spec',
      '--test-reporter-destination=stdout',
      '--test-reporter=junit',
      `--test-reporter-destination=${junitPath}`,
      ...files,
    ],
    { cwd: root, env: process.env, timeoutMs: TEST_TIMEOUT_MS },
  );

  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.status ?? 1;
}

main().catch((error) => {
  console.error(`template-e2e: ${error.message}`);
  process.exitCode = 1;
});
