-- Allow client sessions (client:<uuid>) in usage_windows.
-- The FK to profiles was blocking inserts for business/intake chat sessions.
alter table public.usage_windows
  drop constraint if exists usage_windows_user_id_fkey;

-- Drop policy first — Postgres cannot alter a column type referenced by an RLS policy
drop policy if exists "Users own usage windows" on public.usage_windows;

alter table public.usage_windows
  alter column user_id type text using user_id::text;

-- Recreate the index if one existed on user_id (keep performance)
drop index if exists usage_windows_user_id_idx;
create index usage_windows_user_id_idx on public.usage_windows (user_id);

-- Recreate policy with explicit cast since user_id is now text
create policy "Users own usage windows" on public.usage_windows
  for all using ((select auth.uid())::text = user_id);
