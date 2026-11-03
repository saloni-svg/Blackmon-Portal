-- What each parent has paid, from their paid "Winter Camp 2026: ..." GHL invoices (or paid orders for
-- older payment-link purchases). Saved on "Sync from Winter Camp 2026" and when the parent opens the
-- Payment plan page; shown in the admin Parents "Total paid" column.
CREATE TABLE payment_totals (
  contact_id  TEXT PRIMARY KEY,
  total_paid  REAL,                  -- null: no paid invoice or order found
  numbers     TEXT NOT NULL,         -- e.g. "INV-000010"
  source      TEXT,                  -- invoice | order
  updated_at  TEXT NOT NULL
);
