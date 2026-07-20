# Account Deletion — Phase 5D API Surface Integration Report

**Status:** Complete. Independent API Review: no unresolved CRITICAL or MAJOR finding.
**Written:** 2026-07-21.
**Roadmap:** [Account Deletion Roadmap v1.0 (Frozen)](../roadmaps/account-deletion-roadmap-v1.md) — Phase 4 (Verification), Engineering Workflow step 8 ("Implementation"), third and final implementation slice.
**Scope:** Implements [Phase 5A's](2026-07-20-account-deletion-phase5a-implementation-plan.md) WP7 (API Surface) — exposing `runDeletionWorkflow()`'s `DeletionWorkflowResult.checkpoint` (Phase 5C) as a stable `verification` field on `POST /api/emma/gdpr`'s delete response.
**Authority implemented against:** [ADR-0005](../adr/0005-account-deletion-verification-architecture.md) (Accepted), the accepted [Phase 4B Technical Design Document](2026-07-18-account-deletion-phase4b-technical-design.md) (Revision 3) §7 (API Design), and the [Phase 5C Workflow Integration Report](2026-07-21-account-deletion-phase5c-workflow-integration-report.md) (the data source this phase reads from, unmodified).

---

## Scope of what changed

### `src/app/api/emma/gdpr/route.ts`

- **`computeVerificationRollup(checkpoint)`** (new, exported for testability): implements TDD §7.1's two-step reduction algorithm exactly —
  1. Exclude synthetic marker entries (`resourceId === "db.verification-batch"` or `"external.verification-batch"`).
  2. Deduplicate by keeping only the latest-`recordedAt` entry per `(phase, resourceId)` among survivors of step 1.
  3. Count `resourceStatus` occurrences per phase group, mapped `verified`/`failed`/`inconclusive`/`skipped` ↔ `"completed"`/`"failed"`/`"inconclusive"`/`"skipped"`.
- **`VerificationCounts`/`VerificationRollup`** (new, exported types): the four-field-per-bucket, three-bucket (`database`/`storage`/`external`) shape specified in TDD §7.1.
- **`POST`'s delete branch**: gains one new field, `verification: computeVerificationRollup(result.checkpoint)`, placed as a sibling of `summary` (TDD §7.2). `success`, `status`, `deletedAt`, `summary`, `note` are unmodified in type and computation.
- **No workflow, checkpoint, registry, or SQL change of any kind.** `computeVerificationRollup()` only counts and groups `resourceStatus` values `workflow.ts`'s step functions already assigned in Phase 5C — it makes no verification decision of its own.

### Explicitly unchanged (out of Phase 5D scope, per the task brief)

`src/core/account-deletion/workflow.ts`, `workflow-types.ts`, `gdpr-data.ts`, `registry.ts`, any migration, `src/app/settings/privacy/page.tsx`, `vercel.json`. No retry/resume/checkpoint-generation behavior changed.

### `tests/unit/verification-framework.test.ts`

- The Phase 5C "scope boundary — workflow activated, API surface still untouched" check (which asserted `route.ts` contained no `verification:` field) is retired, with an explanatory comment, for the same reason Phase 5C itself retired Phase 5B's analogous workflow-isolation checks: Phase 5D's entire purpose is to build exactly what that check asserted stayed inert. Real coverage for the now-wired API surface lives in the two files below.

---

## Test results

- **`tests/unit/gdpr.test.ts`** — new `describe("computeVerificationRollup — Phase 5D (WP7, TDD §7.1)")` block, 8 tests: empty-checkpoint all-zero counts; per-status mapping across all three buckets; database marker exclusion (32, not 33); external marker exclusion; **retry-dedup regression (scenario 16 analog)** — a two-attempt sequence (first attempt: 1 failed + 1 completed + failed marker; retry: both completed + completed marker) rolls up to `{verified: 2, failed: 0}`, not `{verified: 3, failed: 1}`; **storage no-dedup-needed regression (scenario 17 analog)** — a guard-fires-pushes-nothing retry sequence rolls up to `{verified: 2}`, not `{verified: 1, skipped: 1}`; bucket independence; non-verification-phase entries ignored.
- **`tests/unit/gdpr-workflow-integration.test.ts`** — new `describe("POST /api/emma/gdpr delete — Phase 5D verification response field")` block, 2 tests, exercising the full request → `runDeletionWorkflow()` → response path with a function-name-aware fake RPC (distinguishing `delete_user_owned_data_ordered` from `verify_user_owned_data_deleted`, unlike the pre-existing single-shape mock used elsewhere in this file):
  - A clean run reports `verification.database.verified === toVerificationTargets().length` (derived from the Registry, not hardcoded), `verification.external.skipped === 2`, and confirms all pre-existing fields (`success`, `status`, `deletedAt`, `summary`, `note`) keep their exact prior shape — the backward-compatibility assertion.
  - A run where the verify RPC reports one non-empty table asserts `body.success === false`, `body.status === "retry_pending"`, and `verification.database.failed === 1` — the regression rule most core to Phase 5D: **the API cannot report verification success when the workflow reports failure**.
- **Full suite:** `npx vitest run` → **783 passed, 3 skipped (pre-existing, unrelated), 0 failed**, 65 test files (64 passed, 1 skipped by design).
- **`npx tsc --noEmit`:** clean.
- **`npx eslint` (changed files) and `npm run lint` (full project):** 0 errors; 10 pre-existing warnings, all in files this phase didn't touch (`settings/usage/page.tsx`, `InputBar.tsx` — unrelated React-hooks-purity/effect lint rules).

---

## Independent API Review

A fresh-context subagent (`everything-claude-code:code-reviewer`), briefed with an explicit adversarial mandate ("try to prove the change is wrong, not just confirm it looks reasonable"), reviewed the actual `git diff` directly (not a summary of it), re-ran the test suite itself, and ran its own `tsc --noEmit`.

**Verdict: Approve. No CRITICAL or MAJOR finding.**

- Confirmed `git diff` against `workflow.ts`/`workflow-types.ts` is empty — the "purely additive/presentational" claim holds structurally, not just by assertion.
- Traced `computeVerificationRollup()` line by line against the Phase 5C step functions: it only filters, groups by `(phase, resourceId)`, keeps the latest `recordedAt`, and increments counters over the closed 4-value `CheckpointResourceStatus` union — no new deletion/retry/marker-status decision is made in `route.ts`.
- Confirmed marker exclusion happens in the same loop _before_ the dedup `Map.set`, matching TDD §7.1's step 1→2→3 order — a marker can never reach the counting loop.
- Manually traced `runDeletionWorkflow`'s cumulative checkpoint accumulation (`workflow.ts:689`) against the dedup's `recordedAt` comparison and could not construct a checkpoint array producing inflated or self-contradictory totals; the scenario-16-style regression test in `gdpr.test.ts` covers this and passes.
- Checked `STATE_ORDER` (`workflow.ts:549-560`): the three verify phases are the last `CRITICAL_STEPS` before `completed`, so it is structurally impossible for `status === "completed"` to coexist with a non-zero `failed` count in any verify bucket, or vice versa.
- Confirmed `success`/`status`/`deletedAt`/`summary`/`note` are byte-for-byte unchanged (`route.ts:211-220`), and grepped `src/app/settings/privacy/page.tsx` (the one existing consumer) to confirm it references nothing new.
- Confirmed the counting switch is exhaustive over the closed status union and counts only ever `++` from 0 — no `undefined`/`NaN` serialization path.
- Confirmed the response only ever reads `.phase`/`.resourceId`/`.resourceStatus`/`.recordedAt` off `CheckpointEntry` — `detail`, `error`, `subResourceMarker`, `remainingCount` are never touched, let alone exposed.
- Independently re-ran `tests/unit/{gdpr,gdpr-workflow-integration,verification-framework}.test.ts` (29 tests) plus the adjacent `deletion-workflow.test.ts`/`verification-workflow.test.ts` (37 tests) and a full `tsc --noEmit` — all passed/clean, confirming the claimed results were real rather than merely asserted.

**MINOR** (accepted, not blocking): the retired `verification-framework.test.ts` scope-boundary check was removed in favor of an explanatory comment rather than converted into a positive "the field now exists and shouldn't regress" assertion. Low risk — the positive behavior is already covered by `gdpr.test.ts` and `gdpr-workflow-integration.test.ts` — but noted as a documentation-completeness nit for anyone reading that file in isolation.

**OBSERVATION** (inherent to the design, not a defect): when a critical step fails before any verify phase runs (e.g. `deleting_database` itself), all three `verification` buckets report all-zero, which a client naively summing counts without first checking `status` could misread as "nothing to worry about" rather than "verification never ran." This is the same informational-only posture already stated in `docs/reference-api.md`'s client-behavior note (TDD §7.4) — not something this diff introduces or could reasonably change within Phase 5D's scope.

---

## Confirmation: follows ADR-0005 and the Phase 4B TDD without architectural deviation

- **Workflow remains authoritative:** every count originates from `DeletionWorkflowResult.checkpoint`; no verification result is computed, inferred, or overridden by the API layer.
- **No duplicated business logic:** `computeVerificationRollup()` counts and groups; it does not re-derive `resourceStatus`, re-run any check, or make any pass/fail decision the workflow didn't already make.
- **Backward compatibility:** confirmed by test — `success`/`status`/`deletedAt`/`summary`/`note` unchanged in type and truthy/falsy semantics; `verification` is purely additive.
- **Stable public contract:** only counts are exposed; no checkpoint internals (`detail`, `error`, `subResourceMarker`, `remainingCount`) leak into the response.
- **No workflow modification:** zero diff hunks touch `workflow.ts`, `workflow-types.ts`, `gdpr-data.ts`, `registry.ts`, or any migration.

---

## Related

- [Phase 5A Implementation Plan](2026-07-20-account-deletion-phase5a-implementation-plan.md) (WP7)
- [Phase 5C Workflow Integration Report](2026-07-21-account-deletion-phase5c-workflow-integration-report.md) (the data source this phase reads from)
- [Phase 4B Technical Design Document](2026-07-18-account-deletion-phase4b-technical-design.md) (Accepted, Revision 3) §7
- [ADR-0005: Account Deletion Verification Architecture](../adr/0005-account-deletion-verification-architecture.md) (Accepted)
- [Account Deletion Roadmap v1.0 (Frozen)](../roadmaps/account-deletion-roadmap-v1.md)
- [docs/reference-api.md](../reference-api.md) — GDPR endpoint documentation, updated with the new `verification` field
- `src/app/api/emma/gdpr/route.ts`
- `tests/unit/{gdpr,gdpr-workflow-integration,verification-framework}.test.ts`
