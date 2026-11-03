-- Camp staff training acknowledgments (documents/Blackmon_Staff_Training_Acknowledgment.pdf), signed in
-- the portal after passing the knowledge assessment. One per staff member; the signed PDF (the form
-- filled in with their details and signature, plus a signature record page) is in <data>/signed/.
CREATE TABLE staff_acknowledgments (
  id              TEXT PRIMARY KEY,
  contact_id      TEXT NOT NULL UNIQUE,         -- their GHL contact
  email           TEXT NOT NULL COLLATE NOCASE,
  name            TEXT NOT NULL,
  role            TEXT NOT NULL,
  location        TEXT NOT NULL DEFAULT '',
  training_date   TEXT NOT NULL DEFAULT '',     -- as printed on the form
  score           TEXT NOT NULL DEFAULT '',     -- as printed on the form, e.g. "9 / 10 (90%)"
  typed_signature TEXT NOT NULL,
  has_drawing     INTEGER NOT NULL DEFAULT 0,
  ip              TEXT,
  user_agent      TEXT,
  signed_at       TEXT NOT NULL,
  file_path       TEXT NOT NULL
);
CREATE INDEX staff_acknowledgments_by_email ON staff_acknowledgments (email);
