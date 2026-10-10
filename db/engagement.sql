-- First-party analytics and support. Never stores IPs or full referrer URLs.
CREATE TABLE IF NOT EXISTS audience_visits (
 id TEXT PRIMARY KEY, source TEXT NOT NULL, medium TEXT NOT NULL DEFAULT '', campaign TEXT NOT NULL DEFAULT '',
 referrer TEXT NOT NULL DEFAULT '', landing TEXT NOT NULL, current_path TEXT NOT NULL,
 device TEXT NOT NULL, started_at INTEGER NOT NULL, last_seen INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS audience_seen ON audience_visits(last_seen);
CREATE INDEX IF NOT EXISTS audience_started ON audience_visits(started_at);
CREATE TABLE IF NOT EXISTS audience_pages (
 id INTEGER PRIMARY KEY, visit_id TEXT NOT NULL REFERENCES audience_visits(id) ON DELETE CASCADE,
 page_key TEXT NOT NULL, path TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(visit_id,page_key)
);
CREATE INDEX IF NOT EXISTS audience_pages_time ON audience_pages(created_at);
CREATE TABLE IF NOT EXISTS support_threads (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', page TEXT NOT NULL DEFAULT '/',
 source TEXT NOT NULL DEFAULT 'Unknown', status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
 unread INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS support_updated ON support_threads(updated_at);
CREATE TABLE IF NOT EXISTS support_messages (
 id INTEGER PRIMARY KEY AUTOINCREMENT, thread_id TEXT NOT NULL REFERENCES support_threads(id) ON DELETE CASCADE,
 sender TEXT NOT NULL CHECK(sender IN ('visitor','team')), body TEXT NOT NULL,
 client_id TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(thread_id,client_id)
);
CREATE INDEX IF NOT EXISTS support_thread_messages ON support_messages(thread_id,id);
CREATE TABLE IF NOT EXISTS support_presence (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, last_seen INTEGER NOT NULL);
