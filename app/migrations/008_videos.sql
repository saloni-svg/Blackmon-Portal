-- Training videos (uploaded by admins, one list for camp staff and one for tutors), who has watched
-- which, and each camp staff member's / tutor's own intro video (also sent to GHL).
CREATE TABLE training_videos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  audience    TEXT NOT NULL CHECK (audience IN ('Camp Staff', 'Tutor')),
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  file_name   TEXT NOT NULL,                 -- the uploaded file's name
  stored      TEXT NOT NULL,                 -- file name on disk (data/training/)
  mime        TEXT NOT NULL,
  size        INTEGER NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  uploaded_by TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX training_videos_by_audience ON training_videos (audience, position);

CREATE TABLE training_progress (
  contact_id TEXT NOT NULL,
  video_id   INTEGER NOT NULL REFERENCES training_videos(id) ON DELETE CASCADE,
  watched_at TEXT NOT NULL,
  PRIMARY KEY (contact_id, video_id)
);

CREATE TABLE intro_videos (
  contact_id  TEXT PRIMARY KEY,              -- their GHL contact
  email       TEXT NOT NULL COLLATE NOCASE,
  file_name   TEXT NOT NULL,
  stored      TEXT NOT NULL,                 -- file name on disk (data/intro-videos/)
  mime        TEXT NOT NULL,
  size        INTEGER NOT NULL,
  uploaded_at TEXT NOT NULL
);
