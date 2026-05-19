-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: add step_transcript to tasks
-- Created: 2026-05-19
-- Purpose: persists the Claude messages array before an approval pause so
--          the agent can resume with full conversation context
-- Safe to run multiple times — all statements are idempotent
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS step_transcript JSONB;
