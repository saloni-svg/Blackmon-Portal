-- When each parent "became a parent": the earliest createdAt of their Winter Camp 2026 Paid (won)
-- opportunity in GHL (or an earlier value already saved here). Announcements sent before it aren't
-- shown to them (Notifications page, badge, dashboard). Filled on every Parents load / sync and the
-- first time the parent opens the portal, so existing parents are backfilled automatically.
ALTER TABLE parent_access ADD COLUMN joined_at TEXT;
