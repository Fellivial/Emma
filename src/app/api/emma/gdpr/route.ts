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
