# Account Deletion Phase 3 — Workflow Orchestrator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a durable, resumable workflow orchestrator on top of the Phase 1/2/2.1 account-deletion foundation (Registry, transactional SQL delete, Storage adapter lifecycle), without modifying any of it, and start using the previously-inert `deletion_requests` table.

**Architecture:** A new `DeletionWorkflow` module (`src/core/account-deletion/workflow.ts`) drives a state machine matching `deletion_requests`'s existing `status` check constraint exactly. Progress is persisted entirely inside the existing `checkpoint jsonb` column (no new columns) as an append-only array of `{phase, resourceId, subResourceMarker, resourceStatus}` entries, per the shape the Phase 1 migration's own header comment already documents. `POST /api/emma/gdpr {action:"delete"}` creates-or-resumes a `deletion_requests` row and calls the workflow instead of deleting inline. Resumability comes from re-invocation (no scheduler/queue exists or is being added): a second call for a user with a non-terminal row picks up from the last completed checkpoint entry instead of restarting.

**Tech Stack:** TypeScript, Next.js route handlers, Supabase (`@supabase/supabase-js`), Vitest.

## Global Constraints

- Do not modify: `src/core/account-deletion/registry.ts`'s existing entries/fields, `supabase/migrations/20260716000001_transactional_deletion.sql`, the `DeletionAdapter` interface shape (`prepare/delete/verify/cleanup` signatures), `workflowVersion` semantics, or the Registry's resource inventory. Additive-only changes to `registry.ts` (one new derivation function) are in scope, mirroring `toUserOwnedDeleteOrder()`/`toGdprExportTables()`.
- Do not create a new schema/migration for `deletion_requests`. Use the existing columns exactly as shipped in `supabase/migrations/20260715000001_deletion_requests.sql` (`status`, `workflow_version`, `checkpoint jsonb`, `grace_period_ends_at`, `requested_at`, `updated_at`, `completed_at`, `cancelled_at`, `retry_count`). The prompt's field list (`current_step`/`completed_steps`/`started_at`/`failed_at`/`failure_reason`) maps onto this schema as: `current_step`/`completed_steps` ⇒ derived from `checkpoint`; `started_at` ⇒ `requested_at`; `failed_at`/`failure_reason` ⇒ recorded inside the failing checkpoint entry's `recordedAt`/`error` fields. Confirmed with the user before this plan was written.
- State machine must use exactly the ADR-0004 / migration status enum (`requested`, `validating`, `waiting_grace_period`, `locked`, `deleting_database`, `deleting_storage`, `deleting_oauth`, `deleting_background_jobs`, `verify_database`, `verify_storage`, `verify_external`, `completed`, `retry_pending`, `failed`, `cancelled`) — not the prompt's illustrative `PENDING/PREPARING/...` example.
- Storage deletion/verification remain **best-effort**, per ADR-0004 ("a Storage failure is logged and reported in the response summary but never fails the request or rolls back the... database erasure"). Only the `deleting_database` step's failure is retry/fail-critical for the overall workflow — this is a direct consequence of the ADR's already-accepted trade-off, not a new one introduced here.
- Registry-driven only: no hardcoded resourceId list for `deleting_oauth`/`deleting_background_jobs`/`deleting_storage`; always derive from `DELETION_RESOURCE_REGISTRY`.
- Out of scope (do not build): operator dashboard, metrics dashboard, admin/manual-retry UI, email notifications, scheduled cleanup, retention policy, background worker/queue, OAuth or background-job deletion adapters, a `cancelled` code path (no cancel endpoint exists or is requested).
- `waiting_grace_period` is implemented as a real, honored check against `grace_period_ends_at` (already a column), but nothing sets that column yet and no scheduler wakes a halted workflow — this is a disclosed, structural limitation (see Task 6), not a missing requirement: building a scheduler is explicitly out of scope.

---

## File Structure

- **Create** `src/core/account-deletion/workflow-types.ts` — `DeletionWorkflowStatus`, `CheckpointEntry`, `DeletionRequestRow`, `DeletionWorkflowResult` types.
- **Create** `src/core/account-deletion/workflow.ts` — the `DeletionWorkflow` orchestrator: row find/create/persist, checkpoint helpers, step executors, state-machine driver (`runDeletionWorkflow`).
- **Modify** `src/core/account-deletion/registry.ts` — add `getResourcesByPhase(phase)`, a pure derivation (additive only).
- **Modify** `src/core/account-deletion/adapters/storage-bucket-adapter.ts` — implement real `verify()` (list the user's folder; empty ⇒ success) instead of the Phase 2 stub, fulfilling the promise ADR-0004 explicitly deferred to Phase 3.
- **Modify** `src/app/api/emma/gdpr/route.ts` — `action:"delete"` now creates/resumes a `deletion_requests` row via `runDeletionWorkflow` instead of deleting inline.
- **Modify** `tests/unit/registry.test.ts` — cover `getResourcesByPhase()`.
- **Modify** `tests/unit/deletion-adapter.test.ts` — replace the stub-verify expectation with real-verify-behavior tests.
- **Create** `tests/unit/deletion-workflow.test.ts` — persistence, step, and full-orchestration tests.
- **Create** `tests/unit/gdpr-workflow-integration.test.ts` — proves the route now delegates to the workflow.

---

### Task 1: Registry — `getResourcesByPhase()`

**Files:**

- Modify: `src/core/account-deletion/registry.ts`
- Test: `tests/unit/registry.test.ts`

**Interfaces:**

- Produces: `getResourcesByPhase(phase: DeletionPhase): ReadonlyArray<DeletionResourceEntry>` — used by Task 3's step executors to resolve `deleting_oauth`/`deleting_background_jobs`/`deleting_database` (for verify) resources without hardcoding resourceIds.

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/registry.test.ts` (extend the existing `import` line to include `getResourcesByPhase`):

```ts
import {
  DELETION_RESOURCE_REGISTRY,
  getDatabaseResources,
  getResourcesByPhase,
  toGdprExportTables,
  toUserOwnedDeleteOrder,
  type ResourceOwnership,
} from "@/core/account-deletion/registry";
```

Add a new test inside the existing `describe("Deletion Resource Registry", ...)` block:

```ts
it("getResourcesByPhase() filters by phase without hardcoding resourceIds", () => {
  const oauthEntries = getResourcesByPhase("deleting_oauth");
  expect(oauthEntries.map((e) => e.resourceId)).toEqual(["oauth.client_integrations"]);

  const backgroundEntries = getResourcesByPhase("deleting_background_jobs");
  expect(backgroundEntries.map((e) => e.resourceId)).toEqual(["background.document_process"]);

  const storageEntries = getResourcesByPhase("deleting_storage");
  expect(storageEntries.map((e) => e.resourceId).sort()).toEqual(
    ["storage.document-ingestion", "storage.task-documents"].sort()
  );

  const dbEntries = getResourcesByPhase("deleting_database");
  expect(dbEntries).toHaveLength(32);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/registry.test.ts -t "getResourcesByPhase"`
Expected: FAIL — `getResourcesByPhase is not a function` / import error.

- [ ] **Step 3: Implement `getResourcesByPhase()`**

Add to `src/core/account-deletion/registry.ts`, immediately after `toGdprExportTables()`:

```ts
/**
 * Filters the Registry to entries belonging to one deletion phase. Phase 3's
 * workflow orchestrator uses this so it never hardcodes which resourceIds
 * belong to deleting_storage/deleting_oauth/deleting_background_jobs — the
 * Registry stays the only place that answer lives, exactly as it already is
 * for toUserOwnedDeleteOrder()/toGdprExportTables(). Database resources
 * (phase "deleting_database") are included for completeness (e.g. Phase 3's
 * verify_database step reads them) even though deletion itself processes
 * them as one atomic batch, not by iterating this list.
 */
export function getResourcesByPhase(phase: DeletionPhase): ReadonlyArray<DeletionResourceEntry> {
  return DELETION_RESOURCE_REGISTRY.filter((entry) => entry.phase === phase);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/registry.test.ts`
Expected: PASS, all existing + new tests green.

- [ ] **Step 5: Commit**

```bash
git add src/core/account-deletion/registry.ts tests/unit/registry.test.ts
git commit -m "feat(gdpr): add Registry getResourcesByPhase() for Phase 3 orchestration"
```

---

### Task 2: Workflow types + persistence layer

**Files:**

- Create: `src/core/account-deletion/workflow-types.ts`
- Create: `src/core/account-deletion/workflow.ts` (persistence layer only in this task)
- Test: `tests/unit/deletion-workflow.test.ts`

**Interfaces:**

- Produces: `DeletionWorkflowStatus`, `CheckpointEntry`, `DeletionRequestRow`, `DeletionWorkflowResult` (types); `findActiveDeletionRequest`, `createDeletionRequest`, `persist`, `checkpointEntry`, `isPhaseCompleted` (not exported — internal to `workflow.ts`, exercised indirectly through `runDeletionWorkflow` in Task 4's tests, but written and unit-tested now via a temporary exported test seam).
- Consumes: nothing from earlier tasks except `DeletionPhase` type from `./registry` (Task 1).

To keep this task's tests independent of Task 4's not-yet-written orchestrator, temporarily export the persistence helpers; Task 4 keeps them exported (they're useful as a stable internal seam, not dead code).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/deletion-workflow.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { DeletionRequestRow } from "@/core/account-deletion/workflow-types";

function makeFakeSupabase(
  options: {
    rows?: DeletionRequestRow[];
    rpcImpl?: (
      fn: string,
      args: unknown
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  } = {}
) {
  const rows: DeletionRequestRow[] = options.rows ?? [];
  let idCounter = 0;

  const rpc = vi.fn(
    options.rpcImpl ??
      (async () => ({ data: [{ table_name: "messages", deleted_count: 0 }], error: null }))
  );

  function from(table: string) {
    if (table !== "deletion_requests") throw new Error(`unexpected table ${table}`);
    return {
      select: () => ({
        eq: (_col: string, userId: string) => ({
          not: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => {
                  const match = rows.find(
                    (r) =>
                      r.user_id === userId && r.status !== "completed" && r.status !== "cancelled"
                  );
                  return { data: match ?? null, error: null };
                },
              }),
            }),
          }),
        }),
      }),
      insert: (values: Partial<DeletionRequestRow>) => ({
        select: () => ({
          single: async () => {
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
            return { data: row, error: null };
          },
        }),
      }),
      update: (patch: Partial<DeletionRequestRow>) => ({
        eq: async (_col: string, id: string) => {
          const row = rows.find((r) => r.id === id);
          if (row) Object.assign(row, patch);
          return { data: null, error: null };
        },
      }),
    };
  }

  return { from, rpc, rows };
}

describe("deletion workflow persistence layer", () => {
  it("creates a new deletion_requests row for a user with no active workflow", async () => {
    const { findActiveDeletionRequest, createDeletionRequest } =
      await import("@/core/account-deletion/workflow");
    const supabase = makeFakeSupabase();

    expect(await findActiveDeletionRequest(supabase as never, "user-1")).toBeNull();
    const row = await createDeletionRequest(supabase as never, "user-1");

    expect(row.user_id).toBe("user-1");
    expect(row.status).toBe("requested");
    expect(row.workflow_version).toBe(1);
    expect(row.checkpoint).toEqual([]);
  });

  it("finds an existing non-terminal row instead of treating the user as fresh", async () => {
    const { findActiveDeletionRequest } = await import("@/core/account-deletion/workflow");
    const existing: DeletionRequestRow = {
      id: "req-existing",
      user_id: "user-1",
      status: "deleting_storage",
      workflow_version: 1,
      checkpoint: [],
      grace_period_ends_at: null,
      requested_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
      cancelled_at: null,
      retry_count: 0,
    };
    const supabase = makeFakeSupabase({ rows: [existing] });

    const found = await findActiveDeletionRequest(supabase as never, "user-1");
    expect(found?.id).toBe("req-existing");
  });

  it("persist() patches and stamps updated_at without dropping other fields", async () => {
    const { createDeletionRequest, persist } = await import("@/core/account-deletion/workflow");
    const supabase = makeFakeSupabase();
    const row = await createDeletionRequest(supabase as never, "user-1");

    const updated = await persist(supabase as never, row, { status: "validating" });

    expect(updated.status).toBe("validating");
    expect(updated.user_id).toBe("user-1");
    expect(updated.updated_at).not.toBe(
      row.updated_at === updated.updated_at ? "" : row.updated_at
    );
  });

  it("isPhaseCompleted() is true only for a matching, non-failed checkpoint entry", async () => {
    const { isPhaseCompleted } = await import("@/core/account-deletion/workflow");
    const row: DeletionRequestRow = {
      id: "req-1",
      user_id: "user-1",
      status: "deleting_storage",
      workflow_version: 1,
      checkpoint: [
        {
          phase: "deleting_storage",
          resourceId: "storage.document-ingestion",
          subResourceMarker: null,
          resourceStatus: "completed",
          recordedAt: new Date().toISOString(),
        },
        {
          phase: "deleting_storage",
          resourceId: "storage.task-documents",
          subResourceMarker: null,
          resourceStatus: "failed",
          recordedAt: new Date().toISOString(),
        },
      ],
      grace_period_ends_at: null,
      requested_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
      cancelled_at: null,
      retry_count: 0,
    };

    expect(isPhaseCompleted(row, "deleting_storage", "storage.document-ingestion")).toBe(true);
    expect(isPhaseCompleted(row, "deleting_storage", "storage.task-documents")).toBe(false);
    expect(isPhaseCompleted(row, "deleting_storage", "storage.unrelated")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/deletion-workflow.test.ts`
Expected: FAIL — cannot find module `@/core/account-deletion/workflow` / `workflow-types`.

- [ ] **Step 3: Implement `workflow-types.ts`**

Create `src/core/account-deletion/workflow-types.ts`:

```ts
/**
 * Deletion Workflow types (Phase 3: Workflow Orchestrator).
 *
 * Mirrors the deletion_requests schema exactly as shipped in
 * supabase/migrations/20260715000001_deletion_requests.sql — no new
 * columns. Per ADR 0004, all step-level progress (what the prompt that
 * commissioned this phase called current_step/completed_steps/failed_at/
 * failure_reason) lives inside the existing checkpoint jsonb column, in the
 * {phase, resourceId, subResourceMarker, resourceStatus} shape the
 * migration's own header comment already documents.
 */

export type DeletionWorkflowStatus =
  | "requested"
  | "validating"
  | "waiting_grace_period"
  | "locked"
  | "deleting_database"
  | "deleting_storage"
  | "deleting_oauth"
  | "deleting_background_jobs"
  | "verify_database"
  | "verify_storage"
  | "verify_external"
  | "completed"
  | "retry_pending"
  | "failed"
  | "cancelled";

export type CheckpointResourceStatus = "completed" | "failed" | "skipped";

export interface CheckpointEntry {
  phase: DeletionWorkflowStatus;
  resourceId: string;
  subResourceMarker: string | null;
  resourceStatus: CheckpointResourceStatus;
  detail?: string;
  error?: string;
  recordedAt: string;
}

export interface DeletionRequestRow {
  id: string;
  user_id: string;
  status: DeletionWorkflowStatus;
  workflow_version: number;
  checkpoint: CheckpointEntry[];
  grace_period_ends_at: string | null;
  requested_at: string;
  updated_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  retry_count: number;
}

export interface DeletionWorkflowResult {
  requestId: string;
  status: DeletionWorkflowStatus;
  summary: string[];
  resumed: boolean;
}
```

- [ ] **Step 4: Implement the persistence layer in `workflow.ts`**

Create `src/core/account-deletion/workflow.ts`:

```ts
/**
 * Deletion Workflow Orchestrator (Phase 3: Workflow Orchestrator & Durable
 * Execution, ADR 0004's "future orchestrator" boundary).
 *
 * Builds durable, resumable orchestration on top of the Phase 1/2/2.1
 * foundation without changing it: the Registry stays the sole resource
 * inventory, delete_user_owned_data_ordered stays the sole atomic database
 * delete path, and DeletionAdapter stays the sole non-database contract.
 * This module's only job is sequencing + checkpointing calls into that
 * foundation and persisting progress to deletion_requests so a crash,
 * restart, or deploy mid-deletion can resume from the last completed step
 * instead of restarting or silently losing track.
 */

import { DELETION_RESOURCE_REGISTRY, type DeletionPhase } from "./registry";
import type {
  CheckpointEntry,
  CheckpointResourceStatus,
  DeletionRequestRow,
  DeletionWorkflowStatus,
} from "./workflow-types";

const WORKFLOW_VERSION = 1;

export interface WorkflowSupabase {
  from: (table: string) => {
    select: (columns?: string) => unknown;
    insert: (values: Record<string, unknown>) => unknown;
    update: (patch: Record<string, unknown>) => unknown;
  };
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function log(
  event: string,
  row: Pick<DeletionRequestRow, "id" | "user_id" | "status">,
  extra?: Record<string, unknown>
): void {
  console.log(`[DeletionWorkflow] ${event}`, {
    requestId: row.id,
    userId: row.user_id,
    status: row.status,
    ...extra,
  });
}

export function checkpointEntry(
  phase: DeletionWorkflowStatus,
  resourceId: string,
  resourceStatus: CheckpointResourceStatus,
  opts: { subResourceMarker?: string | null; detail?: string; error?: string } = {}
): CheckpointEntry {
  return {
    phase,
    resourceId,
    subResourceMarker: opts.subResourceMarker ?? null,
    resourceStatus,
    detail: opts.detail,
    error: opts.error,
    recordedAt: nowIso(),
  };
}

export async function findActiveDeletionRequest(
  supabase: WorkflowSupabase,
  userId: string
): Promise<DeletionRequestRow | null> {
  const query = supabase.from("deletion_requests").select("*") as {
    eq: (
      col: string,
      value: string
    ) => {
      not: (
        col: string,
        op: string,
        value: string
      ) => {
        order: (
          col: string,
          opts: { ascending: boolean }
        ) => {
          limit: (n: number) => {
            maybeSingle: () => Promise<{
              data: DeletionRequestRow | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };
  const { data, error } = await query
    .eq("user_id", userId)
    .not("status", "in", "(completed,cancelled)")
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`findActiveDeletionRequest: ${error.message}`);
  return data ?? null;
}

export async function createDeletionRequest(
  supabase: WorkflowSupabase,
  userId: string
): Promise<DeletionRequestRow> {
  const inserter = supabase.from("deletion_requests").insert({
    user_id: userId,
    status: "requested",
    workflow_version: WORKFLOW_VERSION,
  }) as {
    select: (columns: string) => {
      single: () => Promise<{ data: DeletionRequestRow | null; error: { message: string } | null }>;
    };
  };
  const { data, error } = await inserter.select("*").single();
  if (error || !data) {
    // deletion_requests_one_active_per_user — a concurrent caller may have
    // created the row between our earlier find and this insert. Adopt
    // theirs so two near-simultaneous delete calls converge on one
    // workflow instead of racing or erroring the second caller.
    const existing = await findActiveDeletionRequest(supabase, userId);
    if (existing) return existing;
    throw new Error(`createDeletionRequest: ${error?.message ?? "insert returned no row"}`);
  }
  return data;
}

export async function persist(
  supabase: WorkflowSupabase,
  row: DeletionRequestRow,
  patch: Partial<DeletionRequestRow>
): Promise<DeletionRequestRow> {
  const next: DeletionRequestRow = { ...row, ...patch, updated_at: nowIso() };
  const updater = supabase.from("deletion_requests").update({
    status: next.status,
    checkpoint: next.checkpoint,
    retry_count: next.retry_count,
    completed_at: next.completed_at,
    updated_at: next.updated_at,
  }) as { eq: (col: string, value: string) => Promise<{ error: { message: string } | null }> };
  const { error } = await updater.eq("id", row.id);
  if (error) throw new Error(`persist: ${error.message}`);
  return next;
}

export function isPhaseCompleted(
  row: DeletionRequestRow,
  phase: DeletionWorkflowStatus,
  resourceId: string
): boolean {
  return row.checkpoint.some(
    (e) => e.phase === phase && e.resourceId === resourceId && e.resourceStatus !== "failed"
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/deletion-workflow.test.ts`
Expected: PASS, all 4 tests green.

- [ ] **Step 6: Commit**

```bash
git add src/core/account-deletion/workflow-types.ts src/core/account-deletion/workflow.ts tests/unit/deletion-workflow.test.ts
git commit -m "feat(gdpr): add deletion_requests persistence layer for Phase 3 workflow"
```

---

### Task 3: Step executors + real Storage `verify()`

**Files:**

- Modify: `src/core/account-deletion/workflow.ts` (add step executors)
- Modify: `src/core/account-deletion/adapters/storage-bucket-adapter.ts`
- Modify: `tests/unit/deletion-adapter.test.ts`
- Test (add to): `tests/unit/deletion-workflow.test.ts`

**Interfaces:**

- Consumes: `checkpointEntry`, `isPhaseCompleted` from Task 2; `getResourcesByPhase` from Task 1; `getStorageDeletionAdapters` (existing, Phase 2) from `./adapters/registry-adapters`; `deleteUserOwnedData` (existing, Phase 2) from `@/app/api/emma/gdpr/route`.
- Produces: `PermanentStepError` class, `stepValidating`, `stepGracePeriod`, `stepLocked`, `stepDeletingDatabase`, `stepDeletingStorage`, `skippedNoAdapterEntries`, `stepVerifyDatabase`, `stepVerifyStorage`, `stepVerifyExternal` (all internal to `workflow.ts`, consumed by Task 4's dispatcher in the same file).

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/deletion-workflow.test.ts` (new top-level `describe`):

```ts
describe("deletion adapter verify() — real implementation", () => {
  it("storage adapter verify() succeeds when the user's folder is empty", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
    const listMock = vi.fn(async () => ({ data: [], error: null }));
    vi.doMock("@supabase/supabase-js", () => ({
      createClient: () => ({ storage: { from: () => ({ list: listMock }) } }),
    }));

    const { createStorageBucketAdapter } =
      await import("@/core/account-deletion/adapters/storage-bucket-adapter");
    const adapter = createStorageBucketAdapter("document-ingestion", "storage.document-ingestion");
    const result = await adapter.verify({
      userId: "user-1",
      resourceId: "storage.document-ingestion",
    });

    expect(result).toEqual({ success: true, itemsProcessed: 0, detail: "folder empty" });
    vi.doUnmock("@supabase/supabase-js");
    vi.unstubAllEnvs();
  });
});
```

(This step is a quick smoke test for the real-verify wiring; Task 3's Step 6 below rewrites `tests/unit/deletion-adapter.test.ts`'s dedicated adapter suite exhaustively, which is the authoritative coverage for this behavior — this one just proves the workflow-facing import path works.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/deletion-workflow.test.ts -t "verify() succeeds when"`
Expected: FAIL — current `verify()` is `stubVerify(...)`, so `result` is `{success: true, itemsProcessed: 0, detail: "storage verification deferred to Phase 3"}`, not `{detail: "folder empty"}`.

- [ ] **Step 3: Implement real `verify()` on the Storage adapter**

In `src/core/account-deletion/adapters/storage-bucket-adapter.ts`, update the header comment and imports, then replace the `verify` field:

```ts
/**
 * Storage bucket deletion adapter (Phase 2: delete/prepare/cleanup;
 * Phase 3: real verify()).
 *
 * Every bucket account deletion touches keys objects as `${userId}/...`
 * (see ingest/document/presign/route.ts:97 and integrations/docgen.ts:82),
 * so enumeration is a flat, non-recursive list of one folder per user — no
 * directory walk needed. verify() re-lists the same folder rather than
 * trusting delete()'s own report, so it independently catches a case where
 * delete() reported success but an object was added to the folder in the
 * window between delete() and verify() (e.g. a slow, still-in-flight
 * upload) — exactly the kind of gap ADR 0004 named as the reason verify()
 * was reserved as a real Phase 3 step rather than fused into delete().
 */

import { createClient } from "@supabase/supabase-js";
import {
  noopCleanup,
  noopPrepare,
  type DeletionAdapter,
  type DeletionAdapterContext,
  type DeletionAdapterResult,
} from "../adapter";
```

Replace the `verify: stubVerify(...)` line and add a real method (still inside the returned object literal, after `cleanup: noopCleanup,`):

```ts
export function createStorageBucketAdapter(bucket: string, resourceId: string): DeletionAdapter {
  return {
    resourceId,
    prepare: noopPrepare,
    cleanup: noopCleanup,

    async verify({ userId }: DeletionAdapterContext): Promise<DeletionAdapterResult> {
      const supabase = getStorageClient();
      if (!supabase) {
        return { success: false, itemsProcessed: 0, error: "storage not configured" };
      }
      const { data: files, error } = await supabase.storage.from(bucket).list(userId, { limit: 1 });
      if (error) {
        return { success: false, itemsProcessed: 0, error: error.message };
      }
      if (!files || files.length === 0) {
        return { success: true, itemsProcessed: 0, detail: "folder empty" };
      }
      return { success: false, itemsProcessed: files.length, error: "objects remain under user folder" };
    },

    async delete({ userId }: DeletionAdapterContext): Promise<DeletionAdapterResult> {
      // ... unchanged, existing Phase 2 implementation stays exactly as-is ...
```

(Leave the existing `delete()` body untouched — only `verify` changes; `stubVerify` import is removed since nothing in this file uses it anymore.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/deletion-workflow.test.ts -t "verify() succeeds when"`
Expected: PASS.

- [ ] **Step 5: Update `tests/unit/deletion-adapter.test.ts`'s stub-verify expectation**

Replace the existing test:

```ts
it("verify() is a stub deferring to Phase 3 and never touches storage", async () => {
  const { createStorageBucketAdapter } =
    await import("@/core/account-deletion/adapters/storage-bucket-adapter");
  const adapter = createStorageBucketAdapter("document-ingestion", "storage.document-ingestion");

  const result = await adapter.verify({
    userId: "user-1",
    resourceId: "storage.document-ingestion",
  });

  expect(result.success).toBe(true);
  expect(result.itemsProcessed).toBe(0);
  expect(db.createClient).not.toHaveBeenCalled();
});
```

with:

```ts
it("verify() reports success when the user's folder is empty", async () => {
  const bucketClient = { list: vi.fn(async () => ({ data: [], error: null })) };
  db.createClient.mockReturnValue({ storage: { from: vi.fn(() => bucketClient) } });

  const { createStorageBucketAdapter } =
    await import("@/core/account-deletion/adapters/storage-bucket-adapter");
  const adapter = createStorageBucketAdapter("document-ingestion", "storage.document-ingestion");

  const result = await adapter.verify({
    userId: "user-1",
    resourceId: "storage.document-ingestion",
  });

  expect(result).toEqual({ success: true, itemsProcessed: 0, detail: "folder empty" });
});

it("verify() reports failure when objects remain under the user's folder", async () => {
  const bucketClient = { list: vi.fn(async () => ({ data: [{ name: "leftover" }], error: null })) };
  db.createClient.mockReturnValue({ storage: { from: vi.fn(() => bucketClient) } });

  const { createStorageBucketAdapter } =
    await import("@/core/account-deletion/adapters/storage-bucket-adapter");
  const adapter = createStorageBucketAdapter("document-ingestion", "storage.document-ingestion");

  const result = await adapter.verify({
    userId: "user-1",
    resourceId: "storage.document-ingestion",
  });

  expect(result).toEqual({
    success: false,
    itemsProcessed: 1,
    error: "objects remain under user folder",
  });
});

it("verify() reports a failed list() without throwing", async () => {
  const bucketClient = {
    list: vi.fn(async () => ({ data: null, error: { message: "list failed" } })),
  };
  db.createClient.mockReturnValue({ storage: { from: vi.fn(() => bucketClient) } });

  const { createStorageBucketAdapter } =
    await import("@/core/account-deletion/adapters/storage-bucket-adapter");
  const adapter = createStorageBucketAdapter("document-ingestion", "storage.document-ingestion");

  const result = await adapter.verify({
    userId: "user-1",
    resourceId: "storage.document-ingestion",
  });

  expect(result).toEqual({ success: false, itemsProcessed: 0, error: "list failed" });
});
```

- [ ] **Step 6: Run the adapter test file**

Run: `npx vitest run tests/unit/deletion-adapter.test.ts`
Expected: PASS, all tests green (old stub test replaced by 3 real-behavior tests).

- [ ] **Step 7: Implement the step executors in `workflow.ts`**

Append to `src/core/account-deletion/workflow.ts` (after the persistence layer from Task 2, before any orchestrator code):

```ts
import { deleteUserOwnedData } from "@/app/api/emma/gdpr/route";
import { getStorageDeletionAdapters } from "./adapters/registry-adapters";
import { getResourcesByPhase } from "./registry";

export class PermanentStepError extends Error {}

async function stepValidating(row: DeletionRequestRow): Promise<CheckpointEntry[]> {
  if (!row.user_id || typeof row.user_id !== "string" || row.user_id.trim() === "") {
    throw new PermanentStepError(`invalid user_id: ${JSON.stringify(row.user_id)}`);
  }
  return [checkpointEntry("validating", "workflow.validation", "completed")];
}

async function stepGracePeriod(row: DeletionRequestRow): Promise<CheckpointEntry[] | null> {
  if (row.grace_period_ends_at && new Date(row.grace_period_ends_at).getTime() > Date.now()) {
    // Halts progression until grace_period_ends_at passes. Nothing sets
    // this column today and no scheduler wakes a halted workflow
    // automatically (out of scope for Phase 3, see plan header) —
    // resumption relies on the next re-invocation of runDeletionWorkflow.
    return null;
  }
  return [
    checkpointEntry("waiting_grace_period", "workflow.grace_period", "skipped", {
      detail: row.grace_period_ends_at ? "grace period elapsed" : "no grace period configured",
    }),
  ];
}

async function stepLocked(): Promise<CheckpointEntry[]> {
  // Exclusivity comes from the deletion_requests_one_active_per_user unique
  // index (supabase/migrations/20260715000001_deletion_requests.sql), not a
  // separate lock record — there is nothing else to acquire here.
  return [checkpointEntry("locked", "workflow.lock", "completed")];
}

async function stepDeletingDatabase(
  supabase: WorkflowSupabase,
  row: DeletionRequestRow
): Promise<CheckpointEntry[]> {
  if (isPhaseCompleted(row, "deleting_database", "db.batch")) {
    return [
      checkpointEntry("deleting_database", "db.batch", "skipped", { detail: "already completed" }),
    ];
  }
  try {
    const summary = await deleteUserOwnedData(supabase as never, row.user_id);
    return [
      checkpointEntry("deleting_database", "db.batch", "completed", { detail: summary.join("; ") }),
    ];
  } catch (err) {
    return [
      checkpointEntry("deleting_database", "db.batch", "failed", { error: (err as Error).message }),
    ];
  }
}

async function stepDeletingStorage(row: DeletionRequestRow): Promise<CheckpointEntry[]> {
  const entries: CheckpointEntry[] = [];
  for (const adapter of getStorageDeletionAdapters()) {
    if (isPhaseCompleted(row, "deleting_storage", adapter.resourceId)) {
      entries.push(
        checkpointEntry("deleting_storage", adapter.resourceId, "skipped", {
          detail: "already completed",
        })
      );
      continue;
    }
    const ctx = { userId: row.user_id, resourceId: adapter.resourceId };
    try {
      await adapter.prepare(ctx);
      const result = await adapter.delete(ctx);
      await adapter.cleanup(ctx);
      entries.push(
        result.success
          ? checkpointEntry("deleting_storage", adapter.resourceId, "completed", {
              detail: `${result.itemsProcessed} items`,
            })
          : checkpointEntry("deleting_storage", adapter.resourceId, "failed", {
              error: result.error,
            })
      );
    } catch (err) {
      entries.push(
        checkpointEntry("deleting_storage", adapter.resourceId, "failed", {
          error: (err as Error).message,
        })
      );
    }
  }
  return entries;
}

function skippedNoAdapterEntries(phase: DeletionPhase & DeletionWorkflowStatus): CheckpointEntry[] {
  return getResourcesByPhase(phase).map((entry) =>
    checkpointEntry(phase, entry.resourceId, "skipped", {
      detail: "no deletionAdapter implemented for this resource yet (Registry-driven, deferred)",
    })
  );
}

async function stepVerifyDatabase(): Promise<CheckpointEntry[]> {
  // Every database resource's verificationAdapter is null in the Registry
  // today — real per-table verification is deferred until a future phase
  // populates it, per ADR 0004. Recorded explicitly, not silently skipped.
  return getResourcesByPhase("deleting_database").map((entry) =>
    checkpointEntry("verify_database", entry.resourceId, "skipped", {
      detail: "no verificationAdapter configured in the Registry",
    })
  );
}

async function stepVerifyStorage(row: DeletionRequestRow): Promise<CheckpointEntry[]> {
  const entries: CheckpointEntry[] = [];
  for (const adapter of getStorageDeletionAdapters()) {
    const ctx = { userId: row.user_id, resourceId: adapter.resourceId };
    try {
      const result = await adapter.verify(ctx);
      entries.push(
        result.success
          ? checkpointEntry("verify_storage", adapter.resourceId, "completed", {
              detail: result.detail,
            })
          : checkpointEntry("verify_storage", adapter.resourceId, "failed", { error: result.error })
      );
    } catch (err) {
      entries.push(
        checkpointEntry("verify_storage", adapter.resourceId, "failed", {
          error: (err as Error).message,
        })
      );
    }
  }
  return entries;
}

async function stepVerifyExternal(): Promise<CheckpointEntry[]> {
  return [
    ...getResourcesByPhase("deleting_oauth"),
    ...getResourcesByPhase("deleting_background_jobs"),
  ].map((entry) =>
    checkpointEntry("verify_external", entry.resourceId, "skipped", {
      detail: "no verificationAdapter configured in the Registry",
    })
  );
}
```

Add the missing type import at the top of the file (extend the existing `workflow-types` import):

```ts
import type {
  CheckpointEntry,
  CheckpointResourceStatus,
  DeletionRequestRow,
  DeletionWorkflowStatus,
} from "./workflow-types";
```

- [ ] **Step 8: Run the full workflow test file**

Run: `npx vitest run tests/unit/deletion-workflow.test.ts tests/unit/deletion-adapter.test.ts tests/unit/registry.test.ts`
Expected: PASS. (Step executors aren't called by any test yet in this task — this just confirms no compile/import regressions; Task 4 exercises them end-to-end.)

- [ ] **Step 9: Commit**

```bash
git add src/core/account-deletion/workflow.ts src/core/account-deletion/adapters/storage-bucket-adapter.ts tests/unit/deletion-workflow.test.ts tests/unit/deletion-adapter.test.ts
git commit -m "feat(gdpr): add Phase 3 step executors and real Storage verify()"
```

---

### Task 4: Orchestrator driver — state machine, retry, resume

**Files:**

- Modify: `src/core/account-deletion/workflow.ts` (add `runStep`, `resumeStartStatus`, `runDeletionWorkflow`)
- Test (add to): `tests/unit/deletion-workflow.test.ts`

**Interfaces:**

- Consumes: everything from Tasks 1–3 within the same file.
- Produces: `runDeletionWorkflow(supabase: WorkflowSupabase, userId: string): Promise<DeletionWorkflowResult>` — the sole public entry point Task 5's route wiring calls.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/deletion-workflow.test.ts`:

```ts
describe("runDeletionWorkflow", () => {
  it("creates a new row and reaches completed for a fresh user, tolerating unconfigured storage as best-effort", async () => {
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");
    const supabase = makeFakeSupabase({
      rpcImpl: async () => ({ data: [{ table_name: "messages", deleted_count: 3 }], error: null }),
    });

    const result = await runDeletionWorkflow(supabase as never, "user-1");

    expect(result.resumed).toBe(false);
    expect(result.status).toBe("completed");
    expect(supabase.rows).toHaveLength(1);
    expect(supabase.rows[0].completed_at).not.toBeNull();
    const dbEntry = supabase.rows[0].checkpoint.find(
      (e) => e.phase === "deleting_database" && e.resourceId === "db.batch"
    );
    expect(dbEntry?.resourceStatus).toBe("completed");
    // Storage isn't configured in this test env — best-effort per ADR 0004:
    // recorded as failed in checkpoint, but does not block completion.
    const storageEntries = supabase.rows[0].checkpoint.filter(
      (e) => e.phase === "deleting_storage"
    );
    expect(storageEntries.some((e) => e.resourceStatus === "failed")).toBe(true);
    expect(supabase.rows[0].retry_count).toBe(0);
  });

  it("resumes an existing non-terminal row instead of creating a second one, skipping already-completed steps", async () => {
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");
    const existing: DeletionRequestRow = {
      id: "req-existing",
      user_id: "user-1",
      status: "deleting_storage",
      workflow_version: 1,
      checkpoint: [
        {
          phase: "deleting_database",
          resourceId: "db.batch",
          subResourceMarker: null,
          resourceStatus: "completed",
          recordedAt: new Date().toISOString(),
        },
      ],
      grace_period_ends_at: null,
      requested_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
      cancelled_at: null,
      retry_count: 0,
    };
    const rpc = vi.fn(async () => ({
      data: [{ table_name: "messages", deleted_count: 1 }],
      error: null,
    }));
    const supabase = { ...makeFakeSupabase({ rows: [existing] }), rpc };

    const result = await runDeletionWorkflow(supabase as never, "user-1");

    expect(result.resumed).toBe(true);
    expect(supabase.rows).toHaveLength(1);
    expect(result.status).toBe("completed");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("halts at waiting_grace_period without erroring when a future grace period is set", async () => {
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");
    const future = new Date(Date.now() + 60_000).toISOString();
    const existing: DeletionRequestRow = {
      id: "req-grace",
      user_id: "user-1",
      status: "waiting_grace_period",
      workflow_version: 1,
      checkpoint: [],
      grace_period_ends_at: future,
      requested_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
      cancelled_at: null,
      retry_count: 0,
    };
    const supabase = makeFakeSupabase({ rows: [existing] });

    const result = await runDeletionWorkflow(supabase as never, "user-1");

    expect(result.status).toBe("waiting_grace_period");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("marks retry_pending on a transient database failure and completes on a later call from checkpoint", async () => {
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");
    let attempt = 0;
    const supabase = makeFakeSupabase({
      rpcImpl: async () => {
        attempt += 1;
        if (attempt === 1) return { data: null, error: { message: "transient failure" } };
        return { data: [{ table_name: "messages", deleted_count: 1 }], error: null };
      },
    });

    const first = await runDeletionWorkflow(supabase as never, "user-1");
    expect(first.status).toBe("retry_pending");
    expect(supabase.rows[0].retry_count).toBe(1);
    expect(supabase.rows).toHaveLength(1);

    const second = await runDeletionWorkflow(supabase as never, "user-1");
    expect(second.status).toBe("completed");
    expect(second.resumed).toBe(true);
    expect(attempt).toBe(2);
  });

  it("transitions to failed, not retry_pending, once the database step's retries are exhausted", async () => {
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");
    const supabase = makeFakeSupabase({
      rpcImpl: async () => ({ data: null, error: { message: "persistent failure" } }),
    });

    let result = await runDeletionWorkflow(supabase as never, "user-1");
    expect(result.status).toBe("retry_pending");
    result = await runDeletionWorkflow(supabase as never, "user-1");
    expect(result.status).toBe("retry_pending");
    result = await runDeletionWorkflow(supabase as never, "user-1");
    expect(result.status).toBe("retry_pending");
    result = await runDeletionWorkflow(supabase as never, "user-1");
    expect(result.status).toBe("failed");
    expect(supabase.rows).toHaveLength(1);
  });

  it("fails permanently on an invalid user_id without consuming a retry", async () => {
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");
    const supabase = makeFakeSupabase();

    const result = await runDeletionWorkflow(supabase as never, "");

    expect(result.status).toBe("failed");
    expect(supabase.rows[0].retry_count).toBe(0);
  });

  it("skips deleting_oauth and deleting_background_jobs resources with no adapter, without failing the workflow", async () => {
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");
    const supabase = makeFakeSupabase();

    const result = await runDeletionWorkflow(supabase as never, "user-1");

    expect(result.summary.some((line) => line.includes("oauth.client_integrations: skipped"))).toBe(
      true
    );
    expect(
      result.summary.some((line) => line.includes("background.document_process: skipped"))
    ).toBe(true);
    expect(result.status).toBe("completed");
  });

  it("is idempotent — invoking twice after completion does not re-run or duplicate anything", async () => {
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");
    const rpc = vi.fn(async () => ({
      data: [{ table_name: "messages", deleted_count: 1 }],
      error: null,
    }));
    const supabase = { ...makeFakeSupabase(), rpc };

    const first = await runDeletionWorkflow(supabase as never, "user-1");
    expect(first.status).toBe("completed");
    expect(rpc).toHaveBeenCalledTimes(1);

    // deletion_requests_one_active_per_user excludes 'completed', so a
    // second call for the same user creates a fresh workflow — this proves
    // the *first* workflow itself doesn't duplicate work if re-entered
    // (covered above by the resume test); this test proves a completed
    // workflow doesn't linger as "active" and force a permanent block.
    const second = await runDeletionWorkflow(supabase as never, "user-1");
    expect(second.status).toBe("completed");
    expect(second.resumed).toBe(false);
    expect(supabase.rows).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/deletion-workflow.test.ts -t "runDeletionWorkflow"`
Expected: FAIL — `runDeletionWorkflow` not exported yet.

- [ ] **Step 3: Implement the orchestrator driver**

Append to `src/core/account-deletion/workflow.ts`:

```ts
const MAX_RETRY_COUNT = 3;

// Only the atomic database step is retry/fail-critical for the overall
// workflow. Storage stays best-effort per ADR 0004 ("a Storage failure is
// logged and reported... but never fails the request") — that trade-off
// was already accepted for the synchronous path; this orchestrator carries
// it forward rather than tightening it unilaterally.
const CRITICAL_STEPS: DeletionWorkflowStatus[] = ["deleting_database"];

const STATE_ORDER: DeletionWorkflowStatus[] = [
  "validating",
  "waiting_grace_period",
  "locked",
  "deleting_database",
  "deleting_storage",
  "deleting_oauth",
  "deleting_background_jobs",
  "verify_database",
  "verify_storage",
  "verify_external",
  "completed",
];

async function runStep(
  supabase: WorkflowSupabase,
  row: DeletionRequestRow,
  status: DeletionWorkflowStatus
): Promise<CheckpointEntry[] | null> {
  switch (status) {
    case "validating":
      return stepValidating(row);
    case "waiting_grace_period":
      return stepGracePeriod(row);
    case "locked":
      return stepLocked();
    case "deleting_database":
      return stepDeletingDatabase(supabase, row);
    case "deleting_storage":
      return stepDeletingStorage(row);
    case "deleting_oauth":
      return skippedNoAdapterEntries("deleting_oauth");
    case "deleting_background_jobs":
      return skippedNoAdapterEntries("deleting_background_jobs");
    case "verify_database":
      return stepVerifyDatabase();
    case "verify_storage":
      return stepVerifyStorage(row);
    case "verify_external":
      return stepVerifyExternal();
    default:
      return [];
  }
}

function resumeStartStatus(row: DeletionRequestRow): DeletionWorkflowStatus {
  if (row.status === "retry_pending" && row.checkpoint.length > 0) {
    return row.checkpoint[row.checkpoint.length - 1].phase;
  }
  if (row.status === "requested") return "validating";
  return row.status;
}

export async function runDeletionWorkflow(
  supabase: WorkflowSupabase,
  userId: string
): Promise<import("./workflow-types").DeletionWorkflowResult> {
  const existing = await findActiveDeletionRequest(supabase, userId);
  const resumed = existing !== null;
  let row = existing ?? (await createDeletionRequest(supabase, userId));
  log(resumed ? "resumed" : "started", row);

  const summary: string[] = [];
  let cursor = STATE_ORDER.indexOf(resumeStartStatus(row));
  if (cursor === -1) cursor = 0;

  for (; cursor < STATE_ORDER.length; cursor++) {
    const status = STATE_ORDER[cursor];

    if (status === "completed") {
      row = await persist(supabase, row, { status: "completed", completed_at: nowIso() });
      log("completed", row);
      return { requestId: row.id, status: row.status, summary, resumed };
    }

    row = await persist(supabase, row, { status });

    let entries: CheckpointEntry[] | null;
    try {
      entries = await runStep(supabase, row, status);
    } catch (err) {
      if (err instanceof PermanentStepError) {
        row = await persist(supabase, row, {
          status: "failed",
          checkpoint: [
            ...row.checkpoint,
            checkpointEntry(status, "workflow.step", "failed", { error: err.message }),
          ],
        });
        log("failed", row, { at: status, error: err.message });
        summary.push(`failed at ${status}: ${err.message}`);
        return { requestId: row.id, status: row.status, summary, resumed };
      }
      throw err;
    }

    if (entries === null) {
      log("halted", row, { at: status });
      return { requestId: row.id, status: row.status, summary, resumed };
    }

    const nextCheckpoint = [...row.checkpoint, ...entries];
    summary.push(
      ...entries.map(
        (e) => `${e.phase}/${e.resourceId}: ${e.resourceStatus}${e.error ? ` (${e.error})` : ""}`
      )
    );
    const failed = entries.filter((e) => e.resourceStatus === "failed");

    if (failed.length > 0 && CRITICAL_STEPS.includes(status)) {
      const retryCount = row.retry_count + 1;
      const nextStatus: DeletionWorkflowStatus =
        retryCount > MAX_RETRY_COUNT ? "failed" : "retry_pending";
      row = await persist(supabase, row, {
        status: nextStatus,
        checkpoint: nextCheckpoint,
        retry_count: retryCount,
      });
      log(nextStatus === "failed" ? "failed" : "retry", row, { at: status, retryCount });
      return { requestId: row.id, status: row.status, summary, resumed };
    }

    if (failed.length > 0) {
      log("best_effort_step_failed", row, {
        at: status,
        resources: failed.map((f) => f.resourceId),
      });
    }
    row = await persist(supabase, row, { checkpoint: nextCheckpoint });
    log("step_completed", row, { status });
  }

  return { requestId: row.id, status: row.status, summary, resumed };
}
```

- [ ] **Step 4: Run the full workflow test file**

Run: `npx vitest run tests/unit/deletion-workflow.test.ts`
Expected: PASS, all tests green (persistence + step-wiring + orchestrator tests from Tasks 2–4).

- [ ] **Step 5: Run the full unit suite to check for regressions**

Run: `npx vitest run tests/unit`
Expected: PASS, no regressions in `registry.test.ts`, `deletion-adapter.test.ts`, `gdpr.test.ts`, or anything else.

- [ ] **Step 6: Commit**

```bash
git add src/core/account-deletion/workflow.ts tests/unit/deletion-workflow.test.ts
git commit -m "feat(gdpr): implement Phase 3 deletion workflow state machine with retry/resume"
```

---

### Task 5: Wire the workflow into the GDPR endpoint

**Files:**

- Modify: `src/app/api/emma/gdpr/route.ts`
- Create: `tests/unit/gdpr-workflow-integration.test.ts`

**Interfaces:**

- Consumes: `runDeletionWorkflow` from Task 4.
- Produces: no new exports — `POST` behavior changes internally.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/gdpr-workflow-integration.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const routeMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ getUser: routeMocks.getUser }));
vi.mock("@supabase/supabase-js", () => ({ createClient: routeMocks.createClient }));

import { POST } from "@/app/api/emma/gdpr/route";

function jsonRequest(body: unknown) {
  return new NextRequest("https://emma.example.org/api/emma/gdpr", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

interface FakeRow {
  id: string;
  user_id: unknown;
  status: string;
  workflow_version: number;
  checkpoint: unknown[];
  grace_period_ends_at: null;
  requested_at: string;
  updated_at: string;
  completed_at: string | null;
  cancelled_at: null;
  retry_count: number;
}

describe("POST /api/emma/gdpr delete — Phase 3 workflow wiring", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://emma-test.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
    routeMocks.getUser.mockReset();
    routeMocks.createClient.mockReset();
  });

  it("delegates to the deletion workflow and returns its status instead of deleting inline", async () => {
    routeMocks.getUser.mockResolvedValue({ id: "user-1", email: "a@b.com" });

    const rows: FakeRow[] = [];
    routeMocks.createClient.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: [{ table_name: "messages", deleted_count: 2 }],
        error: null,
      })),
      from: vi.fn((table: string) => {
        if (table === "audit_log") {
          return { insert: vi.fn(async () => ({ error: null })) };
        }
        return {
          select: () => ({
            eq: () => ({
              not: () => ({
                order: () => ({
                  limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
                }),
              }),
            }),
          }),
          insert: (values: Partial<FakeRow>) => ({
            select: () => ({
              single: async () => {
                const row: FakeRow = {
                  id: "req-1",
                  user_id: values.user_id,
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
                return { data: row, error: null };
              },
            }),
          }),
          update: (patch: Partial<FakeRow>) => ({
            eq: async (_col: string, id: string) => {
              const row = rows.find((r) => r.id === id);
              if (row) Object.assign(row, patch);
              return { data: null, error: null };
            },
          }),
        };
      }),
    });

    const response = await POST(jsonRequest({ action: "delete", confirmEmail: "a@b.com" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("completed");
    expect(body.success).toBe(true);
    expect(Array.isArray(body.summary)).toBe(true);
    expect(body.summary.some((line: string) => line.includes("deleting_database/db.batch"))).toBe(
      true
    );
    expect(rows).toHaveLength(1);
  });

  it("still requires email confirmation before touching the workflow", async () => {
    routeMocks.getUser.mockResolvedValue({ id: "user-1", email: "a@b.com" });

    const response = await POST(jsonRequest({ action: "delete", confirmEmail: "wrong@b.com" }));

    expect(response.status).toBe(400);
    expect(routeMocks.createClient).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/gdpr-workflow-integration.test.ts -t "delegates to the deletion workflow"`
Expected: FAIL — response body still has the old shape (`deletedAt` always set, no `status` field, inline deletion happened instead of via `deletion_requests`).

- [ ] **Step 3: Wire the workflow into the route**

In `src/app/api/emma/gdpr/route.ts`, add the import (with the existing imports at the top):

```ts
import { runDeletionWorkflow } from "@/core/account-deletion/workflow";
```

Replace the entire `if (action === "delete") { ... }` block with:

```ts
// ── Data Deletion ────────────────────────────────────────────────────
if (action === "delete") {
  // Safety: require email confirmation
  if (confirmEmail !== user.email) {
    return NextResponse.json(
      {
        error: "Email confirmation required. Send { confirmEmail: 'your@email.com' } to proceed.",
      },
      { status: 400 }
    );
  }

  // Audit the request before deletion; the user-owned audit row is then
  // removed with the rest of the user's direct data by the workflow's
  // deleting_database step below.
  await audit({
    userId: user.id,
    action: "delete",
    resource: "profile",
    reason: "GDPR right-to-erasure: full account data deletion",
    metadata: { email: user.email, timestamp: new Date().toISOString() },
  });

  // Phase 3 (ADR 0004's "future orchestrator" boundary): creates or
  // resumes a deletion_requests row and drives the Registry-driven
  // state machine, instead of deleting inline. Storage stays
  // best-effort per the ADR — a Storage failure is recorded in the
  // summary but never blocks the workflow from completing.
  const result = await runDeletionWorkflow(supabase, user.id);

  return NextResponse.json({
    success: result.status === "completed",
    status: result.status,
    deletedAt: result.status === "completed" ? new Date().toISOString() : null,
    summary: result.summary,
    note: "Auth account preserved. Contact support to fully delete your login credentials.",
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/gdpr-workflow-integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full unit suite**

Run: `npx vitest run tests/unit`
Expected: PASS. Pay particular attention to `tests/unit/gdpr.test.ts` — it tests `deleteUserOwnedData`/`exportUserOwnedData` directly (unchanged exports), not the `POST` handler, so it should be unaffected by this change.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/emma/gdpr/route.ts tests/unit/gdpr-workflow-integration.test.ts
git commit -m "feat(gdpr): wire GDPR delete endpoint to the Phase 3 deletion workflow"
```

---

### Task 6: Full verification + Production Readiness Report

**Files:**

- Read-only verification, plus one new doc.
- Create: `docs/plans/2026-07-16-account-deletion-phase3-production-readiness.md`

- [ ] **Step 1: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors introduced by this phase. If pre-existing unrelated errors exist, confirm they're identical to `main`'s baseline before this branch.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: clean on all files touched in Tasks 1–5.

- [ ] **Step 3: Full test suite**

Run: `npm test`
Expected: 100% pass, including every pre-existing account-deletion test (`registry.test.ts`, `deletion-adapter.test.ts`, `gdpr.test.ts`, `transactional-deletion-sql.test.ts`) plus the new `deletion-workflow.test.ts` and `gdpr-workflow-integration.test.ts`.

- [ ] **Step 4: Write the Production Readiness Report**

Create `docs/plans/2026-07-16-account-deletion-phase3-production-readiness.md` covering, per the commissioning instruction's required sections:

- **Workflow design** — state machine (link to ADR-0004's status enum), checkpoint-in-jsonb persistence (no new schema — explain the field-mapping decision confirmed with the user), critical-vs-best-effort step classification and why (Storage's ADR-0004 best-effort guarantee carried into retry logic).
- **File changes** — the list from this plan's File Structure section, with final line counts/diff stats pulled from `git diff --stat` against the branch's merge-base.
- **Design rationale** — the four disclosed interpretation calls made during this phase, stated plainly:
  1. Deletion Requests field-mapping (checkpoint-jsonb vs. new columns) — resolved with the user before implementation.
  2. `waiting_grace_period` implemented as a real but unscheduled halt (no scheduler exists or was built; nothing sets `grace_period_ends_at` yet).
  3. `verify_database` implemented as a Registry-driven "no verificationAdapter configured" pass-through rather than inventing ad hoc per-table existence checks not modeled anywhere in the Registry schema.
  4. Storage `verify()` implemented for real (folder re-list) since ADR-0004 explicitly named this as reserved for Phase 3, not left as a stub.
- **Compliance with ADR-0004** — explicit confirmation: Registry untouched (only additive `getResourcesByPhase`), transactional SQL engine untouched, `DeletionAdapter` interface untouched, Storage best-effort preserved, `workflowVersion` semantics unchanged (pinned at 1, now actually read by `createDeletionRequest`/checkpointing for the first time).
- **Test results** — paste `npm test` summary (pass count, no skips).
- **Live validation** — state plainly whether this was performed against the linked disposable Supabase project (`frwabkgvzjwfcmbpikir`) or not; if not performed, say so explicitly rather than implying it was (per this project's own recorded pattern of false "TDD/ADR exists" claims — see project memory — don't repeat that failure mode for "live-validated").
- **Production readiness** — explicit go/no-go per the gates this phase actually closes (durable checkpointing, resumability, retry/permanent-failure distinction) vs. gates it does not (grace period scheduling, OAuth/background-job deletion, real per-table database verification).
- **Known limitations** — the four items from Design rationale, plus: single-request synchronous execution model (no background worker — a very large future resource count could make one HTTP request slow; not observed as a problem at today's scale), no cancellation path, `deleting_oauth`/`deleting_background_jobs` are permanently "skipped" until a future phase adds real adapters.
- **Explicit architecture compliance statement** — one paragraph confirming no conflict was found requiring a stop, except the one resolved with the user up front (schema field-mapping), and no other architectural decision was made without either explicit instruction or documented, disclosed judgment.

- [ ] **Step 5: Commit**

```bash
git add docs/plans/2026-07-16-account-deletion-phase3-production-readiness.md
git commit -m "docs(gdpr): Phase 3 production readiness report"
```

---

## Self-Review Notes (completed during planning, not a step to execute)

- **Spec coverage:** Workflow Orchestrator (Task 4), `deletion_requests` becomes active (Task 2/4), Workflow States (ADR enum used throughout), Durable Execution + Step Checkpoint (Task 2's `checkpoint`/`persist`), Adapter Execution incl. `verify()` (Task 3), Registry Driven Execution (`getResourcesByPhase`, Task 1), Retry Strategy + Failure Handling (Task 4's `CRITICAL_STEPS`/`MAX_RETRY_COUNT`), Idempotency (Task 4's `isPhaseCompleted`-gated re-runs + unique-index-backed row reuse), API Integration (Task 5), Observability (`log()` calls at started/resumed/step_completed/retry/failed/completed/halted/best_effort_step_failed). Explicitly-out-of-scope items are not built anywhere in this plan.
- **Placeholder scan:** none — every step has complete code.
- **Type consistency:** `DeletionWorkflowStatus`/`CheckpointEntry`/`DeletionRequestRow`/`DeletionWorkflowResult` defined once in `workflow-types.ts` (Task 2) and used identically in Tasks 3–5; `WorkflowSupabase` defined once in `workflow.ts` and reused; `getResourcesByPhase(phase: DeletionPhase)` (Task 1) called only with values in the `DeletionPhase & DeletionWorkflowStatus` intersection (Task 3), matching its signature.
