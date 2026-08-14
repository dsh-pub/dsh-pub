import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';

import type { D1DatabaseLike, SubmissionWorkflowParams } from './index.js';
import {
  defaultPluginSubmissionWorkflowDependencies,
  runPluginSubmissionWorkflow,
} from './plugin-submission-workflow-core.js';
import { recordPluginSubmissionState } from './plugin-submission-state.js';

interface PluginSubmissionWorkflowBindings {
  DB: D1DatabaseLike;
  GITHUB_APP_CLIENT_ID: string;
  GITHUB_APP_INSTALLATION_ID: string;
  GITHUB_APP_PRIVATE_KEY_PKCS8: string;
  GITHUB_TARGET_REPOSITORY_ID: string;
}

const workflowParams = (value: unknown): SubmissionWorkflowParams => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Plugin submission workflow parameters are invalid.');
  }
  const params = value as Partial<SubmissionWorkflowParams>;
  if (
    typeof params.submissionId !== 'string' ||
    typeof params.owner !== 'string' ||
    typeof params.repo !== 'string' ||
    typeof params.repository !== 'string'
  ) {
    throw new Error('Plugin submission workflow parameters are invalid.');
  }
  return params as SubmissionWorkflowParams;
};

export class PluginSubmissionWorkflow extends WorkflowEntrypoint<
  PluginSubmissionWorkflowBindings,
  SubmissionWorkflowParams
> {
  override async run(event: Readonly<WorkflowEvent<SubmissionWorkflowParams>>, step: WorkflowStep) {
    const params = workflowParams(event.payload);
    await runPluginSubmissionWorkflow(this.env, params, step, {
      ...defaultPluginSubmissionWorkflowDependencies,
      recordState: (submissionId, state) =>
        recordPluginSubmissionState(this.env.DB, submissionId, state),
    });
  }
}
