# Account Deletion Phase 3 — Production Readiness Report

**Status:** Implemented and merged into `feat/account-deletion-p2-hardening` (not yet merged to `main`).
**Written:** 2026-07-16.
**Implementation:** `src/core/account-deletion/workflow.ts`, `src/core/account-deletion/workflow-types.ts`, `src/core/account-deletion/registry.ts` (additive), `src/core/account-deletion/adapters/storage-bucket-adapter.ts`, `src/app/api/emma/gdpr/route.ts`.
**Plan:** [`docs/superpowers/plans/2026-07-16-account-deletion-phase3-workflow-orchestrator.md`](../superpowers/plans/2026-07-16-account-deletion-phase3-workflow-orchestrator.md), executed via `superpowers:subagent-driven-development` (6 tasks, each implemented by a fresh subagent and independently task-reviewed; 5 of 6 tasks required at least one fix-and-re-review round before approval — see **Test results** for the full list).

---

## Workflow design

State machine, exactly the ADR-0004 / `deletion_requests` status enum (no invented states): `requested → validating → waiting_grace_period → locked → deleting_database → deleting_storage → deleting_oauth → deleting_background_jobs → verify_database → verify_storage → verify_external → completed`, with `retry_pending`/`failed`/`cancelled` as side states.

Progress persistence uses **no new schema** — this was confirmed with the user before implementation began, because the commissioning instruction's field list (`current_step`/`completed_steps`/`started_at`/`failed_at`/`failure_reason`) doesn't exist as columns on the already-accepted `deletion_requests` table. The mapping used instead:

| Instruction's concept              | Where it actually lives                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `current_step` / `completed_steps` | Derived from the `checkpoint jsonb` array's `{phase, resourceId, subResourceMarker, resourceStatus}` entries |
| `started_at`                       | The existing `requested_at` column                                                                           |
| `failed_at` / `failure_reason`     | Recorded inside the failing checkpoint entry's own `recordedAt`/`error` fields                               |

**Critical vs. best-effort steps** — only `deleting_database` (the one atomic, transactional step) is retry/fail-critical: its failure increments `retry_count`, staying at `retry_pending` until `MAX_RETRY_COUNT` (3) is exceeded, then escalating to `failed`. Every other step (Storage delete/verify, the no-adapter oauth/background-jobs skip, database-verify skip) is **best-effort**, carrying forward ADR-0004's already-accepted trade-off for Storage ("a Storage failure is logged and reported... but never fails the request") into the orchestrator's retry logic rather than tightening it unilaterally.

**Resumability** comes from re-invocation, not a scheduler: `deletion_requests_one_active_per_user`'s unique index (which deliberately does not exclude `retry_pending` or `failed`, per the Phase 1 migration's own comment) means a second call for the same user finds the existing row and resumes from the last completed checkpoint entry instead of restarting — except for `failed` rows, which are treated as terminal (see **Design rationale**, item 5).

---

## File changes

```
 src/app/api/emma/gdpr/route.ts                     |  82 ++--
 .../adapters/storage-bucket-adapter.ts             |  31 +-
 src/core/account-deletion/registry.ts              |  14 +
 src/core/account-deletion/workflow-types.ts        |  61 +++ (new)
 src/core/account-deletion/workflow.ts              | 469 +++ (new)
 tests/unit/deletion-adapter.test.ts                |  49 ++-
 tests/unit/deletion-workflow.test.ts               | 401 +++ (new)
 tests/unit/gdpr-workflow-integration.test.ts        | 133 +++ (new)
 tests/unit/registry.test.ts                        |  17 +
 9 files changed, 1199 insertions(+), 58 deletions(-)
```

(`git diff --stat b334814..1995c5e`, `b334814` = branch state before Phase 3 began.)

10 commits total (5 feature/task commits + 5 fix commits from review rounds) — see **Test results** for the full commit list.

---

## Design rationale

Five disclosed interpretation calls made during this phase, each either confirmed with the user or resolved during implementation review:

1. **`deletion_requests` field-mapping (checkpoint-jsonb vs. new columns)** — confirmed with the user before writing the plan (see table above). No migration added.
2. **`waiting_grace_period` implemented as a real but unscheduled halt.** The step genuinely checks `grace_period_ends_at` and halts progression if it's in the future, but nothing sets that column yet, and no scheduler wakes a halted workflow automatically — a scheduler/background worker was explicitly out of scope for this phase. Resumption relies entirely on the next re-invocation of `runDeletionWorkflow`.
3. **`verify_database` implemented as a Registry-driven "no verificationAdapter configured" pass-through**, rather than inventing ad hoc per-table existence checks not modeled anywhere in the Registry schema. Every database resource's `verificationAdapter` field is `null` today; real per-table verification is deferred to whichever future phase populates it.
4. **Storage `verify()` implemented for real** (re-lists the user's folder independently of `delete()`'s own report) since ADR-0004 explicitly named this as reserved for Phase 3 ("`verify()` reserved for Phase 3's verification engine"), not left as the Phase 2 stub.
5. **A permanently-`failed` `deletion_requests` row is treated as terminal, not resumed.** This was _not_ anticipated in the original plan and was caught by task review (Task 4): `deletion_requests_one_active_per_user` deliberately keeps `failed` rows "active" (per the Phase 1 migration's own comment — a failed workflow should block a second concurrent request until it truly finishes), which meant a naive resume implementation would silently restart the entire workflow from `validating` on the next call, re-attempting a database delete that had already permanently failed. Fixed: `runDeletionWorkflow` now returns immediately with `status: "failed"` for such a row instead of restarting it. Recovering a failed workflow (retry/cancel) is out of scope for this phase — no such endpoint exists.

---

## Compliance with ADR-0004

- **Registry** — untouched except one additive, pure derivation function (`getResourcesByPhase`), mirroring the existing `toUserOwnedDeleteOrder()`/`toGdprExportTables()` pattern. No existing entry, field, or exported function changed.
- **Transactional SQL engine** (`delete_user_owned_data_ordered`) — untouched. The orchestrator calls the existing `deleteUserOwnedData()` wrapper exactly as before; it is now typed against the real `SupabaseClient` (a fix made during Task 3 review, replacing an `as never` cast that had disabled compile-time checking on this call).
- **`DeletionAdapter` interface** — untouched (`prepare`/`delete`/`verify`/`cleanup` signatures unchanged). Only one adapter's `verify()` _body_ was implemented for real, fulfilling a promise the interface's own Phase 2 comment already made.
- **Storage best-effort guarantee** — preserved and extended into the orchestrator's retry logic (see **Workflow design**): a Storage failure is recorded but never escalates to `retry_pending`/`failed`.
- **`workflowVersion` semantics** — unchanged (pinned at `1` everywhere); now actually read/written by `createDeletionRequest`/checkpointing for the first time, as anticipated by ADR-0004's "Future Orchestration Boundary" section.
- **No new Supabase migration.**

---

## Test results

Full suite, run at the end of Task 6: **725 passed, 3 skipped (pre-existing), 0 failures**, across 61 test files (up from the 705-passed/3-skipped baseline recorded before Phase 3 began). `npx tsc --noEmit`: clean. `npm run lint`: 0 errors, 10 pre-existing warnings (all in `src/app/settings/usage/page.tsx`, `src/app/settings/notifications/page.tsx`, `src/components/InputBar.tsx` — none of these files are touched by this phase).

Commit history for this phase (`git log --oneline b334814..1995c5e`), showing every task and every fix round a task review required:

```
1995c5e test(gdpr): lock in confirmEmail-before-DB-config-check precedence           [Task 5, fix round]
a7bf294 feat(gdpr): wire GDPR delete endpoint to the Phase 3 deletion workflow       [Task 5]
f3d675d fix(gdpr): stop silently restarting permanently-failed deletion workflows     [Task 4, fix round]
dd30f38 feat(gdpr): implement Phase 3 deletion workflow state machine...             [Task 4]
165680e fix(gdpr): swallow storage adapter cleanup() failures instead of aborting     [Task 3, fix round 2]
0fa4213 fix(gdpr): tighten workflow Supabase typing, always run storage cleanup       [Task 3, fix round 1]
1f874f7 feat(gdpr): add Phase 3 step executors and real Storage verify()             [Task 3]
7f741a7 fix(gdpr): persist grace_period_ends_at/cancelled_at, fix tautological test   [Task 2, fix round]
4bdb447 feat(gdpr): add deletion_requests persistence layer for Phase 3 workflow      [Task 2]
148ac76 feat(gdpr): add Registry getResourcesByPhase() for Phase 3 orchestration      [Task 1]
```

Only Task 1 (the smallest, purely additive task) was approved on first review with zero findings. Every other task surfaced at least one genuine Important-severity issue during review — including two bugs in the plan's own prescribed code (Task 2's `persist()` silently dropping two fields from the actual DB write, and a tautological test that could never fail) and one bug introduced by a fix I dispatched myself (Task 3's `finally`-block `cleanup()` call, which would have aborted the whole storage-deletion loop on a throwing `cleanup()`, caught by the very next re-review round). This is recorded plainly because it's evidence the review loop did real work, not a rubber stamp.

## Live validation

**Not performed.** All verification in this phase is unit-test-level, against mocked Supabase clients — no live database was touched. This differs from Phase 2.1, which did run against the linked disposable Supabase project (`frwabkgvzjwfcmbpikir`). Per this project's own recorded pattern of prior phases claiming validation that turned out not to exist, stating this plainly rather than implying otherwise: **the `deletion_requests` read/write paths (find/create/persist), the `not("status", "in", "(completed,cancelled)")` filter, and the unique-index-driven concurrency behavior have never been exercised against real Postgres.** The mocked test harness reimplements this filtering logic in JavaScript rather than proving PostgREST's actual `.not()` filter syntax and the real unique index behave as modeled. This is the same category of gap Phase 2.1 found real bugs in for the transactional SQL function (a `text`/`uuid` mismatch and an ambiguous column reference) that no mock could have caught — the same risk applies here and has not yet been retired.

## Production readiness

**Gates this phase closes:**

- Durable checkpointing of deletion progress (previously: none — a crash mid-deletion left no record beyond whatever the atomic SQL transaction had already committed).
- Resumability across a restart/deploy/crash, via re-invocation (no scheduler needed or built).
- A real retry-vs-permanent-failure distinction for the compliance-critical database step, bounded at `MAX_RETRY_COUNT = 3`.
- Real Storage `verify()` (previously a stub), independently re-checking deletion rather than trusting `delete()`'s own report.
- A permanently-failed workflow correctly reported as terminal rather than silently resurrected.

**Gates this phase does not close (explicitly out of scope, per the commissioning instruction):**

- Grace period _scheduling_ (the check is real; nothing sets the trigger or wakes a halted workflow).
- OAuth / background-job deletion adapters (still `deletionAdapter: null` in the Registry — these resources are recorded as "skipped," not deleted).
- Real per-table database verification (every `verificationAdapter` in the Registry is still `null`).
- Live-database validation of the new persistence/concurrency paths (see above).
- A manual retry/cancel path for a `failed` workflow.

**Recommendation: not yet fully production-ready without at least closing the live-validation gap**, given this exact codebase's own history (Phase 2.1) of finding real, mock-invisible bugs in structurally similar Supabase code. The state-machine logic itself is well-tested and was reviewed hard (5 of 6 tasks required fix rounds, all resolved); the risk that remains is specifically in the untested boundary between this code and real Postgres/PostgREST behavior.

## Known limitations

1. `waiting_grace_period` is unscheduled (see **Design rationale** #2).
2. `verify_database`/`verify_external` are Registry-driven pass-throughs, not real verification (see **Design rationale** #3).
3. A failed workflow has no recovery path — it stays `failed` forever unless something outside this phase (not built) intervenes.
4. Single-request synchronous execution model: there is no background worker, so a very large future resource count could make one HTTP request slow. Not observed as a problem at today's scale (37 registry entries, 2 real Storage adapters).
5. `deleting_oauth`/`deleting_background_jobs` are permanently "skipped" until a future phase adds real adapters — this is unchanged Phase 1/2 scope, just now visible in the checkpoint log instead of silently absent.
6. **Client-side gap surfaced during Task 5's review, outside this plan's scope:** `src/app/settings/privacy/page.tsx`'s delete-account UI only checks `res.ok` before showing a success message. Since `runDeletionWorkflow` can now return `status: "retry_pending"` or `"failed"` while the route still responds with HTTP 200, a user whose deletion is only retry-pending or has permanently failed will currently be told it succeeded. This file was never in this plan's File Structure and was not modified — flagging it here as a real, user-facing correctness gap that should be a follow-up task, not something silently patched in as scope creep on this one.
7. `retry_count` is never reset to 0 after `deleting_database` eventually succeeds following a prior retry — cosmetically stale in a `completed` row's audit trail, functionally inert (Minor, noted during Task 4 review).
8. Checkpoint entries accumulate a fresh `"skipped: already completed"` entry for each already-finished resource on every resume at the same step — harmless log growth, not a correctness issue (Minor, noted during Task 3/4 review).

## Explicit architecture compliance statement

No conflict was found during this phase that required stopping and escalating architectural authority to the user, **except the one resolved before implementation began**: the commissioning instruction's `deletion_requests` field list didn't match the actual, already-accepted schema, and the resolution (map onto the existing `checkpoint`/`requested_at` mechanism, no migration) was confirmed with the user up front. One additional judgment call — treating a `failed` row as terminal rather than resumable — was made during implementation (caught by task review, not anticipated by the plan) and is recorded here rather than treated as a silent fix. Every other decision in this phase either follows the plan directly or is one of the five disclosed interpretation calls listed above; none of them change the Registry, the transactional SQL engine, or the `DeletionAdapter` interface, per the instruction's explicit constraints.

---

## Addendum (2026-07-17, Phase 3.1)

Two things in this report are now stale as written:

1. **Known limitation #6** (client-side false-success gap in `privacy/page.tsx`) was fixed one commit after this report was written, in `c4292ea` — this report was never updated to reflect that at the time. Recorded here rather than silently edited away.
2. **The "not yet fully production-ready" recommendation** in this report's own **Production readiness** section named two gaps: no live-database validation, and an implicit trust that the untested concurrent-request path was safe. Phase 3.1 closed both — see the Phase 3.1 Hardening Report and Live Production Validation Report for what was found and fixed, including a real, measured double-execution bug in this exact code that this report did not know to look for.
3. **Live validation (Phase 3.1, Task 2) found the real `deleteUserOwnedData()` RPC call cannot currently complete successfully on the linked "Emma" Supabase project** — it is missing `document_chunks.user_id` (and, per the same disclosed gap as `document_chunks`/`personas`/`push_subscriptions`/`proactive_daily` above, likely the other three as well), so every real deletion request against this environment retries 3 times and then permanently fails at `deleting_database`. This was not fixed here — touching the live schema was explicitly out of scope for this phase — but it is a real, live-verified result, not a hypothetical one. See the Phase 3.1 Live Production Validation Report for the full evidence log. Whether production has the same gap is unknown and needs separate confirmation before this workflow can be considered safe to rely on there.

This report's **Workflow design**, **File changes**, **Design rationale**, and **Compliance with ADR-0004** sections remain accurate as a historical record of what Phase 3 shipped and are not edited further.
