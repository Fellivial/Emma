-- Content-free provenance for the manual legacy plaintext chat backfill.
-- No authenticated policies are created: only the service role may use this ledger.
CREATE TABLE IF NOT EXISTS public.legacy_chat_migration_ledger (
  -- Legacy rows are not FK-bound so GDPR deletion can remove the ledger first
  -- without mutating the legacy table or weakening rollback provenance.
  legacy_message_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  utc_date date NOT NULL,
  -- Target FKs are intentionally omitted so rollback can preserve provenance
  -- until each proven backfill-created target has been removed successfully.
  target_message_id text NOT NULL UNIQUE,
  target_conversation_id uuid NOT NULL,
  message_created_by_backfill boolean NOT NULL,
  conversation_created_by_backfill boolean NOT NULL,
  migrated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legacy_chat_migration_ledger_user_date
  ON public.legacy_chat_migration_ledger(user_id, utc_date);
CREATE INDEX IF NOT EXISTS idx_legacy_chat_migration_ledger_conversation
  ON public.legacy_chat_migration_ledger(target_conversation_id);

ALTER TABLE public.legacy_chat_migration_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.legacy_chat_migration_ledger FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.legacy_chat_migration_ledger TO service_role;

CREATE OR REPLACE FUNCTION public.backfill_legacy_chat_message(
  p_message jsonb,
  p_ledger jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.messages (
    id, conversation_id, user_id, role, content, display, expression, created_at
  ) VALUES (
    p_message->>'id',
    (p_message->>'conversation_id')::uuid,
    (p_message->>'user_id')::uuid,
    p_message->>'role',
    p_message->>'content',
    p_message->>'display',
    p_message->>'expression',
    (p_message->>'created_at')::timestamptz
  );

  INSERT INTO public.legacy_chat_migration_ledger (
    legacy_message_id, user_id, utc_date, target_message_id,
    target_conversation_id, message_created_by_backfill,
    conversation_created_by_backfill
  ) VALUES (
    (p_ledger->>'legacy_message_id')::uuid,
    (p_ledger->>'user_id')::uuid,
    (p_ledger->>'utc_date')::date,
    p_ledger->>'target_message_id',
    (p_ledger->>'target_conversation_id')::uuid,
    (p_ledger->>'message_created_by_backfill')::boolean,
    (p_ledger->>'conversation_created_by_backfill')::boolean
  );
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_legacy_chat_message(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_legacy_chat_message(jsonb, jsonb) TO service_role;

COMMENT ON TABLE public.legacy_chat_migration_ledger IS
  'Service-role-only provenance for the manual legacy chat encryption backfill; contains no message content.';
