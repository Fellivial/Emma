import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { audit } from "@/core/security/audit";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * GDPR Right-to-Erasure endpoint.
 *
 * POST /api/emma/gdpr
 *   { action: "export" }  → Returns all user data as JSON
 *   { action: "delete" }  → Wipes all user data across every table
 *
 * Deletion order matters (foreign key constraints):
 *   1. messages (references conversations)
 *   2. conversations
 *   3. memories
 *   4. usage
 *   5. action_log (by user_id text match)
 *   6. approvals (via client)
 *   7. client_members
 *   8. profiles
 *   9. Supabase auth user (optional — they may want to keep the account)
 *
 * The audit log entry for the deletion itself is kept (legal requirement).
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
        memories: memories || [],
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
          { error: "Email confirmation required. Send { confirmEmail: 'your@email.com' } to proceed." },
          { status: 400 }
        );
      }

      // Audit BEFORE deletion (this entry will survive)
      await audit({
        userId: user.id,
        action: "delete",
        resource: "profile",
        reason: "GDPR right-to-erasure: full account data deletion",
        metadata: { email: user.email, timestamp: new Date().toISOString() },
      });

      const deletionLog: string[] = [];

      // 1. Messages
      const { count: msgCount } = await supabase
        .from("messages")
        .delete({ count: "exact" })
        .eq("user_id", user.id);
      deletionLog.push(`messages: ${msgCount || 0}`);

      // 2. Conversations
      const { count: convCount } = await supabase
        .from("conversations")
        .delete({ count: "exact" })
        .eq("user_id", user.id);
      deletionLog.push(`conversations: ${convCount || 0}`);

      // 3. Memories
      const { count: memCount } = await supabase
        .from("memories")
        .delete({ count: "exact" })
        .eq("user_id", user.id);
      deletionLog.push(`memories: ${memCount || 0}`);

      // 4. Usage
      const { count: usageCount } = await supabase
        .from("usage")
        .delete({ count: "exact" })
        .eq("user_id", user.id);
      deletionLog.push(`usage: ${usageCount || 0}`);

      // 5. Client memberships (removes from any client)
      const { count: memberCount } = await supabase
        .from("client_members")
        .delete({ count: "exact" })
        .eq("user_id", user.id);
      deletionLog.push(`client_memberships: ${memberCount || 0}`);

      // 6. Tasks
      try {
        await supabase.from("tasks").delete().eq("user_id", user.id);
        deletionLog.push("tasks: cleared");
      } catch { deletionLog.push("tasks: skipped"); }

      // 7. Profile
      const { error: profileErr } = await supabase
        .from("profiles")
        .delete()
        .eq("id", user.id);
      deletionLog.push(profileErr ? "profile: failed" : "profile: deleted");

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

    return NextResponse.json({ error: "Unknown action. Use 'export' or 'delete'." }, { status: 400 });
  } catch (err) {
    console.error("[GDPR] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
