-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: input layer tables
-- Created: 2025-05-09
-- Safe to run multiple times — all statements are idempotent
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── ingested_documents ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ingested_documents (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id       UUID        REFERENCES clients(id) ON DELETE SET NULL,
  label           TEXT,
  mime_type       TEXT        NOT NULL,
  character_count INTEGER     NOT NULL DEFAULT 0,
  extracted_text  TEXT        NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ingested_docs_user ON ingested_documents(user_id);

ALTER TABLE ingested_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own ingested documents" ON ingested_documents;
CREATE POLICY "Users read own ingested documents"
  ON ingested_documents
  FOR SELECT
  USING (auth.uid() = user_id);

-- ─── ingested_emails ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ingested_emails (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  from_address     TEXT        NOT NULL,
  to_address       TEXT,
  subject          TEXT,
  body_text        TEXT,
  attachment_count INTEGER     DEFAULT 0,
  received_at      TIMESTAMPTZ,
  processed        BOOLEAN     DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ingested_emails_user      ON ingested_emails(user_id);
CREATE INDEX IF NOT EXISTS idx_ingested_emails_processed ON ingested_emails(processed);

ALTER TABLE ingested_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own ingested emails" ON ingested_emails;
CREATE POLICY "Users read own ingested emails"
  ON ingested_emails
  FOR SELECT
  USING (auth.uid() = user_id);

-- ─── ingested_whatsapp ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ingested_whatsapp (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  from_number  TEXT        NOT NULL,
  message_id   TEXT        UNIQUE,
  body         TEXT,
  received_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ingested_whatsapp ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own whatsapp messages" ON ingested_whatsapp;
CREATE POLICY "Users read own whatsapp messages"
  ON ingested_whatsapp
  FOR SELECT
  USING (auth.uid() = user_id);
