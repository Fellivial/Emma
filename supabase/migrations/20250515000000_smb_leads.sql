-- SMB intake leads table.
-- Written by the intake API route using the service role key (bypasses RLS).
-- RLS denies all non-service-role access — admin view adds its own policy later.

create table if not exists leads (
  id          uuid primary key default gen_random_uuid(),
  client_slug text not null,
  session_id  text not null,
  name        text not null,
  contact     text not null,
  notes       text,
  ip_hash     text,
  created_at  timestamptz not null default now()
);

create index if not exists leads_client_slug_idx on leads (client_slug);
create index if not exists leads_created_at_idx  on leads (created_at desc);

-- Enable RLS
alter table leads enable row level security;

-- Deny all access from non-service-role principals.
-- The intake API uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS entirely,
-- so no explicit allow policy is needed for writes.
-- This policy makes the table invisible to anon and authenticated roles.
create policy "deny all non-service-role access"
  on leads
  for all
  to anon, authenticated
  using (false);
