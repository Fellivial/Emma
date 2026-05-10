import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseInboundEmail } from "@/core/integrations/emailparser";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  // Respond immediately — webhooks require fast 200
  try {
    const payload = await req.json();
    const parsed = parseInboundEmail(payload);

    const supabase = getSupabase();
    if (supabase) {
      await supabase.from("ingested_emails").insert({
        from_address: parsed.from,
        to_address: parsed.to,
        subject: parsed.subject,
        body_text: parsed.bodyText,
        attachment_count: parsed.attachmentCount,
        received_at: parsed.receivedAt,
        processed: false,
      });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch {
    return NextResponse.json({ success: true }, { status: 200 });
  }
}
