-- Marketing consent is independent from first-party analytics consent.
CREATE TABLE IF NOT EXISTS meta_subjects (
 id TEXT PRIMARY KEY, user_id INTEGER, consent INTEGER NOT NULL DEFAULT 0,
 context TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS meta_subject_user ON meta_subjects(user_id);
CREATE TABLE IF NOT EXISTS meta_events (
 id TEXT PRIMARY KEY, subject_id TEXT NOT NULL, name TEXT NOT NULL,
 payload TEXT, created_at INTEGER NOT NULL, next_attempt INTEGER NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending',
 error_code TEXT
);
CREATE INDEX IF NOT EXISTS meta_events_pending ON meta_events(status,next_attempt);
