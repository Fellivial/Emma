# Account Deletion — Phase 5B Core Infrastructure Implementation Report

**Status:** Complete. Independent Implementation Review: no unresolved CRITICAL or MAJOR finding.
**Written:** 2026-07-20.
**Roadmap:** [Account Deletion Roadmap v1.0 (Frozen)](../roadmaps/account-deletion-roadmap-v1.md) — Phase 4 (Verification), Engineering Workflow step 8 ("Implementation"), first slice.
**Scope:** Implements [Phase 5A's](2026-07-20-account-deletion-phase5a-implementation-plan.md) WP2 (Database Foundation), WP3 (Registry Extension), and WP4 (Verification Framework) — infrastructure only. **No behavior change to the deletion workflow, the GDPR API, or any client.**
**Authority implemented against:** [ADR-0005](../adr/0005-account-deletion-verification-architecture.md) (Accepted), the accepted [Phase 4B Technical Design Document](2026-07-18-account-deletion-phase4b-technical-design.md) (Revision 3) §1, §2.3, §3 — no other TDD section is implemented yet.

---

## Scope of infrastructure implemented

### WP2 — Database Foundation

- `supabase/migrations/20260720000001_verify_user_owned_data_deleted.sql` (new) — the read-only, Registry-parameterized verification counterpart to `delete_user_owned_data_ordered`, per TDD §3.1 (interface), §3.5 (identifier validation, per-column type casting, and the deliberate failure-mode divergence: malformed identifier aborts the whole call; unknown column or per-table query failure is caught individually), §3.6 (`SECURITY DEFINER`, `SET search_path=''`, `service_role`-only grant — identical posture to the delete function).
- `supabase/schema.sql` — the new function mirrored in, byte-for-byte (case-insensitive) identical to the migration, following this repo's existing `delete_user_owned_data_ordered` documentation-sync convention.
- The function is **strictly read-only** (contains no `DELETE`/`UPDATE`/`INSERT`) and is not called by any application code — confirmed by repository-wide grep and by this phase's own isolation tests (below).

### WP3 — Registry Extension

- `src/core/account-deletion/registry.ts` — `verificationAdapter` changed from `null` to `"database-row-count-verify"` on all 32 `DatabaseResourceEntry` rows (TDD §1.1, §1.2's naming convention). The 2 Storage, 2 external (OAuth/background-job), and 1 excluded entry keep `verificationAdapter: null`, with the rationale preserved as an inline doc comment (TDD §1.1's per-entry-group rationale, not silently dropped).
- Two new pure derivation functions, both TDD §1.3/§3.2-specified: `getVerifiableDatabaseResources()` (the Registry-side validation rule — a database resource is verification-eligible iff `verificationAdapter` is non-null) and `toVerificationTargets()` (the RPC payload shape, carrying `resourceId` through unlike `toUserOwnedDeleteOrder()`).
- No new field on `ResourceEntryBase`/`DatabaseResourceEntry`/`OtherResourceEntry` — confirmed unchanged (TDD §1.4).

### WP4 — Verification Framework

- `src/core/account-deletion/gdpr-data.ts` — `DatabaseVerificationResult` (the per-resource result type) and `verifyUserOwnedDataDeleted(supabase, userId)` (TDD §2.3), placed alongside `deleteUserOwnedData()` and following its exact shape: single batched `rpc()` call, `table_name → resourceId` mapping built in TypeScript (never in SQL), re-throw on whole-call failure, `{checked: false, remainingCount: null, errorDetail}` on a per-table failure.
- `src/core/account-deletion/verification-types.ts` (new) — the shared type layer this phase's own brief asked for by name (`VerificationResult`, `VerificationEvidence`, `RawVerificationStatus`, `VerificationBatch`, `VerificationFailureReason`/`VerificationFailure`, `VerificationContext`, `VerificationOutcome`), each mapped to the concrete TDD-specified model rather than a duplicate invention. **No `VerificationAdapter` interface was introduced** — TDD §2.1 explicitly rejected a per-resource adapter-object pattern for database verification, and building one here would have reintroduced exactly what that section rejected. The module's own header comment states this reasoning in full.

---

## What was explicitly NOT done (by design)

Per Phase 5B's own scope boundary and the Phase 5A plan's WP5 ownership:

- `src/core/account-deletion/workflow.ts` and `workflow-types.ts` are **unmodified**. `stepVerifyDatabase`/`stepVerifyExternal` remain the pre-Phase-5B zero-argument pass-throughs; `CRITICAL_STEPS` remains `["deleting_database"]`; `CheckpointResourceStatus` remains 3 values; `DeletionWorkflowResult` has no `checkpoint` field.
- `src/app/api/emma/gdpr/route.ts` is **unmodified** — no `verification` response field exists yet.
- `src/app/settings/privacy/page.tsx` and `vercel.json` are **unmodified**.
- No checkpoint entry is ever written by this phase's code, because nothing calls it.

---

## Test results

- New/changed test files: `tests/unit/registry.test.ts` (extended, one pre-existing assertion updated to match the new, intentional `verificationAdapter` value), `tests/unit/verification-framework.test.ts` (new — covers `verifyUserOwnedDataDeleted()`'s batching, table→resourceId mapping, both failure modes, an added integrity guard against an unrecognized `table_name`, dependency-injection isolation between two calls, `verification-types.ts`'s pure aggregation function, and four feature-isolation regression guards confirming `workflow.ts`/`route.ts` are untouched), `tests/unit/verify-user-owned-data-sql.test.ts` (new — mirrors `transactional-deletion-sql.test.ts`'s regression-lock pattern: migration/schema.sql parity, identifier validation, type casting, grant posture, read-only-ness, and the per-table-vs-whole-call failure split).
- `npx vitest run` (full suite): **755 passed, 3 skipped (pre-existing, unrelated), 0 failed** — 63 test files.
- `npx tsc --noEmit`: clean.
- `npx eslint src/core/account-deletion/`: clean.

---

## Independent Implementation Review

A fresh-context subagent, briefed as a senior backend engineer with no authorship stake, reviewed the actual working-tree diff (not this report's description of it) against ADR-0005, the Phase 4B TDD, and the Phase 5A plan — re-running the test suite, `tsc`, and `eslint` itself rather than trusting reported results, and grepping the repository directly to confirm zero coupling into `workflow.ts`/`route.ts`.

**Result: no CRITICAL or MAJOR finding.** Two findings, both resolved:

1. **OBSERVATION (process):** at review time, the implementation existed only as uncommitted working-tree changes, not yet a commit. Non-blocking — resolved by this phase's own finalization commit.
2. **MINOR (naming-collision risk, resolved in this revision):** `verification-types.ts`'s `VerificationStatus` type and `summarizeVerificationEvidence()` function were named closely enough to TDD §6.1's future `CheckpointResourceStatus` extension and §7.1's future API rollup that a later-phase implementer under time pressure could plausibly reach for these standalone, retry-history-unaware versions instead of building the real, checkpoint-integrated ones — echoing the shape of this subsystem's own prior "obvious but wrong" defects (the marker-status and Storage-undercount bugs). **Resolved:** renamed to `RawVerificationStatus` and `summarizeRawVerificationEvidence()`, with the module's own doc comments now stating explicitly not to reuse either in place of the real §6.1/§7.1 mechanisms once those are built.

The review independently confirmed, by direct inspection (not by trusting this document): the implementation matches TDD §1/§2.3/§3 line-by-line; `verifyUserOwnedDataDeleted(supabase, userId)`'s signature is exactly what a future `stepVerifyDatabase(supabase, row)` will need to call it with (`verifyUserOwnedDataDeleted(supabase, row.user_id)`) — no signature change will be required later; the new migration is safe to apply to a live database with zero behavior change, since nothing calls it yet; and `schema.sql`'s parity test is a real diff check (full string-equality on the extracted function body), not a superficial containment assertion.

---

## Confirmation: no user-visible behavior changed

- No client (`privacy/page.tsx`) reads a field that doesn't already exist.
- No workflow state, checkpoint entry, or `deletion_requests` row shape changes.
- `POST /api/emma/gdpr`'s response is byte-identical to before this phase.
- The one new SQL function is additive, read-only, and unreachable from any application code path — applying its migration to production changes nothing observable.

---

## Notes for Phase 5C (WP5 — Workflow Integration)

Carried forward from the Phase 5A plan's own WP5 section, restated here with what actually exists now to build against:

1. **Call site is ready.** `verifyUserOwnedDataDeleted(supabase, row.user_id)` and `toVerificationTargets()`/`getVerifiableDatabaseResources()` exist exactly as TDD §4.1/§4.5 will need them — no further signature work is needed in `gdpr-data.ts` or `registry.ts` before wiring `stepVerifyDatabase`.
2. **The two highest-fidelity-risk hazards are unchanged and still ahead:** the synthetic aggregate-marker convention (`"db.verification-batch"`, TDD §4.4) and its conditional status formula (§4.1 step 3), and `stepVerifyStorage`'s guard-body divergence (push nothing, not a `"skipped"` placeholder, on fire — TDD §4.2 Revision 3). Phase 5B does not touch `stepVerifyStorage` or add any guard logic — WP5 owns both in full, with TDD §4.1–§4.6 open side-by-side, not from memory.
3. **`verification-types.ts` is a resource, not a shortcut.** Its `RawVerificationStatus`/`summarizeRawVerificationEvidence()` are deliberately named to discourage reuse in place of the real `CheckpointResourceStatus` extension (§6.1) and the real API rollup (§7.1) — build those against `DeletionWorkflowResult.checkpoint` once WP5/WP7 add it, not against this module's standalone types.
4. **`CRITICAL_STEPS` widening, the checkpoint type extension, and the API `verification` field are all still fully unbuilt** — WP5 and WP7's full scope, not reduced by anything in this phase.

---

## Related

- [Phase 5A Implementation Plan](2026-07-20-account-deletion-phase5a-implementation-plan.md) (WP2, WP3, WP4)
- [Phase 5A Independent Planning Review](2026-07-20-account-deletion-phase5a-independent-review.md)
- [Phase 4B Technical Design Document](2026-07-18-account-deletion-phase4b-technical-design.md) (Accepted, Revision 3) §1, §2.3, §3
- [ADR-0005: Account Deletion Verification Architecture](../adr/0005-account-deletion-verification-architecture.md) (Accepted)
- [Account Deletion Roadmap v1.0 (Frozen)](../roadmaps/account-deletion-roadmap-v1.md)
- `src/core/account-deletion/{registry.ts,gdpr-data.ts,verification-types.ts}`
- `supabase/migrations/20260720000001_verify_user_owned_data_deleted.sql`, `supabase/schema.sql`
- `tests/unit/{registry,verification-framework,verify-user-owned-data-sql}.test.ts`
