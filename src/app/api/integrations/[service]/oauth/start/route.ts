import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import * as crypto from "crypto";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

const SCOPES: Record<string, string> = {
  gmail: "https://www.googleapis.com/auth/gmail.send",
  google_calendar: "https://www.googleapis.com/auth/calendar.events",
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ service: string }> }) {
  const { service } = await params;

  // Only Google OAuth supported for now
  if (!SCOPES[service]) {
    return NextResponse.json({ error: `${service}: Coming soon` }, { status: 501 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." }, { status: 501 });
  }

  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return NextResponse.json({ error: "DB not configured" }, { status: 501 });

    // Find user's client
    const { data: membership } = await supabase
      .from("client_members")
      .select("client_id")
      .eq("user_id", user.id)
      .single();

    if (!membership) return NextResponse.json({ error: "No client found" }, { status: 404 });

    // Generate state token
    const state = crypto.randomBytes(32).toString("hex");

    await supabase.from("oauth_states").insert({
      state,
      client_id: membership.client_id,
      user_id: user.id,
      service,
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.headers.get("origin") || "http://localhost:3000";
    const redirectUri = `${appUrl}/api/integrations/${service}/oauth/callback`;

    const oauthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    oauthUrl.searchParams.set("client_id", clientId);
    oauthUrl.searchParams.set("redirect_uri", redirectUri);
    oauthUrl.searchParams.set("response_type", "code");
    oauthUrl.searchParams.set("scope", SCOPES[service]);
    oauthUrl.searchParams.set("access_type", "offline");
    oauthUrl.searchParams.set("prompt", "consent");
    oauthUrl.searchParams.set("state", state);

    return NextResponse.redirect(oauthUrl.toString());
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
