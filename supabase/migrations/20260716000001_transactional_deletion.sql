-- Phase 2 (account deletion): atomic, ordered, multi-table user-data delete.
--
-- Replaces the per-table sequential .delete().eq() calls previously made
-- from src/app/api/emma/gdpr/route.ts's deleteUserOwnedData(). Those calls
-- each auto-committed independently, so a failure partway through left the
-- user's data half-deleted. This function executes every delete inside the
-- single transaction PostgREST opens for the RPC call: any failure aborts
-- the whole call and none of the deletes persist.
--
-- The delete order and table/column list are NOT hardcoded here — they are
-- passed in as p_tables, built at call time from the Deletion Resource
-- Registry (src/core/account-deletion/registry.ts), which stays the single
-- source of truth for which tables are user-owned and in what order they
-- must be cleared (children before parents).
--
-- The affiliates -> affiliate_referrals cascade is the one case that isn't a
-- plain column-filtered delete (see registry.ts's note on db.affiliates), so
-- it's special-cased here exactly as it was in the pre-Phase-2 TypeScript,
-- emitting an extra affiliate_referrals row immediately before affiliates.
--
-- Not every ownership column is uuid: user_files.user_id and
-- user_mcp_servers.user_id (and a couple of others) are text, predating
-- this table's uuid standardization. p_user_id is cast to match each
-- column's actual type (looked up from the catalog) rather than casting the
-- column itself, so an index on the ownership column stays usable.
CREATE OR REPLACE FUNCTION public.delete_user_owned_data_ordered(
  p_user_id uuid,
  p_tables jsonb
) RETURNS TABLE(table_name text, deleted_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_entry jsonb;
  v_table text;
  v_column text;
  v_column_type text;
  v_count integer;
  v_affiliate_ids uuid[];
  v_referral_count integer;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_tables)
  LOOP
    v_table := v_entry->>'table';
    v_column := COALESCE(v_entry->>'column', 'user_id');

    IF v_table !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
      RAISE EXCEPTION 'invalid table identifier: %', v_table;
    END IF;
    IF v_column !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
      RAISE EXCEPTION 'invalid column identifier: %', v_column;
    END IF;

    -- Qualified as "c.table_name" deliberately: this function's own RETURNS
    -- TABLE(table_name text, ...) makes "table_name" a plpgsql variable in
    -- scope here too, so a bare reference to information_schema.columns'
    -- table_name column is ambiguous without the alias.
    SELECT c.data_type INTO v_column_type
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = v_table AND c.column_name = v_column;

    IF v_column_type IS NULL THEN
      RAISE EXCEPTION 'unknown column: %.%', v_table, v_column;
    END IF;

    IF v_table = 'affiliates' THEN
      BEGIN
        IF v_column_type = 'uuid' THEN
          EXECUTE format('SELECT array_agg(id) FROM public.affiliates WHERE %I = $1', v_column)
            INTO v_affiliate_ids
            USING p_user_id;
        ELSE
          EXECUTE format('SELECT array_agg(id) FROM public.affiliates WHERE %I = $1', v_column)
            INTO v_affiliate_ids
            USING p_user_id::text;
        END IF;

        IF v_affiliate_ids IS NOT NULL AND array_length(v_affiliate_ids, 1) > 0 THEN
          DELETE FROM public.affiliate_referrals WHERE affiliate_id = ANY(v_affiliate_ids);
          GET DIAGNOSTICS v_referral_count = ROW_COUNT;
        ELSE
          v_referral_count := 0;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'affiliate_referrals: %', SQLERRM;
      END;

      table_name := 'affiliate_referrals';
      deleted_count := v_referral_count;
      RETURN NEXT;
    END IF;

    BEGIN
      IF v_column_type = 'uuid' THEN
        EXECUTE format('DELETE FROM public.%I WHERE %I = $1', v_table, v_column) USING p_user_id;
      ELSE
        EXECUTE format('DELETE FROM public.%I WHERE %I = $1', v_table, v_column)
          USING p_user_id::text;
      END IF;
      GET DIAGNOSTICS v_count = ROW_COUNT;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION '%: %', v_table, SQLERRM;
    END;

    table_name := v_table;
    deleted_count := v_count;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_owned_data_ordered(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_owned_data_ordered(uuid, jsonb) TO service_role;

COMMENT ON FUNCTION public.delete_user_owned_data_ordered IS
  'Atomic, ordered, multi-table GDPR delete for one user. Table/column list and order come from the caller (Deletion Resource Registry); this function only adds transactional guarantees and the affiliate_referrals cascade.';
