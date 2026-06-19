-- MCP configuration is server-managed while the feature is disabled.
-- Preserve member CRUD for normal integrations, but prevent authenticated
-- clients from bypassing server-side MCP validation through the Supabase REST
-- API. Service-role operations continue to bypass RLS.

begin;

lock table public.client_integrations in access exclusive mode;

do $$
begin
  if exists (
    select 1
    from public.client_integrations
    where service not in (
      'gmail', 'google_calendar', 'google_drive', 'slack',
      'notion', 'hubspot', 'elevenlabs'
    )
      and service not like 'mcp\_%' escape E'\\'
  ) then
    raise exception
      'Refusing to tighten client_integrations service constraint: ambiguous service values require a production data audit';
  end if;
end
$$;

alter table public.client_integrations
  drop constraint if exists client_integrations_service_check;

alter table public.client_integrations
  add constraint client_integrations_service_check
  check (
    service in (
      'gmail', 'google_calendar', 'google_drive', 'slack',
      'notion', 'hubspot', 'elevenlabs'
    )
    or service like 'mcp\_%' escape E'\\'
  );

drop policy if exists "Members manage integrations" on public.client_integrations;
drop policy if exists "Members manage non-MCP integrations" on public.client_integrations;

create policy "Members manage non-MCP integrations"
  on public.client_integrations
  for all
  to authenticated
  using (
    service not like 'mcp\_%' escape E'\\'
    and client_id in (
      select client_id from public.client_members where user_id = auth.uid()
    )
  )
  with check (
    service not like 'mcp\_%' escape E'\\'
    and client_id in (
      select client_id from public.client_members where user_id = auth.uid()
    )
  );

do $$
begin
  if to_regclass('public.user_mcp_servers') is not null then
    comment on table public.user_mcp_servers is
      'LEGACY/INERT: superseded by client_integrations. Retain pending production data audit; no runtime code may read or write this table.';
  end if;
end
$$;

commit;
