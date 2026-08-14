import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const workflowPath = new URL('../.github/workflows/plugin-submission.yml', import.meta.url);

describe('plugin submission workflow contract', () => {
  it('accepts only newly opened Issues carrying the submission label', async () => {
    const workflow = parse(await readFile(workflowPath, 'utf8'));

    expect(workflow.on).toEqual({ issues: { types: ['opened'] } });
    expect(workflow.jobs.validate.if).toBe(
      "contains(github.event.issue.labels.*.name, 'plugin-submission')",
    );
  });

  it('pins official actions and carries the validated main SHA into a non-force push', async () => {
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

    const validateCheckout = workflow.jobs.validate.steps.find(
      (step: { name?: string }) => step.name === 'Checkout registry source',
    );
    expect(validateCheckout.with).toMatchObject({ 'persist-credentials': false, ref: 'main' });
    expect(workflow.jobs.validate.outputs.base_sha).toBe('${{ steps.base.outputs.base_sha }}');

    const integrateCheckout = workflow.jobs.integrate.steps.find(
      (step: { name?: string }) => step.name === 'Checkout validated base',
    );
    expect(integrateCheckout.with).toMatchObject({
      'persist-credentials': false,
      ref: '${{ needs.validate.outputs.base_sha }}',
    });
    expect(workflow.jobs.integrate.outputs.commit_sha).toBe('${{ steps.push.outputs.commit_sha }}');

    const push = workflow.jobs.integrate.steps.find(
      (step: { name?: string }) => step.name === 'Fast-forward main',
    );
    expect(push.run).toContain('git push origin HEAD:main');
    expect(push.run).not.toMatch(/--force(?:-with-lease)?/);
  });

  it('waits for the exact Cloudflare check and live verification before reporting', async () => {
    const workflow = parse(await readFile(workflowPath, 'utf8'));
    const verify = workflow.jobs.verify_deployment;
    const verifyStep = verify.steps.find(
      (step: { name?: string }) => step.name === 'Wait for Cloudflare and verify the live catalog',
    );

    expect(verify.permissions).toMatchObject({ checks: 'read', contents: 'read' });
    expect(verify['timeout-minutes']).toBe(15);
    expect(verifyStep.env).toMatchObject({
      INTEGRATED_COMMIT_SHA: '${{ needs.integrate.outputs.commit_sha }}',
      SUBMISSION_CHANGED: '${{ needs.validate.outputs.changed }}',
    });
    expect(workflow.jobs.report.needs).toContain('verify_deployment');
  });
});
