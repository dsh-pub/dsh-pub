import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const workflowPath = new URL('../.github/workflows/plugin-submission.yml', import.meta.url);
const syncScriptPath = new URL('./sync-plugin-submissions.mjs', import.meta.url);

describe('plugin submission workflow contract', () => {
  it('validates submission pull requests and syncs only merged submission files', async () => {
    const workflow = parse(await readFile(workflowPath, 'utf8'));

    expect(workflow.on).toEqual({
      pull_request_target: {
        paths: ['submissions/**'],
        types: ['opened', 'reopened', 'synchronize', 'ready_for_review'],
      },
      push: { branches: ['main'], paths: ['submissions/**'] },
    });
    expect(workflow.permissions).toEqual({});
    expect(workflow.jobs.validate.if).toContain("github.event_name == 'pull_request_target'");
    expect(workflow.jobs.validate.if).toContain('github.event.pull_request.draft == false');
    expect(workflow.jobs.integrate.if).toBe("github.event_name == 'push'");
  });

  it('runs pull request checks from the exact trusted base without checking out fork code', async () => {
    const source = await readFile(workflowPath, 'utf8');
    const workflow = parse(source);
    const steps = Object.values(workflow.jobs).flatMap((job: unknown) =>
      Array.isArray((job as { steps?: unknown[] }).steps)
        ? (job as { steps: unknown[] }).steps
        : [],
    );
    const actionReferences = steps
      .map((step) => (step as { uses?: string }).uses)
      .filter((value): value is string => typeof value === 'string');

    expect(actionReferences.length).toBeGreaterThan(0);
    for (const reference of actionReferences) {
      expect(reference).toMatch(/^actions\/[a-z-]+@[a-f0-9]{40}$/);
    }

    expect(workflow.jobs.validate.permissions).toEqual({
      contents: 'read',
      'pull-requests': 'read',
    });
    expect(JSON.stringify(workflow.jobs.validate.steps)).not.toContain('secrets.');
    expect(JSON.stringify(workflow.jobs.validate.steps)).not.toContain(
      'actions/create-github-app-token',
    );
    const validateCheckout = workflow.jobs.validate.steps.find(
      (step: { name?: string }) => step.name === 'Checkout trusted registry source',
    );
    const process = workflow.jobs.validate.steps.find(
      (step: { name?: string }) => step.name === 'Inspect the fixed public source',
    );
    const artifacts = workflow.jobs.validate.steps.find(
      (step: { name?: string }) => step.name === 'Generate directory artifacts',
    );
    const staticChecks = workflow.jobs.validate.steps.find(
      (step: { name?: string }) => step.name === 'Run static checks',
    );
    expect(validateCheckout.with).toMatchObject({
      'persist-credentials': false,
      ref: '${{ github.event.pull_request.base.sha }}',
    });
    expect(artifacts.run).toBe('npm run build --workspace @dsh-pub/plugin-directory');
    expect(workflow.jobs.validate.steps.indexOf(process)).toBeLessThan(
      workflow.jobs.validate.steps.indexOf(artifacts),
    );
    expect(workflow.jobs.validate.steps.indexOf(artifacts)).toBeLessThan(
      workflow.jobs.validate.steps.indexOf(staticChecks),
    );
    expect(source).not.toContain('ref: ${{ github.event.pull_request.head.sha }}');
    expect(workflow.jobs.validate.outputs.base_sha).toBe('${{ steps.process.outputs.base_sha }}');
    expect(workflow.jobs.validate.outputs.head_sha).toBe('${{ steps.process.outputs.head_sha }}');
  });

  it('refreshes a validated PR when main drifts, otherwise merges it without squash or force', async () => {
    const workflow = parse(await readFile(workflowPath, 'utf8'));
    const merge = workflow.jobs.merge;
    const tokenStep = merge.steps.find(
      (step: { name?: string }) => step.name === 'Create update-branch token',
    );
    const mergeStep = merge.steps.find(
      (step: { name?: string }) => step.name === 'Merge the validated pull request',
    );

    expect(merge.needs).toBe('validate');
    expect(merge.permissions).toEqual({ contents: 'write', 'pull-requests': 'write' });
    expect(tokenStep.uses).toBe(
      'actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1',
    );
    expect(tokenStep.with).toEqual({
      'client-id': '${{ vars.DSH_PUB_APP_CLIENT_ID }}',
      'permission-pull-requests': 'write',
      'private-key': '${{ secrets.DSH_PUB_APP_PRIVATE_KEY_PKCS8 }}',
    });
    expect(mergeStep.env).toMatchObject({
      EXPECTED_BASE_SHA: '${{ needs.validate.outputs.base_sha }}',
      EXPECTED_HEAD_SHA: '${{ needs.validate.outputs.head_sha }}',
      GH_TOKEN: '${{ github.token }}',
      PR_NUMBER: '${{ github.event.pull_request.number }}',
      UPDATE_BRANCH_TOKEN: '${{ steps.submission-app-token.outputs.token }}',
    });
    expect(mergeStep.run).toContain('pulls/$PR_NUMBER/merge');
    expect(mergeStep.run).toContain('merge_method=merge');
    expect(mergeStep.run).toContain('--jq .base.ref');
    expect(mergeStep.run).toContain('--jq .draft');
    expect(mergeStep.run).toContain('EXPECTED_BASE_SHA');
    expect(mergeStep.run).toContain('EXPECTED_HEAD_SHA');
    expect(mergeStep.run).toContain('pulls/$PR_NUMBER/update-branch');
    expect(mergeStep.run).toContain('-f expected_head_sha="$EXPECTED_HEAD_SHA"');
    expect(mergeStep.run).toContain(
      'GH_TOKEN="$UPDATE_BRANCH_TOKEN" gh api --method PUT "repos/$REPOSITORY/pulls/$PR_NUMBER/update-branch"',
    );
    expect(mergeStep.run.match(/GH_TOKEN="\$UPDATE_BRANCH_TOKEN"/g)).toHaveLength(1);
    expect(mergeStep.run).toContain('if [ "$CURRENT_MAIN_SHA" != "$EXPECTED_BASE_SHA" ]');
    expect(mergeStep.run.indexOf('--jq .head.sha')).toBeLessThan(
      mergeStep.run.indexOf('pulls/$PR_NUMBER/update-branch'),
    );
    expect(mergeStep.run.indexOf('--jq .base.ref')).toBeLessThan(
      mergeStep.run.indexOf('pulls/$PR_NUMBER/update-branch'),
    );
    expect(mergeStep.run.indexOf('--jq .state')).toBeLessThan(
      mergeStep.run.indexOf('pulls/$PR_NUMBER/update-branch'),
    );
    expect(mergeStep.run.indexOf('pulls/$PR_NUMBER/update-branch')).toBeLessThan(
      mergeStep.run.indexOf('pulls/$PR_NUMBER/merge'),
    );
    expect(mergeStep.run).not.toContain('squash');
    expect(mergeStep.run).not.toMatch(/--force(?:-with-lease)?/);
  });

  it('regenerates the catalog from trusted main after the PR merge', async () => {
    const workflow = parse(await readFile(workflowPath, 'utf8'));
    const syncScript = await readFile(syncScriptPath, 'utf8');
    const integrate = workflow.jobs.integrate;
    const checkout = integrate.steps.find(
      (step: { name?: string }) => step.name === 'Checkout merged submission',
    );
    const sync = integrate.steps.find(
      (step: { name?: string }) => step.name === 'Generate catalog from merged submissions',
    );
    const build = integrate.steps.find(
      (step: { name?: string }) => step.name === 'Build deployable workspace',
    );
    const token = integrate.steps.find(
      (step: { name?: string }) => step.name === 'Create catalog push token',
    );
    const push = integrate.steps.find(
      (step: { name?: string }) => step.name === 'Commit generated catalog',
    );

    expect(integrate.permissions).toEqual({ contents: 'read', 'pull-requests': 'read' });
    expect(checkout.with).toMatchObject({
      'persist-credentials': false,
      ref: '${{ github.sha }}',
    });
    expect(sync.run).toBe('node scripts/sync-plugin-submissions.mjs');
    expect(syncScript).toContain('apps/dsh-plugin/scripts/generate-catalog.ts');
    expect(token.uses).toBe(
      'actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1',
    );
    expect(token.with).toEqual({
      'client-id': '${{ vars.DSH_PUB_APP_CLIENT_ID }}',
      'permission-contents': 'write',
      'private-key': '${{ secrets.DSH_PUB_APP_PRIVATE_KEY_PKCS8 }}',
    });
    expect(integrate.steps.indexOf(token)).toBeGreaterThan(integrate.steps.indexOf(build));
    expect(integrate.steps.indexOf(token)).toBeLessThan(integrate.steps.indexOf(push));
    expect(push.env.GH_TOKEN).toBe('${{ steps.catalog-app-token.outputs.token }}');
    expect(push.run).toContain('git push origin HEAD:main');
    expect(push.run).not.toMatch(/--force(?:-with-lease)?/);
  });
});
