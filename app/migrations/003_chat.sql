-- "Ask Blackmon": the parent Q&A chat, its "talk to a person" handoffs, and the search index cache.

-- One conversation per parent at a time (status 'open'); starting a new chat closes the old one.
-- 'handoff' = the parent asked to talk to a person; 'handled' = an admin marked it dealt with.
CREATE TABLE chat_conversations (
  id           TEXT PRIMARY KEY,
  contact_id   TEXT NOT NULL,
  parent_name  TEXT NOT NULL,
  parent_email TEXT NOT NULL,
  parent_phone TEXT,
  child_name   TEXT,
  location     TEXT,
  language     TEXT NOT NULL DEFAULT 'en',
  status       TEXT NOT NULL DEFAULT 'open',
  closed       INTEGER NOT NULL DEFAULT 0,
  handoff_at   TEXT,
  handled_at   TEXT,
  handled_by   TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX chat_conversations_contact ON chat_conversations (contact_id, closed);

-- role: 'parent', 'bot' or 'event' (e.g. "asked to talk to a person"). text_en is the English
-- translation shown to admins when the chat isn't in English. sources: JSON list of source labels.
CREATE TABLE chat_messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL REFERENCES chat_conversations (id) ON DELETE CASCADE,
  role            TEXT NOT NULL,
  text            TEXT NOT NULL,
  text_en         TEXT,
  sources         TEXT,
  answered        INTEGER,
  offer_handoff   INTEGER NOT NULL DEFAULT 0,
  feedback        INTEGER,
  created_at      TEXT NOT NULL
);
CREATE INDEX chat_messages_conversation ON chat_messages (conversation_id, id);

-- Cache for the search index: extracted PDF text (by file hash) and embeddings (by chunk hash).
CREATE TABLE kb_cache (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Handoff notifications link to the chat.
ALTER TABLE admin_notifications ADD COLUMN conversation_id TEXT;
