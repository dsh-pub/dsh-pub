import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function createTempWorkspace(prefix = 'onee-e2e-') {
  const root = await mkdtemp(join(tmpdir(), prefix));
  let cleaned = false;

  return {
    root,
    async cleanup() {
      if (cleaned) return;
      cleaned = true;
      await rm(root, { force: true, recursive: true });
    },
  };
}
