-- A portal invite sent while PARENT_MESSAGES=test goes to the test contact, not the parent. It's
-- recorded here instead of invite_sent_at, so the parent still gets their real invite at launch.
ALTER TABLE parent_access ADD COLUMN test_invite_at TEXT;
