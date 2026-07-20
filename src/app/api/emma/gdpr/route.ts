import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { audit } from "@/core/security/audit";
import { runDeletionWorkflow } from "@/core/account-deletion/workflow";
import {
  USER_OWNED_DELETE_ORDER,
  GDPR_EXPORT_TABLES,
  deleteUserOwnedData,
  exportUserOwnedData,
} from "@/core/account-deletion/gdpr-data";
import type {
  CheckpointEntry,
  DeletionWorkflowStatus,
} from "@/core/account-deletion/workflow-types";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// Re-exported (not just relocated) so every existing import of these four
// names from this route file — tests/unit/gdpr.test.ts,
// tests/unit/gdpr-workflow-integration.test.ts, and this file's own POST
// handler below — continues to resolve unchanged. The canonical
// implementations now live in @/core/account-deletion/gdpr-data (Phase 3
// hardening: removes the core-module → route-handler import cycle with
// src/core/account-deletion/workflow.ts).
export { USER_OWNED_DELETE_ORDER, GDPR_EXPORT_TABLES, deleteUserOwnedData, exportUserOwnedData };

// ── Verification rollup (Phase 5D, WP7 — TDD §7.1-§7.5) ──────────────────
//
// Presentation-only reshaping of runDeletionWorkflow()'s own
// DeletionWorkflowResult.checkpoint (Phase 5C, TDD §4.6) into API-ergonomic
// counts. Computes nothing the workflow didn't already decide — every
// resourceStatus here was assigned by workflow.ts's step functions; this
// function only counts and groups what's already there. No workflow logic
// is duplicated or reimplemented.

export interface VerificationCounts {
  verified: number;
  failed: number;
  inconclusive: number;
  skipped: number;
}

export interface VerificationRollup {
  database: VerificationCounts;
  storage: VerificationCounts;
  external: VerificationCounts;
}

// Synthetic aggregate-marker resourceIds workflow.ts writes for the
// verify_database/verify_external skip guards (workflow.ts's
// DB_VERIFICATION_MARKER/EXTERNAL_VERIFICATION_MARKER) — not real Registry
// resources, and excluded from the counts before anything else (TDD §7.1
// step 1). Without this, a clean run would report 33 verified database
// resources instead of 32.
const VERIFICATION_MARKER_IDS = new Set(["db.verification-batch", "external.verification-batch"]);

const VERIFICATION_PHASE_BUCKET: Partial<Record<DeletionWorkflowStatus, keyof VerificationRollup>> =
  {
    verify_database: "database",
    verify_storage: "storage",
    verify_external: "external",
  };

function emptyVerificationCounts(): VerificationCounts {
  return { verified: 0, failed: 0, inconclusive: 0, skipped: 0 };
}

/**
 * TDD §7.1's two-step reduction algorithm, applied in order: (1) exclude
 * synthetic marker entries, (2) deduplicate by keeping only the
 * latest-recordedAt entry per (phase, resourceId) — a retried
 * verify_database batch produces multiple entries per resource across
 * attempts (no per-table skip guard, only the aggregate marker), so naive
 * counting would report retry-count-scaled, potentially self-contradictory
 * totals (Revision 2). verify_storage never needs this dedup step by
 * construction — its per-adapter guard pushes no entry when it fires
 * (Revision 3), so at most one real entry ever exists per resourceId there.
 */
export function computeVerificationRollup(
  checkpoint: readonly CheckpointEntry[]
): VerificationRollup {
  const rollup: VerificationRollup = {
    database: emptyVerificationCounts(),
    storage: emptyVerificationCounts(),
    external: emptyVerificationCounts(),
  };

  const latestByKey = new Map<string, CheckpointEntry>();
  for (const entry of checkpoint) {
    if (VERIFICATION_MARKER_IDS.has(entry.resourceId)) continue;
    const bucket = VERIFICATION_PHASE_BUCKET[entry.phase];
    if (!bucket) continue;

    const key = `${entry.phase}::${entry.resourceId}`;
    const existing = latestByKey.get(key);
    if (!existing || entry.recordedAt >= existing.recordedAt) {
      latestByKey.set(key, entry);
    }
  }

  for (const entry of latestByKey.values()) {
    const bucket = VERIFICATION_PHASE_BUCKET[entry.phase];
    if (!bucket) continue;
    const counts = rollup[bucket];
    switch (entry.resourceStatus) {
      case "completed":
        counts.verified++;
        break;
      case "failed":
        counts.failed++;
        break;
      case "inconclusive":
        counts.inconclusive++;
        break;
      case "skipped":
        counts.skipped++;
        break;
    }
  }

  return rollup;
}

/**
 * GDPR Right-to-Erasure endpoint.
 *
 * POST /api/emma/gdpr
 *   { action: "export" }  → Returns all user data as JSON
 *   { action: "delete" }  → Deletes directly user-owned Emma data
 *
 * Child records are deleted before trials, affiliates, tasks, conversations,
 * and profiles. Direct user-owned audit entries are deleted. Tenant-owned/shared
 * integrations and referral rows owned by another user are intentionally
 * excluded pending explicit ownership and retention policies.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { action, confirmEmail } = await req.json();

    // Safety: require email confirmation before touching the DB at all for
    // a delete request (checked here, ahead of getSupabase(), so a rejected
    // request never has to instantiate a Supabase client). Deliberate
    // precedence consequence: this 400 wins over the 501 "DB not
    // configured" check below even when Supabase happens to be
    // unconfigured — a mismatched confirmEmail is rejected before we ever
    // look at DB config, since the caller's own encoded intent to delete
    // must match their email before anything else is checked.
    if (action === "delete" && confirmEmail !== user.email) {
      return NextResponse.json(
        {
          error: "Email confirmation required. Send { confirmEmail: 'your@email.com' } to proceed.",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "DB not configured" }, { status: 501 });
    }

    // ── Data Export ──────────────────────────────────────────────────────
    if (action === "export") {
      const exportedData = await exportUserOwnedData(supabase, user.id);

      await audit({
        userId: user.id,
        action: "export",
        resource: "profile",
        reason: "GDPR data export requested",
      });

      return NextResponse.json({
        exportedAt: new Date().toISOString(),
        user: { id: user.id, email: user.email },
        ...exportedData,
      });
    }

    // ── Data Deletion ────────────────────────────────────────────────────
    if (action === "delete") {
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
        // Phase 5D (WP7): sibling of summary, not nested inside it or
        // replacing it — an additive field an old client simply never reads.
        verification: computeVerificationRollup(result.checkpoint),
        note: "Auth account preserved. Contact support to fully delete your login credentials.",
      });
    }

    return NextResponse.json(
      { error: "Unknown action. Use 'export' or 'delete'." },
      { status: 400 }
    );
  } catch (err) {
    console.error("[GDPR] Error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
