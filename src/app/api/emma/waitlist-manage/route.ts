import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function isAdmin(email: string | undefined): boolean {
  const adminEmails = (process.env.EMMA_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase());
  return adminEmails.includes(email?.toLowerCase() || "");
}

/**
 * Waitlist Management API (admin only)
 *
 * POST /api/emma/waitlist-manage
 *   { action: "list" }                      → List all waitlist entries
 *   { action: "invite", waitlistId }         → Send invite to a waiting user
 *   { action: "set_cap", maxUsers }          → Update max active user cap
 *   { action: "stats" }                      → Get waitlist + seat stats
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isAdmin(user.email)) return NextResponse.json({ error: "Admin only" }, { status: 403 });

    const supabase = getSupabase();
    if (!supabase) return NextResponse.json({ error: "DB not configured" }, { status: 501 });

    const body = await req.json();
    const { action } = body;

    // ── List all entries ─────────────────────────────────────────────────
    if (action === "list") {
      const { data } = await supabase
        .from("waitlist_v2")
        .select("*")
        .order("created_at", { ascending: true });

      return NextResponse.json({ entries: data || [] });
    }

    // ── Invite a waiting user ────────────────────────────────────────────
    if (action === "invite") {
      const { waitlistId } = body;
      if (!waitlistId) return NextResponse.json({ error: "waitlistId required" }, { status: 400 });

      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(); // 48 hours

      const { error } = await supabase
        .from("waitlist_v2")
        .update({
          status: "invited",
          invited_at: new Date().toISOString(),
          invite_expires_at: expiresAt,
        })
        .eq("id", waitlistId)
        .eq("status", "waiting");

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // Get user's email for the invite
      const { data: entry } = await supabase
        .from("waitlist_v2")
        .select("email, name")
        .eq("id", waitlistId)
        .single();

      // TODO: Send invite email
      // await resend.emails.send({
      //   to: entry.email,
      //   subject: "Your spot is ready",
      //   html: `Hey ${entry.name}, your Emma spot is ready. You have 48 hours: <a href="...">Claim your spot</a>`
      // })

      return NextResponse.json({ invited: true, email: entry?.email, expiresAt });
    }

    // ── Update seat cap ──────────────────────────────────────────────────
    if (action === "set_cap") {
      const { maxUsers } = body;
      if (typeof maxUsers !== "number" || maxUsers < 1) {
        return NextResponse.json({ error: "maxUsers must be a positive number" }, { status: 400 });
      }

      await supabase.from("global_config").upsert({
        key: "max_active_users",
        value: String(maxUsers),
        updated_at: new Date().toISOString(),
      });

      return NextResponse.json({ updated: true, maxUsers });
    }

    // ── Stats ────────────────────────────────────────────────────────────
    if (action === "stats") {
      const { data: maxRow } = await supabase
        .from("global_config")
        .select("value")
        .eq("key", "max_active_users")
        .single();
      const maxSpots = parseInt(maxRow?.value || "10", 10);

      const { count: activeCount } = await supabase
        .from("waitlist_v2")
        .select("id", { count: "exact", head: true })
        .eq("status", "converted");
      const { count: waitingCount } = await supabase
        .from("waitlist_v2")
        .select("id", { count: "exact", head: true })
        .eq("status", "waiting");
      const { count: invitedCount } = await supabase
        .from("waitlist_v2")
        .select("id", { count: "exact", head: true })
        .eq("status", "invited");

      return NextResponse.json({
        maxSpots,
        activeUsers: activeCount || 0,
        spotsRemaining: Math.max(0, maxSpots - (activeCount || 0)),
        waiting: waitingCount || 0,
        invited: invitedCount || 0,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
