import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { WhatsAppAdapter } from "@/core/integrations/whatsapp";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

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

    if (message) {
      const supabase = getSupabase();
      if (supabase) {
        await supabase
          .from("ingested_whatsapp")
          .upsert(
            {
              from_number: message.from,
              message_id: message.messageId,
              body: message.text,
              received_at: message.timestamp,
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
