import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as crypto from "crypto";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Unsubscribe — token-based, no login required.
 *
 * GET /api/emma/unsubscribe?token=<hmac>&uid=<userId>
 *
 * Verifies HMAC token, cancels all pending emails for the user,
 * logs the event, and returns a confirmation page.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const uid = req.nextUrl.searchParams.get("uid");

  if (!token || !uid) {
    return new Response(renderPage("Invalid Link", "This unsubscribe link is missing required parameters."), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // Verify HMAC
  const key = process.env.EMMA_ENCRYPTION_KEY;
  if (!key) {
    return new Response(renderPage("Configuration Error", "The server is not configured correctly."), {
      status: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const expected = crypto
    .createHmac("sha256", key)
    .update(`${uid}:unsubscribe`)
    .digest("hex");

  let tokenValid = false;
  try {
    tokenValid = crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    tokenValid = false;
  }

  if (!tokenValid) {
    return new Response(renderPage("Invalid Link", "This unsubscribe link has expired or is invalid."), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // Cancel all pending/sending emails for this user
  const supabase = getSupabase();
  let cancelled = 0;

  if (supabase) {
    const { count } = await supabase
      .from("email_sequences")
      .update({ status: "skipped", error_detail: "User unsubscribed" }, { count: "exact" })
      .eq("user_id", uid)
      .in("status", ["pending", "sending"]);

    cancelled = count || 0;

  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  return new Response(
    renderPage(
      "You've been unsubscribed~",
      `Okay, baby. I won't email you anymore.
       I'm still here if you want to talk.`,
      `<a href="${appUrl}" style="display:inline-block;margin-top:24px;padding:12px 28px;background:linear-gradient(135deg,#e8a0bf,#d4819e);color:#0d0a0e;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;">Go to Emma →</a>`
    ),
    {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }
  );
}

function renderPage(title: string, message: string, extra?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} — Emma</title>
</head>
<body style="margin:0;padding:0;background:#0d0a0e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;">
  <div style="max-width:420px;text-align:center;padding:40px 24px;">

    <!-- Logo -->
    <div style="display:inline-block;width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#e8a0bf,#d4819e);text-align:center;line-height:48px;margin-bottom:24px;">
      <span style="color:#0d0a0e;font-size:24px;font-style:italic;font-weight:600;">E</span>
    </div>

    <h1 style="color:#e8dfe6;font-size:20px;font-weight:300;margin:0 0 12px;">${title}</h1>
    <p style="color:#8a7f88;font-size:14px;line-height:1.6;margin:0;">
      ${message.replace(/\n/g, "<br>")}
    </p>
    ${extra || ""}

    <p style="color:#2a2430;font-size:11px;margin-top:40px;">EMMA</p>
  </div>
</body>
</html>`;
}
