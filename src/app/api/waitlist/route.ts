import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Waitlist API — 10-spot early access system
 *
 * GET  /api/waitlist              → Get spot counter (spotsRemaining, totalSpots, waitlistCount)
 * POST /api/waitlist { action: "join", name, email, industry, message?, referralSource? }
 *                                 → Join early access or waitlist
 */
export async function GET() {
  const supabase = getSupabase();

  if (!supabase) {
    // Fallback when DB not configured
    return NextResponse.json({ spotsRemaining: 10, totalSpots: 10, waitlistCount: 0 });
  }

  try {
    // Get max from global_config
    const { data: maxRow } = await supabase
      .from("global_config").select("value").eq("key", "max_active_users").single();
    const maxSpots = parseInt(maxRow?.value || "10", 10);

    // Count converted users (active early access)
    const { count: activeCount } = await supabase
      .from("waitlist_v2").select("id", { count: "exact", head: true })
      .eq("status", "converted");

    // Count waiting users
    const { count: waitingCount } = await supabase
      .from("waitlist_v2").select("id", { count: "exact", head: true })
      .eq("status", "waiting");

    const spotsRemaining = Math.max(0, maxSpots - (activeCount || 0));

    return NextResponse.json({
      spotsRemaining,
      totalSpots: maxSpots,
      activeUsers: activeCount || 0,
      waitlistCount: waitingCount || 0,
    });
  } catch {
    return NextResponse.json({ spotsRemaining: 10, totalSpots: 10, waitlistCount: 0 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "join") {
      const { name, email, industry, message, referralSource } = body;

      if (!name || !email || !industry) {
        return NextResponse.json({ error: "Name, email, and industry are required" }, { status: 400 });
      }

      if (!email.includes("@")) {
        return NextResponse.json({ error: "Invalid email" }, { status: 400 });
      }

      const supabase = getSupabase();
      if (!supabase) {
        return NextResponse.json({ error: "DB not configured" }, { status: 501 });
      }

      // Check if already registered
      const { data: existing } = await supabase
        .from("waitlist_v2").select("id, status, position")
        .eq("email", email.toLowerCase()).single();

      if (existing) {
        if (existing.status === "converted") {
          return NextResponse.json({ result: "already_active", message: "You already have access." });
        }
        return NextResponse.json({
          result: "already_waitlisted",
          position: existing.position,
          message: `You're already on the list at position #${existing.position}.`,
        });
      }

      // Check spots
      const { data: maxRow } = await supabase
        .from("global_config").select("value").eq("key", "max_active_users").single();
      const maxSpots = parseInt(maxRow?.value || "10", 10);

      const { count: activeCount } = await supabase
        .from("waitlist_v2").select("id", { count: "exact", head: true })
        .eq("status", "converted");

      const spotsAvailable = maxSpots - (activeCount || 0);

      if (spotsAvailable > 0) {
        // ── Spot available — immediate access ────────────────────────────
        const { data: entry, error } = await supabase.from("waitlist_v2").insert({
          name: name.trim(),
          email: email.toLowerCase().trim(),
          industry,
          message: message?.trim() || null,
          referral_source: referralSource?.trim() || null,
          status: "converted",
          converted_at: new Date().toISOString(),
        }).select("position").single();

        if (error) {
          if (error.code === "23505") {
            return NextResponse.json({ error: "Email already registered" }, { status: 409 });
          }
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // TODO: Create Supabase auth account + send welcome email
        // await supabase.auth.admin.createUser({ email, ... })
        // await resend.emails.send({ to: email, subject: "Welcome — let's set Emma up for you", ... })

        return NextResponse.json({
          result: "accepted",
          spotsRemaining: spotsAvailable - 1,
          message: "You're in. Emma will reach out shortly.",
        });
      } else {
        // ── No spots — add to waitlist ───────────────────────────────────
        const { data: entry, error } = await supabase.from("waitlist_v2").insert({
          name: name.trim(),
          email: email.toLowerCase().trim(),
          industry,
          message: message?.trim() || null,
          referral_source: referralSource?.trim() || null,
          status: "waiting",
        }).select("position").single();

        if (error) {
          if (error.code === "23505") {
            return NextResponse.json({ error: "Email already registered" }, { status: 409 });
          }
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // TODO: Send waitlist confirmation email
        // await resend.emails.send({ to: email, subject: `You're #${entry.position} — Emma has your spot reserved`, ... })

        return NextResponse.json({
          result: "waitlisted",
          position: entry?.position,
          message: `You're on the list. We'll contact you personally when a spot opens.`,
        });
      }
    }

    // Legacy support — simple email-only join
    if (body.email && !action) {
      const supabase = getSupabase();
      if (supabase) {
        try {
          await supabase.from("waitlist").upsert(
            { email: body.email.toLowerCase().trim(), signed_up_at: new Date().toISOString() },
            { onConflict: "email" }
          );
        } catch {}
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
