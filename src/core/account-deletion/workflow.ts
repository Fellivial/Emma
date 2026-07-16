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
import { deleteUserOwnedData } from "@/app/api/emma/gdpr/route";
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
    eq: (col: string, value: string) => Promise<{ error: { message: string } | null }>;
  };
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
      await adapter.cleanup(ctx);
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
