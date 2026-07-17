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

import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteUserOwnedData } from "@/core/account-deletion/gdpr-data";
import { getStorageDeletionAdapters } from "./adapters/registry-adapters";
import type { DeletionPhase } from "./registry";
import { getResourcesByPhase } from "./registry";
import type {
  CheckpointEntry,
  CheckpointResourceStatus,
  DeletionRequestRow,
  DeletionWorkflowStatus,
} from "./workflow-types";

const WORKFLOW_VERSION = 1;

export type WorkflowSupabase = Pick<SupabaseClient, "from" | "rpc">;

function nowIso(): string {
  return new Date().toISOString();
}

export function log(
  event: string,
  row: Pick<DeletionRequestRow, "id" | "user_id" | "status">,
  extra?: Record<string, unknown>
): void {
  console.warn(`[DeletionWorkflow] ${event}`, {
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
  const query = supabase.from("deletion_requests").select("*") as unknown as {
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
  }) as unknown as {
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

export function isPhaseCompleted(
  row: DeletionRequestRow,
  phase: DeletionWorkflowStatus,
  resourceId: string
): boolean {
  return row.checkpoint.some(
    (e) => e.phase === phase && e.resourceId === resourceId && e.resourceStatus !== "failed"
  );
}

export class PermanentStepError extends Error {}

export class ConcurrentModificationError extends Error {
  constructor(public readonly requestId: string) {
    super(`deletion_requests row ${requestId} was modified by another execution`);
  }
}

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
    const summary = await deleteUserOwnedData(supabase, row.user_id);
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
    } finally {
      try {
        await adapter.cleanup(ctx);
      } catch (cleanupErr) {
        console.warn(`[DeletionWorkflow] cleanup() failed for ${adapter.resourceId}`, cleanupErr);
      }
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

  if (row.status === "failed") {
    // Permanent failure is terminal at this layer — deletion_requests_one_active_per_user
    // deliberately does not exclude 'failed' (see the migration's own comment: it "stays
    // counted so a stalled/reconciling workflow blocks a second concurrent request until it
    // truly finishes"), so a later call for this user will keep finding this row. Silently
    // restarting the whole workflow from validating would be worse than doing nothing: it
    // would re-attempt a database delete that already permanently failed, with no signal to
    // the caller that this is a resurrection rather than a normal resume. Recovering a failed
    // workflow is out of scope for Phase 3 (no retry/cancel endpoint exists) — surface it as
    // still-failed and let the caller decide.
    log("already_failed", row);
    return {
      requestId: row.id,
      status: row.status,
      summary: ["workflow previously failed permanently; not auto-restarting"],
      resumed: true,
    };
  }

  const summary: string[] = [];
  let cursor = STATE_ORDER.indexOf(resumeStartStatus(row));
  if (cursor === -1) cursor = 0;

  try {
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
}
