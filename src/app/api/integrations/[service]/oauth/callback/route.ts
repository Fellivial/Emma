import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { encrypt } from "@/core/security/encryption";
import { audit } from "@/core/security/audit";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ service: string }> }) {
  const { service } = await params;
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/settings/integrations?error=missing_params`);
  }

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.redirect(`${appUrl}/settings/integrations?error=db`);
  }

  try {
    // Look up and validate state (single-use, TTL)
    const { data: oauthState } = await supabase
      .from("oauth_states")
      .select("client_id, user_id, service")
      .eq("state", state)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (!oauthState) {
      return NextResponse.redirect(`${appUrl}/settings/integrations?error=invalid_state`);
    }

    // Delete state immediately (single-use)
    await supabase.from("oauth_states").delete().eq("state", state);

    // Exchange code for tokens
    const redirectUri = `${appUrl}/api/integrations/${service}/oauth/callback`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error(`[OAuth] Token exchange failed for ${service}:`, errText);
      return NextResponse.redirect(`${appUrl}/settings/integrations?error=token_exchange`);
    }

    const tokens = await tokenRes.json();

    // Fetch user info for account identifier
    let accountEmail = "";
    try {
      const infoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (infoRes.ok) {
        const info = await infoRes.json();
        accountEmail = info.email || "";
      }
    } catch {}

    // Encrypt tokens
    const encryptedAccess = encrypt(tokens.access_token);
    const encryptedRefresh = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    // Upsert integration
    await supabase.from("client_integrations").upsert({
      client_id: oauthState.client_id,
      service: oauthState.service,
      status: "connected",
      access_token: encryptedAccess,
      refresh_token: encryptedRefresh,
      token_expires_at: expiresAt,
      account_identifier: accountEmail,
      updated_at: new Date().toISOString(),
    }, { onConflict: "client_id,service" });

    // Audit
    audit({
      userId: oauthState.user_id,
      action: "write",
      resource: "integration",
      reason: `${service} connected (${accountEmail})`,
    }).catch(() => {});

    return NextResponse.redirect(`${appUrl}/settings/integrations?connected=${service}`);
  } catch (err) {
    console.error(`[OAuth] Callback error for ${service}:`, err);
    return NextResponse.redirect(`${appUrl}/settings/integrations?error=callback`);
  }
}
