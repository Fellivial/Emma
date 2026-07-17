# Account Deletion Phase 3.1 — Hardening & Production Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the gaps Phase 3's independent verification found — a proven concurrent-execution race in the workflow's persistence layer, zero live-database validation, and stale architecture documentation — without adding any Phase 4 capability.

**Architecture:** Add optimistic concurrency control (compare-and-swap on `updated_at`) to `workflow.ts`'s existing `persist()` function so two overlapping `runDeletionWorkflow()` calls for the same user can no longer both drive the same row and duplicate side-effecting work. Validate the whole workflow against the real, already-linked "Emma" Supabase project (`frwabkgvzjwfcmbpikir`) using a disposable auth user. Bring ADR-0004, the Technical Design Document, and the Phase 3 Production Readiness Report back in sync with what's actually shipped.

**Tech Stack:** TypeScript, `@supabase/supabase-js`, Vitest, `npx supabase` CLI (already linked to the Emma project).

## Global Constraints

- Do not modify: `registry.ts`'s resource inventory, the transactional SQL RPC (`delete_user_owned_data_ordered`), the `DeletionAdapter` interface, the `deletion_requests` schema (no new migration — `updated_at` already exists as a column, which is all the fix needs).
- Do not implement: grace-period scheduler, cron, reconciliation, metrics, operator dashboard, admin UI, OAuth/background-job deletion adapters, verification-engine expansion, notifications, email, queue redesign, workflow-shape redesign. Anything that smells like a new capability belongs to Phase 4, not here.
- The concurrency fix must be the smallest change that closes the proven race — optimistic concurrency on the existing `updated_at` column, not a new lock table, not a queue, not a distributed lock service.
- Every new test must lock in a real, previously-unverified behavior. Do not add tests for coverage's own sake.
- This phase produces four deliverables at the end (not per-task): a Hardening Report, a Live Production Validation Report, a Documentation Synchronization Report, and a Production Readiness Report. These are written by the controller after all tasks and the final whole-branch review are complete — not assigned as their own SDD tasks.

---

## Investigation already performed (context for Task 1 — do not re-derive)

Independent verification of Phase 3 flagged a _possible_ race but did not prove it. Before writing this plan, the race was reproduced and measured directly against `src/core/account-deletion/workflow.ts` as it exists on `main` today, using a throwaway Vitest file (`tests/unit/_repro-concurrency.test.ts`, deleted after use — not part of this plan's file structure) with artificial network jitter injected into every mocked Supabase call (real Postgres calls have real network latency; Vitest's default instant-resolving mocks let one async call fully outrun the other on the microtask queue and never actually interleave, which is why a naive reproduction attempt without jitter shows no bug).

**Result across 8 jittered trials, every single time:** `supabase.rpc` (the atomic `delete_user_owned_data_ordered` call) fires **twice** for one logical `runDeletionWorkflow()` invocation pair. The final persisted `checkpoint` array looks clean (correct entry counts, no visible duplication) purely because `persist()` replaces the whole `checkpoint` column on every write rather than merging — whichever of the two overlapping executions writes last silently overwrites the other's already-persisted progress with its own complete, but redundant, copy. The `deletion_requests_one_active_per_user` unique index only prevents a second **row**; nothing prevents two overlapping executions from independently driving the **same** adopted row through the entire state machine, each working off its own disconnected in-memory checkpoint snapshot that is never re-read from the database mid-run.

Root cause: `persist()` (`workflow.ts`) does an unconditional `UPDATE deletion_requests SET ... WHERE id = $1` with no check that the row hasn't been written by someone else since it was read. This is a textbook missing-compare-and-swap bug, not a hypothetical one — it was directly measured via `rpc.mock.calls.length === 2`.

**Practical severity:** the atomic database RPC and the Storage adapters are both idempotent by design, so a real double-invocation is very unlikely to corrupt user data today. What it genuinely breaks is the durability/audit-trail guarantee this phase exists to provide ("no duplicated work after retry," accurate checkpoint history) and wastes a full concurrent second transaction against 32 tables for every overlapping request. It would become a serious bug the moment any future non-idempotent step (e.g., a Phase 4 OAuth token revocation) is added on top of this foundation — which is exactly why this must be fixed before Phase 4, not after.

---

## File Structure

- **Modify** `src/core/account-deletion/workflow.ts` — add `ConcurrentModificationError`, make `persist()` conditional (compare-and-swap on `updated_at`), wrap `runDeletionWorkflow()`'s main loop to concede cleanly when it loses the race.
- **Modify** `tests/unit/deletion-workflow.test.ts` — update the fake Supabase `update()` chain to support the new `.eq().eq().select()` shape with real CAS semantics; add the permanent concurrency regression test (jittered, proving `rpc` is now called exactly once).
- **Modify** `tests/unit/gdpr-workflow-integration.test.ts` — same fake-chain update (it has its own separate inline mock), no behavior change to its existing assertions.
- **Create** `scripts/validate-deletion-workflow-live.ts` — live-database validation script (kept in the repo afterward as a re-runnable runbook, matching the existing `scripts/validate-backup-health.ts` precedent).
- **Modify** `docs/adr/0004-account-deletion-architecture.md` — reflect that Phase 3 (orchestrator) and Phase 3.1 (hardening) have shipped.
- **Modify** `docs/plans/2026-07-16-account-deletion-technical-design.md` — reflect the same; the "Future Orchestration Boundary" and "Non-Goals" sections currently assert things that are no longer true.
- **Modify** `docs/plans/2026-07-16-account-deletion-phase3-production-readiness.md` — add an addendum noting Known Limitation #6 was fixed in `c4292ea` (predates this phase) and that the concurrency gap this phase closes was found and fixed here.
- **Create** `docs/plans/2026-07-17-account-deletion-phase3.1-hardening-report.md`, `docs/plans/2026-07-17-account-deletion-phase3.1-live-validation-report.md`, `docs/plans/2026-07-17-account-deletion-phase3.1-doc-sync-report.md`, `docs/plans/2026-07-17-account-deletion-phase3.1-production-readiness.md` — the four required deliverables, written after all tasks land.

---

### Task 1: Fix the proven concurrent-execution race

**Files:**

- Modify: `src/core/account-deletion/workflow.ts`
- Modify: `tests/unit/deletion-workflow.test.ts`
- Modify: `tests/unit/gdpr-workflow-integration.test.ts`

**Interfaces:**

- Produces: `ConcurrentModificationError` (exported class, extends `Error`, carries `requestId: string`).
- Modifies behavior of: `persist()` (now throws `ConcurrentModificationError` instead of silently succeeding when the row was written by someone else since it was read) and `runDeletionWorkflow()` (now catches that error at the top level and returns a result instead of throwing or duplicating work).
- Does not change: `createDeletionRequest`, `findActiveDeletionRequest`, `isPhaseCompleted`, any step executor, `STATE_ORDER`, `CRITICAL_STEPS`, `resumeStartStatus`.

- [ ] **Step 1: Write the failing regression test**

Add to `tests/unit/deletion-workflow.test.ts`, as a new top-level `describe` block placed after the existing `runDeletionWorkflow` describe block:

```ts
describe("runDeletionWorkflow — concurrent execution safety", () => {
  function jitter(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, Math.random() * 8));
  }

  function makeJitteredFakeSupabase() {
    const rows: DeletionRequestRow[] = [];
    let idCounter = 0;

    const rpc = vi.fn(async () => {
      await jitter();
      return { data: [{ table_name: "messages", deleted_count: 1 }], error: null };
    });

    function from(table: string) {
      if (table !== "deletion_requests") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: (_col: string, userId: string) => ({
            not: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => {
                    await jitter();
                    const match = rows.find(
                      (r) =>
                        r.user_id === userId && r.status !== "completed" && r.status !== "cancelled"
                    );
                    return {
                      data: match ? { ...match, checkpoint: [...match.checkpoint] } : null,
                      error: null,
                    };
                  },
                }),
              }),
            }),
          }),
        }),
        insert: (values: Partial<DeletionRequestRow>) => ({
          select: () => ({
            single: async () => {
              await jitter();
              const alreadyActive = rows.find(
                (r) =>
                  r.user_id === values.user_id &&
                  r.status !== "completed" &&
                  r.status !== "cancelled"
              );
              if (alreadyActive) {
                return {
                  data: null,
                  error: {
                    message:
                      'duplicate key value violates unique constraint "deletion_requests_one_active_per_user"',
                  },
                };
              }
              idCounter += 1;
              const row: DeletionRequestRow = {
                id: `req-${idCounter}`,
                user_id: values.user_id as string,
                status: "requested",
                workflow_version: 1,
                checkpoint: [],
                grace_period_ends_at: null,
                requested_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                completed_at: null,
                cancelled_at: null,
                retry_count: 0,
              };
              rows.push(row);
              return { data: { ...row, checkpoint: [...row.checkpoint] }, error: null };
            },
          }),
        }),
        update: (patch: Partial<DeletionRequestRow>) => ({
          eq: (_col1: string, id: string) => ({
            eq: (_col2: string, updatedAt: string) => ({
              select: async (_cols: string) => {
                await jitter();
                const row = rows.find((r) => r.id === id);
                // Real conditional UPDATE ... WHERE id = $1 AND updated_at = $2:
                // zero affected rows if someone else already wrote since we read.
                if (!row || row.updated_at !== updatedAt) {
                  return { data: [], error: null };
                }
                Object.assign(row, patch);
                return { data: [{ id: row.id }], error: null };
              },
            }),
          }),
        }),
      };
    }

    return { from, rpc, rows };
  }

  it("never invokes the atomic delete RPC more than once when two calls race on the same user", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");

    for (let attempt = 0; attempt < 5; attempt++) {
      const supabase = makeJitteredFakeSupabase();

      const results = await Promise.all([
        runDeletionWorkflow(supabase as never, "user-1"),
        runDeletionWorkflow(supabase as never, "user-1"),
      ]);

      expect(supabase.rpc.mock.calls.length).toBe(1);
      expect(supabase.rows.length).toBe(1);
      // Both calls must resolve (not throw) even though one of them lost
      // the race partway through.
      for (const r of results) {
        expect(typeof r.status).toBe("string");
      }
    }
  }, 20000);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/deletion-workflow.test.ts -t "never invokes the atomic delete RPC more than once"`
Expected: FAIL — the new mock's `update()` returns an object with a nested `.eq().select()` chain, but the current `persist()` in `workflow.ts` calls `.eq("id", row.id)` and expects a `Promise` back directly, not a further-chainable object. This will throw a TypeError (`.eq is not a function` or similar) or, if it happens to run, `rpc.mock.calls.length` will be `2`.

- [ ] **Step 3: Add `ConcurrentModificationError` and make `persist()` conditional**

In `src/core/account-deletion/workflow.ts`, add the new error class immediately after `PermanentStepError`:

```ts
export class PermanentStepError extends Error {}

export class ConcurrentModificationError extends Error {
  constructor(public readonly requestId: string) {
    super(`deletion_requests row ${requestId} was modified by another execution`);
  }
}
```

Replace the existing `persist()` function body:

```ts
export async function persist(
  supabase: WorkflowSupabase,
  row: DeletionRequestRow,
  patch: Partial<DeletionRequestRow>
): Promise<DeletionRequestRow> {
  const next: DeletionRequestRow = { ...row, ...patch, updated_at: nowIso() };
  const updater = supabase.from("deletion_requests").update({
    status: next.status,
    checkpoint: next.checkpoint,
    grace_period_ends_at: next.grace_period_ends_at,
    retry_count: next.retry_count,
    completed_at: next.completed_at,
    cancelled_at: next.cancelled_at,
    updated_at: next.updated_at,
  }) as unknown as {
    eq: (
      col: string,
      value: string
    ) => {
      eq: (
        col: string,
        value: string
      ) => {
        select: (
          columns: string
        ) => Promise<{ data: Array<{ id: string }> | null; error: { message: string } | null }>;
      };
    };
  };
  // Optimistic concurrency: the WHERE clause requires updated_at to still
  // match what we read the row as. A zero-row result means another
  // execution (a second overlapping runDeletionWorkflow() call for the same
  // user) already wrote to this row since we read it — that is a lost race,
  // not a database error, and the caller decides how to respond to it.
  const { data, error } = await updater
    .eq("id", row.id)
    .eq("updated_at", row.updated_at)
    .select("id");
  if (error) throw new Error(`persist: ${error.message}`);
  if (!data || data.length === 0) throw new ConcurrentModificationError(row.id);
  return next;
}
```

- [ ] **Step 4: Make `runDeletionWorkflow()` concede cleanly on a lost race**

In `src/core/account-deletion/workflow.ts`, wrap the existing `for` loop inside `runDeletionWorkflow()` in a `try`/`catch`. The loop body itself does not change — only add the wrapping `try {` right before `for (; cursor < STATE_ORDER.length; cursor++) {` and the `catch` block right after the loop's closing `}`:

```ts
const summary: string[] = [];
let cursor = STATE_ORDER.indexOf(resumeStartStatus(row));
if (cursor === -1) cursor = 0;

try {
  for (; cursor < STATE_ORDER.length; cursor++) {
    // ... existing loop body, completely unchanged ...
  }
} catch (err) {
  if (err instanceof ConcurrentModificationError) {
    const current = await findActiveDeletionRequest(supabase, userId);
    log("conceded_to_concurrent_execution", row, { at: STATE_ORDER[cursor] });
    summary.push("stopped: another concurrent execution already advanced this deletion workflow");
    return {
      requestId: row.id,
      status: current?.status ?? row.status,
      summary,
      resumed,
    };
  }
  throw err;
}

return { requestId: row.id, status: row.status, summary, resumed };
```

Do not change anything else in the function — the `if (row.status === "failed")` early-return block above the loop, and every existing `return` statement inside the loop (for `completed`, `PermanentStepError`, critical-step failure, etc.) stay exactly as they are; they all still work correctly inside a `try` block.

- [ ] **Step 5: Run the new test to verify it passes**

Run: `npx vitest run tests/unit/deletion-workflow.test.ts -t "never invokes the atomic delete RPC more than once"`
Expected: PASS across all 5 attempts in the loop.

- [ ] **Step 6: Update the existing fake Supabase harness in `deletion-workflow.test.ts` for the sequential tests**

The existing `makeFakeSupabase()` helper at the top of `tests/unit/deletion-workflow.test.ts` (used by every other test in the file) has an `update()` that only supports a single `.eq()`. Update it to match the new two-`.eq()`-plus-`.select()` shape `persist()` now calls, while keeping the same sequential (non-jittered) behavior:

```ts
      update: (patch: Partial<DeletionRequestRow>) => ({
        eq: (_col1: string, id: string) => ({
          eq: (_col2: string, updatedAt: string) => ({
            select: async (_cols: string) => {
              const row = rows.find((r) => r.id === id);
              if (!row || row.updated_at !== updatedAt) {
                return { data: [], error: null };
              }
              Object.assign(row, patch);
              return { data: [{ id: row.id }], error: null };
            },
          }),
        }),
      }),
```

Replace the old `update: (patch) => ({ eq: async (_col, id) => {...} })` block with this.

- [ ] **Step 7: Run the full workflow test file**

Run: `npx vitest run tests/unit/deletion-workflow.test.ts`
Expected: PASS, all tests green — every existing sequential test (resume, retry, grace period, failed-row, idempotency) must still pass unchanged, since sequential execution never has a stale `updated_at` at the point of writing.

- [ ] **Step 8: Update the separate inline mock in `gdpr-workflow-integration.test.ts`**

That file has its own duplicated `from()` mock (not shared with `deletion-workflow.test.ts`). Update its `update` handler the same way:

```ts
          update: (patch: Partial<FakeRow>) => ({
            eq: (_col1: string, id: string) => ({
              eq: (_col2: string, updatedAt: string) => ({
                select: async (_cols: string) => {
                  const row = rows.find((r) => r.id === id);
                  if (!row || row.updated_at !== updatedAt) {
                    return { data: [], error: null };
                  }
                  Object.assign(row, patch);
                  return { data: [{ id: row.id }], error: null };
                },
              }),
            }),
          }),
```

Replace the existing `update: (patch) => ({ eq: async (_col, id) => {...} })` block in that file with this.

- [ ] **Step 9: Run the full unit suite to check for regressions**

Run: `npx vitest run tests/unit`
Expected: PASS, no regressions anywhere.

- [ ] **Step 10: Run TypeScript and lint**

Run: `npx tsc --noEmit -p .`
Expected: clean.
Run: `npm run lint`
Expected: 0 errors (pre-existing unrelated warnings only).

- [ ] **Step 11: Commit**

```bash
git add src/core/account-deletion/workflow.ts tests/unit/deletion-workflow.test.ts tests/unit/gdpr-workflow-integration.test.ts
git commit -m "fix(gdpr): add optimistic concurrency control to close proven double-execution race"
```

---

### Task 2: Live database validation against the real, linked Emma Supabase project

**Files:**

- Create: `scripts/validate-deletion-workflow-live.ts`

**Interfaces:**

- Consumes: `runDeletionWorkflow`, `findActiveDeletionRequest` from `@/core/account-deletion/workflow` (Task 1's fixed version); real `createClient` from `@supabase/supabase-js`; `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` from the environment (already present in `.env.local`).
- Produces: console output logging pass/fail for each validation scenario, used verbatim to write the Live Production Validation Report deliverable after this task runs.

This script is a one-off validation runbook, not application code — it is not imported by anything, not covered by `npm test`, and is safe to leave in `scripts/` afterward (the repo already has a similar precedent: `scripts/validate-backup-health.ts`, `scripts/rotate-encryption-key.ts`).

**Safety constraints for this task:**

- Only ever touches a disposable auth user created by this script itself (via `supabase.auth.admin.createUser`), never a real user's row. `deletion_requests.user_id` has an `on delete cascade not null` FK to `auth.users`, so a real UUID satisfying that FK is required — a throwaway admin-created user is the only safe way to get one.
- The script deletes that disposable user (and, via cascade, every row it created) in a `finally` block so it cannot leave residue even if an assertion fails partway through.
- Does not touch `USER_OWNED_DELETE_ORDER`'s 32 real tables with seeded data beyond what's strictly needed to prove `deleteUserOwnedData()` actually deletes rows for this disposable user (a couple of `profiles`/`memories` rows is enough — this is proving the RPC and workflow wiring work against real Postgres, not re-doing Phase 2.1's full 32-table sweep).

- [ ] **Step 1: Write the validation script**

Create `scripts/validate-deletion-workflow-live.ts`:

```ts
/**
 * Phase 3.1 live validation — exercises the deletion workflow against the
 * real, linked Emma Supabase project instead of mocks. One-off runbook, not
 * covered by `npm test`. Creates and deletes its own disposable auth user;
 * never touches real user data.
 *
 * Run: npx tsx scripts/validate-deletion-workflow-live.ts
 */
import { createClient } from "@supabase/supabase-js";
import {
  runDeletionWorkflow,
  findActiveDeletionRequest,
} from "../src/core/account-deletion/workflow";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
  process.exit(1);
}

const admin = createClient(url, key);

type Result = { name: string; pass: boolean; detail: string };
const results: Result[] = [];

function record(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}: ${detail}`);
}

async function main() {
  const email = `phase31-validation-${Date.now()}@example.invalid`;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    console.error("Could not create disposable auth user:", createErr?.message);
    process.exit(1);
  }
  const userId = created.user.id;
  console.log(`Disposable auth user: ${userId}`);

  try {
    // 1. Seed a couple of real rows so deleteUserOwnedData() has something
    // real to delete.
    await admin.from("profiles").insert({ id: userId, name: "Phase 3.1 Validation" });
    await admin
      .from("memories")
      .insert({ user_id: userId, category: "fact", key: "k1", value: "v1" });

    // 2. Fresh create — findActiveDeletionRequest() returns null pre-creation.
    const beforeCreate = await findActiveDeletionRequest(admin, userId);
    record(
      "create: no active row before first call",
      beforeCreate === null,
      JSON.stringify(beforeCreate)
    );

    // 3. Full run — proves the real .not("status","in","(completed,cancelled)")
    // PostgREST filter, real insert defaults, real RPC call, and real RLS
    // (service role bypasses RLS, which is itself the behavior being proven —
    // see step 7 for the anon/authenticated-denied side of that claim).
    const first = await runDeletionWorkflow(admin, userId);
    record(
      "full run reaches completed",
      first.status === "completed",
      `status=${first.status} resumed=${first.resumed}`
    );

    // 4. Confirm the seeded rows are actually gone.
    const { data: profileAfter } = await admin.from("profiles").select("id").eq("id", userId);
    const { data: memoriesAfter } = await admin.from("memories").select("id").eq("user_id", userId);
    record(
      "real rows actually deleted",
      (profileAfter?.length ?? 0) === 0 && (memoriesAfter?.length ?? 0) === 0,
      `profiles=${profileAfter?.length} memories=${memoriesAfter?.length}`
    );

    // 5. Idempotency / duplicate request — a second call after completion
    // creates a NEW row (unique index excludes 'completed'), does not resume,
    // and completes again without error (deleteUserOwnedData is idempotent).
    const second = await runDeletionWorkflow(admin, userId);
    record(
      "second call after completion creates a fresh row, not a resume",
      second.status === "completed" &&
        second.resumed === false &&
        second.requestId !== first.requestId,
      `status=${second.status} resumed=${second.resumed} sameRow=${second.requestId === first.requestId}`
    );

    // 6. Concurrent request — the real target of this phase's fix. Two
    // genuinely concurrent calls over the real network, for a user with no
    // existing row, must not both invoke the RPC.
    const concurrentEmail = `phase31-concurrent-${Date.now()}@example.invalid`;
    const { data: concurrentUser } = await admin.auth.admin.createUser({
      email: concurrentEmail,
      email_confirm: true,
    });
    const concurrentUserId = concurrentUser!.user!.id;
    try {
      const [c1, c2] = await Promise.all([
        runDeletionWorkflow(admin, concurrentUserId),
        runDeletionWorkflow(admin, concurrentUserId),
      ]);
      const { data: rowsAfter } = await admin
        .from("deletion_requests")
        .select("id,status")
        .eq("user_id", concurrentUserId);
      record(
        "concurrent requests: exactly one row, both calls resolve",
        (rowsAfter?.length ?? 0) === 1,
        `rows=${rowsAfter?.length} c1.status=${c1.status} c2.status=${c2.status}`
      );
    } finally {
      await admin.auth.admin.deleteUser(concurrentUserId);
    }

    // 7. Permission model / RLS — an anon and an authenticated (non-service)
    // client must not be able to write deletion_requests at all, and must
    // only be able to read their own row.
    const anonKeyEnv = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (anonKeyEnv) {
      const anon = createClient(url!, anonKeyEnv);
      const { error: anonWriteErr } = await anon
        .from("deletion_requests")
        .update({ status: "cancelled" })
        .eq("user_id", userId);
      record(
        "RLS: anon client cannot write deletion_requests",
        anonWriteErr !== null,
        anonWriteErr?.message ?? "no error — THIS IS A REAL PROBLEM if it wrote"
      );
    } else {
      record(
        "RLS: anon client write check",
        false,
        "NEXT_PUBLIC_SUPABASE_ANON_KEY not set — skipped, not verified"
      );
    }
  } finally {
    await admin.auth.admin.deleteUser(userId);
    console.log(`Cleaned up disposable auth user: ${userId}`);
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) {
    console.log("FAILURES:", failed.map((f) => f.name).join(", "));
    process.exit(1);
  }
}

main();
```

- [ ] **Step 2: Confirm the live project is the expected one before running anything**

Run: `npx supabase projects list`
Expected: the linked project is `frwabkgvzjwfcmbpikir` ("Emma"), matching the project Phase 2.1 already validated against — confirm this before proceeding; do not run this script against any other project.

- [ ] **Step 3: Run the script**

Run: `npx tsx scripts/validate-deletion-workflow-live.ts`
Expected: `7/7 passed` (or `6/7` with an explicit "skipped, not verified" line if `NEXT_PUBLIC_SUPABASE_ANON_KEY` isn't set locally — that's an honest partial result, not a failure to paper over).

- [ ] **Step 4: If any scenario fails, fix the real bug it found**

If a scenario fails, treat it exactly like Phase 2.1 treated the `text`/`uuid` mismatch and ambiguous-column bugs it found: fix the actual code in `src/core/account-deletion/`, re-run this script from Step 3, and only proceed once it passes. Do not weaken the script's assertions to make a real failure disappear.

- [ ] **Step 5: Record the raw output for the Live Production Validation Report**

Capture the full console output of the passing run — it becomes the evidence log in the deliverable report (Task 4's write-up), the same way Phase 2.1's "44/44 passed" evidence log was captured.

- [ ] **Step 6: Commit**

```bash
git add scripts/validate-deletion-workflow-live.ts
git commit -m "test(gdpr): add live-database validation script for Phase 3.1, run against the Emma project"
```

---

### Task 3: Documentation synchronization

**Files:**

- Modify: `docs/adr/0004-account-deletion-architecture.md`
- Modify: `docs/plans/2026-07-16-account-deletion-technical-design.md`
- Modify: `docs/plans/2026-07-16-account-deletion-phase3-production-readiness.md`

**Interfaces:** None — documentation only, no code changes in this task.

- [ ] **Step 1: Update ADR-0004's header and Decision section**

In `docs/adr/0004-account-deletion-architecture.md`, update the `**Phase:**` line to:

```markdown
- **Phase:** 1 ("Foundation") → 2 ("Execution Foundation") → 2.1 ("Hardening & Production Validation") → 3 ("Workflow Orchestrator & Durable Execution") → 3.1 ("Hardening & Production Validation")
```

In the **Decision** section, change point 4 (currently: _"A persistence table (`deletion_requests`) exists as a foundation for future durable, resumable deletion, but nothing reads or writes it yet — workflow orchestration is explicitly deferred, not designed here."_) to:

```markdown
4. A **workflow orchestrator** (`src/core/account-deletion/workflow.ts`, Phase 3) now reads and writes the `deletion_requests` table this architecture reserved for it: `POST /api/emma/gdpr {action:"delete"}` creates or resumes a row and drives it through the Registry-derived state machine, with optimistic concurrency control (Phase 3.1) preventing two overlapping requests for the same user from duplicating work against it.
```

- [ ] **Step 2: Update the "Future evolution constraints" section**

Find the bullet starting "A future orchestrator is expected to consume `deletion_requests`..." and change it to past tense, reflecting it shipped:

```markdown
- **The orchestrator** (Phase 3, `src/core/account-deletion/workflow.ts`) consumes `deletion_requests` exactly as this section anticipated: a state machine over the existing 14-state status enum, `checkpoint jsonb` progress, driving the adapter lifecycle per resource per phase. It does not replace the transactional database step or the adapter contract — it coordinates them.
```

- [ ] **Step 3: Add a Consequences note about the concurrency fix**

In the **Consequences → Trade-offs** section, add one bullet after the existing `deletion_requests` trade-off bullet:

```markdown
- Phase 3's first shipped version of the orchestrator had no protection against two overlapping `runDeletionWorkflow()` calls for the same user both driving the same row — proven via a jittered-mock reproduction during Phase 3.1's independent-verification follow-up (measured: the atomic delete RPC fired twice for one logical request). Phase 3.1 closed this with optimistic concurrency control (compare-and-swap on the existing `updated_at` column) rather than a new lock table or queue — see the Phase 3.1 Hardening Report for the full analysis.
```

- [ ] **Step 4: Update the Technical Design Document's Non-Goals section**

In `docs/plans/2026-07-16-account-deletion-technical-design.md`, the **Non-Goals** section currently says _"Workflow orchestration, a state machine, checkpoint execution, a grace period, or a retry scheduler. These consume `deletion_requests`; nothing does yet."_ — this document's own header already scopes it to "the implementation as it exists after Phase 1, Phase 2, and Phase 2.1." Add a note directly below the Non-Goals list:

```markdown
> **Superseded by Phase 3 for the items above marked "these consume `deletion_requests`."** Workflow orchestration, the state machine, checkpoint execution, and retry now exist — see `src/core/account-deletion/workflow.ts` and the **Future Orchestration Boundary** section below, which documents what actually shipped. This document's own scope (Phases 1/2/2.1) is otherwise still accurate for the Registry, transactional RPC, and adapter lifecycle it describes — those were not changed by Phase 3 or 3.1.
```

- [ ] **Step 5: Update the "Future Orchestration Boundary" section**

Replace the sentence _"**Nothing reads or writes this table.** It was created in Phase 1 as a foundation and remains, after Phase 2 and Phase 2.1, exactly that — a foundation, not yet a workflow."_ with:

```markdown
**Phase 3 built the orchestrator this section anticipated** (`src/core/account-deletion/workflow.ts`): it creates a `deletion_requests` row on a delete request, drives the adapter lifecycle per resource per phase, writes `checkpoint` after each step, and implements the grace-period check and retry logic this section named as the next phase's job. Phase 3.1 added optimistic concurrency control so two overlapping requests for the same user can't corrupt or duplicate that progress. What remains genuinely unbuilt, per Phase 3's own disclosed scope: grace-period _scheduling_ (the check is real, nothing sets the trigger or wakes a halted workflow), OAuth/background-job adapters, and real per-table verification (every `verificationAdapter` in the Registry is still `null`) — these stay Phase 4 scope, not something this document should claim exists.
```

- [ ] **Step 6: Add an addendum to the Phase 3 Production Readiness Report**

At the end of `docs/plans/2026-07-16-account-deletion-phase3-production-readiness.md`, append:

```markdown
---

## Addendum (2026-07-17, Phase 3.1)

Two things in this report are now stale as written:

1. **Known limitation #6** (client-side false-success gap in `privacy/page.tsx`) was fixed one commit after this report was written, in `c4292ea` — this report was never updated to reflect that at the time. Recorded here rather than silently edited away.
2. **The "not yet fully production-ready" recommendation** in this report's own **Production readiness** section named two gaps: no live-database validation, and an implicit trust that the untested concurrent-request path was safe. Phase 3.1 closed both — see the Phase 3.1 Hardening Report and Live Production Validation Report for what was found and fixed, including a real, measured double-execution bug in this exact code that this report did not know to look for.

This report's **Workflow design**, **File changes**, **Design rationale**, and **Compliance with ADR-0004** sections remain accurate as a historical record of what Phase 3 shipped and are not edited further.
```

- [ ] **Step 7: Commit**

```bash
git add docs/adr/0004-account-deletion-architecture.md docs/plans/2026-07-16-account-deletion-technical-design.md docs/plans/2026-07-16-account-deletion-phase3-production-readiness.md
git commit -m "docs(gdpr): synchronize ADR-0004, TDD, and Phase 3 PRR with what Phase 3/3.1 actually shipped"
```

---

### Task 4: Final regression pass and repository consistency check

**Files:** None modified unless Step 2 finds something.

**Interfaces:** None.

- [ ] **Step 1: Run the full suite, typecheck, and lint one more time on the final state**

Run: `npx vitest run tests/unit`
Expected: PASS, no regressions, count matches or exceeds Phase 3's baseline (725 passed / 3 skipped) plus Task 1's new concurrency test.

Run: `npx tsc --noEmit -p .`
Expected: clean.

Run: `npm run lint`
Expected: 0 errors.

- [ ] **Step 2: Repository consistency check**

Run: `git status --porcelain` and confirm no stray files (e.g., the throwaway `_repro-concurrency.test.ts` used during investigation must not be present — it was already deleted before this plan was written, but confirm).

Grep for any TODO/FIXME left behind by this phase's own changes:

Run: `git diff main...HEAD -- src/core/account-deletion tests/unit/deletion-workflow.test.ts tests/unit/gdpr-workflow-integration.test.ts | grep -iE "TODO|FIXME|XXX"`
Expected: no output. If anything is found, resolve it before proceeding (either implement it if it's in scope, or remove it and note why in the Hardening Report if it describes genuine, disclosed future work).

- [ ] **Step 3: Commit if Step 2 required any changes**

```bash
git add -A
git commit -m "chore(gdpr): repository consistency pass for Phase 3.1"
```

(Skip this commit entirely if Step 2 found nothing to change.)

---

## After all tasks: required final reviews (not a task — controller performs these directly)

Per the commissioning instruction, do not limit review to individual tasks:

1. **Full architecture review** — re-read `workflow.ts` end to end post-fix; confirm the CAS change didn't leak into Registry/RPC/Adapter boundaries.
2. **Whole-branch review** — diff everything this phase touched against `main`, independently re-verified (not trusted from task self-reports), the same way Phase 3's SDD ledger recorded its own final whole-branch review catching 2 Important findings.
3. **Production readiness review** — produces the Task-4-deliverable Production Readiness Report answering the four required questions (production-ready? deployment blockers? operational blockers? implementation blockers?) plus residual risks and technical debt.

## Deliverables (written by the controller after the above)

1. `docs/plans/2026-07-17-account-deletion-phase3.1-hardening-report.md` — bugs found, root cause, solution, trade-offs (the concurrency race is the centerpiece; note plainly if nothing else was found).
2. `docs/plans/2026-07-17-account-deletion-phase3.1-live-validation-report.md` — what was tested, how, results, bugs found/fixed, using Task 2's captured output verbatim.
3. `docs/plans/2026-07-17-account-deletion-phase3.1-doc-sync-report.md` — list of every doc updated and why (mirrors Task 3's steps).
4. `docs/plans/2026-07-17-account-deletion-phase3.1-production-readiness.md` — the final verdict.
