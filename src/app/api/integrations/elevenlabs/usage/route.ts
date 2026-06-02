import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decrypt } from "@/core/security/encryption";
import { getUser } from "@/lib/supabase/server";

const ELEVENLABS_API = "https://api.elevenlabs.io/v1";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET() {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return NextResponse.json({ error: "DB not configured" }, { status: 501 });

    const { data: membership } = await supabase
      .from("client_members")
      .select("client_id")
      .eq("user_id", user.id)
      .single();
    if (!membership) return NextResponse.json({ error: "No client" }, { status: 404 });

    const { data: integration } = await supabase
      .from("client_integrations")
      .select("access_token, status")
      .eq("client_id", membership.client_id)
      .eq("service", "elevenlabs")
      .single();

    if (!integration || integration.status !== "connected") {
      return NextResponse.json({ error: "ElevenLabs not connected" }, { status: 404 });
    }

    let apiKey: string;
    try {
      apiKey = decrypt(integration.access_token);
    } catch {
      return NextResponse.json({ error: "Could not load stored key" }, { status: 500 });
    }

    const res = await fetch(`${ELEVENLABS_API}/user/subscription`, {
      headers: { "xi-api-key": apiKey },
    });

    if (res.status === 401) {
      return NextResponse.json(
        {
          error: "Key invalid or missing User scope — add 'User' permission when creating the key",
        },
        { status: 401 }
      );
    }
    if (!res.ok) {
      return NextResponse.json({ error: `ElevenLabs returned ${res.status}` }, { status: 502 });
    }

    const sub = await res.json();

    return NextResponse.json({
      tier: (sub.tier as string) ?? "unknown",
      characterCount: (sub.character_count as number) ?? 0,
      characterLimit: (sub.character_limit as number) ?? 0,
      resetUnix: (sub.next_character_count_reset_unix as number | null) ?? null,
      canExtend: (sub.can_extend_character_limit as boolean) ?? false,
      hasOpenInvoices: (sub.has_open_invoices as boolean) ?? false,
      subscriptionStatus: (sub.status as string) ?? "unknown",
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
