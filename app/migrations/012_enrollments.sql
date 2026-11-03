-- Enrollment forms parents submit in the portal (Camp Enrollment Forms Build Spec, Oct 2026). One per
-- parent per camp (e.g. "Winter 2026"); every child, emergency contact, authorized pick-up and agreement
-- is in data (JSON, lib/enrollment.js). Only the basics also go to GHL (name, phone, first child,
-- location, the enrollment-submitted tag); the rest stays in the portal for the admin roster.
CREATE TABLE enrollments (
  contact_id  TEXT NOT NULL,                     -- their GHL contact
  camp        TEXT NOT NULL,                     -- camp tag, e.g. "Winter 2026"
  email       TEXT NOT NULL DEFAULT '' COLLATE NOCASE,
  data        TEXT NOT NULL,
  signed_name TEXT NOT NULL,
  signed_on   TEXT NOT NULL,                     -- the date on the signature (YYYY-MM-DD)
  ip          TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (contact_id, camp)
);
