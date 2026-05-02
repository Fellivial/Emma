import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
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

    const { service } = await req.json();
    if (!service) return NextResponse.json({ error: "service required" }, { status: 400 });

    const { data: membership } = await supabase
      .from("client_members").select("client_id").eq("user_id", user.id).single();
    if (!membership) return NextResponse.json({ error: "No client" }, { status: 404 });

    await supabase.from("client_integrations").update({
      status: "disconnected",
      access_token: null,
      refresh_token: null,
      account_identifier: null,
      token_expires_at: null,
      updated_at: new Date().toISOString(),
    }).eq("client_id", membership.client_id).eq("service", service);

    audit({ userId: user.id, action: "delete", resource: "integration", reason: `${service} disconnected` }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
