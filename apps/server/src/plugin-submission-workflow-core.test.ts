import { describe, expect, it, vi } from 'vitest';

import {
  runPluginSubmissionWorkflow,
  type PluginSubmissionWorkflowDependencies,
} from './plugin-submission-workflow-core.js';

const params = {
  owner: 'Example',
  repo: 'dsh-clock',
  repository: 'https://github.com/Example/dsh-clock',
  submissionId: '796c8a18-d7f3-47e1-9b91-a290d1ad44f8',
};
const stableBranch = 'submission/ZXhhbXBsZS9kc2gtY2xvY2s';

const createStep = () => {
  const outputs: Array<{ name: string; value: unknown }> = [];
  return {
    outputs,
    step: {
      async do<T>(name: string, callback: () => Promise<T>) {
        const value = await callback();
        outputs.push({ name, value });
        return value;
      },
    },
  };
};

const createDependencies = () => {
  const createJwt = vi.fn<PluginSubmissionWorkflowDependencies['createJwt']>(
    async () => 'signed-jwt',
  );
  const createToken = vi.fn<PluginSubmissionWorkflowDependencies['createToken']>(async () => ({
    expiresAt: '2026-08-15T02:00:00Z',
    token: 'secret-token',
  }));
  const ensurePullRequest = vi.fn<PluginSubmissionWorkflowDependencies['ensurePullRequest']>(
    async () => ({
      branch: stableBranch,
      commitSha: '2'.repeat(40),
      created: true,
      prNumber: 42,
      prUrl: 'https://github.com/dsh-pub/dsh-pub/pull/42',
      status: 'pr_created' as const,
    }),
  );
  const recordState = vi.fn<PluginSubmissionWorkflowDependencies['recordState']>(
    async () => undefined,
  );
  return { createJwt, createToken, ensurePullRequest, recordState };
};

const env = {
  GITHUB_APP_CLIENT_ID: 'Iv1.dshpub',
  GITHUB_APP_INSTALLATION_ID: '1234',
  GITHUB_APP_PRIVATE_KEY_PKCS8: 'private-key',
  GITHUB_TARGET_REPOSITORY_ID: '5678',
};

describe('plugin submission workflow core', () => {
  it('creates a PR and checkpoints only public workflow outputs', async () => {
    const dependencies = createDependencies();
    const { outputs, step } = createStep();

    await runPluginSubmissionWorkflow(env, params, step, dependencies);

    expect(outputs.map(({ name }) => name)).toEqual([
      'mark submission as creating pull request',
      'create or find submission pull request',
      'record submission pull request',
    ]);
    expect(JSON.stringify(outputs)).not.toContain('secret-token');
    expect(dependencies.recordState).toHaveBeenNthCalledWith(1, params.submissionId, {
      status: 'creating_pr',
    });
    expect(dependencies.recordState).toHaveBeenNthCalledWith(2, params.submissionId, {
      branch: stableBranch,
      commitSha: '2'.repeat(40),
      prNumber: 42,
      prUrl: 'https://github.com/dsh-pub/dsh-pub/pull/42',
      status: 'pr_created',
    });
  });

  it('records already_submitted when the canonical record already exists on main', async () => {
    const dependencies = createDependencies();
    dependencies.ensurePullRequest.mockResolvedValue({
      branch: `submission/${params.submissionId}`,
      commitSha: null,
      created: false,
      prNumber: null,
      prUrl: null,
      status: 'already_submitted',
    });
    const { step } = createStep();

    await runPluginSubmissionWorkflow(env, params, step, dependencies);

    expect(dependencies.recordState).toHaveBeenLastCalledWith(params.submissionId, {
      status: 'already_submitted',
    });
  });

  it('recovers the public PR state instead of marking failure after a D1 write error', async () => {
    const dependencies = createDependencies();
    let prStateAttempts = 0;
    dependencies.recordState.mockImplementation(async (_submissionId, state) => {
      if (state.status !== 'pr_created') return;
      prStateAttempts += 1;
      if (prStateAttempts === 1) throw new Error('D1 temporarily unavailable');
    });
    const { step } = createStep();

    await expect(
      runPluginSubmissionWorkflow(env, params, step, dependencies),
    ).resolves.toBeUndefined();

    expect(dependencies.recordState).toHaveBeenLastCalledWith(params.submissionId, {
      branch: stableBranch,
      commitSha: '2'.repeat(40),
      prNumber: 42,
      prUrl: 'https://github.com/dsh-pub/dsh-pub/pull/42',
      status: 'pr_created',
    });
    expect(dependencies.recordState).not.toHaveBeenCalledWith(
      params.submissionId,
      expect.objectContaining({ status: 'failed' }),
    );
  });

  it('records a safe failure state and rethrows the internal error', async () => {
    const dependencies = createDependencies();
    dependencies.ensurePullRequest.mockRejectedValue(new Error('GitHub secret detail'));
    const { step } = createStep();

    await expect(runPluginSubmissionWorkflow(env, params, step, dependencies)).rejects.toThrow(
      'GitHub secret detail',
    );
    expect(dependencies.recordState).toHaveBeenLastCalledWith(params.submissionId, {
      code: 'submission_automation_failed',
      message: 'Submission automation could not create a pull request.',
      status: 'failed',
    });
  });
});
