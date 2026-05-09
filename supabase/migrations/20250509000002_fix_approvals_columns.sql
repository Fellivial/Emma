-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: fix approvals table column names
-- Created: 2025-05-09
-- Safe to run multiple times — all statements are idempotent
--
-- The original schema used tool_name/tool_input but agent-loop.ts inserts
-- using action/input, and agent/route.ts selects action, input, task_id,
-- user_id, risk_level. This migration adds the missing columns and backfills
-- action/input from the legacy tool_name/tool_input values.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. Add missing columns ──────────────────────────────────────────────────

alter table public.approvals
  add column if not exists task_id text references public.tasks on delete cascade,
  add column if not exists user_id uuid references auth.users,
  add column if not exists action text,
  add column if not exists input jsonb,
  add column if not exists risk_level text check (risk_level in ('safe', 'moderate', 'dangerous'));


-- ─── 2. Backfill action/input from legacy tool_name/tool_input ───────────────

update public.approvals
  set
    action = tool_name,
    input  = tool_input
  where action is null;


-- ─── 3. Index for fast per-user pending approval lookups ─────────────────────

create index if not exists approvals_user_status_idx
  on public.approvals (user_id, status)
  where status = 'pending';
