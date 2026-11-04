-- foreign_keys: off
-- Several staff members / tutors can share one email (e.g. Jordan as Owner and as camp staff). They
-- share that email's one dashboard login and GHL contact. Rebuilds staff without UNIQUE on email.
CREATE TABLE staff_new (
  id                 TEXT PRIMARY KEY,
  first_name         TEXT NOT NULL,
  last_name          TEXT NOT NULL,
  gender             TEXT NOT NULL CHECK (gender IN ('Male', 'Female', 'Other', 'Prefer not to say')),
  email              TEXT NOT NULL COLLATE NOCASE,
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
INSERT INTO staff_new SELECT id, first_name, last_name, gender, email, phone, role, location, id_proof_path, id_proof_file_name,
  id_proof_mime, ghl_contact_id, created_at, updated_at FROM staff;
DROP TABLE staff;
ALTER TABLE staff_new RENAME TO staff;
CREATE INDEX staff_by_email ON staff (email);
