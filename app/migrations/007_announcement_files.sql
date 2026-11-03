-- Files attached to announcements (PDF, JPG, PNG). An upload starts unattached (announcement_id
-- NULL) until the announcement is saved; unattached uploads are removed after a day.
CREATE TABLE announcement_files (
  id              TEXT PRIMARY KEY,           -- random id, used in download links
  announcement_id INTEGER REFERENCES announcements(id),
  name            TEXT NOT NULL,              -- the original file name, shown to parents
  mime            TEXT NOT NULL,
  size            INTEGER NOT NULL,
  stored          TEXT NOT NULL,              -- file name on disk (data/announcements/)
  position        INTEGER NOT NULL DEFAULT 0,
  uploaded_by     TEXT NOT NULL,
  created_at      TEXT NOT NULL
);
CREATE INDEX announcement_files_by_announcement ON announcement_files (announcement_id);
