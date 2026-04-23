-- ═══════════════════════════════════════════════════════════════════════════
-- EMMA Production Schema (consolidated)
-- Run this in Supabase SQL Editor → New Query → Paste → Run
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
  category text not null check (category in ('preference', 'routine', 'personal', 'episodic', 'environment')),
  key text not null,
  value text not null,
  confidence real not null default 0.8,
  source text not null default 'extracted' check (source in ('extracted', 'explicit', 'observed')),
  last_accessed timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category, key)
);


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
  total_tokens integer not null default 0,
  summary text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);


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
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed', 'awaiting_approval', 'approved', 'rejected')),
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


-- ─── 11. Audit Log (append-only — no update/delete) ─────────────────────────

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
  status text not null default 'pending' check (status in ('pending', 'sent', 'opened', 'clicked', 'failed')),
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);


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

-- Profiles
create policy "Users read own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "Users update own profile" on public.profiles
  for update using (auth.uid() = id);

-- User data
create policy "Users own memories" on public.memories
  for all using (auth.uid() = user_id);
create policy "Users own conversations" on public.conversations
  for all using (auth.uid() = user_id);
create policy "Users own messages" on public.messages
  for all using (auth.uid() = user_id);
create policy "Users own usage" on public.usage
  for all using (auth.uid() = user_id);

-- Clients (tenant-scoped)
create policy "Members read own client" on public.clients
  for select using (id in (select client_id from public.client_members where user_id = auth.uid()));
create policy "Members read membership" on public.client_members
  for select using (user_id = auth.uid());

-- Tasks + Actions (tenant-scoped)
create policy "Members read tasks" on public.tasks
  for all using (client_id in (select client_id from public.client_members where user_id = auth.uid()));
create policy "Members read actions" on public.action_log
  for all using (client_id in (select client_id from public.client_members where user_id = auth.uid()));
create policy "Members manage approvals" on public.approvals
  for all using (client_id in (select client_id from public.client_members where user_id = auth.uid()));
create policy "Members read schedules" on public.scheduled_tasks
  for all using (client_id in (select client_id from public.client_members where user_id = auth.uid()));
create policy "Members read webhooks" on public.webhook_endpoints
  for all using (client_id in (select client_id from public.client_members where user_id = auth.uid()));

-- Audit log (append-only)
create policy "Users read own audit" on public.audit_log
  for select using (user_id = auth.uid()::text);
create policy "Service inserts audit" on public.audit_log
  for insert with check (true);

-- Referrals
create policy "Users see own referrals" on public.referrals
  for select using (referrer_id = auth.uid());
create policy "Service inserts referrals" on public.referrals
  for insert with check (true);

-- Affiliates
create policy "Affiliates see own data" on public.affiliates
  for select using (user_id = auth.uid());
create policy "Affiliates see own referrals" on public.affiliate_referrals
  for select using (affiliate_id in (select id from public.affiliates where user_id = auth.uid()));

-- Trials
create policy "Users see own trial" on public.trials
  for select using (user_id = auth.uid());
create policy "Service manages trials" on public.trials
  for all with check (true);
create policy "Users see own trial events" on public.trial_events
  for select using (user_id = auth.uid());


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


-- ═══════════════════════════════════════════════════════════════════════════
-- SEED DATA
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.global_config (key, value) values
  ('max_active_users', '10'),
  ('waitlist_enabled', 'true')
on conflict (key) do nothing;
