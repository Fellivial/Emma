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

/**
 * "inconclusive" (Phase 5C, TDD §6.1) means "could not determine either
 * way" — a whole-call RPC failure, a per-table lookup/query error (e.g. the
 * disclosed document_chunks.user_id schema-drift condition), or a Storage
 * list()/adapter error. Distinct from "failed", which means "confirmed a
 * real, non-empty resource." isPhaseCompleted()'s `!== "failed"` guard test
 * treats "inconclusive" the same as "completed"/"skipped" (absent-equivalent
 * to a real defect) — deliberate: an inconclusive result does not block
 * workflow completion (TDD §5.4), matching the open Product/Legal question
 * about evidentiary standard (ADR-0005 Open Questions) without silently
 * resolving it in the strictest direction.
 */
export type CheckpointResourceStatus = "completed" | "failed" | "skipped" | "inconclusive";

export interface CheckpointEntry {
  phase: DeletionWorkflowStatus;
  resourceId: string;
  subResourceMarker: string | null;
  resourceStatus: CheckpointResourceStatus;
  detail?: string;
  error?: string;
  recordedAt: string;
  /**
   * Phase 5C, TDD §6.2 — verification-only; undefined for deletion-phase
   * entries and for "skipped"/"inconclusive" verification entries where no
   * count was ever obtained. The machine-readable counterpart to `detail`'s
   * human-readable summary.
   */
  remainingCount?: number;
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
  /**
   * Phase 5C, TDD §4.6 — the row's final checkpoint array, additive to this
   * type. Every return statement in runDeletionWorkflow() sets this to
   * row.checkpoint, with one exception (the ConcurrentModificationError
   * branch, which prefers a freshly re-fetched row's checkpoint). Exists so
   * a future caller (a later phase's API rollup, per TDD §7.1) has
   * structured evidence to compute from without string-parsing `summary`.
   */
  checkpoint: CheckpointEntry[];
}
