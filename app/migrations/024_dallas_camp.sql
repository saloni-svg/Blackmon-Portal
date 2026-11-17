-- foreign_keys: off
-- Second camp, Dallas (8494 Stults Rd, Dallas, TX 75243): staff can be at Little Elm or Dallas.
-- Rebuilds staff so its location CHECK allows 'Dallas' ('Plano' stays allowed for history).
CREATE TABLE staff_new (
  id                 TEXT PRIMARY KEY,
  first_name         TEXT NOT NULL,
  last_name          TEXT NOT NULL,
  gender             TEXT NOT NULL CHECK (gender IN ('Male', 'Female', 'Other', 'Prefer not to say')),
  email              TEXT NOT NULL COLLATE NOCASE,
  phone              TEXT NOT NULL,
  role               TEXT NOT NULL CHECK (role IN ('Camp Staff', 'Tutor')),
  location           TEXT NOT NULL CHECK (location IN ('Plano', 'Little Elm', 'Dallas')),
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
