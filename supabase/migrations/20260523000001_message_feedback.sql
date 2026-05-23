-- Message feedback: thumbs up/down on Emma responses.
-- Idempotent — safe to run multiple times.

create table if not exists public.message_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  message_id text not null,
  rating text not null check (rating in ('up', 'down')),
  created_at timestamptz not null default now(),
  unique (user_id, message_id)
);

alter table public.message_feedback enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'message_feedback'
      and policyname = 'Users manage own feedback'
  ) then
    create policy "Users manage own feedback"
      on public.message_feedback
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;
