import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * POST /api/waitlist/quick-access
 * Streamlined landing-page entry: email + name only.
 *   - Spots available → insert as converted, send magic-link invite, return { result: "invited" }
 *   - No spots         → return { result: "waitlist" }  (client redirects to /waitlist)
 *   - Already exists   → return { result: "already_registered" } (client redirects to /login)
 */
export async function POST(req: NextRequest) {
  try {
    const { email, name } = await req.json();

    if (!email?.trim() || !name?.trim()) {
      return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail.includes("@")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "DB not configured" }, { status: 501 });
    }

    // Check if already on the list
    const { data: existing } = await supabase
      .from("waitlist_v2")
      .select("id, status")
      .eq("email", normalizedEmail)
      .single();

    if (existing) {
      return NextResponse.json({ result: "already_registered" });
    }

    // Check available spots
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

    const spotsLeft = maxSpots - (activeCount || 0);

    if (spotsLeft <= 0) {
      return NextResponse.json({ result: "waitlist" });
    }

    // Spot available — insert and send invite
    const { error: insertError } = await supabase.from("waitlist_v2").insert({
      name: name.trim(),
      email: normalizedEmail,
      industry: "other",
      status: "converted",
      converted_at: new Date().toISOString(),
    });

    if (insertError) {
      if (insertError.code === "23505") {
        return NextResponse.json({ result: "already_registered" });
      }
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Send magic-link invite
    if (process.env.RESEND_API_KEY) {
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://emma.ai";
        let loginUrl = `${appUrl}/login`;

        const { data: linkData } = await supabase.auth.admin.generateLink({
          type: "magiclink",
          email: normalizedEmail,
        });
        if (linkData?.properties?.action_link) {
          loginUrl = linkData.properties.action_link;
        }

        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: process.env.EMAIL_FROM ?? "noreply@example.com",
          to: normalizedEmail,
          subject: "Welcome to Emma — your access link",
          text: [
            `Hey ${name.trim()},`,
            "",
            "Your spot is reserved. Click below to activate your account:",
            "",
            loginUrl,
            "",
            "The link expires in 24 hours and is single-use.",
            "",
            "— Emma",
          ].join("\n"),
        });
      } catch (emailErr) {
        console.error("[quick-access] invite email failed", emailErr);
      }
    }

    return NextResponse.json({ result: "invited", spotsRemaining: spotsLeft - 1 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
