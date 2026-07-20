-- Phase 5B (account deletion): read-only, Registry-parameterized
-- verification counterpart to delete_user_owned_data_ordered (ADR-0005,
-- Phase 4B TDD §3 -- docs/adr/0005-account-deletion-verification-architecture.md,
-- docs/plans/2026-07-18-account-deletion-phase4b-technical-design.md).
--
-- This function is infrastructure only. Nothing in the application calls it
-- yet -- src/core/account-deletion/gdpr-data.ts's verifyUserOwnedDataDeleted()
-- wraps it but is not invoked from workflow.ts's stepVerifyDatabase (still
-- its pre-Phase-5B pass-through). It becomes load-bearing only once a later
-- phase wires that step up, per
-- docs/plans/2026-07-20-account-deletion-phase5a-implementation-plan.md (WP5).
--
-- Identifier validation and per-column type casting mirror
-- delete_user_owned_data_ordered byte-for-byte in discipline (not code --
-- this is a separate function, TDD §3.5) for the identical reason: this is
-- server-code-only input, but validation is defense in depth, not a
-- trust-boundary substitute.
--
-- Failure behaviour deliberately diverges from the delete function (TDD
-- §3.5): a malformed identifier (fails the regex) indicates a
-- Registry/deployment bug and aborts the whole call, same as the delete
-- function. An unknown column or a per-table query failure is caught
-- per-table instead -- a read has no atomicity requirement a partial
-- failure would violate, and aborting the entire verification because one
-- table has a disclosed schema-tracking gap (the document_chunks.user_id
-- condition Phase 3.1 found) would mean zero tables get verification
-- evidence instead of the other ~31, a strictly worse outcome for this
-- phase's whole purpose.
CREATE OR REPLACE FUNCTION public.verify_user_owned_data_deleted(
  p_user_id uuid,
  p_tables jsonb
) RETURNS TABLE(table_name text, remaining_count integer, checked boolean, error_detail text)
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
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_tables)
  LOOP
    v_table := v_entry->>'table';
    v_column := COALESCE(v_entry->>'column', 'user_id');

    -- Malformed identifier: abort the whole call (same as
    -- delete_user_owned_data_ordered) -- this is a Registry/deployment bug,
    -- not a runtime data condition, and should fail loudly rather than be
    -- swallowed into a per-table "not checked" result.
    IF v_table !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
      RAISE EXCEPTION 'invalid table identifier: %', v_table;
    END IF;
    IF v_column !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
      RAISE EXCEPTION 'invalid column identifier: %', v_column;
    END IF;

    BEGIN
      -- Qualified as "c.table_name" deliberately: this function's own
      -- RETURNS TABLE(table_name text, ...) makes "table_name" a plpgsql
      -- variable in scope here too, so a bare reference to
      -- information_schema.columns' table_name column is ambiguous without
      -- the alias (identical reasoning to delete_user_owned_data_ordered).
      SELECT c.data_type INTO v_column_type
      FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = v_table AND c.column_name = v_column;

      IF v_column_type IS NULL THEN
        RAISE EXCEPTION 'unknown column: %.%', v_table, v_column;
      END IF;

      IF v_column_type = 'uuid' THEN
        EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', v_table, v_column)
          INTO v_count
          USING p_user_id;
      ELSE
        EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', v_table, v_column)
          INTO v_count
          USING p_user_id::text;
      END IF;

      table_name := v_table;
      remaining_count := v_count;
      checked := true;
      error_detail := NULL;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      -- Per-table catch, not a whole-call abort: an unknown column (the
      -- document_chunks.user_id condition) or a transient query failure on
      -- one table must not prevent reporting on the other tables.
      table_name := v_table;
      remaining_count := NULL;
      checked := false;
      error_detail := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_user_owned_data_deleted(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_user_owned_data_deleted(uuid, jsonb) TO service_role;

COMMENT ON FUNCTION public.verify_user_owned_data_deleted IS
  'Read-only, ordered, multi-table GDPR verification for one user -- the verification counterpart to delete_user_owned_data_ordered. Table/column list and order come from the caller (Deletion Resource Registry). Phase 5B infrastructure: not yet called by any application code.';
