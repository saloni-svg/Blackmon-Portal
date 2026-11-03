-- Every "Your Blackmon Portal login" invite sent: when, to which email, and GHL's message id. The admin
-- Parents "Portal invite" column shows the latest; an email that was invited before is never invited
-- automatically again (a parent who pays again, even on a second GHL contact).
CREATE TABLE invite_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id  TEXT NOT NULL,
  email       TEXT NOT NULL,             -- lower case
  message_id  TEXT,                      -- GHL Conversations message id (null if GHL didn't return one)
  how         TEXT NOT NULL,             -- "automatic" or "manual, by <admin email>"
  sent_at     TEXT NOT NULL
);
CREATE INDEX invite_log_contact ON invite_log (contact_id, sent_at);
CREATE INDEX invite_log_email ON invite_log (email);
-- Invites sent before this log existed (message id unknown).
INSERT INTO invite_log (contact_id, email, message_id, how, sent_at)
  SELECT contact_id, '', NULL, 'before the invite log', invite_sent_at FROM parent_access WHERE invite_sent_at IS NOT NULL;
