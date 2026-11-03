-- Admin area (/admin): staff records, dashboard users, parent invites and the activity log.

-- Camp staff and tutors added from the admin Staff page. GHL keeps their contact
-- (Portal - Role / Location); this keeps the extra details and the private ID proof.
CREATE TABLE staff (
  id                 TEXT PRIMARY KEY,
  first_name         TEXT NOT NULL,
  last_name          TEXT NOT NULL,
  gender             TEXT NOT NULL CHECK (gender IN ('Male', 'Female', 'Other', 'Prefer not to say')),
  email              TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone              TEXT NOT NULL,
  role               TEXT NOT NULL CHECK (role IN ('Camp Staff', 'Tutor')),
  location           TEXT NOT NULL CHECK (location IN ('Plano', 'Little Elm')),
  id_proof_path      TEXT NOT NULL,
  id_proof_file_name TEXT NOT NULL,
  id_proof_mime      TEXT NOT NULL,
  ghl_contact_id     TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

-- People who can sign in to /admin. The Owner comes from .env; everyone else is a staff
-- member given "View only" or "Admin" access (deleting the staff record removes the login).
-- password_hash is NULL until they set it through their one-time setup link.
CREATE TABLE admin_users (
  id                   TEXT PRIMARY KEY,
  email                TEXT NOT NULL UNIQUE COLLATE NOCASE,
  first_name           TEXT NOT NULL,
  last_name            TEXT NOT NULL,
  level                TEXT NOT NULL CHECK (level IN ('owner', 'admin', 'view')),
  password_hash        TEXT,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  staff_id             TEXT UNIQUE REFERENCES staff (id) ON DELETE CASCADE,
  photo_path           TEXT,
  setup_token_hash     TEXT,
  setup_expires_at     INTEGER,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);

-- Paid parents (from the GHL pipeline) the admin has invited or removed from the list.
CREATE TABLE parent_access (
  contact_id     TEXT PRIMARY KEY,
  invite_sent_at TEXT,
  hidden_at      TEXT,
  updated_at     TEXT NOT NULL
);

CREATE TABLE activity_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  at        TEXT NOT NULL,
  user_id   TEXT,
  user_name TEXT NOT NULL,
  action    TEXT NOT NULL,
  target    TEXT NOT NULL,
  details   TEXT
);
CREATE INDEX activity_log_at ON activity_log (at DESC);
