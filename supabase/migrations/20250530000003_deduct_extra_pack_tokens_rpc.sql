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
   where user_id::text = p_user_id
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
