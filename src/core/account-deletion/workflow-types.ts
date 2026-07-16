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
