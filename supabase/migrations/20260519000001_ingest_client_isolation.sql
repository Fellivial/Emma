-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: add client_id to ingested_emails and ingested_whatsapp
-- Created: 2026-05-19
-- Purpose: enables per-client inbox isolation in read_recent_emails and
--          read_whatsapp_messages agent tools
-- Safe to run multiple times — all statements are idempotent
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE ingested_emails
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE ingested_whatsapp
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_ingested_emails_client    ON ingested_emails(client_id);
CREATE INDEX IF NOT EXISTS idx_ingested_whatsapp_client  ON ingested_whatsapp(client_id);
