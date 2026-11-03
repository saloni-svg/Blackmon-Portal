-- Parent notifications: a parent can remove (x) a document notification; the document itself
-- stays under Documents. Announcements: admins post them to every parent's Notifications.

ALTER TABLE doc_assignments ADD COLUMN notice_dismissed_at TEXT;

CREATE TABLE announcements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- Per parent (GHL contact): when they saw an announcement and whether they removed it.
CREATE TABLE announcement_reads (
  announcement_id INTEGER NOT NULL REFERENCES announcements (id) ON DELETE CASCADE,
  contact_id      TEXT NOT NULL,
  read_at         TEXT,
  dismissed_at    TEXT,
  PRIMARY KEY (announcement_id, contact_id)
);
