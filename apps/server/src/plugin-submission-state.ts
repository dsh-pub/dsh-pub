import type { D1DatabaseLike } from './index.js';

export type PluginSubmissionState =
  | {
      branch: string;
      commitSha: string | null;
      prNumber: number;
      prUrl: string;
      status: 'pr_created';
    }
  | { status: 'already_submitted' }
  | { code: string; message: string; status: 'failed' }
  | { status: 'creating_pr' };

export async function recordPluginSubmissionState(
  db: D1DatabaseLike,
  submissionId: string,
  state: PluginSubmissionState,
) {
  if (state.status === 'creating_pr') {
    await db.batch([
      db
        .prepare(
          `UPDATE plugin_submissions
           SET status = 'creating_pr', error_code = NULL, error_message = NULL,
               updated_at = unixepoch()
           WHERE id = ?1 AND status IN ('queued', 'creating_pr')`,
        )
        .bind(submissionId),
    ]);
    return;
  }
  if (state.status === 'pr_created') {
    await db.batch([
      db
        .prepare(
          `UPDATE plugin_submissions
           SET status = 'pr_created', branch = ?1, source_commit = ?2,
               pull_request_number = ?3, pull_request_url = ?4,
               error_code = NULL, error_message = NULL, updated_at = unixepoch()
           WHERE id = ?5 AND status IN ('creating_pr', 'pr_created')`,
        )
        .bind(state.branch, state.commitSha, state.prNumber, state.prUrl, submissionId),
    ]);
    return;
  }
  if (state.status === 'already_submitted') {
    await db.batch([
      db
        .prepare(
          `UPDATE plugin_submissions
           SET status = 'already_submitted', error_code = NULL, error_message = NULL,
               updated_at = unixepoch()
           WHERE id = ?1 AND status IN ('creating_pr', 'already_submitted')`,
        )
        .bind(submissionId),
    ]);
    return;
  }
  await db.batch([
    db
      .prepare(
        `UPDATE plugin_submissions
         SET status = 'failed', error_code = ?1, error_message = ?2,
             updated_at = unixepoch()
         WHERE id = ?3 AND status IN ('queued', 'creating_pr', 'failed')`,
      )
      .bind(state.code, state.message, submissionId),
  ]);
}
