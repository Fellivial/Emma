import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { audit } from "@/core/security/audit";
import { decrypt } from "@/core/security/encryption";
import type { SupabaseClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

const USER_OWNED_DELETE_ORDER: ReadonlyArray<{ table: string; column?: string }> = [
  { table: "legacy_chat_migration_ledger" },
  { table: "user_mcp_servers" },
  { table: "user_files" },
  { table: "message_feedback" },
  { table: "messages" },
  { table: "chat_messages" },
  { table: "conversations" },
  { table: "document_chunks" },
  { table: "ingested_documents" },
  { table: "email_sequences" },
  { table: "trial_events" },
  { table: "trials" },
  // Referral rows created by this user are directly owned. Rows where this
  // user is only the referred party are shared reward records and are retained.
  { table: "referrals", column: "referrer_id" },
  { table: "affiliates" },
  { table: "approvals" },
  { table: "action_log" },
  { table: "agent_task_summaries" },
  { table: "provenance_chains" },
  { table: "pattern_detections" },
  { table: "tasks" },
  { table: "push_subscriptions" },
  { table: "proactive_daily" },
  { table: "oauth_states" },
  { table: "usage_windows" },
  { table: "extra_packs" },
  { table: "personas" },
  { table: "memories" },
  { table: "usage" },
  { table: "client_members" },
  { table: "audit_log" },
  { table: "profiles", column: "id" },
];

export async function deleteUserOwnedData(
  supabase: Pick<SupabaseClient, "from">,
  userId: string
): Promise<string[]> {
  const summary: string[] = [];
  for (const { table, column = "user_id" } of USER_OWNED_DELETE_ORDER) {
    if (table === "affiliates") {
      const { data: affiliates, error: affiliateReadError } = await supabase
        .from("affiliates")
        .select("id")
        .eq("user_id", userId);
      if (affiliateReadError) throw new Error(`affiliates: ${affiliateReadError.message}`);

      const affiliateIds = (affiliates || []).map((row) => row.id as string);
      if (affiliateIds.length > 0) {
        const { count, error } = await supabase
          .from("affiliate_referrals")
          .delete({ count: "exact" })
          .in("affiliate_id", affiliateIds);
        if (error) throw new Error(`affiliate_referrals: ${error.message}`);
        summary.push(`affiliate_referrals: ${count ?? 0}`);
      } else {
        summary.push("affiliate_referrals: 0");
      }
    }

    const { count, error } = await supabase
      .from(table)
      .delete({ count: "exact" })
      .eq(column, userId);
    if (error) throw new Error(`${table}: ${error.message}`);
    summary.push(`${table}: ${count ?? 0}`);
  }
  return summary;
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

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "DB not configured" }, { status: 501 });
    }

    const { action, confirmEmail } = await req.json();

    // ── Data Export ──────────────────────────────────────────────────────
    if (action === "export") {
      const [
        { data: profile },
        { data: memories },
        { data: conversations },
        { data: messages },
        { data: usage },
        { data: auditEntries },
      ] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase.from("memories").select("*").eq("user_id", user.id),
        supabase.from("conversations").select("*").eq("user_id", user.id),
        supabase.from("messages").select("*").eq("user_id", user.id),
        supabase.from("usage").select("*").eq("user_id", user.id),
        supabase.from("audit_log").select("*").eq("user_id", user.id).limit(500),
      ]);

      await audit({
        userId: user.id,
        action: "export",
        resource: "profile",
        reason: "GDPR data export requested",
      });

      return NextResponse.json({
        exportedAt: new Date().toISOString(),
        user: { id: user.id, email: user.email },
        profile,
        memories: (memories || []).map((m: Record<string, unknown>) => ({
          ...m,
          value:
            typeof m.value === "string" && m.value.startsWith("enc:v1:")
              ? (() => {
                  try {
                    return decrypt(m.value as string);
                  } catch {
                    return m.value;
                  }
                })()
              : m.value,
        })),
        conversations: conversations || [],
        messages: messages || [],
        usage: usage || [],
        auditLog: auditEntries || [],
      });
    }

    // ── Data Deletion ────────────────────────────────────────────────────
    if (action === "delete") {
      // Safety: require email confirmation
      if (confirmEmail !== user.email) {
        return NextResponse.json(
          {
            error:
              "Email confirmation required. Send { confirmEmail: 'your@email.com' } to proceed.",
          },
          { status: 400 }
        );
      }

      // Audit the request before deletion; the user-owned audit row is then
      // removed with the rest of the user's direct data below.
      await audit({
        userId: user.id,
        action: "delete",
        resource: "profile",
        reason: "GDPR right-to-erasure: full account data deletion",
        metadata: { email: user.email, timestamp: new Date().toISOString() },
      });

      const deletionLog = await deleteUserOwnedData(supabase, user.id);

      // Note: We do NOT delete the auth.users entry here.
      // The user can still log in but will have an empty account.
      // Full auth deletion should be done via Supabase dashboard or a separate admin action.

      return NextResponse.json({
        success: true,
        deletedAt: new Date().toISOString(),
        summary: deletionLog,
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
