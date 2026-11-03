-- Messages to parents from the admin dashboard: announcements gain an audience, email/SMS
-- channels, AI translations and a send time; missing-step reminders are logged per parent; and
-- each parent's language (picked in the Ask Blackmon chat) is remembered.

ALTER TABLE announcements ADD COLUMN audience TEXT NOT NULL DEFAULT '{"type":"all"}'; -- {"type":"all"} | {"type":"location","location":"Plano"} | {"type":"families","contactIds":[..]}
ALTER TABLE announcements ADD COLUMN channels TEXT NOT NULL DEFAULT '["portal"]';     -- portal is always on; plus "email" / "sms"
ALTER TABLE announcements ADD COLUMN translations TEXT;                                -- {"hi":{"title","body","sms"}, ...}
ALTER TABLE announcements ADD COLUMN send_at TEXT;                                     -- scheduled time; NULL = when posted
ALTER TABLE announcements ADD COLUMN sent_at TEXT;                                     -- when parents got it; NULL = still scheduled
ALTER TABLE announcements ADD COLUMN send_summary TEXT;                                -- {"recipients","email","sms","failed"}
UPDATE announcements SET sent_at = created_at;

-- The language a parent picked in the chat; reminders and announcements use it.
CREATE TABLE parent_prefs (
  contact_id TEXT PRIMARY KEY,
  language   TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Every reminder / announcement email or SMS: who it was for, where it went, and whether it worked.
CREATE TABLE outreach_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id TEXT NOT NULL,
  kind       TEXT NOT NULL,  -- reminder | announcement
  ref        TEXT,           -- announcement id
  channel    TEXT NOT NULL,  -- email | sms
  language   TEXT NOT NULL,
  sent_to    TEXT,           -- the address used (the test contact in test mode)
  status     TEXT NOT NULL,  -- sent | failed | skipped
  error      TEXT,
  at         TEXT NOT NULL
);
CREATE INDEX outreach_log_contact ON outreach_log (contact_id, kind, at);
