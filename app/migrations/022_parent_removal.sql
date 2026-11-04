-- Admin Parents → Delete / Remove from camp. removed_at / removed_by: when and by whom (admin email);
-- removed_how: 'deleted' (Winter Camp 2026 opportunities deleted in GHL), 'lost' (set to Lost) or
-- 'hidden' (the earlier Delete, which only turned portal access off). Removed parents are kept for
-- history and left out everywhere. removed_opportunities: the opportunities removed, so a GHL search
-- that still lists them (it lags up to an hour) can't bring the parent back.
ALTER TABLE parent_access ADD COLUMN removed_at TEXT;
ALTER TABLE parent_access ADD COLUMN removed_by TEXT;
ALTER TABLE parent_access ADD COLUMN removed_how TEXT;
UPDATE parent_access SET removed_at = hidden_at, removed_how = 'hidden' WHERE hidden_at IS NOT NULL;
CREATE TABLE removed_opportunities (
  opportunity_id TEXT PRIMARY KEY,
  contact_id     TEXT NOT NULL,
  how            TEXT NOT NULL CHECK (how IN ('deleted', 'lost')),
  removed_at     TEXT NOT NULL,
  removed_by     TEXT
);
CREATE INDEX removed_opportunities_by_contact ON removed_opportunities (contact_id);
