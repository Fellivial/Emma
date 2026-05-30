import * as crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { WhatsAppAdapter } from "@/core/integrations/whatsapp";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const adapter = new WhatsAppAdapter();

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge || "", { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  // Verify X-Hub-Signature-256 before processing — Meta always sends this
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    console.error("[WhatsApp ingest] WHATSAPP_APP_SECRET is not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const body = await req.text();
  const sigHeader = req.headers.get("x-hub-signature-256") || "";
  const sigValue = sigHeader.startsWith("sha256=") ? sigHeader.slice(7) : sigHeader;

  const expected = crypto.createHmac("sha256", appSecret).update(body).digest("hex");
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
    const message = adapter.parseInboundWebhook(payload);
    // Clients configure their webhook URL as /api/emma/ingest/whatsapp?client_id=<uuid>
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

    if (message) {
      if (supabase) {
        await supabase.from("ingested_whatsapp").upsert(
          {
            from_number: message.from,
            message_id: message.messageId,
            body: message.text,
            received_at: message.timestamp,
            ...(clientId ? { client_id: clientId } : {}),
          },
          { onConflict: "message_id" }
        );
      }
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch {
    return NextResponse.json({ success: true }, { status: 200 });
  }
}
