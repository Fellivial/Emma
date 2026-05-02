import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { encrypt } from "@/core/security/encryption";
import { audit } from "@/core/security/audit";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return NextResponse.json({ error: "DB not configured" }, { status: 501 });

    const { apiKey } = await req.json();
    if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length < 10) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 400 });
    }

    const { data: membership } = await supabase
      .from("client_members").select("client_id").eq("user_id", user.id).single();
    if (!membership) return NextResponse.json({ error: "No client" }, { status: 404 });

    await supabase.from("client_integrations").upsert({
      client_id: membership.client_id,
      service: "hubspot",
      status: "connected",
      access_token: encrypt(apiKey.trim()),
      account_identifier: "HubSpot API Key",
      updated_at: new Date().toISOString(),
    }, { onConflict: "client_id,service" });

    audit({ userId: user.id, action: "write", resource: "integration", reason: "HubSpot API key connected" }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
