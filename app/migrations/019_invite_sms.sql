-- The SMS sent with each portal invite (lib/admin.js invite()).
ALTER TABLE invite_log ADD COLUMN sms_status TEXT;      -- sent | test (went to the test phone) | skipped | failed; null: invite sent before SMS existed
ALTER TABLE invite_log ADD COLUMN sms_message_id TEXT;  -- GHL Conversations message id
ALTER TABLE invite_log ADD COLUMN sms_note TEXT;        -- why it was skipped / failed, or where a test SMS went
