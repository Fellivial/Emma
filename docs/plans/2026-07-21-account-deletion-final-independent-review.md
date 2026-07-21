# Account Deletion — Independent Production Review

**Date:** 2026-07-21
**Reviewer:** fresh-context subagent, no visibility into any prior design/implementation/hardening review for this feature, no visibility into the accompanying [Final Production Readiness Review](2026-07-21-account-deletion-final-production-readiness-review.md) or its conclusions. Instructed to independently assess production readiness from first principles and actively look for reasons the feature should not be deployed.

This document is reproduced verbatim from the subagent's own report (light formatting only — headings, no content changes) so its independence is auditable: nothing here was edited to match the main review's conclusions after the fact. Where the two documents agree, it's because both independently converged on the same evidence in the code, not because one copied the other.

---

**Scope reviewed:** `registry.ts`, `workflow.ts`, `workflow-types.ts`, `adapter.ts`, `adapters/registry-adapters.ts`, `adapters/storage-bucket-adapter.ts`, `verification-types.ts`, `gdpr-data.ts`, `src/app/api/emma/gdpr/route.ts`, all three migrations, `supabase/schema.sql`, ADR-0004, ADR-0005, the Phase 5E runbook, `docs/reference-api.md` (GDPR section), `.github/workflows/ci.yml`, `vercel.json`, and the seven test files listed in the brief (independently re-ran: 783/783 pass). All file paths below are relative to `C:\Users\fel\emma`.

I did not take the existing paper trail's conclusions at face value. Two of my findings below (the schema/registry drift root cause, and the retry-loop's non-remediation defect) are not stated anywhere in the ADRs or runbook — I derived them from reading the code and cross-referencing the test suite's own assertions.

---

## 1. Overall production safety

The **database deletion path is structurally sound for its core promise**: `delete_user_owned_data_ordered` runs as one Postgres transaction (`supabase/migrations/20260716000001_transactional_deletion.sql`), so a mid-batch failure rolls back everything — no half-deleted user. Verification (`verify_user_owned_data_deleted`) independently re-counts rows rather than trusting the delete step's own report, and a confirmed non-empty table changes the workflow's terminal status (`verificationMarkerStatus`, `workflow.ts:317-328`) rather than being logged and ignored — this is real, not cosmetic, independence.

However, I found two classes of risk that mean the answer to "could this silently succeed while leaving personal data behind?" is **not simply no**:

- **Storage.** `StorageBucketAdapter.verify()` returns `success:false, itemsProcessed:0` when storage is unconfigured or a `list()` call errors (`adapters/storage-bucket-adapter.ts:42-44`). `stepVerifyStorage` classifies `itemsProcessed === 0` failures as `"inconclusive"`, not `"failed"` (`workflow.ts:454-467`), and `"inconclusive"` never blocks `CRITICAL_STEPS`. So a storage misconfiguration or transient outage can produce `status:"completed", success:true` to the user while storage objects were never confirmed deleted. In practice this is a narrow window (the storage client reuses the same env vars the whole route already requires), but it's real and undisclosed as a residual risk anywhere in the docs.
- **In-flight background jobs.** `registry.ts:556-568` explicitly documents that `background.document_process` has no deletion adapter: "a run completing after deletion can write `document_chunks`/storage objects for a user that no longer exists." This is disclosed, but it means "completed" does not mean "erasure is permanent" — a straggling Inngest run can re-introduce personal data after a "successful" deletion, with nothing to catch or re-delete it later.
- **The retry mechanism does not remediate verification failures** (see §4 below — this is the single most consequential finding in this review, and it is not documented anywhere I found).

For the specific empirical fact you supplied (4/32 tables missing on one validation project): I independently confirmed this is real and traced its _mechanism_ precisely. `delete_user_owned_data_ordered` looks up each table's column type via `information_schema.columns` (`20260716000001_transactional_deletion.sql:63-69`); if the table doesn't exist, `v_column_type` is `NULL` and the function `RAISE EXCEPTION`s, which aborts the **entire transaction** — zero rows deleted anywhere, not just for the missing table. `verify_user_owned_data_deleted` catches this per-table instead (`20260720000001_verify_user_owned_data_deleted.sql:93-102`), correctly reporting `checked:false` for just the affected tables without blocking the other ~28. This asymmetry is real and matters: **delete fails all-or-nothing; verify degrades gracefully.** Net effect for a user hitting this: the whole request fails loudly (`success:false`, eventually `status:"failed"` after 3 attempts) — not silent, not partial, not corrupting. That's a defensible failure mode, but it means the feature is completely non-functional on any environment with this drift, which is a production-safety-_adjacent_ availability problem even though it isn't a data-integrity one.

## 2. Operational readiness

The Phase 5E runbook (`docs/runbooks/account-deletion-deployment.md`) is unusually good — it names its own gaps candidly (e.g., §1.2's warning not to trust `migration list --linked`, §7's "nothing today alerts on inconclusive counts — an operator has to know to look"). An on-call engineer with DB access could, with this document, actually diagnose a stuck deletion (§7's troubleshooting steps are concrete and correct against the code I read).

What's missing for someone without the authors present:

- No dashboard, no alert, no cron sweep for `retry_pending`/`failed` rows. Discovery is 100% reactive — someone has to think to query `deletion_requests`.
- The client-facing copy ("Deletion is in progress and will retry automatically. Please check back shortly." — `src/app/settings/privacy/page.tsx:66-70`) is **factually wrong**. Nothing retries automatically. `retry_pending` only advances when the user (or anyone) calls `POST /api/emma/gdpr {action:"delete"}` again — I confirmed no cron, no queue, no scheduled job touches `deletion_requests` (`vercel.json`'s only crons are unrelated). If the user takes this message at face value and never returns, the request stalls indefinitely with no automatic recovery and no one paged.

## 3. Deployment readiness

`ci.yml`'s `deploy-production` triggers on every push to `main` with no manual gate and no migration-apply step (confirmed by reading the file directly — matches the runbook's own claim). The Phase 5E addition is a non-blocking `continue-on-error: true` warning annotation when a PR touches `supabase/migrations/` (`ci.yml:40-46`) — genuinely present, genuinely non-blocking, exactly as documented.

**A gap the runbook doesn't fully capture**: this CI reminder only greps `supabase/migrations/`. The four tables missing from the validation project (`document_chunks`, `personas`, `push_subscriptions`, `proactive_daily`) are defined in `supabase/schema.sql`, **not** in any incremental migration file (I grepped both — confirmed). `schema.sql` is a hand-maintained "consolidated, idempotent" snapshot that's supposed to stay in sync with the migrations directory, and it does currently contain the current `delete_user_owned_data_ordered`/`verify_user_owned_data_deleted` definitions byte-identical to the migration files (there's even a regression test locking this, `tests/unit/transactional-deletion-sql.test.ts:36-46`). But **a PR that edits `schema.sql` directly to add a table** (as presumably happened when these 4 tables were added) **gets zero CI warning**, because the reminder step only watches `supabase/migrations/`. This is the actual root-cause mechanism for the class of drift you asked me to judge, and it is currently unmitigated by anything in CI.

## 4. Residual risks (would refuse to sign off without acknowledgment)

**This is my most important independent finding, not present in any of the prior review documents I read.** The retry mechanism for verification failures does not remediate — it only re-checks.

`resumeStartStatus()` (`workflow.ts:594-600`) resumes a `retry_pending` row at `row.checkpoint[row.checkpoint.length - 1].phase` — i.e., the phase whose _last_ entry was `"failed"`. For `verify_database`/`verify_storage`, that phase is the **read-only check itself**, not the delete step that precedes it in `STATE_ORDER`. Combined with the forward-only cursor (`for (; cursor < STATE_ORDER.length; cursor++)`), this means: once verification confirms a real leftover row/object, every subsequent "retry" re-runs only the verification RPC/list call — never `deleting_database` or `deleting_storage` again. I confirmed this precisely against the repo's own mandatory regression test: `tests/unit/verification-workflow.test.ts:460-500` ("Marker Defect") drives a table with 3 confirmed leftover rows through 4 full `runDeletionWorkflow()` invocations; the mock's `deleteCallCount` is tracked but never asserted, and by inspection only `verify_user_owned_data_deleted` is ever called across all 4 rounds — the leftover rows are never targeted by a fresh `DELETE`. The workflow correctly refuses to report `"completed"` (that part is solid), but it deterministically converges to a permanent, unrecoverable `"failed"` state **without ever attempting the fix**. Recovery requires a human operator to manually intervene at the database level (runbook §2.3), and — per §2 above — nothing pages that operator.

This matters most for exactly the disclosed background-job gap in §1: a straggling Inngest run rewriting `document_chunks` after deletion is precisely the kind of transient leftover verification is designed to catch — and precisely the kind of leftover this retry loop can never clean up on its own.

Other residual risks worth explicit go-live acknowledgment:

- Production's schema state relative to the registry's 32 tables is **explicitly unconfirmed** — ADR-0005's own Open Questions table marks this "Blocking for live validation... Ops confirms production schema state" and it is still unresolved as of this PR.
- A `deletion_requests` row that reaches `status:"failed"` has no product-facing retry/cancel path and permanently blocks new requests for that user (`deletion_requests_one_active_per_user` includes `failed`).
- OAuth tokens for departed members of shared tenants are never revoked (disclosed, arguably defensible since they're tenant-owned).

## 5. Production documentation

Good and largely accurate. I cross-checked `docs/reference-api.md`'s GDPR section against the actual route response shape (`route.ts:211-220`) and found no drift — the documented `verification` rollup shape matches `computeVerificationRollup()`'s real output exactly, including field names and the `external.skipped` example. The runbook is candid to a fault about its own gaps (rare and valuable). One inaccuracy I found: nothing in the runbook or ADRs mentions that the schema-drift root cause traces to `schema.sql` edits bypassing the migration-based CI reminder (§3 above) — the existing docs treat this purely as a migrations-sequencing problem, which is only half the story.

## 6. Rollback capability

The runbook's rollback guidance (§2.1, §2.2) is accurate against the code: I confirmed `runStep()`'s switch has no case for `verify_database`/`verify_storage`/`verify_external` prior to Phase 5C (falls to `default: return []`), so the warning against rolling back past Phase 5C while requests are in-flight is real and correctly stated. All three migrations use `CREATE OR REPLACE`/`CREATE TABLE IF NOT EXISTS`/`DROP POLICY IF EXISTS` — confirmed idempotent by direct reading, so re-applying after a bad rollback is genuinely low-risk. Migration rollback for `20260716000001` is correctly flagged as unsafe alone (breaks every request outright since `gdpr-data.ts` calls the function by name with no fallback).

## 7. Migration safety

The three migrations themselves are well-defended: `SECURITY DEFINER` + `SET search_path = ''` (prevents search-path hijacking), regex-validated identifiers before any `EXECUTE format(...)`, `REVOKE ALL ... GRANT ... TO service_role` only. This is careful, defensive SQL. The genuine safety question isn't the migration files' own correctness — it's that **nothing automated verifies the registry's 32 table names actually exist as tables anywhere** before a real user hits the delete endpoint. I checked `tests/unit/registry.test.ts` and every other test file for any check like "every `DATABASE_RESOURCES[].table` has a matching `create table` in `schema.sql`" — none exists. This is a straightforward, cheap, CI-runnable test (parse `schema.sql`, parse `registry.ts`, diff the two table sets) that would have caught this exact class of bug at merge time, for free, with no live database needed — and it doesn't exist today.

## 8. Observability

`log()` emits structured `console.warn` with `requestId`/`userId`/`status` (`workflow.ts:35-46`) — sufficient to reconstruct one user's history after the fact, confirmed by tracing every call site. There is no fleet-wide aggregation, no alerting on `inconclusive`/`retry_pending`/`failed` counts, and (per §4) the one case where alerting would matter most — a verification-confirmed leftover that will never self-heal — produces no signal beyond a `console.warn` line and a `checkpoint` entry nobody is watching.

## 9. Long-term maintainability

Real strengths: the Registry-as-single-source-of-truth pattern (`toUserOwnedDeleteOrder`/`toGdprExportTables`/`toVerificationTargets` all deriving from one array) structurally prevents the _old_ class of drift (two hand-maintained lists disagreeing) — this part of the design genuinely closes the bug it was built to close. The dual `schema.sql`/`migrations/` maintenance model, however, is a standing structural risk for the _next_ instance of table-level drift, and nothing enforces the two stay in sync beyond hand discipline (one narrow exception: the function-body text-identity test in `transactional-deletion-sql.test.ts`, which doesn't cover table definitions). The checkpoint-append-only-JSON model will keep growing per retry generation; bounded per the Phase 4C analysis (~136 entries worst case) but worth remembering if `MAX_RETRY_COUNT` or the state machine grows.

---

## Findings (severity-classified)

1. **[CRITICAL]** `workflow.ts` — `resumeStartStatus()` (line 594) + forward-only cursor (line 636): retrying a `verify_database`/`verify_storage` failure never re-invokes the corresponding delete/adapter step, only re-checks. A confirmed real leftover (e.g. from the disclosed in-flight-background-job race) cannot be self-healed by the retry mechanism at all — it deterministically converges to permanent, unrecoverable `"failed"` after 3 attempts with the leftover data never targeted for deletion, confirmed by the repo's own `verification-workflow.test.ts:460-500` mandatory regression, which never exercises a second delete call. Recovery is undocumented-as-a-code-path and depends entirely on manual DB intervention nobody is alerted to attempt.

2. **[CRITICAL]** No automated check anywhere (CI, tests) that every table `registry.ts`'s `DATABASE_RESOURCES` references actually exists in `schema.sql`/production. This is the direct, currently-unmitigated root cause of the schema-drift class of bug you asked me to independently judge — my assessment is that it is **not adequately mitigated**, only occasionally caught by manual, ad-hoc live-validation phases that are not merge-blocking and have no guaranteed cadence.

3. **[MAJOR]** `src/app/settings/privacy/page.tsx:66-70` tells the user deletion "will retry automatically" — this is false. No cron/queue/scheduler exists to advance a `retry_pending` row; the only trigger is a fresh call to the same endpoint. Users who believe the copy and don't return may leave their request stalled indefinitely.

4. **[MAJOR]** `adapters/storage-bucket-adapter.ts:42-44` + `workflow.ts:454-467`: a storage misconfiguration/outage is classified `"inconclusive"`, which never blocks `CRITICAL_STEPS` — the workflow can report `status:"completed", success:true` while storage objects were never confirmed deleted.

5. **[MAJOR]** `registry.ts:556-568` (disclosed, but re-flagging as unresolved): in-flight Inngest document-processing runs are not cancelled on deletion and can write `document_chunks`/storage objects for a user after "successful" erasure — combined with finding #1, this leftover has no automated remediation path.

6. **[MAJOR]** ADR-0005's own Open Questions table states production's schema state relative to this feature is unconfirmed and explicitly "blocking for live validation" — this has not been resolved as of this PR, per the ADR/runbook's own text.

7. **[MINOR]** `ci.yml`'s migration-sequencing reminder (line 40) only watches `supabase/migrations/`, not `supabase/schema.sql` — the actual file where the 4 missing tables are defined. A direct `schema.sql` edit gets no CI signal at all.

8. **[MINOR]** `gdpr-data.ts:110-116` (`decryptExportValue`): a decryption failure during export silently returns `null` rather than surfacing an error — a user's export could be silently incomplete/corrupted with no indication.

9. **[OBSERVATION]** No fleet-wide alerting/dashboard for stuck (`retry_pending`) or permanently-failed deletion requests — disclosed as explicit, accepted Phase 7 scope, not a surprise, but worth restating given findings #1 and #3 make this gap more consequential than the docs frame it.

10. **[OBSERVATION]** Deployment pipeline has no migration-apply gate and no manual approval before `main` → production; explicitly disclosed and accepted risk (runbook §3), consistent with what I independently verified in `ci.yml`.

---

## Recommendation: **GO WITH CONDITIONS**

The core transactional-delete-plus-independent-verify architecture is genuinely sound, fails loud rather than silent on the schema-drift scenario, and the team's own paper trail is unusually honest about its known gaps. I would not block indefinitely. But I would not sign off unconditionally either, given two findings (#1 and #2) that are structural, not cosmetic, and one (#3) that actively misleads users about a safety property that doesn't exist.

**Required before real users rely on this for GDPR erasure:**

1. Directly confirm (via `information_schema.tables`, not the migration ledger) that production has all 32 registry tables — this is explicitly flagged as unresolved in ADR-0005 itself.
2. Fix the retry-loop gap (finding #1): either make `resumeStartStatus` re-run the corresponding delete/adapter step when the last checkpoint entry belongs to a verify phase, or explicitly document (and alert on) the fact that a verification-confirmed failure requires manual remediation — don't let it fail silently into "just retry 3 more times and give up."
3. Correct the "will retry automatically" copy in `settings/privacy/page.tsx` to something truthful, or actually build the automatic retry it promises.
4. Add the cheap CI-level registry-vs-schema.sql existence check (finding #2/#7) — this is a small, high-value fix that directly prevents recurrence of the exact bug this review was commissioned to assess.

None of these require re-architecting anything already built; they're bounded fixes on top of a foundation that is otherwise reasonable.

---

## Note from the primary reviewer

Findings #1 and #3 above were independently re-verified against the source code (not taken on faith) before being incorporated into the main [Final Production Readiness Review](2026-07-21-account-deletion-final-production-readiness-review.md) as R-14 and R-15. This document's severity classification for finding #1 (CRITICAL) differs from the main review's classification (blocking, but not architectural) — both agree on the underlying fact; the difference is that the main review weighs "requires re-architecture" separately from "must be resolved before go-live," and #1 requires the latter but not the former. Finding #2 (CRITICAL, no registry/schema existence check) is incorporated as R-17, classified non-blocking-but-strongly-recommended in the main review rather than blocking, since the specific instance of drift it would have caught (R-1) is already known and being independently confirmed via condition 1 — the test's absence is a recurrence-prevention gap, not itself the reason this release should wait.
