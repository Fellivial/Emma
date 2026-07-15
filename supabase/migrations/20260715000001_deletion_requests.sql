-- Account Deletion — persistence model (ADR-000X, Phase 1: Foundation)
--
-- One row per deletion workflow. status enumerates the granular state machine
-- (see Technical Design Document §2); checkpoint is a structured jsonb array of
-- {phase, resourceId, subResourceMarker, resourceStatus} entries scoped to
-- Registry resourceIds (src/core/account-deletion/registry.ts), enabling
-- resume-from-exact-point-of-interruption (§3). workflow_version freezes which
-- Registry snapshot + state-machine shape this request executes against, so a
-- future Registry/state-machine change never affects an in-flight row (§4).
--
-- Phase 1 only introduces this table; no code writes to it yet. The existing
-- synchronous GDPR delete/export path (src/app/api/emma/gdpr/route.ts) is
-- unchanged in behavior. Later phases wire the orchestrator to read/write it.

create table if not exists public.deletion_requests (
  id                    uuid        primary key default gen_random_uuid(),
  user_id               uuid        references auth.users (id) on delete cascade not null,
  status                text        not null default 'requested',
  workflow_version      integer     not null default 1,
  checkpoint            jsonb       not null default '[]'::jsonb,
  grace_period_ends_at  timestamptz,
  requested_at          timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  completed_at          timestamptz,
  cancelled_at          timestamptz,
  retry_count           integer     not null default 0,
  constraint deletion_requests_status_check check (
    status in (
      'requested', 'validating', 'waiting_grace_period', 'locked',
      'deleting_database', 'deleting_storage', 'deleting_oauth', 'deleting_background_jobs',
      'verify_database', 'verify_storage', 'verify_external',
      'completed', 'retry_pending', 'failed', 'cancelled'
    )
  )
);

alter table public.deletion_requests enable row level security;

drop policy if exists "Users read own deletion requests" on public.deletion_requests;
create policy "Users read own deletion requests" on public.deletion_requests
  for select
  using (auth.uid() = user_id);

-- Writes are service-role only (the future orchestrator), same posture as
-- companion_state — no client insert/update/delete policy exists.

-- At most one non-terminal deletion workflow per user. Excludes 'completed'
-- and 'cancelled' only — 'failed' stays counted so a stalled/reconciling
-- workflow blocks a second concurrent request until it truly finishes.
create unique index if not exists deletion_requests_one_active_per_user
  on public.deletion_requests (user_id)
  where status not in ('completed', 'cancelled');

create index if not exists idx_deletion_requests_status on public.deletion_requests (status);
