-- HIGH-03: restrict audit_log INSERT to service_role only.
--
-- All legitimate audit writes use the service_role client (src/core/security/audit.ts).
-- service_role bypasses RLS entirely — this change has zero effect on production audit logging.
--
-- Before: any authenticated session could insert rows with arbitrary user_id values,
--         enabling audit trail poisoning.
-- After:  only service_role inserts are permitted; authenticated role is blocked.

drop policy if exists "Service inserts audit" on public.audit_log;
create policy "Service inserts audit" on public.audit_log
  for insert
  with check (false);
