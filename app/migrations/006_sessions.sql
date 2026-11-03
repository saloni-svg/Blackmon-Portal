-- Sign-in sessions (portal and admin dashboard), so restarting the server doesn't sign anyone out.
-- Only a SHA-256 hash of each session id is stored; the id itself is in the browser's cookie.
CREATE TABLE sessions (
  sid_hash   TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,     -- portal | admin
  subject    TEXT NOT NULL,     -- GHL contact id (portal) or admin user id (admin)
  expires_at INTEGER NOT NULL,  -- ms since 1970
  created_at TEXT NOT NULL
);
CREATE INDEX sessions_subject ON sessions (kind, subject);
