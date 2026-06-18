-- Remove the last unused SMB segmentation field without discarding production data.
-- This migration deliberately aborts if any client still has a vertical_id value so an
-- operator can export/review those values before retrying.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clients'
      and column_name = 'vertical_id'
  ) then
    lock table public.clients in access exclusive mode;

    if exists (select 1 from public.clients where vertical_id is not null) then
      raise exception 'clients.vertical_id contains data; export or migrate it before dropping the column';
    end if;

    alter table public.clients drop column vertical_id;
  end if;
end
$$;
