CREATE TABLE plugin_submissions (
  id TEXT PRIMARY KEY,
  repository TEXT NOT NULL,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  repository_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'creating_pr', 'pr_created', 'already_submitted', 'failed')
  ),
  source_commit TEXT,
  branch TEXT,
  pull_request_number INTEGER,
  pull_request_url TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX plugin_submissions_status_idx ON plugin_submissions (status, updated_at);
CREATE UNIQUE INDEX plugin_submissions_active_repository_idx
  ON plugin_submissions (repository_key)
  WHERE status IN ('queued', 'creating_pr');
