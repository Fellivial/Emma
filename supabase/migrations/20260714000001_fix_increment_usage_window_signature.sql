-- Fix migration drift on increment_usage_window's p_user_id parameter type.
--
-- 20250530000001_usage_windows_text_userid.sql altered usage_windows.user_id
-- from uuid to text (to allow "client:<uuid>" session identities) and
-- schema.sql was updated to match, but no migration ever altered the
-- increment_usage_window function itself. Postgres treats a changed
-- parameter type as a distinct overload, so the live function was still
-- increment_usage_window(p_user_id uuid, ...) — confirmed via direct
-- PostgREST OpenAPI introspection against the live database. Every RPC call
-- passing a non-UUID identity (e.g. "client:<uuid>", or "" when no identity
-- is available) fails the uuid cast at the call boundary with 22P02
-- (invalid_text_representation) before the INSERT ever runs.
--
-- This migration drops the stale uuid-typed overload and recreates the
-- function with p_user_id text, matching the table column (already text
-- since 20250530000001) and schema.sql. Function body is unchanged from
-- schema.sql — only the parameter type moves. No table or data changes.
--
-- Idempotent: the DROP targets the exact stale (uuid, ...) signature via
-- `if exists`, so re-running after the fix is a no-op there; CREATE OR
-- REPLACE on the text signature is naturally idempotent.

drop function if exists public.increment_usage_window(uuid, text, timestamptz, bigint, integer);

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
