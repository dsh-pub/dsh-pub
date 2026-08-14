import {
  createGitHubAppJwt,
  createInstallationToken,
  ensureSubmissionPullRequest,
} from './github-app.js';
import type { SubmissionWorkflowParams } from './index.js';
import type { PluginSubmissionState } from './plugin-submission-state.js';

export interface PluginSubmissionWorkflowEnvironment {
  GITHUB_APP_CLIENT_ID: string;
  GITHUB_APP_INSTALLATION_ID: string;
  GITHUB_APP_PRIVATE_KEY_PKCS8: string;
  GITHUB_TARGET_REPOSITORY_ID: string;
}

export interface WorkflowStepLike {
  do<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

export interface PluginSubmissionWorkflowDependencies {
  createJwt: typeof createGitHubAppJwt;
  createToken: typeof createInstallationToken;
  ensurePullRequest: typeof ensureSubmissionPullRequest;
  recordState(submissionId: string, state: PluginSubmissionState): Promise<void>;
}

export const defaultPluginSubmissionWorkflowDependencies = {
  createJwt: createGitHubAppJwt,
  createToken: createInstallationToken,
  ensurePullRequest: ensureSubmissionPullRequest,
} as const;

export async function runPluginSubmissionWorkflow(
  env: PluginSubmissionWorkflowEnvironment,
  params: SubmissionWorkflowParams,
  step: WorkflowStepLike,
  dependencies: PluginSubmissionWorkflowDependencies,
) {
  let pullRequest: Awaited<ReturnType<typeof dependencies.ensurePullRequest>> | undefined;
  const recordPullRequestState = async () => {
    if (!pullRequest) throw new Error('Plugin submission pull request result is unavailable.');
    if (pullRequest.status === 'already_submitted') {
      await dependencies.recordState(params.submissionId, { status: 'already_submitted' });
      return { status: 'already_submitted' as const };
    }
    await dependencies.recordState(params.submissionId, {
      branch: pullRequest.branch,
      commitSha: pullRequest.commitSha,
      prNumber: pullRequest.prNumber,
      prUrl: pullRequest.prUrl,
      status: 'pr_created',
    });
    return { prUrl: pullRequest.prUrl, status: 'pr_created' as const };
  };
  try {
    await step.do('mark submission as creating pull request', async () => {
      await dependencies.recordState(params.submissionId, { status: 'creating_pr' });
      return { status: 'creating_pr' as const };
    });
    pullRequest = await step.do('create or find submission pull request', async () => {
      const repositoryId = Number(env.GITHUB_TARGET_REPOSITORY_ID);
      if (!Number.isSafeInteger(repositoryId) || repositoryId <= 0) {
        throw new Error('GitHub target repository ID is invalid.');
      }
      const jwt = await dependencies.createJwt({
        clientId: env.GITHUB_APP_CLIENT_ID,
        privateKeyPkcs8Pem: env.GITHUB_APP_PRIVATE_KEY_PKCS8,
      });
      const installation = await dependencies.createToken({
        installationId: env.GITHUB_APP_INSTALLATION_ID,
        jwt,
        repositoryId,
      });
      return dependencies.ensurePullRequest({ ...params, token: installation.token });
    });
    await step.do('record submission pull request', recordPullRequestState);
  } catch (error) {
    if (pullRequest) {
      await step.do('recover submission pull request state', recordPullRequestState);
      return;
    }
    await step.do('record submission failure', async () => {
      await dependencies.recordState(params.submissionId, {
        code: 'submission_automation_failed',
        message: 'Submission automation could not create a pull request.',
        status: 'failed',
      });
      return { status: 'failed' as const };
    });
    throw error;
  }
}
