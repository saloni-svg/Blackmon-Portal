-- Camp staff knowledge assessment (content/assessment.json): every attempt, graded by the portal
-- against the answer key when it's submitted. Staff below the pass mark retake it.
CREATE TABLE assessment_attempts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id   TEXT NOT NULL,                 -- their GHL contact
  email        TEXT NOT NULL COLLATE NOCASE,
  name         TEXT NOT NULL DEFAULT '',
  answers      TEXT NOT NULL,                 -- JSON: [{ n, picked: [..], correct: true/false }]
  score        INTEGER NOT NULL,
  total        INTEGER NOT NULL,
  percent      INTEGER NOT NULL,
  passed       INTEGER NOT NULL,              -- 1 / 0
  submitted_at TEXT NOT NULL
);
CREATE INDEX assessment_attempts_by_contact ON assessment_attempts (contact_id, id);
CREATE INDEX assessment_attempts_by_email ON assessment_attempts (email, id);
