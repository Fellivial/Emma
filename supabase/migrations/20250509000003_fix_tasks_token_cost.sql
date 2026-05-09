-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: fix tasks table column names
-- Created: 2025-05-09
-- Safe to run multiple times — rename is guarded by existence check
--
-- agent-loop.ts writes token_cost and result but the original schema had
-- total_tokens and no result column. This migration renames the column and
-- adds the missing one.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. Rename total_tokens → token_cost ────────────────────────────────────
--
-- Only rename if the old column still exists (idempotent).

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'tasks'
      and column_name  = 'total_tokens'
  ) then
    alter table public.tasks rename column total_tokens to token_cost;
  end if;
end $$;


-- ─── 2. Add result column ────────────────────────────────────────────────────

alter table public.tasks add column if not exists result text;
