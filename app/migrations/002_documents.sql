-- Camp documents for paid parents, waiver signatures, and admin notifications.

-- One row per parent (GHL contact) and document. The parent's notification for a document is
-- this row: unread until viewed_at is set.
CREATE TABLE doc_assignments (
  id          TEXT PRIMARY KEY,
  contact_id  TEXT NOT NULL,
  doc_id      TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  viewed_at   TEXT,
  UNIQUE (contact_id, doc_id)
);

-- Signed waivers. A reset keeps the row (reset_at set) for the record; only one signature per
-- assignment can be active, so a waiver can't be signed twice.
CREATE TABLE doc_signatures (
  id              TEXT PRIMARY KEY,
  assignment_id   TEXT NOT NULL REFERENCES doc_assignments (id) ON DELETE CASCADE,
  contact_id      TEXT NOT NULL,
  doc_id          TEXT NOT NULL,
  parent_name     TEXT NOT NULL,
  child_name      TEXT NOT NULL,
  relationship    TEXT NOT NULL,
  typed_signature TEXT NOT NULL,
  has_drawing     INTEGER NOT NULL DEFAULT 0,
  ip              TEXT,
  user_agent      TEXT,
  signed_at       TEXT NOT NULL,
  file_path       TEXT NOT NULL,
  reset_at        TEXT,
  reset_by        TEXT
);
CREATE UNIQUE INDEX doc_signatures_active ON doc_signatures (assignment_id) WHERE reset_at IS NULL;

-- Admin dashboard notifications (e.g. a parent signed a waiver), read state per admin.
CREATE TABLE admin_notifications (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  at           TEXT NOT NULL,
  kind         TEXT NOT NULL,
  title        TEXT NOT NULL,
  contact_id   TEXT,
  doc_id       TEXT,
  signature_id TEXT
);
CREATE TABLE admin_notification_reads (
  notification_id INTEGER NOT NULL REFERENCES admin_notifications (id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES admin_users (id) ON DELETE CASCADE,
  read_at         TEXT NOT NULL,
  PRIMARY KEY (notification_id, user_id)
);
