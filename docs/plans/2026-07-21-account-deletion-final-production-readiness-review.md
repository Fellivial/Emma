# Account Deletion — Final Production Readiness Review

**Date:** 2026-07-21
**Reviewer:** Claude Code (primary review), with two research subagents (architecture/risk-history consolidation; code/test correctness) and one fresh-context independent adversarial subagent (production-challenge pass).
**Scope:** the full Account Deletion Verification feature as it exists after Phases 4A–5E — `src/core/account-deletion/*`, `src/app/api/emma/gdpr/route.ts`, `src/app/settings/privacy/page.tsx`, the three account-deletion Supabase migrations, ADR-0004, ADR-0005, and all associated design/review/hardening documents under `docs/plans/`.
**Branch:** `feature/account-deletion-phase5e` (this review is appended here rather than on a new branch — see Finalization Note at the end).

This document answers one question: **based on all available engineering evidence, is this feature ready to be trusted with real user account deletions in production?**

It is explicitly not an architecture review (ADR-0004/0005 are accepted and out of scope to relitigate) and not a code review of individual phases (each phase already passed its own independent review — see the Review-Chain Integrity section). It is a production go/no-go decision layered on top of that completed work — the step the roadmap itself, and every prior phase document, names as still owed.

---

## Executive Summary

The core architecture — one atomic Postgres transaction for deletion, followed by an independent, per-table re-verification RPC that a retry-and-fail-loud state machine gates the final status on — is sound and was confirmed sound by three independent passes in this review (two informed by the full paper trail, one deliberately blind to it). 783 tests pass, 0 fail. No path was found, across three independent close reads, where the system reports a deletion as successful while data verifiably remains, or silently loses/corrupts a checkpoint.

However, this review surfaced **two concrete, previously-undocumented defects** that were not caught by any of the ten prior phase-level independent reviews, because none of them was scoped to check the user-facing settings page or to stress-test what "retry" actually means once a _verification_ step (as opposed to the delete step) fails:

1. The user-facing copy in `src/app/settings/privacy/page.tsx:65-70` tells a user whose deletion is `retry_pending` that it "will retry automatically" — this is false. Nothing automatically advances a `retry_pending` row; only an identical follow-up request does.
2. The workflow's retry mechanism, once a `verify_database`/`verify_storage`/`verify_external` step confirms real leftover data, never re-attempts the underlying delete or adapter step — it only re-runs the verification check. This is a direct, provable consequence of `resumeStartStatus()` (`workflow.ts:594-600`) resuming at the _failed phase itself_ combined with a forward-only state cursor that structurally cannot revisit an earlier, already-completed phase. Confirmed against the repository's own "Marker Defect" mandatory regression test, which asserts the verify RPC is called again on each retry but never asserts a fresh delete call. This is consistent with the architecture's own stated scope (remediation of a confirmed defect was never promised — ADR-0005 treats this as requiring human intervention), but it means "retry_pending" is a materially different guarantee than the name suggests, and combined with finding #1, a real user with a confirmed leftover-data defect has no way to learn that manual/support intervention — not waiting — is what's actually required. Combined with zero alerting on terminal `failed` rows (a known, disclosed gap), a GDPR erasure request could sit in permanent, unremediated `failed` status indefinitely with no one aware.

Everything else this review checked — architectural fidelity, the review-chain's own integrity, checkpoint/resume correctness, workflow authority, API exposure, migration safety, rollback procedure, and the previously-known schema-drift risk — held up under independent scrutiny. Full detail below.

**Decision: GO WITH CONDITIONS.** See the Production Decision section for the specific, owned conditions.

---

## 1. Architectural Fidelity Assessment

Verified via a dedicated research pass reading ADR-0004, ADR-0005, the accepted Phase 4B TDD (Revision 3, the version that survived a 4-round independent review chain), and every Phase 5A–5E implementation report against each other.

**Finding: no material architectural drift.** Each of ADR-0005's seven binding "Chosen Architecture" items maps cleanly onto what 5B–5D actually built:

| ADR-0005 item                                                                                                          | Implementation                                                                                        | Verified by                                                 |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1. Registry gains a `verificationAdapter` field                                                                        | `registry.ts` — one field changed on 32 entries, two pure derivation functions added, zero new fields | Phase 5B report + direct code read                          |
| 2. New `verify_user_owned_data_deleted` RPC, per-table catch (diverging from the delete RPC's whole-transaction-abort) | `supabase/migrations/20260720000001_verify_user_owned_data_deleted.sql`                               | Phase 5E live-DB validation (runbook §4) + direct code read |
| 3. Conditional marker-status formula (not unconditional "completed")                                                   | `workflow.ts:317-328`, `verificationMarkerStatus()`                                                   | Direct code read + "Marker Defect" regression test          |
| 4. 4-value `CheckpointResourceStatus` incl. `inconclusive`                                                             | `workflow-types.ts`                                                                                   | Direct code read                                            |
| 5. `verify_database`/`verify_storage`/`verify_external` added to `CRITICAL_STEPS`                                      | `workflow.ts:542-547`                                                                                 | Direct code read                                            |
| 6. Single batched RPC call, not per-table                                                                              | `stepVerifyDatabase` — one `verifyUserOwnedDataDeleted()` call                                        | Phase 5E timing validation (~31ms for 32 tables)            |
| 7. Resume-safety for all three verify phases via aggregate/per-resource guards                                         | `stepVerifyDatabase`/`stepVerifyStorage`/`stepVerifyExternal` guards                                  | Direct code read + Resume regression test                   |

**One disclosed, non-binding elaboration:** Phase 5B introduced `verification-types.ts`, a module the TDD didn't name as required. It briefly created a naming-collision risk with the real checkpoint-level vocabulary (caught and fixed by Phase 5B's own independent review — the risky names were renamed with warning doc comments). Not a defect, just extra surface area worth knowing about.

**One open scope note carried forward, not a defect:** the roadmap's own 13-step Engineering Workflow names a formal "Production Readiness Review" (step 10) and "Independent Phase Gate Review" (step 11) for Phase 4 as distinct, still-outstanding steps as of Phase 5E's own closing line ("ready to enter the roadmap's final Production Readiness Review"). This document and its accompanying independent review are, functionally, that missing step 10/11.

---

## 2. Functional Correctness Assessment

Verified via an independent code-and-test read (not relying on any phase's own claims) covering deletion, verification, retry, resume, checkpoint reconstruction, workflow authority, and API exposure, then re-verified directly by me against the two findings the adversarial pass surfaced.

**False success:** not found. `route.ts`'s `success` field is computed directly from `result.status === "completed"` — there is exactly one success computation in the entire route (confirmed by grep), and `CRITICAL_STEPS` gates that status on real per-table/per-bucket verification results, not the delete step's own self-report. Three independent reads (two informed, one blind) converged on this same conclusion.

**Caveat, not a defect:** an `"inconclusive"` result (an RPC/Storage-list outage, not a confirmed defect) does not block completion, by explicit ADR-0005 design — this is a disclosed, still-open Product/Legal "evidentiary standard" question (see Risk Register item R-3), not a hidden bug. The API is honest about it: `verification.*.inconclusive` counts are always returned alongside `success`/`status`.

**False failure:** not found. The `checked`/`inconclusive` vs. `failed` distinction is threaded consistently from SQL through to the API response; no path over-classifies a transient error as a confirmed defect.

**The whole-transaction-abort (delete) vs. per-table-catch (verify) asymmetry:** confirmed intentional and correctly implemented, not a defect. The delete RPC's per-table exception handler adds context and re-raises rather than swallowing (`20260716000001_transactional_deletion.sql:98-108`) — atomicity is preserved for a destructive operation, while the read-only verify RPC maximizes partial evidence since it has no atomicity requirement to protect. This design choice is explicitly reasoned in the migration's own header comment. I agree with it.

**Retry corruption:** not found in the sense of double-deletion (the delete step is naturally idempotent — a re-run deletes zero rows the second time — and Storage delete is covered by a dedicated idempotency test). One informational nuance: `MAX_RETRY_COUNT = 3` is a single counter shared cumulatively across all four critical steps combined, not a per-step budget — e.g., two `deleting_database` failures plus two `verify_storage` failures exhausts the same counter. This matches the code's own documented intent but is untested for the cross-step case specifically; low severity, recommend a confirming test plus explicit sign-off that a global (not per-step) budget is the intended product behavior.

**Resume corruption — the confirmed, real finding:** `resumeStartStatus()` (`workflow.ts:594-600`) resumes a `retry_pending` row at the _phase of its own last checkpoint entry_. For a `verify_database`/`verify_storage`/`verify_external` failure, that phase is the verify step itself — which sits _after_ `deleting_database`/`deleting_storage` in `STATE_ORDER` (`workflow.ts:549-561`). Combined with a forward-only cursor (`for (; cursor < STATE_ORDER.length; cursor++)`), this means: **once a verify phase fails, every subsequent retry re-runs only that verification check — it never revisits an earlier, already-`completed`-marked delete or adapter step, even though the verify step just confirmed that step's work didn't hold.** I traced this directly in the code and confirmed it against the repository's own "Marker Defect" mandatory regression test (`tests/unit/verification-workflow.test.ts:460-500`): the test tracks and asserts `verifyCallCount()` incrementing across all 4 workflow invocations, and never asserts (or exercises a mock capable of asserting) a second delete call. The workflow's refusal to report `"completed"` after a confirmed defect is real and well-tested — but the "retry" it performs is a re-check, not a remediation attempt. This is consistent with ADR-0005's explicit framing that automated remediation of a confirmed post-verification defect was never a committed scope item (human intervention was always the documented answer — see the runbook's §2.3), but the framing in existing documentation ("no retry/cancel endpoint exists") undersells how the _existing_ retry mechanism behaves: it isn't a no-op pending a future endpoint, it's actively running the wrong step. See Risk Register item R-14.

**Checkpoint corruption:** not found. Every write path appends (`[...row.checkpoint, ...newEntries]`) or preserves the array unchanged; no truncation/replacement path exists. Concurrency is handled by optimistic locking on `updated_at`, with a losing writer raising `ConcurrentModificationError` rather than silently overwriting — confirmed by a dedicated 5-iteration randomized-jitter concurrency test.

**Workflow authority:** not found to be dual. `workflow.ts` is the only writer to `deletion_requests` (confirmed by repo-wide grep); `route.ts` never touches the table directly, only calls `runDeletionWorkflow()`.

**API exposure — one real, new finding:** `route.ts`'s `summary` field (and the `error`/`errorDetail` checkpoint fields it's built from) includes raw driver/Postgres error text verbatim in the customer-facing 200-status JSON body — e.g. a real failure could surface `"unknown column: document_chunks.user_id"` or a raw connection-reset message directly to the end user. Scoped to the requester's own request only (not cross-user), and the route's top-level catch correctly keeps unexpected 500s generic and server-log-only — so this is an information-hygiene issue, not a security breach, but worth scrubbing before this is exposed to real customers rather than internal testing. See Risk Register item R-16.

**The mandatory regression tests:** all four the runbook cites (Marker Defect, Storage Undercount, Resume, API Verification) were independently confirmed to exist at their cited line numbers and to assert genuine, falsifiable behavior — not tautological restatements of the implementation. Full test suite: **783 passed, 0 failed, 3 skipped** (re-run directly during this review, matching Phase 5E's own last recorded count).

---

## 3. Operational Readiness Assessment

`docs/runbooks/account-deletion-deployment.md` (written Phase 5E) is unusually candid — it names its own gaps directly rather than glossing over them (e.g., "nothing today alerts on inconclusive counts — an operator has to know to look"). Its troubleshooting steps (§7) were independently confirmed correct against the actual code by both the informed and the blind review pass.

**What it gives an on-call engineer without the original authors present:** a correct, concrete procedure to look up a specific user's stuck deletion (`deletion_requests` row + `checkpoint` history + log correlation via `requestId`), correct rollback guidance (verified line-by-line against `runStep()`'s actual switch statement), and correct migration-application guidance (including the critical warning not to trust `migration list --linked`, itself independently confirmed true — see Database Readiness below).

**What it does not give an operator:** any proactive signal. There is no dashboard, alert, or cron sweep for `retry_pending`/`failed` rows — discovery is entirely reactive. Combined with §2's confirmed finding that "retry" doesn't remediate verification failures, and the confirmed-false "will retry automatically" UI copy, a real GDPR erasure request with a genuine confirmed leftover defect can sit permanently `failed`, with leftover personal data, indefinitely — with no one aware unless they think to query the table. This is the single most consequential gap this review found relative to what prior phases assessed, because prior phases evaluated "no retry/cancel endpoint" as a scoped-out feature gap, not as "the thing labeled retry doesn't do what an operator or user would reasonably assume it does."

---

## 4. Database Readiness

**The known finding (Phase 5E, restated and re-confirmed, not re-derived):** 4 of the Registry's 32 database tables (`document_chunks`, `personas`, `push_subscriptions`, `proactive_daily`) do not exist on the linked validation Supabase project. I independently confirmed these 4 tables _are_ defined in `supabase/schema.sql` (lines 966, 1051, 1066, and 1109 respectively, all `create table if not exists`) — so this is not a code-repository inconsistency, it is a live-environment application gap: `schema.sql` was not (or not fully) applied to that project.

**Operational impact — explicit answer to the review brief's question:** this blocks real deletions **only on the specific project where the gap was measured** — it is not evidence of a defect in the Registry, the delete RPC, or the verify RPC, all three of which behaved exactly as designed when confronted with a missing table (delete aborts the whole transaction and retries to permanent failure; verify degrades gracefully per-table). **Whether it blocks the actual intended production deployment target depends entirely on whether that target has the same gap** — this has not been confirmed either way in this review or, per ADR-0005's own Open Questions table, in any prior document. This is the single largest open item standing between "GO" and "GO WITH CONDITIONS" in this review — see Risk Register item R-1 and the Production Decision section.

**A gap not previously named in these terms:** there is no automated check anywhere in this repository — CI, unit test, or otherwise — that the Registry's table list (`registry.ts`) matches what actually exists in `schema.sql`, let alone in a live database. The current safety net for this entire class of bug is manual, ad-hoc live-validation phases (2.1, 3.1, 5E) with no guaranteed cadence and no merge-time enforcement. A test that parses `registry.ts` and `schema.sql` and diffs the table sets would be inexpensive, requires no live database access, and would have caught this exact class of gap at merge time. See Risk Register item R-17.

**Migration ledger:** independently re-confirmed via the runbook's own documented mechanism (not re-derived from scratch this pass) — `supabase_migrations.schema_migrations` on the linked project stops recording reliably after `companion_state`, so `migration list --linked` cannot be trusted as a source of truth for this subsystem; direct `information_schema`/`pg_proc` queries are the only reliable check. This is a live-environment/tooling fact, not a code defect, and is already correctly documented.

**Migration file quality:** all three account-deletion migrations use defensive SQL (`SECURITY DEFINER` + `SET search_path = ''`, regex-validated identifiers before any dynamic `EXECUTE format(...)`, minimal `service_role`-only grants) and are idempotent (`CREATE OR REPLACE FUNCTION`, `CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS` before re-creating). Re-applying any of them, or applying them out of order relative to each other, is safe. Clean-database-from-scratch deployment was reasoned but not independently tested this review (matches Phase 5E's own disclosed residual gap) — low risk given the idempotent construction, not re-verified live.

---

## 5. Deployment Readiness

`.github/workflows/ci.yml`'s `deploy-production` job triggers on every push to `main`, unconditionally, with no migration-apply step and no manual approval gate — confirmed by direct reading, matching what the runbook already documents. Phase 5E added a `continue-on-error: true` CI warning annotation when a PR touches `supabase/migrations/` — confirmed genuinely non-blocking by direct reading of the workflow file.

**A scope gap in that reminder, not previously named:** the reminder only watches `supabase/migrations/`. It would not have fired for the specific historical change that introduced the 4 tables named above, since those are long-standing entries in `supabase/schema.sql`, not a recent account-deletion-scoped migration — meaning the reminder's protection is narrower than the actual risk surface for this class of bug. This doesn't make the reminder wrong for what it was built to do (migration-before-code sequencing for _new_ account-deletion migrations); it does mean it should not be read as covering schema-drift risk more broadly. The real fix for the broader risk is the registry-vs-schema check named above (R-17), not an extension of this CI reminder's grep pattern.

**Real enforcement (an automated migrate-then-deploy gate) was deliberately not built,** per Phase 5E's own reasoning: no Supabase deploy secrets exist in this repo's CI to build/test such a gate against, and shipping an untested pipeline change against the real production target was judged riskier than the documented manual-discipline status quo. I find this reasoning sound and the risk explicitly, correctly accepted rather than silently ignored.

---

## 6. Performance Assessment

Live-timed by Phase 5E against the linked validation project and not re-measured independently this review (no reason to doubt a single `EXPLAIN ANALYZE` measurement): `verify_user_owned_data_deleted`'s full 32-table batch executes in ~31ms server-side, negligible against the `maxDuration: 60` (60,000ms) now configured for the GDPR route. The pre-existing delete RPC could not be re-timed on the linked project (it aborts immediately there per the schema gap) — this is a measurement gap, not a performance concern, since the delete RPC's failure mode there is fast, not slow. Retry overhead is bounded by `MAX_RETRY_COUNT = 3`; checkpoint growth is bounded (~136 entries worst case per Phase 4C's prior analysis, not re-derived this review). **No performance blocker found.**

---

## 7. Observability Assessment

`workflow.ts`'s `log()` emits structured `console.warn` lines with `requestId`/`userId`/`status` plus event-specific fields, sufficient to reconstruct one user's deletion history after the fact — confirmed by tracing every call site against the state machine. This is real, working observability for reactive, single-user investigation.

**What does not exist, and is now more consequential than previously assessed:** no fleet-wide aggregation, no alerting on `inconclusive` or terminal `failed` counts. Prior phases correctly disclosed this as out-of-scope (Phase 7 territory). This review's finding changes the calculus: because §2/§3 confirm that a terminal `failed` status following a confirmed verification defect will never self-heal, and because GDPR erasure carries statutory time expectations, "no one is alerted when this happens" is no longer a pure roadmap-sequencing question — it's a direct input to whether this feature can be trusted unsupervised in production today. See Risk Register item R-18 and the Production Decision's conditions.

---

## 8. Testing Assessment

Full suite: **783 passed, 0 failed, 3 skipped**, independently re-run during this review (matches Phase 5E's last recorded count — no regression since). All four roadmap-mandated regression tests (Marker Defect, Storage Undercount, Resume, API Verification) confirmed present, passing, and asserting genuine behavior rather than tautologies — independently verified against their actual assertions, not just their existence.

**One test-coverage gap directly tied to this review's own findings:** no test exercises or asserts on the actual `deleteUserOwnedData`/adapter call count across a verify-phase retry sequence — which is precisely why the retry-doesn't-remediate behavior (§2) went unnoticed by ten prior independent reviews despite a very thorough regression suite. The Marker Defect test's own mock tracks `verifyCallCount()` but has no equivalent tracking for delete calls. Recommend adding this assertion regardless of whether the underlying behavior is changed or explicitly accepted, so the intended behavior (re-check only, or re-check-and-remediate) is pinned by a test rather than left to be independently re-discovered.

---

## 9. Security & Privacy Assessment

GDPR correctness: the delete/verify pair correctly scopes to the authenticated caller's own `user_id` throughout (no user-supplied ID routes to another user's data — confirmed by direct trace). Tenant-owned/shared resources (`client_integrations`) are correctly excluded from automatic deletion, matching `reference-api.md`'s documented contract, which I cross-checked against the actual route response shape and found to match exactly, field-for-field.

**Checkpoint contents:** no raw user data — only resource identifiers, counts, and status enums. No PII beyond `user_id` (already known to the system) appears in `checkpoint` entries.

**API exposure — restating R-16 in this context:** raw SQL/driver error strings in the customer-facing `summary` field is an information-disclosure hygiene issue (internal table/column names, driver wording) rather than a data-privacy breach, but is exactly the kind of thing that should not ship to real customers without being scrubbed to a generic message.

**Open, disclosed, unresolved Product/Legal question (not new, restated because it's directly relevant to a GO decision):** ADR-0005 leaves "what evidentiary standard counts as adequately proven erasure" (existence-check vs. something stronger) explicitly to Product/Legal, unowned by name, unresolved after 5A–5E. A "GO" decision implicitly accepts the current existence-check standard as sufficient; that acceptance should be made explicitly by someone with the authority to make it, not implicitly by a code review.

---

## 10. Maintainability Assessment

**Real strength:** the Registry-as-single-source-of-truth pattern (`toUserOwnedDeleteOrder`/`toGdprExportTables`/`toVerificationTargets` all deriving from one array in `registry.ts`) structurally prevents the _old_ class of bug (two hand-maintained lists silently disagreeing). This is a genuine architectural improvement that closes the exact defect class it was built to close.

**Standing structural risk, not fully closed by that pattern:** the Registry's _table names_ still have no automated tie to what actually exists in `schema.sql` or a live database (R-17) — the single-source-of-truth pattern prevents divergence _within_ the codebase, but not divergence _between_ the codebase and the database it assumes exists.

**A documented-but-unenforced guarantee:** `workflow_version` (`workflow.ts:27`, written once at row creation) is claimed by its own migration's header comment to "freeze which Registry snapshot + state-machine shape this request executes against, so a future Registry/state-machine change never affects an in-flight row" — but it is never read anywhere in `workflow.ts` (confirmed by grep: zero read-sites). The one real instance of cross-version drift that has occurred (pre-Phase-5C rows with stale placeholder checkpoints) was hand-patched via a naming trick, not by this version field. This isn't a defect in current behavior, but it's a claim in a comment that doesn't match the code, and the next `STATE_ORDER` change has no automated safety net beyond hand discipline. Recommend either implementing real version branching or removing the unearned claim from the comment.

**The governance-chain observation, restated because it remains unresolved:** every independent review across all ten prior phases, and both of this review's own subagents, is explicitly AI-authored ("fresh-context subagent"). No document in this entire paper trail — including this one — records a human engineer, architect, or Product/Legal stakeholder's own sign-off. This was first flagged by the Phase 4C Independent Production Audit and has persisted, unowned, across six subsequent documents. This review does not resolve it either; it is named here so a human reader of this document is the first to actually close it, by virtue of reading and acting on this review themselves.

---

## Production Risk Register

Risk items R-1 through R-13 are carried forward from the Phase 4C Production Readiness Review's own numbered register (unchanged unless noted); R-14 through R-18 are new findings from this review.

| #        | Risk                                                                                                                                                                    | Impact                                                                                                        | Likelihood                                                                                                                                               | Owner                                            | Mitigation                                                                                                                                                                       | Classification                                                                                             |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| R-1      | Registry's 32 tables not confirmed present in the actual intended production database (4/32 confirmed missing on one validation project; production status unconfirmed) | High — deletion fails deterministically for any user if true in production                                    | Unknown until confirmed                                                                                                                                  | Ops                                              | Confirm via `information_schema.tables` before go-live                                                                                                                           | **Blocking** until confirmed                                                                               |
| R-2      | GDPR route `maxDuration` — new verify RPC timed safe (~31ms); delete RPC not re-timed (blocked on drifted environment)                                                  | Low                                                                                                           | Low                                                                                                                                                      | Implementer                                      | Re-time delete RPC once R-1 is resolved                                                                                                                                          | Non-blocking                                                                                               |
| R-3      | Evidentiary standard for "proven erasure" is an open Product/Legal question                                                                                             | Medium (compliance framing)                                                                                   | N/A                                                                                                                                                      | Product/Legal (unassigned)                       | Explicit sign-off before external launch                                                                                                                                         | **Recommend blocking for external GDPR-facing claims**, non-blocking for continued internal validation     |
| R-4      | OAuth/background-job resources have no deletion/verification adapter                                                                                                    | Medium                                                                                                        | N/A                                                                                                                                                      | Roadmap owner (unassigned)                       | New ADR/roadmap phase                                                                                                                                                            | Non-blocking, disclosed                                                                                    |
| R-5      | `recordedAt` monotonicity assumed, not proven                                                                                                                           | Low                                                                                                           | Low                                                                                                                                                      | —                                                | Accepted                                                                                                                                                                         | Non-blocking                                                                                               |
| R-6      | `inconclusive` `verify_storage` entry permanently satisfies its own resume guard                                                                                        | Low                                                                                                           | Low                                                                                                                                                      | —                                                | Accepted                                                                                                                                                                         | Non-blocking                                                                                               |
| R-7      | Checkpoint history grows unboundedly (bounded today by `MAX_RETRY_COUNT`)                                                                                               | Low                                                                                                           | Low                                                                                                                                                      | Future phase                                     | Accepted                                                                                                                                                                         | Non-blocking                                                                                               |
| R-8      | Checkpoint malformed-entry tolerance is incidental, not tested by design                                                                                                | Low                                                                                                           | Low                                                                                                                                                      | —                                                | Accepted                                                                                                                                                                         | Non-blocking                                                                                               |
| R-12     | No deployment-pipeline enforcement of migration-before-code sequencing                                                                                                  | Medium                                                                                                        | Medium                                                                                                                                                   | Whoever merges migrations                        | Manual discipline + non-blocking CI reminder (accepted, not resolved)                                                                                                            | Non-blocking, explicitly accepted                                                                          |
| R-13     | Checkpoint's append-only, no-natural-key shape is the structural root of several now-closed review findings                                                             | Low (informational)                                                                                           | N/A                                                                                                                                                      | Future phase (6)                                 | Design input for future work                                                                                                                                                     | Non-blocking                                                                                               |
| **R-14** | **Retry mechanism never re-attempts the delete/adapter step after a verify-phase failure — only re-checks** (new finding, this review)                                  | **High** — a confirmed real leftover-data defect has no automated remediation path and, per R-18, no alerting | Low-medium (requires a genuine post-delete data reappearance, e.g. the disclosed in-flight background-job race) but consequence is severe when it occurs | Implementer / Product (decide intended behavior) | Either implement remediation-on-retry for verify-phase failures, or explicitly document + alert on this so manual intervention actually happens before a GDPR deadline is missed | **Blocking** (see Production Decision)                                                                     |
| **R-15** | **User-facing copy claims automatic retry that does not exist** (`src/app/settings/privacy/page.tsx:65-70`) (new finding, this review)                                  | Medium-High — actively misleads a user with a real legal deletion request into passive waiting                | Certain (triggers every time `status === "retry_pending"` is shown)                                                                                      | Frontend owner                                   | Correct the copy to something truthful (e.g., direct the user to re-submit or contact support)                                                                                   | **Blocking** (trivial fix)                                                                                 |
| **R-16** | **Raw SQL/driver error text surfaces verbatim in the customer-facing `summary` field** (new finding, this review)                                                       | Low-Medium — information-hygiene, not a security breach (scoped to requester's own data)                      | Medium (any real delete/verify error)                                                                                                                    | API owner                                        | Scrub to a generic message before customer-facing exposure beyond internal testing                                                                                               | Non-blocking for internal use; **blocking before wider customer exposure**                                 |
| **R-17** | **No automated check that Registry table names exist in `schema.sql`/production** (new finding, this review)                                                            | High (root cause of R-1's class of bug)                                                                       | Certain to recur without mitigation — this is the second time this exact class of gap has been found via manual live-validation rather than automation   | Implementer                                      | Add a cheap CI/unit test diffing `registry.ts` against `schema.sql`                                                                                                              | Non-blocking for this release, **strongly recommended before next schema change touches this area**        |
| **R-18** | **No alerting on terminal `failed` deletion requests** (restated, elevated in severity by R-14/R-15's interaction)                                                      | High when combined with R-14/R-15 — a GDPR request can sit permanently unresolved, unnoticed                  | Low likelihood per-request, high consequence                                                                                                             | Ops/Future phase (7)                             | At minimum, a manual weekly query per the runbook until real alerting exists; real alerting recommended before broad production reliance                                         | **Recommend blocking**, or an explicit accepted-risk sign-off with a concrete interim manual-check cadence |

**Separated by category, per the review brief's request:**

- **Implementation risks:** R-14, R-15, R-16, R-17 (all new, all fixable without re-architecture)
- **Operational risks:** R-1, R-12, R-18
- **Accepted risks (explicitly, by prior phases, unchanged by this review):** R-2, R-5, R-6, R-7, R-8, R-13
- **Unresolved but explicitly non-blocking, owned by Product/Legal/roadmap, not engineering:** R-3, R-4

---

## Open Issues

1. Production schema state relative to the Registry's 32 tables is unconfirmed (R-1) — this is the single largest open item and was already the top item in the Phase 4C Risk Register; it remains open after Phase 5E and after this review.
2. The retry/copy pairing (R-14 + R-15) is a genuinely new finding this review is responsible for surfacing — no prior phase document names either.
3. Governance-chain human-sign-off gap (§10) remains unresolved and unowned across eleven documents now, including this one.

---

## Production Decision

### **GO WITH CONDITIONS**

The architecture is sound, the implementation matches its accepted design, the review chain that produced it genuinely converged (every CRITICAL/MAJOR finding across ten prior independent reviews was either fixed or is an honestly-disclosed accepted risk — confirmed, not assumed, by this review's own research pass). This is not a "NO GO" — nothing found requires re-architecture, and most of what's listed below is small, bounded, cheap engineering work.

It is not a clean "GO" either, because this review found two real, verifiable, previously-uncaught defects (R-14, R-15) that mean a real user with a genuinely confirmed leftover-data GDPR erasure defect currently has no way to know what's actually happening or what to do about it — and no one on the operations side is alerted either. That combination is squarely the kind of thing a final production-readiness gate exists to catch before real users hit it, not after.

**Blocking conditions (must be satisfied before this feature processes real, uncontrolled production deletion requests):**

1. **R-1** — Ops (owner per ADR-0005) must directly confirm, via `information_schema.tables` against the actual intended production database (not the migration ledger, per the runbook's own warning), that all 32 Registry tables exist. Verification criterion: a query result, not a claim. Blocked until confirmed.
2. **R-15** — Fix the "will retry automatically" copy in `src/app/settings/privacy/page.tsx` to something truthful. Owner: frontend/implementer. Verification: updated copy + a test asserting the `retry_pending` message no longer claims automatic retry. Trivial, should not delay the other conditions.
3. **R-14** — Product must explicitly decide, and engineering must implement or document accordingly: should a confirmed verify-phase defect trigger a remediation attempt (re-run the corresponding delete/adapter step) on the next retry, or is human intervention the permanent, intended answer? Whichever is decided, it must be reflected in both the code's actual behavior and the user-facing copy (tie to condition 2) — the current state (silent re-check-only, framed to the user as "automatic retry") is the one combination that must not ship as-is. Owner: Product + implementer. Verification: either new code + test, or an explicit written decision plus corrected copy.
4. **R-18** — At minimum, commit to and document a concrete manual-check cadence (e.g., a weekly query per the runbook) for terminal `failed` rows until real alerting exists, so condition 3's decision has an actual operational backstop. Owner: Ops. Verification: a documented, owned, dated commitment — not just "the runbook mentions this is possible."

**Non-blocking, strongly recommended before the next schema or migration change touches this subsystem:**

5. **R-17** — Add an automated (CI-runnable, no live DB required) test diffing `registry.ts`'s table list against `supabase/schema.sql`. Owner: implementer. This is the cheapest, highest-leverage fix in this entire review — it directly prevents recurrence of the exact bug class R-1 represents.
6. **R-16** — Scrub raw SQL/driver error text from the customer-facing `summary` field before this is exposed to customers beyond internal testing. Owner: API owner.
7. **R-3** — Product/Legal should explicitly sign off on the existence-check evidentiary standard before this feature is marketed/relied upon as a complete GDPR compliance solution, as distinct from "the code behaves as designed."

None of conditions 1–4 require touching the core delete/verify transaction logic, the Registry, or the SQL functions — they are scoped, additive fixes (a query, a copy change, a decision + small code change, an operational commitment) layered on top of an otherwise-sound foundation.

---

## Independent Production Review Summary

A fresh-context subagent with no visibility into this document, any prior phase document, or any conclusion reached above was separately commissioned to independently assess production readiness from first principles and actively look for reasons not to ship. Its full findings are recorded in the companion document, [`2026-07-21-account-deletion-final-independent-review.md`](2026-07-21-account-deletion-final-independent-review.md). Its own recommendation was **GO WITH CONDITIONS**, and — notably — it independently arrived at both R-14 and R-15 (the retry-doesn't-remediate defect and the misleading UI copy) without being told either fact in advance, which is why this final report incorporates them as confirmed findings rather than unverified claims: I re-derived both directly against the source code myself (`workflow.ts:594-600`, the "Marker Defect" test's own assertions, and `src/app/settings/privacy/page.tsx:65-70`) before accepting them. Where its findings differed in emphasis from this document (e.g., it classified R-14 as CRITICAL; this document classifies it as blocking-but-not-architectural, since it requires no re-design, only a scoped fix or an explicit decision), the difference is one of framing, not of underlying fact — both documents agree on what is true in the code today.

No CRITICAL or unresolved MAJOR finding from either this review or the independent pass blocks a bounded "GO WITH CONDITIONS" — everything identified has a concrete, ownable, verifiable fix that does not require revisiting the accepted architecture.

---

## Required Follow-ups

**Must resolve before production reliance on real, uncontrolled deletion requests (blocking):**

- R-1, R-15, R-14, R-18 (see Production Decision conditions 1–4)

**Should resolve soon, not blocking this release (post-deployment operational actions):**

- R-17 (registry/schema drift test), R-16 (error message scrubbing), R-3 (Product/Legal evidentiary sign-off), R-2 (re-time delete RPC once R-1 clears)

**Explicitly out of scope for this feature, future architectural work (not blocking, not this phase's job):**

- R-4 (OAuth/background-job deletion adapters — needs a new ADR/roadmap phase)
- Real fleet-wide alerting/dashboard for deletion-workflow health (Phase 7 territory, per the roadmap's own sequencing)
- A durable, automated migration-before-code deployment gate (R-12) — requires Supabase deploy secrets in CI that don't currently exist; revisit if/when those are added for another reason
- Real `workflow_version`-based state-machine compatibility branching, or removing the unearned claim from its comment (§10)
- Retiring the dual "Phase 5" naming ambiguity across `docs/plans/` (documentation hygiene only, no functional impact)

---

## Related

- [ADR-0004: Account Deletion Architecture](../adr/0004-account-deletion-architecture.md)
- [ADR-0005: Account Deletion Verification Architecture](../adr/0005-account-deletion-verification-architecture.md)
- [Phase 4C Production Readiness Review](2026-07-20-account-deletion-phase4c-production-readiness.md) — origin of Risk Register items R-1 through R-13
- [Phase 5E Production Hardening Report](2026-07-21-account-deletion-phase5e-production-hardening.md) / [its Independent Review](2026-07-21-account-deletion-phase5e-independent-review.md)
- [Deployment/Rollback/Troubleshooting Runbook](../runbooks/account-deletion-deployment.md)
- [API Reference — GDPR section](../reference-api.md#gdpr)
- [Independent Production Review](2026-07-21-account-deletion-final-independent-review.md) (companion document)
- `src/core/account-deletion/{registry,workflow,workflow-types,gdpr-data,adapter}.ts`, `src/app/api/emma/gdpr/route.ts`, `src/app/settings/privacy/page.tsx`

---

## Finalization Note

This review was appended to the existing `feature/account-deletion-phase5e` branch (which already has an open PR against `main`) rather than opened as a new branch/PR, since it reviews and directly extends that same body of work and there is no reason to fragment the review history across two open PRs for one still-unmerged feature. If the maintainer prefers a separate PR for this document, it can be cherry-picked onto a new branch without any code changes to carry.
