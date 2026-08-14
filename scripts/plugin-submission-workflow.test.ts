import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const workflowPath = new URL('../.github/workflows/plugin-submission.yml', import.meta.url);

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
    const validateCheckout = workflow.jobs.validate.steps.find(
      (step: { name?: string }) => step.name === 'Checkout trusted registry source',
    );
    expect(validateCheckout.with).toMatchObject({
      'persist-credentials': false,
      ref: '${{ github.event.pull_request.base.sha }}',
    });
    expect(source).not.toContain('ref: ${{ github.event.pull_request.head.sha }}');
    expect(workflow.jobs.validate.outputs.base_sha).toBe('${{ steps.process.outputs.base_sha }}');
    expect(workflow.jobs.validate.outputs.head_sha).toBe('${{ steps.process.outputs.head_sha }}');
  });

  it('merges the unchanged validated PR with a merge commit, never a squash or force push', async () => {
    const workflow = parse(await readFile(workflowPath, 'utf8'));
    const merge = workflow.jobs.merge;
    const mergeStep = merge.steps.find(
      (step: { name?: string }) => step.name === 'Merge the validated pull request',
    );

    expect(merge.needs).toBe('validate');
    expect(merge.permissions).toEqual({ contents: 'write', 'pull-requests': 'write' });
    expect(mergeStep.env).toMatchObject({
      EXPECTED_BASE_SHA: '${{ needs.validate.outputs.base_sha }}',
      EXPECTED_HEAD_SHA: '${{ needs.validate.outputs.head_sha }}',
      PR_NUMBER: '${{ github.event.pull_request.number }}',
    });
    expect(mergeStep.run).toContain('pulls/$PR_NUMBER/merge');
    expect(mergeStep.run).toContain('merge_method=merge');
    expect(mergeStep.run).toContain('--jq .base.ref');
    expect(mergeStep.run).toContain('--jq .draft');
    expect(mergeStep.run).toContain('EXPECTED_BASE_SHA');
    expect(mergeStep.run).toContain('EXPECTED_HEAD_SHA');
    expect(mergeStep.run).not.toContain('squash');
    expect(mergeStep.run).not.toMatch(/--force(?:-with-lease)?/);
  });

  it('regenerates the catalog from trusted main after the PR merge', async () => {
    const workflow = parse(await readFile(workflowPath, 'utf8'));
    const integrate = workflow.jobs.integrate;
    const checkout = integrate.steps.find(
      (step: { name?: string }) => step.name === 'Checkout merged submission',
    );
    const sync = integrate.steps.find(
      (step: { name?: string }) => step.name === 'Generate catalog from merged submissions',
    );
    const push = integrate.steps.find(
      (step: { name?: string }) => step.name === 'Commit generated catalog',
    );

    expect(integrate.permissions).toEqual({ contents: 'write', 'pull-requests': 'read' });
    expect(checkout.with).toMatchObject({
      'persist-credentials': false,
      ref: '${{ github.sha }}',
    });
    expect(sync.run).toBe('node scripts/sync-plugin-submissions.mjs');
    expect(push.run).toContain('git push origin HEAD:main');
    expect(push.run).not.toMatch(/--force(?:-with-lease)?/);
  });
});
