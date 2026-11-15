import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const workflowPath = new URL('../.github/workflows/test.yml', import.meta.url);

describe('Quality workflow contract', () => {
  it('pins Playwright browser installation to Ubuntu 24.04', async () => {
    const workflow = parse(await readFile(workflowPath, 'utf8'));
    const quality = workflow.jobs.quality;
    const installBrowser = quality.steps.find(
      (step: { name?: string }) => step.name === 'Install browser for E2E',
    );

    expect(quality['runs-on']).toBe('ubuntu-24.04');
    expect(installBrowser.run).toBe('npx playwright install --with-deps chromium');
  });
});
