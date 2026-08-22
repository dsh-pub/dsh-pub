import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const workflowPath = new URL('../.github/workflows/topic-catalog-sync.yml', import.meta.url);

describe('Topic catalog sync workflow contract', () => {
  it('runs daily at 01:00 Asia/Shanghai and supports a manual trial', async () => {
    const workflow = parse(await readFile(workflowPath, 'utf8'));

    expect(workflow.on).toEqual({
      push: {
        branches: ['main'],
        paths: [
          '.github/workflows/topic-catalog-sync.yml',
          'scripts/sync-topic-catalog.mjs',
          'scripts/lib/github-topic-client.mjs',
          'scripts/lib/topic-catalog-sync.mjs',
        ],
      },
      schedule: [{ cron: '0 1 * * *', timezone: 'Asia/Shanghai' }],
      workflow_dispatch: null,
    });
  });

  it('syncs the complete Topic, validates the product, and pushes only generated data', async () => {
    const source = await readFile(workflowPath, 'utf8');
    const workflow = parse(source);
    const job = workflow.jobs.sync;
    const actionReferences = job.steps
      .map((step: { uses?: string }) => step.uses)
      .filter((value: unknown): value is string => typeof value === 'string');

    expect(job.permissions).toEqual({ contents: 'read' });
    expect(actionReferences.length).toBeGreaterThan(0);
    for (const reference of actionReferences) {
      expect(reference).toMatch(/^actions\/[a-z-]+@[a-f0-9]{40}$/);
    }

    const checkout = job.steps.find((step: { name?: string }) => step.name === 'Checkout main');
    expect(checkout.with).toMatchObject({ 'persist-credentials': false, ref: 'main' });
    const sync = job.steps.find((step: { name?: string }) => step.name === 'Sync Topic catalog');
    expect(sync.run).toBe('node scripts/sync-topic-catalog.mjs');
    expect(sync.env.GITHUB_TOKEN).toBe('${{ github.token }}');

    const commands = job.steps.map((step: { run?: string }) => step.run).filter(Boolean);
    expect(commands).toEqual(
      expect.arrayContaining(['npm run lint', 'npm run test', 'npm run e2e', 'npm run build']),
    );

    const commit = job.steps.find(
      (step: { name?: string }) => step.name === 'Commit generated catalog data',
    );
    const build = job.steps.find(
      (step: { name?: string }) => step.name === 'Build deployable workspace',
    );
    const e2e = job.steps.find((step: { name?: string }) => step.name === 'Run integration tests');
    const token = job.steps.find(
      (step: { name?: string }) => step.name === 'Create catalog push token',
    );
    expect(token.uses).toBe(
      'actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1',
    );
    expect(token.with).toEqual({
      'client-id': '${{ vars.DSH_PUB_APP_CLIENT_ID }}',
      'permission-contents': 'write',
      'private-key': '${{ secrets.DSH_PUB_APP_PRIVATE_KEY_PKCS8 }}',
    });
    expect(job.steps.indexOf(build)).toBeLessThan(job.steps.indexOf(token));
    expect(job.steps.indexOf(token)).toBeLessThan(job.steps.indexOf(commit));
    expect(job.steps.indexOf(commit)).toBeLessThan(job.steps.indexOf(e2e));
    expect(commit.env.GH_TOKEN).toBe('${{ steps.catalog-app-token.outputs.token }}');
    for (const path of [
      'apps/dsh-plugin/lib/client.js',
      'apps/dsh-plugin/src/client/catalog.generated.json',
      'apps/server/src/installable-slugs.generated.json',
      'packages/catalog/src/community.generated.json',
      'packages/catalog/src/community.sources.json',
      'packages/catalog/src/topic-analysis.generated.json',
    ]) {
      expect(commit.run).toContain(path);
    }
    expect(commit.run).toContain('git push origin HEAD:main');
    expect(commit.run).not.toMatch(/--force(?:-with-lease)?/);
  });
});
