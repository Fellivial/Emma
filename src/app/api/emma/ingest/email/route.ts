import * as crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { parseInboundEmail } from "@/core/integrations/emailparser";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  // Verify HMAC signature — shared secret configured in the email provider's webhook settings
  const webhookSecret = process.env.INGEST_EMAIL_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[Email ingest] INGEST_EMAIL_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const body = await req.text();
  const sigHeader =
    req.headers.get("x-webhook-signature") || req.headers.get("x-hook-secret") || "";
  const sigValue = sigHeader.startsWith("sha256=") ? sigHeader.slice(7) : sigHeader;

  if (!sigValue) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  const expected = crypto.createHmac("sha256", webhookSecret).update(body).digest("hex");
  let signatureValid = false;
  try {
    signatureValid = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sigValue));
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  try {
    const payload = JSON.parse(body);
    const parsed = parseInboundEmail(payload);
    // Clients configure their webhook URL as /api/emma/ingest/email?client_id=<uuid>
    const clientId = new URL(req.url).searchParams.get("client_id") || null;

    const supabase = getSupabaseAdmin();

    if (clientId && supabase) {
      const { data: clientRow } = await supabase
        .from("clients")
        .select("id")
        .eq("id", clientId)
        .single();
      if (!clientRow) {
        return NextResponse.json({ error: "Invalid client_id" }, { status: 400 });
      }
    }

    if (supabase) {
      await supabase.from("ingested_emails").insert({
        from_address: parsed.from,
        to_address: parsed.to,
        subject: parsed.subject,
        body_text: parsed.bodyText,
        attachment_count: parsed.attachmentCount,
        received_at: parsed.receivedAt,
        processed: false,
        ...(clientId ? { client_id: clientId } : {}),
      });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch {
    return NextResponse.json({ success: true }, { status: 200 });
  }
}
