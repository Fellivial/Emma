import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { renderEmail, generateUnsubscribeUrl, type EmailContext } from "@/core/email-templates";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Cron: Email Sequence Processor
 * Schedule: every 15 minutes (vercel.json)
 *
 * Flow per row:
 *   1. Optimistic lock (pending → sending)
 *   2. Deduplication check
 *   3. Build context from trial + profile
 *   4. Render template
 *   5. Send via Resend
 *   6. Mark sent or failed
 */
export async function GET(req: NextRequest) {
  // ── Cron authentication ───────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const isLocalhost =
    req.headers.get("host")?.includes("localhost") ||
    req.headers.get("host")?.includes("127.0.0.1");

  if (!isLocalhost) {
    if (!cronSecret) {
      console.error("[CRON] CRON_SECRET is not set — rejecting request");
      return NextResponse.json(
        { error: "Cron not configured" },
        { status: 500 }
      );
    }
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
  }
  // ─────────────────────────────────────────────────────────────────

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "DB not configured" }, { status: 501 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    // Mark all pending as failed so they don't retry forever
    const { data: pending } = await supabase
      .from("email_sequences")
      .select("id")
      .eq("status", "pending")
      .lte("scheduled_for", new Date().toISOString())
      .limit(50);

    if (pending && pending.length > 0) {
      console.warn("[Cron:Email] RESEND_API_KEY not configured — marking pending rows as failed");
      for (const row of pending) {
        await supabase.from("email_sequences").update({
          status: "failed",
          error_detail: "RESEND_API_KEY not configured",
        }).eq("id", row.id);
      }
    }

    return NextResponse.json({ error: "RESEND_API_KEY not configured", failed: pending?.length || 0 });
  }

  const resend = new Resend(resendKey);
  const fromAddress = process.env.EMAIL_FROM || "Emma <emma@example.com>";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  try {
    const now = new Date().toISOString();

    // Fetch due emails (batch of 50)
    const { data: pendingEmails, error: fetchErr } = await supabase
      .from("email_sequences")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", now)
      .order("scheduled_for", { ascending: true })
      .limit(50);

    if (fetchErr || !pendingEmails || pendingEmails.length === 0) {
      return NextResponse.json({ processed: 0 });
    }

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of pendingEmails) {
      try {
        // ── 1. Optimistic lock ────────────────────────────────────────
        const { count } = await supabase
          .from("email_sequences")
          .update({ status: "sending" }, { count: "exact" })
          .eq("id", row.id)
          .eq("status", "pending");

        if (!count || count === 0) {
          skipped++;
          continue; // Another cron instance got it
        }

        // ── 2. Deduplication check ────────────────────────────────────
        const { data: dupe } = await supabase
          .from("email_sequences")
          .select("id")
          .eq("user_id", row.user_id)
          .eq("template_id", row.template_id)
          .eq("status", "sent")
          .neq("id", row.id)
          .limit(1)
          .single();

        if (dupe) {
          await supabase.from("email_sequences").update({
            status: "skipped",
            error_detail: "Duplicate — already sent",
          }).eq("id", row.id);
          skipped++;
          continue;
        }

        // ── 3. Build context ──────────────────────────────────────────
        const { data: profile } = await supabase
          .from("profiles")
          .select("name")
          .eq("id", row.user_id)
          .single();

        const context: EmailContext = {
          name: profile?.name || "there",
          email: row.email,
          upgradeUrl: `${appUrl}/settings/billing?ref=email_${row.template_id}`,
          unsubscribeUrl: generateUnsubscribeUrl(row.user_id),
        };

        // ── 4. Render template ────────────────────────────────────────
        const rendered = renderEmail(row.template_id, context);

        // ── 5. Send via Resend ────────────────────────────────────────
        await resend.emails.send({
          from: fromAddress,
          to: row.email,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        });

        // ── 6. Mark sent ──────────────────────────────────────────────
        await supabase.from("email_sequences").update({
          status: "sent",
          sent_at: new Date().toISOString(),
        }).eq("id", row.id);

        sent++;
      } catch (err: any) {
        // ── 7. Mark failed ────────────────────────────────────────────
        console.error(`[Cron:Email] Failed ${row.id}:`, err);
        await supabase.from("email_sequences").update({
          status: "failed",
          error_detail: err?.message || String(err),
        }).eq("id", row.id);
        failed++;
      }
    }

    return NextResponse.json({ processed: sent + skipped + failed, sent, skipped, failed });
  } catch (err) {
    console.error("[Cron:Email] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
