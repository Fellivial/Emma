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
  // Respond immediately — Meta expects fast 200
  try {
    const payload = await req.json();
    const message = adapter.parseInboundWebhook(payload);
    // Clients configure their webhook URL as /api/emma/ingest/whatsapp?client_id=<uuid>
    const clientId = new URL(req.url).searchParams.get("client_id") || null;

    if (message) {
      const supabase = getSupabaseAdmin();
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
