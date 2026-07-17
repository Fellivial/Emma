# Account Deletion Phase 3.1 — Live Production Validation Report

**Status:** Complete.
**Written:** 2026-07-17.
**Target:** the linked "Emma" Supabase project (`frwabkgvzjwfcmbpikir`) — the same project Phase 2.1 validated against.
**Script:** `scripts/validate-deletion-workflow-live.ts` (kept in the repo as a re-runnable runbook).

---

## What was tested and how

Phase 2.1 demonstrated that mocked tests are not sufficient for this codebase — it found two real bugs (a `text`/`uuid` type mismatch, an ambiguous column reference) in the transactional SQL function that no mock could have caught. This phase repeats that discipline for the Phase 3/3.1 workflow orchestrator, which had never been run against a real database before.

**Method:** a standalone script creates one disposable `auth.users` row via the Supabase Admin API (satisfying `deletion_requests.user_id`'s FK, which requires a real `auth.users` row — a synthetic UUID would not satisfy it), exercises the real `runDeletionWorkflow()`/`findActiveDeletionRequest()` functions against it over the real network, and deletes the disposable user (cascading away every row it created) in a `finally` block. No real user data was touched at any point; this was independently re-verified after each run (see **Cleanup verification** below).

**What could not be tested as originally planned, and why:** the original plan's script assumed a "full run reaches completed" scenario would be achievable. The first live run instead found that the real `deleteUserOwnedData()` RPC call cannot currently succeed on this environment at all — see **Major finding** below. Rather than working around this by touching the live schema (declined — out of scope) or the Registry/production code (would misrepresent what's actually being validated), the script was revised to test everything that doesn't depend on `deleting_database` succeeding, plus the retry/failure path this gap incidentally makes exercisable for the first time against real Postgres.

---

## Results

**7/7 scenarios passed** (final, revised script):

| #   | Scenario                                                                                                                                                                                            | Result                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `findActiveDeletionRequest()`'s real `.not("status","in","(completed,cancelled)")` PostgREST filter returns `null` for a user with no row                                                           | PASS                                                                                                                                  |
| 2   | Retry escalation: `deleting_database` fails → `retry_pending` → `retry_pending` → `retry_pending` → `failed`, exactly matching `MAX_RETRY_COUNT=3` semantics previously verified only against mocks | PASS — reached `failed` after 4 real network calls                                                                                    |
| 3   | Checkpoint persists and reads back correctly through real PostgREST, including the real captured RPC error message (`unknown column: document_chunks.user_id`)                                      | PASS — `checkpointLen=7`, error captured verbatim                                                                                     |
| 4   | A permanently-`failed` row is not silently restarted on a later call (the Phase 3 `c4292ea`/`f3d675d` fix) — confirmed live, not just in mocks                                                      | PASS — same `requestId` returned, no restart                                                                                          |
| 5   | **Concurrent requests over the real network** (not mocked jitter): two genuinely concurrent `runDeletionWorkflow()` calls for the same new user                                                     | PASS — exactly one `deletion_requests` row, both calls resolved without throwing (one conceded per Task 1's fix, the other continued) |
| 6   | RLS: an anon client cannot write `deletion_requests` (checked via `.select()` after the write to distinguish a silently-filtered zero-row RLS result from an actual unauthorized write)             | PASS — zero rows affected, no write occurred                                                                                          |
| 7   | RLS: an anon client (no session) cannot read another user's `deletion_requests` row                                                                                                                 | PASS — zero rows returned                                                                                                             |

Scenario 5 is the most load-bearing result of this whole validation pass: it is the first time Task 1's concurrency fix was exercised against real Postgres over real network latency rather than an artificially-jittered mock, and it produced exactly the intended outcome.

## Bugs found

### 1. `document_chunks.user_id` does not exist on the linked "Emma" project — MAJOR, NOT FIXED (disclosed, per explicit user decision)

Isolated by calling the RPC directly with the full 32-table Registry list: `error.message === "unknown column: document_chunks.user_id"`. Narrowing to a single-table call (`profiles` only) succeeded, confirming the RPC mechanism and permissions are fine — the failure is specific to this table.

This is not a newly-discovered category of problem: the Technical Design Document's own "Phase 2.1: what live validation actually found" section already disclosed that `document_chunks`, `personas`, `push_subscriptions`, and `proactive_daily` "could not be exercised on that particular project," attributing it to those four tables' definitions existing only in `schema.sql`, never as tracked migrations. What's new here: Phase 2.1 sidestepped this by testing the RPC with an adjusted table list; this phase's validation calls the **real production code path** (`runDeletionWorkflow` → `deleteUserOwnedData`, exactly as `POST /api/emma/gdpr` invokes it) and found that path **cannot currently complete a real deletion on this environment at all** — every real request against it retries 3 times and then permanently fails.

**Why this was not fixed:** the user was asked directly whether to (a) document only and work around it in the validation script, (b) fix the live schema now, or (c) stop live validation entirely, and explicitly chose (a). Touching a live, linked Supabase project's schema is a real, hard-to-reverse infrastructure change this phase's scope (`Do not implement... schema redesign`) does not authorize, and doing so without a clear picture of why the gap exists (a genuine provisioning gap vs. an intentional divergence) would risk masking the real question, which is whether **production** has the same gap.

**Scope of the finding:** confirmed directly for `document_chunks.user_id` only. The parenthetical claim in an earlier draft of this phase's documentation that the other three tables "likely" share the same defect was reviewed and corrected — it was not tested and should not be asserted. What _is_ shared and confirmed across all four is the migration-tracking gap category (defined only in `schema.sql`, never in a versioned migration file), which is a different, weaker claim than "also missing a column."

**Open question this phase cannot answer:** whether production has the same gap. That requires someone with access to production's actual schema state to check — out of this phase's ability to verify from here.

## Bugs fixed

None found live beyond what Task 1 (informed by the earlier mock reproduction) already fixed before this validation ran. Live validation's job here was to confirm that fix and surface anything mocks couldn't — it did both: confirmed the concurrency fix works for real, and surfaced the schema gap above.

## Cleanup verification

After every script run (including two exploratory diagnostic runs used to isolate the `document_chunks` error), a follow-up check confirmed: zero disposable `phase31-*@example.invalid` auth users remained, and zero `deletion_requests` rows were left behind. No real user data was created, read beyond existence checks, or modified at any point.

## What was intentionally not tested

- **Full end-to-end completion** (`deleting_database` actually succeeding) — blocked by the schema gap above; not achievable on this environment without touching live schema (declined).
- **Storage adapter behavior against real Storage buckets** — out of this phase's scope; Phase 2.1 already validated Storage adapters live, and Task 1's fix does not touch Storage code paths.
- **Rollback behavior of the transactional RPC itself** — already validated live by Phase 2.1; not re-tested here since Phase 3.1 doesn't touch the RPC.
