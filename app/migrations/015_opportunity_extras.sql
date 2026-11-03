-- The last known Extended Care, Extended Care Days, Transportation and Discount Code per Winter Camp 2026
-- opportunity, read from GHL on "Sync from Winter Camp 2026". A later empty value from GHL never erases one.
CREATE TABLE opportunity_extras (
  opportunity_id     TEXT PRIMARY KEY,
  contact_id         TEXT NOT NULL,
  extended_care      TEXT,                     -- opportunity.extended_care, e.g. "Early care (7:00–9:00 AM)"
  extended_care_days REAL,                     -- opportunity.extended_care_days
  transportation     TEXT,                     -- opportunity.transportation, e.g. "$120 – 2 days"
  discount_code      TEXT,                     -- opportunity.discount_code
  updated_at         TEXT NOT NULL
);
