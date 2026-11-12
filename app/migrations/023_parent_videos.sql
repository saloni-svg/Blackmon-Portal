-- foreign_keys: off
-- Parent videos: admins upload videos for parents too (admin → Parent videos), which every parent
-- watches on their portal's Videos page. They're training_videos with audience 'Parent'; this
-- rebuild only widens the audience CHECK.
CREATE TABLE training_videos_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  audience    TEXT NOT NULL CHECK (audience IN ('Camp Staff', 'Tutor', 'Parent')),
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  file_name   TEXT NOT NULL,
  stored      TEXT NOT NULL,
  mime        TEXT NOT NULL,
  size        INTEGER NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  uploaded_by TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
INSERT INTO training_videos_new SELECT id, audience, title, description, file_name, stored, mime, size, position, uploaded_by, created_at, updated_at FROM training_videos;
DROP TABLE training_videos;
ALTER TABLE training_videos_new RENAME TO training_videos;
CREATE INDEX training_videos_by_audience ON training_videos (audience, position);
