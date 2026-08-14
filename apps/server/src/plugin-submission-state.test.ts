import { describe, expect, it } from 'vitest';

import type { D1DatabaseLike, D1PreparedStatementLike, D1ResultLike } from './index.js';
import { recordPluginSubmissionState } from './plugin-submission-state.js';

class Statement implements D1PreparedStatementLike {
  params: unknown[] = [];

  constructor(readonly query: string) {}

  bind(...values: unknown[]) {
    this.params = values;
    return this;
  }

  async first<Row = Record<string, unknown>>(): Promise<Row | null> {
    return null;
  }
}

class Database implements D1DatabaseLike {
  readonly statements: Statement[] = [];

  prepare(query: string) {
    return new Statement(query);
  }

  async batch<Row = Record<string, unknown>>(
    statements: D1PreparedStatementLike[],
  ): Promise<D1ResultLike<Row>[]> {
    this.statements.push(...(statements as Statement[]));
    return statements.map(() => ({ meta: { changes: 1 }, results: [], success: true }));
  }
}

const submissionId = '796c8a18-d7f3-47e1-9b91-a290d1ad44f8';
const normalized = (value: string) => value.replace(/\s+/g, ' ').trim();

describe('plugin submission state persistence', () => {
  it('writes every public workflow state without persisting credentials', async () => {
    const db = new Database();

    await recordPluginSubmissionState(db, submissionId, { status: 'creating_pr' });
    await recordPluginSubmissionState(db, submissionId, {
      branch: `submission/${submissionId}`,
      commitSha: '2'.repeat(40),
      prNumber: 42,
      prUrl: 'https://github.com/dsh-pub/dsh-pub/pull/42',
      status: 'pr_created',
    });
    await recordPluginSubmissionState(db, submissionId, { status: 'already_submitted' });
    await recordPluginSubmissionState(db, submissionId, {
      code: 'submission_automation_failed',
      message: 'Submission automation could not create a pull request.',
      status: 'failed',
    });

    expect(db.statements.map(({ query }) => normalized(query))).toEqual([
      expect.stringMatching(/SET status = 'creating_pr'.*status IN \('queued', 'creating_pr'\)/),
      expect.stringMatching(/SET status = 'pr_created'.*status IN \('creating_pr', 'pr_created'\)/),
      expect.stringMatching(
        /SET status = 'already_submitted'.*status IN \('creating_pr', 'already_submitted'\)/,
      ),
      expect.stringMatching(
        /SET status = 'failed'.*status IN \('queued', 'creating_pr', 'failed'\)/,
      ),
    ]);
    expect(db.statements.map(({ params }) => params)).toEqual([
      [submissionId],
      [
        `submission/${submissionId}`,
        '2'.repeat(40),
        42,
        'https://github.com/dsh-pub/dsh-pub/pull/42',
        submissionId,
      ],
      [submissionId],
      [
        'submission_automation_failed',
        'Submission automation could not create a pull request.',
        submissionId,
      ],
    ]);
    expect(JSON.stringify(db.statements)).not.toContain('token');
    expect(JSON.stringify(db.statements)).not.toContain('private-key');
  });
});
