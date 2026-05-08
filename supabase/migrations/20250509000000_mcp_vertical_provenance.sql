-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: MCP servers, vertical IDs, and provenance chains
-- Created: 2025-05-09
-- Safe to run multiple times — all statements are idempotent
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. clients.vertical_id ─────────────────────────────────────────────────
--
-- References the id field in src/core/verticals/templates.ts
-- (e.g. "clinic", "real_estate", "ecommerce", "legal").
-- No foreign key — verticals are defined in code, not a DB table.

alter table public.clients
  add column if not exists vertical_id text default null;

alter table public.clients
  add column if not exists autonomy_tier integer not null default 2;

alter table public.clients
  add column if not exists proactive_vision boolean not null default false;

comment on column public.clients.vertical_id is
  'References a vertical id from src/core/verticals/templates.ts (e.g. "clinic", "real_estate"). No FK — verticals are code-defined.';
comment on column public.clients.autonomy_tier is
  'Autonomy tier: 1 = notify only, 2 = suggest (default), 3 = execute autonomously.';
comment on column public.clients.proactive_vision is
  'Whether Emma proactively analyzes the user''s screen via vision.';


-- ─── 2. client_integrations.mcp_url ─────────────────────────────────────────
--
-- Populated when service starts with "mcp_".
-- Contains the full MCP server URL, e.g. "https://mcp.notion.com/mcp".

alter table public.client_integrations
  add column if not exists mcp_url text default null;

comment on column public.client_integrations.mcp_url is
  'MCP server URL. Populated when service starts with "mcp_" (e.g. "https://mcp.notion.com/mcp").';

-- The existing service check constraint only allows 6 OAuth services.
-- MCP integrations use arbitrary "mcp_*" service names, so we widen the
-- constraint to allow any non-empty string while keeping the original values.
alter table public.client_integrations
  drop constraint if exists client_integrations_service_check;

alter table public.client_integrations
  add constraint client_integrations_service_check
  check (
    service in ('gmail', 'google_calendar', 'slack', 'notion', 'hubspot', 'elevenlabs')
    or service like 'mcp_%'
  );


-- ─── 3. provenance_chains ────────────────────────────────────────────────────
--
-- Stores the full step-by-step audit trail for each agent task run.
-- Written by persistChain() in src/core/provenance.ts via server-side
-- service role — service role bypasses RLS.
-- Users can only read chains where user_id = auth.uid().
--
-- Column naming matches the TypeScript code exactly:
--   chain_id  — task ID (unique lookup key)
--   data      — full ProvenanceChain JSON blob

create table if not exists public.provenance_chains (
  id           uuid        primary key default gen_random_uuid(),
  chain_id     text        not null unique,
  data         jsonb       not null,
  status       text        not null default 'running'
                           check (status in ('running', 'completed', 'failed', 'awaiting_approval')),
  started_at   timestamptz not null default now(),
  completed_at timestamptz default null,
  user_id      uuid        references auth.users(id) on delete cascade,
  client_id    uuid        references public.clients(id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.provenance_chains is
  'Step-by-step audit trail for agent task runs. Written server-side by persistChain(). Separate from audit_log which tracks security events.';
comment on column public.provenance_chains.chain_id is
  'The agent task ID — matches tasks.id and used as the upsert conflict key.';
comment on column public.provenance_chains.data is
  'Full ProvenanceChain JSON: {taskId, goal, steps[], startedAt, completedAt, status}.';


-- ─── 4. RLS — provenance_chains ─────────────────────────────────────────────

alter table public.provenance_chains enable row level security;

-- Users can read their own chains. Service role bypasses RLS for server writes.
drop policy if exists "Users read own provenance" on public.provenance_chains;
create policy "Users read own provenance" on public.provenance_chains
  for select
  using (auth.uid() = user_id);

-- Server-side inserts/updates go through service role (bypasses RLS).
-- No insert/update policy needed for anon/authenticated roles.


-- ─── 5. Indexes — provenance_chains ─────────────────────────────────────────

create index if not exists idx_provenance_chain_id
  on public.provenance_chains (chain_id);

create index if not exists idx_provenance_user_id
  on public.provenance_chains (user_id);

create index if not exists idx_provenance_status
  on public.provenance_chains (status);
