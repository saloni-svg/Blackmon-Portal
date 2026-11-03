-- The last known "Sports Included" (Yes / No) per Winter Camp 2026 opportunity, read from GHL
-- (opportunity field 5pPdYwI9qj4ABWiQlCFs). Kept so a later empty value from GHL never erases it.
CREATE TABLE opportunity_sports (
  opportunity_id TEXT PRIMARY KEY,
  contact_id     TEXT NOT NULL,
  sports         TEXT NOT NULL,                -- "Yes" or "No"
  updated_at     TEXT NOT NULL
);
