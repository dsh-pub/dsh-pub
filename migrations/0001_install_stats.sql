CREATE TABLE install_events (
  event_id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  completion_id TEXT UNIQUE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER
);

CREATE INDEX install_events_slug_status_idx ON install_events (slug, status);

CREATE TABLE plugin_stats (
  slug TEXT PRIMARY KEY,
  completed_total INTEGER NOT NULL DEFAULT 0 CHECK (completed_total >= 0),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
