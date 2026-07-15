-- ═══════════════════════════════════════════════════════════════════════════
-- EMMA Production Schema (consolidated, idempotent)
-- Safe to run multiple times — all statements use IF NOT EXISTS / IF EXISTS
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. User Profiles ───────────────────────────────────────────────────────

create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  name text not null default 'User',
  avatar text not null default '👤',
  role text not null default 'member' check (role in ('admin', 'member', 'guest')),
  tts_enabled boolean not null default true,
  notifications_enabled boolean not null default true,
  quiet_hours_start text,
  quiet_hours_end text,
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', 'User'));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ─── 2. Clients (tenants) ───────────────────────────────────────────────────

create table if not exists public.clients (
  id uuid default gen_random_uuid() primary key,
  slug text unique not null,
  name text not null,
  owner_id uuid references auth.users,
  persona_name text not null default 'Emma',
  persona_prompt text,
  persona_greeting text,
  voice_id text,
  tools_enabled text[] not null default '{"chat","tts"}',
  token_budget_monthly integer not null default 300000,
  token_budget_daily integer not null default 10714,
  message_limit_daily integer not null default 10,
  plan_id text not null default 'free',
  autonomy_tier integer not null default 2,
  proactive_vision boolean not null default false,
  custom_routines jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clients add column if not exists plan_id text not null default 'free';
alter table public.clients add column if not exists autonomy_tier integer not null default 2;
alter table public.clients add column if not exists proactive_vision boolean not null default false;
alter table public.clients add column if not exists custom_routines jsonb default '[]'::jsonb;
-- LemonSqueezy subscription metadata (lemonSqueezyId, orderId, renewsAt, endsAt, cardBrand, cardLastFour)
alter table public.clients add column if not exists lemon_meta jsonb default null;

create table if not exists public.client_members (
  client_id uuid references public.clients on delete cascade,
  user_id uuid references auth.users on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (client_id, user_id)
);


-- ─── 3. Memories ────────────────────────────────────────────────────────────

create table if not exists public.memories (
  id text primary key,
  user_id uuid references public.profiles on delete cascade not null,
  category text not null check (category in ('preference', 'habit', 'personal', 'goal', 'relationship', 'context', 'constraint')),
  key text not null,
  value text not null,
  confidence real not null default 0.8,
  source text not null default 'extracted' check (source in ('extracted', 'explicit', 'observed')),
  status text not null default 'active' check (status in ('active', 'superseded')),
  superseded_by text references public.memories(id),
  last_accessed timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category, key)
);
-- Soft-delete migration: add status + superseded_by, replace unique with partial index
alter table public.memories add column if not exists status text not null default 'active' check (status in ('active', 'superseded'));
alter table public.memories add column if not exists superseded_by text references public.memories(id);
alter table public.memories drop constraint if exists memories_user_id_category_key_key;
create unique index if not exists memories_active_uq on public.memories (user_id, category, key) where status = 'active';


-- ─── 4. Conversations + Messages ────────────────────────────────────────────

create table if not exists public.conversations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles on delete cascade not null,
  title text,
  summary text,
  message_count integer not null default 0,
  token_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id text primary key,
  conversation_id uuid references public.conversations on delete cascade not null,
  user_id uuid references public.profiles on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  display text not null,
  expression text,
  token_estimate integer not null default 0,
  created_at timestamptz not null default now()
);

-- Service-role-only provenance for the manual legacy plaintext chat backfill.
-- This table intentionally contains no message content and has no user policies.
create table if not exists public.legacy_chat_migration_ledger (
  legacy_message_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  utc_date date not null,
  target_message_id text not null unique,
  target_conversation_id uuid not null,
  message_created_by_backfill boolean not null,
  conversation_created_by_backfill boolean not null,
  migrated_at timestamptz not null default now()
);

alter table public.legacy_chat_migration_ledger enable row level security;
revoke all on public.legacy_chat_migration_ledger from anon, authenticated;
create index if not exists idx_legacy_chat_migration_ledger_user_date
  on public.legacy_chat_migration_ledger(user_id, utc_date);
create index if not exists idx_legacy_chat_migration_ledger_conversation
  on public.legacy_chat_migration_ledger(target_conversation_id);

create or replace function public.backfill_legacy_chat_message(
  p_message jsonb,
  p_ledger jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.messages (
    id, conversation_id, user_id, role, content, display, expression, created_at
  ) values (
    p_message->>'id',
    (p_message->>'conversation_id')::uuid,
    (p_message->>'user_id')::uuid,
    p_message->>'role',
    p_message->>'content',
    p_message->>'display',
    p_message->>'expression',
    (p_message->>'created_at')::timestamptz
  );
  insert into public.legacy_chat_migration_ledger (
    legacy_message_id, user_id, utc_date, target_message_id,
    target_conversation_id, message_created_by_backfill,
    conversation_created_by_backfill
  ) values (
    (p_ledger->>'legacy_message_id')::uuid,
    (p_ledger->>'user_id')::uuid,
    (p_ledger->>'utc_date')::date,
    p_ledger->>'target_message_id',
    (p_ledger->>'target_conversation_id')::uuid,
    (p_ledger->>'message_created_by_backfill')::boolean,
    (p_ledger->>'conversation_created_by_backfill')::boolean
  );
end;
$$;
revoke all on function public.backfill_legacy_chat_message(jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.backfill_legacy_chat_message(jsonb, jsonb) to service_role;


-- ─── 5. Usage Tracking ──────────────────────────────────────────────────────

create table if not exists public.usage (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles on delete cascade not null,
  date date not null default current_date,
  message_count integer not null default 0,
  token_count integer not null default 0,
  api_calls integer not null default 0,
  unique (user_id, date)
);


-- ─── 6. Tasks (autonomous agent) ────────────────────────────────────────────

create table if not exists public.tasks (
  id text primary key,
  client_id uuid references public.clients on delete cascade,
  user_id uuid references auth.users,
  goal text not null,
  context text,
  status text not null default 'running' check (status in ('running', 'completed', 'failed', 'awaiting_approval', 'max_steps_reached')),
  trigger_type text not null default 'manual',
  trigger_source text,
  steps_completed integer not null default 0,
  max_steps integer not null default 10,
  token_cost integer not null default 0,
  result text,
  summary text,
  context_snapshot jsonb,
  task_summary text,
  steps_taken integer not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.tasks add column if not exists context_snapshot jsonb;
alter table public.tasks add column if not exists task_summary text;
alter table public.tasks add column if not exists steps_taken integer not null default 0;
alter table public.tasks add column if not exists started_at timestamptz;
alter table public.tasks add column if not exists step_transcript jsonb;


-- ─── 7. Action Log (tool call history) ──────────────────────────────────────

create table if not exists public.action_log (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references public.clients on delete cascade,
  user_id uuid references auth.users,
  task_id text references public.tasks on delete cascade,
  step_number integer,
  action text not null,
  input jsonb not null default '{}',
  output jsonb,
  token_cost integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed', 'awaiting_approval', 'approved', 'rejected', 'injection_detected', 'skipped_low_autonomy', 'moderate_executed')),
  risk_level text not null default 'safe' check (risk_level in ('safe', 'moderate', 'dangerous')),
  trigger_type text not null default 'manual' check (trigger_type in ('manual', 'scheduled', 'webhook', 'agent')),
  error text,
  duration_ms integer,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);


-- ─── 8. Approvals (approval gate) ───────────────────────────────────────────

create table if not exists public.approvals (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references public.clients on delete cascade not null,
  action_log_id uuid references public.action_log on delete cascade not null,
  task_id text references public.tasks on delete cascade,
  user_id uuid references auth.users,
  action text,
  input jsonb,
  risk_level text check (risk_level in ('safe', 'moderate', 'dangerous')),
  tool_name text not null,
  tool_input jsonb not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  decided_by uuid references auth.users,
  decided_at timestamptz,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now()
);


-- ─── 9. Scheduled Tasks ─────────────────────────────────────────────────────

create table if not exists public.scheduled_tasks (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references public.clients on delete cascade not null,
  name text not null,
  description text,
  cron_expression text not null,
  workflow text not null,
  workflow_input jsonb not null default '{}',
  enabled boolean not null default true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz not null default now()
);


-- ─── 10. Webhook Endpoints ──────────────────────────────────────────────────

create table if not exists public.webhook_endpoints (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references public.clients on delete cascade not null,
  secret text not null,
  event_type text not null,
  workflow text not null,
  workflow_input_template jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);


-- ─── 11. Audit Log ──────────────────────────────────────────────────────────

create table if not exists public.audit_log (
  id uuid default gen_random_uuid() primary key,
  user_id text not null,
  action text not null,
  resource text not null,
  resource_id text,
  reason text not null,
  metadata jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);


-- ─── 12. Waitlist (legacy) ──────────────────────────────────────────────────

create table if not exists public.waitlist (
  email text primary key,
  signed_up_at timestamptz not null default now()
);


-- ─── 13. Waitlist v2 (10-spot early access) ─────────────────────────────────

create table if not exists public.waitlist_v2 (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  email text unique not null,
  industry text not null,
  message text,
  referral_source text,
  position serial,
  status text not null default 'waiting' check (status in ('waiting', 'invited', 'converted', 'expired')),
  invited_at timestamptz,
  invite_expires_at timestamptz,
  converted_at timestamptz,
  created_at timestamptz not null default now()
);


-- ─── 14. Global Config ──────────────────────────────────────────────────────

create table if not exists public.global_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);


-- ─── 15. Referrals ──────────────────────────────────────────────────────────

create table if not exists public.referrals (
  id uuid default gen_random_uuid() primary key,
  referrer_id uuid references auth.users not null,
  referrer_client_id uuid references public.clients,
  referral_code text unique not null,
  referred_email text,
  referred_user_id uuid references auth.users,
  status text not null default 'pending' check (status in ('pending', 'signed_up', 'converted', 'rewarded', 'expired')),
  reward_type text not null default 'free_month',
  reward_applied boolean not null default false,
  created_at timestamptz not null default now(),
  converted_at timestamptz,
  rewarded_at timestamptz
);


-- ─── 16. Affiliates ─────────────────────────────────────────────────────────

create table if not exists public.affiliates (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users,
  name text not null,
  email text unique not null,
  affiliate_code text unique not null,
  commission_rate numeric(4,2) not null default 0.20,
  commission_months integer not null default 3,
  total_earned numeric(10,2) not null default 0,
  total_referrals integer not null default 0,
  status text not null default 'active' check (status in ('active', 'paused', 'terminated')),
  created_at timestamptz not null default now()
);

create table if not exists public.affiliate_referrals (
  id uuid default gen_random_uuid() primary key,
  affiliate_id uuid references public.affiliates not null,
  referred_email text not null,
  referred_user_id uuid references auth.users,
  referred_client_id uuid references public.clients,
  status text not null default 'pending' check (status in ('pending', 'signed_up', 'converted', 'churned')),
  plan_id text,
  monthly_revenue numeric(10,2) not null default 0,
  commission_paid numeric(10,2) not null default 0,
  months_tracked integer not null default 0,
  created_at timestamptz not null default now(),
  converted_at timestamptz
);


-- ─── 17. Trials + Events + Email Sequences ──────────────────────────────────

create table if not exists public.trials (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  client_id uuid references public.clients,
  plan_id text not null default 'starter',
  status text not null default 'active' check (status in ('active', 'converted', 'expired', 'cancelled')),
  messages_used integer not null default 0,
  messages_limit integer not null default 500,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  converted_at timestamptz,
  cancelled_at timestamptz,
  first_message_at timestamptz,
  first_voice_at timestamptz,
  first_memory_at timestamptz,
  first_routine_at timestamptz,
  source text,
  referral_code text,
  affiliate_code text
);

create table if not exists public.trial_events (
  id uuid default gen_random_uuid() primary key,
  trial_id uuid references public.trials not null,
  user_id uuid references auth.users not null,
  event text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.email_sequences (
  id uuid default gen_random_uuid() primary key,
  trial_id uuid references public.trials not null,
  user_id uuid references auth.users not null,
  email text not null,
  template_id text not null,
  status text not null default 'pending',
  error_detail text,
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);


-- ─── 18. Rate Limit Counters ────────────────────────────────────────────────

create table if not exists public.rate_limit_counters (
  id uuid default gen_random_uuid() primary key,
  client_id uuid not null,
  hour_window timestamptz not null,
  task_count integer not null default 0,
  token_count bigint not null default 0,
  updated_at timestamptz not null default now(),
  unique (client_id, hour_window)
);


-- ─── 19. Client Integrations ────────────────────────────────────────────────

create table if not exists public.client_integrations (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references public.clients on delete cascade not null,
  service text not null constraint client_integrations_service_check check (service in ('gmail','google_calendar','google_drive','slack','notion','hubspot','elevenlabs') or service like 'mcp\_%' escape E'\\'),
  status text not null default 'disconnected' check (status in ('connected','disconnected','auth_expired','error')),
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  account_identifier text,
  last_used_at timestamptz,
  last_error text,
  voice_id text,
  mcp_url text default null,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, service)
);

create table if not exists public.oauth_states (
  id uuid default gen_random_uuid() primary key,
  state text unique not null,
  code_verifier text,
  client_id uuid references public.clients on delete cascade not null,
  user_id uuid references auth.users not null,
  service text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes')
);
-- PKCE migration: add code_verifier for existing databases
alter table public.oauth_states add column if not exists code_verifier text;


-- ─── 20. Usage Metering ─────────────────────────────────────────────────────

create table if not exists public.usage_windows (
  id uuid default gen_random_uuid() primary key,
  user_id text not null,
  window_type text not null check (window_type in ('daily','weekly','monthly')),
  window_start timestamptz not null,
  tokens_used bigint not null default 0,
  messages_used integer not null default 0,
  warning_sent boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (user_id, window_type, window_start)
);

create table if not exists public.extra_packs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles on delete cascade not null,
  tokens_granted bigint not null,
  tokens_remaining bigint not null,
  valid_until timestamptz not null default (now() + interval '30 days'),
  purchase_ref text,
  created_at timestamptz not null default now()
);


-- ─── 21. Agent Task Summaries ───────────────────────────────────────────────

create table if not exists public.agent_task_summaries (
  id uuid default gen_random_uuid() primary key,
  task_id text references public.tasks on delete cascade not null,
  client_id uuid references public.clients on delete cascade,
  user_id uuid references auth.users not null,
  summary_text text not null,
  context_snapshot jsonb,
  tokens_used integer not null default 0,
  created_at timestamptz not null default now()
);


-- ─── 22. Pattern Detections ─────────────────────────────────────────────────

create table if not exists public.pattern_detections (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references public.clients on delete cascade not null,
  user_id uuid references auth.users not null,
  pattern_type text not null check (pattern_type in ('daily_workflow','weekly_workflow','tool_sequence','trigger_time')),
  workflow_id text,
  tool_sequence text[],
  recurrence jsonb not null,
  status text not null default 'detected' check (status in ('detected','suggested','accepted','dismissed','scheduled','orphaned')),
  suppressed_until timestamptz,
  suggestion_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, user_id, pattern_type, workflow_id)
);


-- ─── 23. Provenance Chains ──────────────────────────────────────────────────

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


-- ─── 24. Storage Buckets ────────────────────────────────────────────────────
--
-- task-documents: private bucket for DOCX/PDF files generated by the docgen
-- tool (src/core/integrations/docgen.ts). Files stored at {userId}/{taskId}_{name}.
-- Signed URLs (1 h) returned to callers; no public access.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'task-documents',
  'task-documents',
  false,
  52428800,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;


-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles enable row level security;
alter table public.memories enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.usage enable row level security;
alter table public.clients enable row level security;
alter table public.client_members enable row level security;
alter table public.tasks enable row level security;
alter table public.action_log enable row level security;
alter table public.approvals enable row level security;
alter table public.scheduled_tasks enable row level security;
alter table public.webhook_endpoints enable row level security;
alter table public.audit_log enable row level security;
alter table public.referrals enable row level security;
alter table public.affiliates enable row level security;
alter table public.affiliate_referrals enable row level security;
alter table public.trials enable row level security;
alter table public.trial_events enable row level security;
alter table public.email_sequences enable row level security;
alter table public.client_integrations enable row level security;
alter table public.oauth_states enable row level security;
alter table public.usage_windows enable row level security;
alter table public.extra_packs enable row level security;
alter table public.agent_task_summaries enable row level security;
alter table public.pattern_detections enable row level security;
alter table public.provenance_chains enable row level security;
alter table public.global_config enable row level security;
alter table public.waitlist enable row level security;
alter table public.waitlist_v2 enable row level security;
alter table public.rate_limit_counters enable row level security;


-- ═══════════════════════════════════════════════════════════════════════════
-- POLICIES (drop + create for idempotency)
-- ═══════════════════════════════════════════════════════════════════════════

-- Profiles
drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile" on public.profiles for select using (auth.uid() = id);
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles for update using (auth.uid() = id);

-- Memories
drop policy if exists "Users own memories" on public.memories;
create policy "Users own memories" on public.memories for all using (auth.uid() = user_id);

-- Conversations
drop policy if exists "Users own conversations" on public.conversations;
create policy "Users own conversations" on public.conversations for all using (auth.uid() = user_id);

-- Messages
drop policy if exists "Users own messages" on public.messages;
create policy "Users own messages" on public.messages for all using (auth.uid() = user_id);

-- Usage
drop policy if exists "Users own usage" on public.usage;
create policy "Users own usage" on public.usage for all using (auth.uid() = user_id);

-- Clients
drop policy if exists "Members read own client" on public.clients;
create policy "Members read own client" on public.clients for select using (id in (select client_id from public.client_members where user_id = auth.uid()));
drop policy if exists "Members read membership" on public.client_members;
create policy "Members read membership" on public.client_members for select using (user_id = auth.uid());

-- Tasks
drop policy if exists "Members read tasks" on public.tasks;
create policy "Members read tasks" on public.tasks for all using (client_id in (select client_id from public.client_members where user_id = auth.uid()));

-- Action Log
drop policy if exists "Members read actions" on public.action_log;
create policy "Members read actions" on public.action_log for all using (client_id in (select client_id from public.client_members where user_id = auth.uid()));

-- Approvals
drop policy if exists "Members manage approvals" on public.approvals;
create policy "Members manage approvals" on public.approvals for all using (client_id in (select client_id from public.client_members where user_id = auth.uid()));

-- Scheduled Tasks
drop policy if exists "Members read schedules" on public.scheduled_tasks;
create policy "Members read schedules" on public.scheduled_tasks for all using (client_id in (select client_id from public.client_members where user_id = auth.uid()));

-- Webhook Endpoints
drop policy if exists "Members read webhooks" on public.webhook_endpoints;
create policy "Members read webhooks" on public.webhook_endpoints for all using (client_id in (select client_id from public.client_members where user_id = auth.uid()));

-- Audit Log
drop policy if exists "Users read own audit" on public.audit_log;
create policy "Users read own audit" on public.audit_log for select using (user_id = auth.uid()::text);
drop policy if exists "Service inserts audit" on public.audit_log;
create policy "Service inserts audit" on public.audit_log for insert with check (false);

-- Referrals
drop policy if exists "Users see own referrals" on public.referrals;
create policy "Users see own referrals" on public.referrals for select using (referrer_id = auth.uid());
drop policy if exists "Service inserts referrals" on public.referrals;
create policy "Service inserts referrals" on public.referrals for insert with check (true);

-- Affiliates
drop policy if exists "Affiliates see own data" on public.affiliates;
create policy "Affiliates see own data" on public.affiliates for select using (user_id = auth.uid());
drop policy if exists "Affiliates see own referrals" on public.affiliate_referrals;
create policy "Affiliates see own referrals" on public.affiliate_referrals for select using (affiliate_id in (select id from public.affiliates where user_id = auth.uid()));

-- Trials
drop policy if exists "Users see own trial" on public.trials;
create policy "Users see own trial" on public.trials for select using (user_id = auth.uid());
drop policy if exists "Service manages trials" on public.trials;
create policy "Service manages trials" on public.trials for all with check (true);
drop policy if exists "Users see own trial events" on public.trial_events;
create policy "Users see own trial events" on public.trial_events for select using (user_id = auth.uid());

-- Client Integrations
drop policy if exists "Members manage integrations" on public.client_integrations;
drop policy if exists "Members manage non-MCP integrations" on public.client_integrations;
create policy "Members manage non-MCP integrations" on public.client_integrations
  for all to authenticated
  using (
    service not like 'mcp\_%' escape E'\\'
    and client_id in (select client_id from public.client_members where user_id = auth.uid())
  )
  with check (
    service not like 'mcp\_%' escape E'\\'
    and client_id in (select client_id from public.client_members where user_id = auth.uid())
  );
drop policy if exists "Users manage own oauth states" on public.oauth_states;
create policy "Users manage own oauth states" on public.oauth_states for all using (user_id = auth.uid());

-- Usage Windows
drop policy if exists "Users own usage windows" on public.usage_windows;
create policy "Users own usage windows" on public.usage_windows for all using (auth.uid()::text = user_id);

-- Extra Packs
drop policy if exists "Users own extra packs" on public.extra_packs;
create policy "Users own extra packs" on public.extra_packs for all using (auth.uid() = user_id);

-- Agent Task Summaries
drop policy if exists "Members read task summaries" on public.agent_task_summaries;
create policy "Members read task summaries" on public.agent_task_summaries for all using (client_id in (select client_id from public.client_members where user_id = auth.uid()));

-- Pattern Detections
drop policy if exists "Members manage patterns" on public.pattern_detections;
create policy "Members manage patterns" on public.pattern_detections for all using (client_id in (select client_id from public.client_members where user_id = auth.uid()));

-- Provenance Chains
drop policy if exists "Users read own provenance" on public.provenance_chains;
create policy "Users read own provenance" on public.provenance_chains for select using (auth.uid() = user_id);

-- Global Config (service-role only — deny all direct access)
drop policy if exists "Deny all direct access to global_config" on public.global_config;
create policy "Deny all direct access to global_config"
  on public.global_config
  for all
  using (false);

-- Waitlist: anon insert only — no reads (privacy)
drop policy if exists "Anon can join waitlist" on public.waitlist;
create policy "Anon can join waitlist" on public.waitlist
  for insert with check (true);

drop policy if exists "Anon can join waitlist_v2" on public.waitlist_v2;
create policy "Anon can join waitlist_v2" on public.waitlist_v2
  for insert with check (true);

-- Rate limit counters: service_role only (deny all direct access)
drop policy if exists "Deny direct access to rate_limit_counters" on public.rate_limit_counters;
create policy "Deny direct access to rate_limit_counters"
  on public.rate_limit_counters for all using (false);

-- Storage: task-documents
-- Users can only read files in their own folder ({user_id}/...).
-- Server-side writes use the service role (bypasses RLS) — no insert policy needed.
drop policy if exists "Users read own documents" on storage.objects;
create policy "Users read own documents"
  on storage.objects
  for select
  using (
    bucket_id = 'task-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- GRANTS (required for Data API access on projects created after 2026-05-30)
-- Without these, PostgREST returns "permission denied for table" on new projects.
-- ═══════════════════════════════════════════════════════════════════════════

-- anon: only tables reachable without authentication (waitlist signup)
grant insert on public.waitlist to anon;
grant insert on public.waitlist_v2 to anon;

-- authenticated: all tables a signed-in user accesses via the browser client
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.memories to authenticated;
grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
grant select on public.usage to authenticated;
grant select on public.usage_windows to authenticated;
grant select on public.extra_packs to authenticated;
grant select on public.tasks to authenticated;
grant select, insert, update on public.clients to authenticated;
grant select on public.client_members to authenticated;
grant select, insert, update, delete on public.client_integrations to authenticated;
grant select on public.provenance_chains to authenticated;

-- service_role: full access to all tables (server-side API routes)
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Ensure future tables created by the postgres role get service_role grants automatically
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════════════════

create index if not exists idx_memories_user on public.memories (user_id);
create index if not exists idx_memories_category on public.memories (user_id, category);
create index if not exists idx_conversations_user on public.conversations (user_id, created_at desc);
create index if not exists idx_messages_conversation on public.messages (conversation_id, created_at);
create index if not exists idx_usage_user_date on public.usage (user_id, date);
create index if not exists idx_clients_slug on public.clients (slug);
create index if not exists idx_client_members_user on public.client_members (user_id);
create index if not exists idx_tasks_client on public.tasks (client_id, created_at desc);
create index if not exists idx_action_log_client on public.action_log (client_id, created_at desc);
create index if not exists idx_action_log_task on public.action_log (task_id);
create index if not exists idx_approvals_pending on public.approvals (client_id, status) where status = 'pending';
create index if not exists idx_scheduled_tasks_client on public.scheduled_tasks (client_id, enabled);
create index if not exists idx_audit_log_user on public.audit_log (user_id, created_at desc);
create index if not exists idx_audit_log_resource on public.audit_log (resource, resource_id);
create index if not exists idx_referrals_code on public.referrals (referral_code);
create index if not exists idx_referrals_referrer on public.referrals (referrer_id);
create index if not exists idx_affiliate_code on public.affiliates (affiliate_code);
create index if not exists idx_affiliate_referrals_aff on public.affiliate_referrals (affiliate_id);
create index if not exists idx_trials_user on public.trials (user_id);
create index if not exists idx_trials_status on public.trials (status) where status = 'active';
create index if not exists idx_trial_events_trial on public.trial_events (trial_id);
create index if not exists idx_email_seq_pending on public.email_sequences (status, scheduled_for) where status = 'pending';
create index if not exists idx_waitlist_v2_status on public.waitlist_v2 (status);
create index if not exists idx_waitlist_v2_email on public.waitlist_v2 (email);
create index if not exists idx_rate_limit_client_hour on public.rate_limit_counters (client_id, hour_window);
create index if not exists idx_integrations_client on public.client_integrations (client_id, service);
create index if not exists idx_oauth_states_state on public.oauth_states (state);
create index if not exists idx_usage_windows_user_type on public.usage_windows (user_id, window_type, window_start desc);
create index if not exists idx_extra_packs_user_valid on public.extra_packs (user_id, valid_until);
create index if not exists idx_task_summaries_task on public.agent_task_summaries (task_id);
create index if not exists idx_task_summaries_user on public.agent_task_summaries (user_id, created_at desc);
create index if not exists idx_pattern_detections_client on public.pattern_detections (client_id, user_id, status);
create index if not exists idx_provenance_chain_id on public.provenance_chains (chain_id);
create index if not exists idx_provenance_user_id on public.provenance_chains (user_id);
create index if not exists idx_provenance_status on public.provenance_chains (status);


-- ═══════════════════════════════════════════════════════════════════════════
-- CONSTRAINTS (idempotent)
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.email_sequences add column if not exists error_detail text;

alter table public.email_sequences drop constraint if exists email_sequences_status_check;
alter table public.email_sequences add constraint email_sequences_status_check
  check (status in ('pending','sending','sent','failed','skipped','opened','clicked'));

alter table public.client_integrations add column if not exists mcp_url text default null;

alter table public.client_integrations drop constraint if exists client_integrations_service_check;
alter table public.client_integrations add constraint client_integrations_service_check
  check (
    service in ('gmail', 'google_calendar', 'google_drive', 'slack', 'notion', 'hubspot', 'elevenlabs')
    or service like 'mcp\_%' escape E'\\'
  );

-- action_log: add reason column for agent-loop annotations (moderate/injection notes)
alter table public.action_log add column if not exists reason text;

-- action_log: extend status constraint to cover agent-loop-specific values
alter table public.action_log drop constraint if exists action_log_status_check;
alter table public.action_log add constraint action_log_status_check
  check (status in (
    'pending', 'running', 'completed', 'failed',
    'awaiting_approval', 'approved', 'rejected',
    'injection_detected', 'skipped_low_autonomy', 'moderate_executed'
  ));


-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.increment_rate_limit(
  p_client_id uuid,
  p_hour_window timestamptz,
  p_tasks integer default 1,
  p_tokens bigint default 0
) returns void as $$
begin
  insert into public.rate_limit_counters
    (client_id, hour_window, task_count, token_count, updated_at)
  values
    (p_client_id, p_hour_window, p_tasks, p_tokens, now())
  on conflict (client_id, hour_window)
  do update set
    task_count = rate_limit_counters.task_count + p_tasks,
    token_count = rate_limit_counters.token_count + p_tokens,
    updated_at = now();
end;
$$ language plpgsql;

create or replace function public.increment_usage_window(
  p_user_id text,
  p_window_type text,
  p_window_start timestamptz,
  p_tokens bigint,
  p_messages integer default 1
) returns void as $$
begin
  insert into public.usage_windows
    (user_id, window_type, window_start, tokens_used, messages_used, updated_at)
  values
    (p_user_id, p_window_type, p_window_start, p_tokens, p_messages, now())
  on conflict (user_id, window_type, window_start)
  do update set
    tokens_used = usage_windows.tokens_used + p_tokens,
    messages_used = usage_windows.messages_used + p_messages,
    updated_at = now();
end;
$$ language plpgsql;

create or replace function public.deduct_extra_pack_tokens(
  p_user_id text,
  p_deduct bigint
) returns bigint
language plpgsql
security definer
as $$
declare
  v_pack_id uuid;
  v_remaining bigint;
begin
  -- Select the oldest valid pack with tokens remaining, lock it for update
  select id, tokens_remaining
    into v_pack_id, v_remaining
    from public.extra_packs
   where user_id = p_user_id::uuid
     and valid_until > now()
     and tokens_remaining > 0
   order by created_at asc
   limit 1
   for update skip locked;

  if v_pack_id is null then
    return 0; -- no pack available
  end if;

  -- Atomically deduct, floor at 0
  update public.extra_packs
     set tokens_remaining = greatest(0, tokens_remaining - p_deduct)
   where id = v_pack_id;

  return greatest(0, v_remaining - p_deduct);
end;
$$;


-- ─── Push Subscriptions (Web Push API) ───────────────────────────────────────

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  subscription jsonb not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "Users manage own push subscriptions" on public.push_subscriptions;
create policy "Users manage own push subscriptions"
  on public.push_subscriptions
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_push_subscriptions_user on public.push_subscriptions (user_id);

-- ─── Realtime publications ────────────────────────────────────────────────────
-- Enables postgres_changes subscriptions for live task + approval updates.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'approvals'
  ) then
    alter publication supabase_realtime add table public.approvals;
  end if;
end $$;

-- ─── Deprecation Notes ────────────────────────────────────────────────────────
--
-- client_addons table: DEPRECATED as of pricing v2.
--   Autonomous mode is now gated by plan tier (starter → 3/hr, pro → 50/hr).
--   The autonomous_basic and autonomous_pro add-ons have been removed.
--   This table is kept for historical data only — do not write new rows.
--   Migration: autonomous access is checked via addon-enforcer.ts using plan.features.autonomous.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- SEED DATA
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.global_config (key, value) values
  ('max_active_users', '10'),
  ('waitlist_enabled', 'true')
on conflict (key) do nothing;


-- ─── WhatsApp reply loop (migration) ────────────────────────────────────────
-- ingested_whatsapp lives in migrations/20250509000004_input_layer.sql.
-- These ALTER TABLE statements add the columns needed for the bidirectional loop.
alter table ingested_whatsapp add column if not exists direction text not null default 'inbound' check (direction in ('inbound', 'outbound'));
alter table ingested_whatsapp add column if not exists outbound_wamid text;

-- ─── Autonomous & Proactive Systems (migration) ──────────────────────────────

-- pattern_detections: add columns matching what persistPatterns() actually writes
alter table public.pattern_detections add column if not exists suggestion text;
alter table public.pattern_detections add column if not exists frequency integer not null default 1;
alter table public.pattern_detections add column if not exists example_goals jsonb;
alter table public.pattern_detections add column if not exists detected_at timestamptz;
alter table public.pattern_detections add column if not exists shown_at timestamptz;

-- Extend constraints to cover values the code actually uses
alter table public.pattern_detections drop constraint if exists pattern_detections_pattern_type_check;
alter table public.pattern_detections add constraint pattern_detections_pattern_type_check
  check (pattern_type in ('daily','weekly','tool_sequence','daily_workflow','weekly_workflow','trigger_time','memory_reflection','connection_expiry'));
alter table public.pattern_detections drop constraint if exists pattern_detections_status_check;
alter table public.pattern_detections add constraint pattern_detections_status_check
  check (status in ('pending','detected','suggested','accepted','dismissed','scheduled','orphaned'));

-- Quiet hours timezone on profiles (quiet_hours_start / end already exist)
alter table public.profiles add column if not exists quiet_hours_tz text default 'UTC';

-- Proactive daily cap: max 3 non-urgent surfaced suggestions per user per day
create table if not exists public.proactive_daily (
  user_id uuid references auth.users not null,
  day date not null default current_date,
  count integer not null default 0,
  primary key (user_id, day)
);
alter table public.proactive_daily enable row level security;
drop policy if exists "Users own proactive daily" on public.proactive_daily;
create policy "Users own proactive daily" on public.proactive_daily
  for all using (auth.uid() = user_id);
create index if not exists idx_proactive_daily_user_day on public.proactive_daily (user_id, day);
alter table ingested_whatsapp add column if not exists window_expires_at timestamptz;

-- ─── Custom Persona Configuration (migration) ────────────────────────────────

create table if not exists public.personas (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles on delete cascade not null unique,
  name text,
  base_persona_id text not null default 'neutral',
  tone_adjectives text[] not null default '{}',
  communication_style text not null default 'casual',
  verbosity text not null default 'normal',
  topics_emphasise text[] not null default '{}',
  topics_avoid text[] not null default '{}',
  language text not null default 'en',
  voice_id text,
  description text,
  description_screened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.personas enable row level security;
drop policy if exists "Users own persona" on public.personas;
create policy "Users own persona" on public.personas for all using (auth.uid() = user_id);
create index if not exists idx_personas_user on public.personas (user_id);

-- ─── Document Ingestion — pgvector RAG pipeline (migration) ──────────────────

create extension if not exists vector with schema extensions;

create table if not exists public.ingested_documents (
  id              uuid default gen_random_uuid() primary key,
  user_id         uuid references auth.users on delete cascade not null,
  client_id       uuid references public.clients on delete set null,
  label           text not null,
  mime_type       text not null,
  character_count integer not null default 0,
  chunk_count     integer not null default 0,
  extracted_text  text,
  created_at      timestamptz not null default now()
);
alter table public.ingested_documents enable row level security;
drop policy if exists "Users own documents" on public.ingested_documents;
create policy "Users own documents" on public.ingested_documents
  for all using (auth.uid() = user_id);
create index if not exists idx_ingested_documents_user on public.ingested_documents (user_id);

create table if not exists public.document_chunks (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references auth.users on delete cascade not null,
  doc_id      uuid references public.ingested_documents on delete cascade not null,
  chunk_index integer not null,
  chunk_text  text not null,
  embedding   extensions.vector(1536),
  created_at  timestamptz not null default now()
);
alter table public.document_chunks enable row level security;
drop policy if exists "Users own chunks" on public.document_chunks;
create policy "Users own chunks" on public.document_chunks
  for all using (auth.uid() = user_id);
create index if not exists idx_document_chunks_user on public.document_chunks (user_id);
create index if not exists idx_document_chunks_doc on public.document_chunks (doc_id);
create index if not exists idx_document_chunks_embedding on public.document_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

create or replace function match_document_chunks(
  query_embedding extensions.vector(1536),
  match_user_id   uuid,
  match_threshold float default 0.75,
  match_count     int default 3
)
returns table (
  id         uuid,
  doc_id     uuid,
  doc_label  text,
  chunk_text text,
  similarity float
)
language sql stable as $$
  select
    dc.id,
    dc.doc_id,
    d.label as doc_label,
    dc.chunk_text,
    1 - (dc.embedding <=> query_embedding) as similarity
  from public.document_chunks dc
  join public.ingested_documents d on d.id = dc.doc_id
  where dc.user_id = match_user_id
    and 1 - (dc.embedding <=> query_embedding) > match_threshold
  order by dc.embedding <=> query_embedding asc
  limit match_count;
$$;


-- ─── Email Ingest ────────────────────────────────────────────────────────────

create table if not exists public.ingested_emails (
  id               uuid        default gen_random_uuid() primary key,
  client_id        uuid        references public.clients on delete cascade,
  from_address     text        not null,
  to_address       text,
  subject          text,
  body_text        text,
  attachment_count integer     not null default 0,
  received_at      timestamptz not null default now(),
  processed        boolean     not null default false,
  created_at       timestamptz not null default now()
);
-- No permissive RLS policy — only service role (getSupabaseAdmin) may access
alter table public.ingested_emails enable row level security;
create index if not exists idx_ingested_emails_client    on public.ingested_emails (client_id);
create index if not exists idx_ingested_emails_processed on public.ingested_emails (processed) where processed = false;
create index if not exists idx_ingested_emails_received  on public.ingested_emails (received_at desc);


-- ─── WhatsApp Ingest ─────────────────────────────────────────────────────────

create table if not exists public.ingested_whatsapp (
  id                uuid        default gen_random_uuid() primary key,
  client_id         uuid        references public.clients on delete cascade,
  from_number       text        not null,
  message_id        text        unique not null,
  body              text,
  received_at       timestamptz not null,
  direction         text        not null default 'inbound'
                                check (direction in ('inbound', 'outbound')),
  window_expires_at timestamptz,
  outbound_wamid    text,
  created_at        timestamptz not null default now()
);
-- No permissive RLS policy — only service role (getSupabaseAdmin) may access
alter table public.ingested_whatsapp enable row level security;
create index if not exists idx_ingested_whatsapp_client   on public.ingested_whatsapp (client_id);
create index if not exists idx_ingested_whatsapp_number   on public.ingested_whatsapp (from_number);
create index if not exists idx_ingested_whatsapp_received on public.ingested_whatsapp (received_at desc);


-- ─── Companion State (ADR 0002) ──────────────────────────────────────────────
-- Cross-session presence: one row per user, overwritten in place. Encrypted
-- fields (last_mood, last_emotion, last_proactive_topic, presence_summary)
-- hold AES-256-GCM ciphertext written via src/core/security/encryption.ts.

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


-- ─── Deletion Requests (ADR-000X, Phase 1: Foundation) ───────────────────────
-- Persistence model for the durable account-deletion workflow. status
-- enumerates the granular state machine; checkpoint is a structured jsonb
-- array scoped to Deletion Resource Registry resourceIds, enabling resume
-- from the exact point of interruption. workflow_version freezes which
-- Registry snapshot + state-machine shape an in-flight request executes
-- against. See src/core/account-deletion/registry.ts and the Technical
-- Design Document. Writes are service-role only; no client policy exists.

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
create unique index if not exists deletion_requests_one_active_per_user
  on public.deletion_requests (user_id)
  where status not in ('completed', 'cancelled');
create index if not exists idx_deletion_requests_status on public.deletion_requests (status);

-- Phase 2: atomic, ordered, multi-table user-data delete. Table/column list
-- and order come from the caller (Deletion Resource Registry); this function
-- only adds transactional guarantees and the affiliate_referrals cascade.
-- See src/app/api/emma/gdpr/route.ts and
-- supabase/migrations/20260716000001_transactional_deletion.sql.
--
-- Not every ownership column is uuid: user_files.user_id and
-- user_mcp_servers.user_id (and a couple of others) are text, predating
-- this table's uuid standardization. p_user_id is cast to match each
-- column's actual type (looked up from the catalog) rather than casting the
-- column itself, so an index on the ownership column stays usable.
create or replace function public.delete_user_owned_data_ordered(
  p_user_id uuid,
  p_tables jsonb
) returns table(table_name text, deleted_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry jsonb;
  v_table text;
  v_column text;
  v_column_type text;
  v_count integer;
  v_affiliate_ids uuid[];
  v_referral_count integer;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  for v_entry in select * from jsonb_array_elements(p_tables)
  loop
    v_table := v_entry->>'table';
    v_column := coalesce(v_entry->>'column', 'user_id');

    if v_table !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' then
      raise exception 'invalid table identifier: %', v_table;
    end if;
    if v_column !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' then
      raise exception 'invalid column identifier: %', v_column;
    end if;

    -- Qualified as "c.table_name" deliberately: this function's own returns
    -- table(table_name text, ...) makes "table_name" a plpgsql variable in
    -- scope here too, so a bare reference to information_schema.columns'
    -- table_name column is ambiguous without the alias.
    select c.data_type into v_column_type
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = v_table and c.column_name = v_column;

    if v_column_type is null then
      raise exception 'unknown column: %.%', v_table, v_column;
    end if;

    if v_table = 'affiliates' then
      begin
        if v_column_type = 'uuid' then
          execute format('select array_agg(id) from public.affiliates where %I = $1', v_column)
            into v_affiliate_ids
            using p_user_id;
        else
          execute format('select array_agg(id) from public.affiliates where %I = $1', v_column)
            into v_affiliate_ids
            using p_user_id::text;
        end if;

        if v_affiliate_ids is not null and array_length(v_affiliate_ids, 1) > 0 then
          delete from public.affiliate_referrals where affiliate_id = any(v_affiliate_ids);
          get diagnostics v_referral_count = row_count;
        else
          v_referral_count := 0;
        end if;
      exception when others then
        raise exception 'affiliate_referrals: %', sqlerrm;
      end;

      table_name := 'affiliate_referrals';
      deleted_count := v_referral_count;
      return next;
    end if;

    begin
      if v_column_type = 'uuid' then
        execute format('delete from public.%I where %I = $1', v_table, v_column) using p_user_id;
      else
        execute format('delete from public.%I where %I = $1', v_table, v_column)
          using p_user_id::text;
      end if;
      get diagnostics v_count = row_count;
    exception when others then
      raise exception '%: %', v_table, sqlerrm;
    end;

    table_name := v_table;
    deleted_count := v_count;
    return next;
  end loop;

  return;
end;
$$;

revoke all on function public.delete_user_owned_data_ordered(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.delete_user_owned_data_ordered(uuid, jsonb) to service_role;

-- ─── user_files / user_mcp_servers (documentation sync, Phase 2.1) ──────────
-- Both tables have existed since migrations/20260522000001_user_files.sql and
-- migrations/20260522000002_user_mcp_servers.sql, and are already part of the
-- Deletion Resource Registry's user-owned table list — but their definitions
-- were never folded into this consolidated schema.sql, discovered as a real
-- gap during Phase 2.1's live-database validation (the tables exist in
-- production/staging via their own migrations; this file just didn't
-- document them). user_id is text on both, not uuid — predates this
-- codebase's uuid standardization; see the Phase 2.1 Technical Design
-- Document's note on delete_user_owned_data_ordered's column-type handling.

create table if not exists user_files (
  id         uuid        primary key default gen_random_uuid(),
  user_id    text        not null,
  file_id    text        not null,
  name       text        not null,
  media_type text        not null,
  size_bytes bigint      not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, file_id)
);
create index if not exists idx_user_files_user_id on user_files (user_id);
alter table user_files enable row level security;

create table if not exists user_mcp_servers (
  id            uuid        primary key default gen_random_uuid(),
  user_id       text        not null,
  name          text        not null,
  url           text        not null,
  auth_token    text,
  allowed_tools text[]      not null default '{}',
  blocked_tools text[]      not null default '{}',
  enabled       boolean     not null default true,
  created_at    timestamptz not null default now(),
  unique (user_id, url)
);
create index if not exists user_mcp_servers_user_id_idx on user_mcp_servers (user_id);
alter table user_mcp_servers enable row level security;
