# Account Deletion — Phase 5C Workflow Integration Report

**Status:** Complete. Independent Workflow Review: no unresolved CRITICAL or MAJOR finding.
**Written:** 2026-07-21.
**Roadmap:** [Account Deletion Roadmap v1.0 (Frozen)](../roadmaps/account-deletion-roadmap-v1.md) — Phase 4 (Verification), Engineering Workflow step 8 ("Implementation"), second slice. **This is the first phase in this feature's history that intentionally changes runtime/workflow behavior.**
**Scope:** Implements [Phase 5A's](2026-07-20-account-deletion-phase5a-implementation-plan.md) WP5 (Workflow Integration) in full — wiring the Phase 5B infrastructure into `workflow.ts`.
**Authority implemented against:** [ADR-0005](../adr/0005-account-deletion-verification-architecture.md) (Accepted), the accepted [Phase 4B Technical Design Document](2026-07-18-account-deletion-phase4b-technical-design.md) (Revision 3) §4 (Workflow Design), §5 (Workflow Outcome Authority), §6 (Checkpoint Design) — every decision traced to an exact TDD subsection, no simplification or improvisation.

---

## Scope of what changed

### `src/core/account-deletion/workflow.ts`

- **`stepVerifyDatabase(supabase, row)`** (TDD §4.1, §4.5 signature change): real body replacing the pre-Phase-5C zero-arg pass-through. Aggregate-marker skip guard on `"db.verification-batch"`; calls `verifyUserOwnedDataDeleted()` (Phase 5B) in `try`/`catch`; maps each `DatabaseVerificationResult` to `"completed"`/`"failed"`/`"inconclusive"`; appends the conditional-status marker **last**.
- **`stepVerifyStorage(row)`** (TDD §4.2 Revision 3): guard now pushes **zero** checkpoint entries when it fires (not a `"skipped"` placeholder — the exact fix the Phase 4B review chain's final round required); three-way failure mapping (`success: true` → completed; `success: false && itemsProcessed > 0` → failed with `remainingCount`; `success: false && itemsProcessed === 0` or a caught exception → inconclusive).
- **`stepVerifyExternal(row)`** (TDD §4.3, §4.5 signature change): logic unchanged (still all `"skipped"`, no adapter exists); guard and marker-write step added for resume-safety consistency, using the same conditional formula as database.
- **`verificationMarkerStatus()`** (new, shared helper): the conditional marker-status formula (TDD §4.1 step 3 — the single most important correction in the TDD's own review chain), reused by both `stepVerifyDatabase` and `stepVerifyExternal` so the fix isn't duplicated.
- **`runStep()`**'s switch updated to pass `supabase`/`row` through to the two changed step calls (TDD §4.5).
- **`CRITICAL_STEPS`** widened to `["deleting_database", "verify_database", "verify_storage", "verify_external"]` (TDD §5.1) — the existing `failed.length > 0 && CRITICAL_STEPS.includes(status)` branch reused completely unmodified.
- **`checkpointEntry()`** factory gains an optional `remainingCount` param, passed through identically to `detail`/`error` (TDD §4.6).
- **`DeletionWorkflowResult.checkpoint`** populated on all 7 `return` statements in `runDeletionWorkflow()`, with the `ConcurrentModificationError` branch specifically using `current?.checkpoint ?? row.checkpoint` (TDD §4.6's one stated exception to the blanket rule).
- **Logging**: `verification_started`/`verification_completed`/`verification_failed`/`verification_inconclusive`/`aggregate_marker_created` log events added at the natural points inside the three verify step functions, reusing the existing `log()`/`console.warn` mechanism unmodified — no new logging infrastructure. Retry and workflow-outcome-change logging is unchanged and now naturally covers verification too, since `verify_*` phases flow through the same `CRITICAL_STEPS`-gated branch deletion failures already used.

### `src/core/account-deletion/workflow-types.ts`

- `CheckpointResourceStatus` extended to 4 values (`+ "inconclusive"`, TDD §6.1).
- `CheckpointEntry` gains optional `remainingCount?: number` (TDD §6.2).
- `DeletionWorkflowResult` gains `checkpoint: CheckpointEntry[]` (TDD §4.6).

### Explicitly unchanged (out of Phase 5C scope, per the task brief)

`src/app/api/emma/gdpr/route.ts` (no `verification` response field — WP7), `src/app/settings/privacy/page.tsx`, `vercel.json`. No API response change, no UI change, no deployment change.

---

## Test results

- **New test file:** `tests/unit/verification-workflow.test.ts` — 22 tests covering `stepVerifyDatabase`/`stepVerifyStorage`/`stepVerifyExternal` end-to-end (via `runDeletionWorkflow`, since these are internal, non-exported functions — tested through the public API exactly as this codebase's existing convention does), workflow outcome authority, and `DeletionWorkflowResult.checkpoint` population on every return path including the `ConcurrentModificationError` branch.
- **Mandatory regression tests — both present and passing:**
  - **Marker Defect Regression** (TDD §9 scenario 15, the original CRITICAL finding): a confirmed database defect is never masked — 4 sequential calls against a persistently-dirty table produce `retry_pending → retry_pending → retry_pending → failed`, **never** `completed`; the guard never fires while the marker is `"failed"`; `verifyUserOwnedDataDeleted()` is called again for real on every retry.
  - **Storage Undercount Regression** (TDD §9 scenario 17, the Revision 3 finding): the per-resource guard pushes zero entries when it fires; a genuinely-verified-clean bucket's evidence is never replaced by a `"skipped"` placeholder across a retry triggered by a different resource.
  - **Resume Regression**: repeated retries, repeated resumes, partial interruptions, and — critically — a pre-Phase-5C row with only the old per-resource `"skipped"` placeholders (no marker) correctly re-runs real verification on its first post-deploy resume rather than being misread as already-verified.
- **Existing tests updated, not weakened:** `tests/unit/deletion-workflow.test.ts` — 4 tests updated to reflect the legitimate new behavior (verification now runs and calls its own RPC), each preserving its original guarantee precisely (e.g., "resumes... skipping already-completed steps" now asserts the _delete_ RPC specifically isn't re-invoked, rather than asserting no RPC call at all). `tests/unit/verification-framework.test.ts` — the Phase 5B "feature isolation" checks (which asserted `workflow.ts` stayed inert) were retired with an explanatory comment, since Phase 5C's entire purpose is to activate exactly what those checks protected; the one still-true check (route.ts/WP7 untouched) was kept.
- **Full suite:** `npx vitest run` → **774 passed, 3 skipped (pre-existing, unrelated), 0 failed**, 64 test files.
- **`npx tsc --noEmit`:** clean.
- **`npx eslint`:** 0 errors (23 pre-existing warnings, all in unrelated files this phase didn't touch).

---

## Independent Workflow Review

A fresh-context subagent, briefed with an explicit adversarial mandate ("attempt to prove the workflow can produce an incorrect outcome," not merely compare code structure to the spec), reviewed the actual diff against ADR-0005, the Phase 4B TDD, and the Phase 5A plan — running the test suite itself, reading `git diff` directly, and specifically attempting to reproduce this subsystem's own documented defect shapes (the unconditional-marker CRITICAL finding, the Revision 2 retry-history-summing bug, the Revision 3 storage-placeholder-undercount bug) against the actual shipped code.

**Result: no CRITICAL or MAJOR finding.** Every attempted invalidation failed to reproduce a defect:

- Traced `verificationMarkerStatus()` directly — status is recomputed fresh from the current run's entries on every call, never hardcoded; a live 4-call regression run never reached `"completed"` while a defect persisted.
- Confirmed `stepVerifyStorage`'s guard contains no `checkpointEntry(...)` call in its fire branch at all — a live 2-call retry sequence left a genuinely-clean bucket's original `"completed"` entry untouched, never replaced by a placeholder.
- Confirmed `CRITICAL_STEPS`'s widened array feeds the pre-existing, textually-unmodified escalation branch, and that `"inconclusive"` is excluded from it by construction — verified both directions (a verification failure blocks completion; an inconclusive-only result does not).
- Counted all 7 `return` statements in `runDeletionWorkflow()` and confirmed each sets `checkpoint` correctly, including the `ConcurrentModificationError` branch's `current?.checkpoint ?? row.checkpoint`.
- Confirmed the pre-Phase-5C backward-compatibility hazard (old per-resource `"skipped"` placeholders, no marker) is correctly handled — real verification runs on first post-deploy resume.
- Confirmed zero new module-level mutable state, `persist()`'s optimistic-concurrency mechanism byte-for-byte unmodified, and zero diff hunks touching any deletion-phase step function.

One MINOR finding, resolved in this revision: the reviewer noted the test suite asserted `DeletionWorkflowResult.checkpoint` directly for only 2 of 7 return paths (verified correct by code reading in all 7, but not independently pinned by a test for 5 of them) — most notably the `ConcurrentModificationError` branch, the one place the population rule deliberately diverges from the blanket `row.checkpoint` default. **Resolved:** two new tests added (`PermanentStepError` branch; a deterministic `ConcurrentModificationError` reproduction confirming `result.checkpoint` comes from the freshly re-fetched `current` row, not the workflow's own stale local `row`). Two OBSERVATIONs (both cosmetic/expected-behavior, non-blocking) were recorded and left as-is.

---

## Confirmation: follows ADR-0005 Revision 3 without architectural deviation

- **Registry remains authoritative:** every verification target is derived from `toVerificationTargets()`/`getVerifiableDatabaseResources()` (Phase 5B); no hardcoded resourceId list appears anywhere in this diff.
- **Resume safety:** every verify step reuses the existing `isPhaseCompleted()` guard mechanism unmodified; no parallel checkpoint semantics introduced.
- **Retry determinism:** `MAX_RETRY_COUNT = 3` reused unchanged; a retry's outcome depends only on the current call's real re-verification, never on which prior attempt happened to run first.
- **Verification authority:** `CRITICAL_STEPS` is the one and only mechanism that makes a verification failure load-bearing for `status`; the branch it feeds is unmodified.
- **No hidden state:** every fact this phase adds (marker status, per-resource evidence, `remainingCount`) lives in `deletion_requests.checkpoint`, reconstructable on any resume; no transient workflow-only variable carries decision-relevant state across a call boundary.
- **No architectural redesign:** no new persistence model, no new adapter interface, no new Registry field, no new `STATE_ORDER` state. Every mechanism traces to an exact TDD subsection cited inline in the code's own comments.

---

## Related

- [Phase 5A Implementation Plan](2026-07-20-account-deletion-phase5a-implementation-plan.md) (WP5)
- [Phase 5A Independent Planning Review](2026-07-20-account-deletion-phase5a-independent-review.md)
- [Phase 5B Core Infrastructure Implementation Report](2026-07-20-account-deletion-phase5b-implementation-report.md)
- [Phase 4B Technical Design Document](2026-07-18-account-deletion-phase4b-technical-design.md) (Accepted, Revision 3) §4, §5, §6, §9
- [ADR-0005: Account Deletion Verification Architecture](../adr/0005-account-deletion-verification-architecture.md) (Accepted)
- [Account Deletion Roadmap v1.0 (Frozen)](../roadmaps/account-deletion-roadmap-v1.md)
- `src/core/account-deletion/{workflow.ts,workflow-types.ts}`
- `tests/unit/{verification-workflow,deletion-workflow,verification-framework}.test.ts`
