/**
 * Shared verification framework types (Phase 5B: infrastructure only).
 *
 * These give the concrete, already-designed models from ADR-0005 and the
 * Phase 4B TDD the names this phase's own brief asked for — not a parallel
 * or duplicate model set:
 *
 *   - VerificationResult / VerificationEvidence -> DatabaseVerificationResult
 *     (gdpr-data.ts, TDD §2.3). One resource's outcome, and the array of all
 *     of them for one verification attempt, respectively.
 *   - RawVerificationStatus -> the 4-value vocabulary TDD §6.1 specifies for
 *     a future CheckpointResourceStatus extension, named "Raw" and kept
 *     deliberately distinct so a later phase can't mistake it for the real,
 *     checkpoint-integrated type. Declared here so this module and its
 *     tests compile standalone; NOT yet applied to CheckpointResourceStatus
 *     itself (workflow-types.ts is unmodified by Phase 5B — see
 *     docs/plans/2026-07-20-account-deletion-phase5a-implementation-plan.md,
 *     WP5, which owns that change).
 *   - VerificationOutcome -> a pure, standalone rollup over one attempt's
 *     VerificationEvidence. Deliberately NOT the TDD §7.1 API rollup, which
 *     operates over historical checkpoint entries with a retry-deduplication
 *     step — there is nothing to deduplicate until a later phase actually
 *     writes checkpoint entries (Phase 5B writes none). This is a smaller,
 *     genuinely reusable building block, not a premature reimplementation of
 *     that later algorithm.
 *   - VerificationBatch -> the RPC request payload shape, exactly what
 *     toVerificationTargets() (registry.ts) already returns.
 *   - VerificationFailureReason / VerificationFailure -> the two failure
 *     modes TDD §2.3 names (a whole-call RPC failure vs. a single table's
 *     failure), given a shared descriptor shape.
 *   - VerificationContext -> the (userId) identity every verification call
 *     needs. Documents the calling convention; does NOT replace
 *     verifyUserOwnedDataDeleted()'s existing (supabase, userId) parameter
 *     list, which must match TDD §2.3 exactly.
 *
 * What this module deliberately does NOT introduce: a VerificationAdapter
 * interface. TDD §2.1 ("Why database verification is not a DeletionAdapter")
 * explicitly rejected a per-resource adapter-object pattern for database
 * verification — 32 tables are verified as one batched read, not 32
 * independent adapter instances each implementing prepare/delete/verify/
 * cleanup. Introducing a generic adapter interface here would be exactly the
 * "second per-resource object contract for something that is architecturally
 * one call" the TDD already rejected, and would violate ADR-0005 Design
 * Goal 3 ("no new... adapter contract... unless the existing ones are
 * demonstrably insufficient"). Storage verification already has a real
 * adapter contract (DeletionAdapter.verify(), adapter.ts) reused unchanged;
 * external verification has no adapter by design (no deletion adapter
 * exists for OAuth/background jobs to verify the absence of). See
 * docs/plans/2026-07-20-account-deletion-phase5a-implementation-plan.md
 * (WP4) for the full reasoning behind this scoping decision.
 */

import type { DatabaseVerificationResult } from "./gdpr-data";
import type { toVerificationTargets } from "./registry";

/** One resource's verification outcome. */
export type VerificationResult = DatabaseVerificationResult;

/** All resources' verification outcomes for one verification attempt. */
export type VerificationEvidence = ReadonlyArray<VerificationResult>;

/**
 * The 4-value vocabulary TDD §6.1 specifies for a future
 * CheckpointResourceStatus extension — named "Raw" and kept deliberately
 * distinct from that future type (not a type alias of it, not re-exported
 * under the unqualified "VerificationStatus" name) so nothing in a later
 * phase can mistake this standalone declaration for the real, checkpoint-
 * integrated type workflow-types.ts will eventually own. Not yet applied to
 * CheckpointResourceStatus itself — see this module's header.
 */
export type RawVerificationStatus = "completed" | "failed" | "skipped" | "inconclusive";

/** The RPC request payload shape — exactly toVerificationTargets()'s return type. */
export type VerificationBatch = ReturnType<typeof toVerificationTargets>;

/** The two failure modes TDD §2.3 names for database verification. */
export type VerificationFailureReason = "whole-call-error" | "per-table-error";

export interface VerificationFailure {
  reason: VerificationFailureReason;
  /** Absent for a whole-call failure — there is no single resource to attribute it to. */
  resourceId?: string;
  message: string;
}

/** The identity every verification call needs. Documents the calling convention. */
export interface VerificationContext {
  userId: string;
}

export interface VerificationOutcome {
  verified: number;
  failed: number;
  inconclusive: number;
}

/**
 * Pure aggregation over one verification attempt's raw evidence — no
 * retry-history awareness, since there is no checkpoint history to
 * deduplicate yet (Phase 5B writes none). Named "Raw" deliberately: this is
 * NOT the TDD §7.1 API rollup (which requires marker-exclusion AND
 * latest-recordedAt deduplication across a row's full checkpoint history —
 * a materially different algorithm). Do not reach for this function when
 * implementing §7.1's real rollup later — build that against
 * DeletionWorkflowResult.checkpoint instead, per WP7. This is a ready-made
 * building block for a simpler, one-shot summary; nothing invokes it today.
 */
export function summarizeRawVerificationEvidence(
  evidence: VerificationEvidence
): VerificationOutcome {
  let verified = 0;
  let failed = 0;
  let inconclusive = 0;
  for (const result of evidence) {
    if (!result.checked) {
      inconclusive++;
    } else if (result.remainingCount === 0) {
      verified++;
    } else {
      failed++;
    }
  }
  return { verified, failed, inconclusive };
}
