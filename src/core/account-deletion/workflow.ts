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
