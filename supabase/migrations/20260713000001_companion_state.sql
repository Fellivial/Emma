-- Companion State — cross-session presence (ADR 0002)
--
-- One row per user, overwritten in place. Never a history: the table holds
-- only the latest snapshot of "when did we last talk and how did it end".
-- last_mood / last_emotion / last_proactive_topic / presence_summary are
-- AES-256-GCM ciphertext ("enc:v1:...") written server-side via
-- src/core/security/encryption.ts. last_interaction_at and
-- last_greeting_context are plaintext: a timestamp (queryable for staleness)
-- and a bounded enum of Emma's own greeting buckets — no user content.

create table if not exists public.companion_state (
  user_id               uuid        primary key references auth.users (id) on delete cascade,
  last_interaction_at   timestamptz,
  last_greeting_context text,
  last_mood             text,
  last_emotion          text,
  last_proactive_topic  text,
  presence_summary      text,
  updated_at            timestamptz not null default now()
);

alter table public.companion_state enable row level security;

drop policy if exists "Users own companion state" on public.companion_state;
create policy "Users own companion state" on public.companion_state
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
