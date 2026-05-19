import { NextRequest, NextResponse } from "next/server";
import { parseInboundEmail } from "@/core/integrations/emailparser";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  // Respond immediately — webhooks require fast 200
  try {
    const payload = await req.json();
    const parsed = parseInboundEmail(payload);
    // Clients configure their webhook URL as /api/emma/ingest/email?client_id=<uuid>
    const clientId = new URL(req.url).searchParams.get("client_id") || null;

    const supabase = getSupabaseAdmin();
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
