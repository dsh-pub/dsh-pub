import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const roots = ['apps', 'packages'];
const targets = ['coverage', 'dist', join('.cache', 'test-results')];

for (const root of roots) {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.isDirectory()) targets.push(join(root, entry.name, 'dist'));
  }
}

await Promise.all(
  targets.map((target) =>
    rm(target, {
      force: true,
      recursive: true,
    }),
  ),
);
