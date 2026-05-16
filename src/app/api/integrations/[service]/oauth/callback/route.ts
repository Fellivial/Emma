import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { encrypt } from "@/core/security/encryption";
import { audit } from "@/core/security/audit";
import { getClientIp } from "@/lib/get-client-ip";

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

    // Exchange code for tokens (dispatched by provider)
    const redirectUri = `${appUrl}/api/integrations/${service}/oauth/callback`;

    let accessToken = "";
    let refreshToken: string | null = null;
    let expiresAt: string | null = null;
    let accountEmail = "";

    const googleServices = new Set(["gmail", "google_calendar", "google_drive"]);

    if (googleServices.has(oauthState.service)) {
      // ── Google token exchange ─────────────────────────────────────────────
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
        console.error(
          `[OAuth] Google token exchange failed for ${service}:`,
          await tokenRes.text()
        );
        return NextResponse.redirect(`${appUrl}/settings/integrations?error=token_exchange`);
      }
      const tokens = await tokenRes.json();
      accessToken = tokens.access_token || "";
      refreshToken = tokens.refresh_token || null;
      expiresAt = tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : null;
      try {
        const infoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (infoRes.ok) {
          const info = await infoRes.json();
          accountEmail = info.email || "";
        }
      } catch {}
    } else if (oauthState.service === "notion") {
      // ── Notion token exchange ─────────────────────────────────────────────
      const clientId = process.env.NOTION_CLIENT_ID || "";
      const clientSecret = process.env.NOTION_CLIENT_SECRET || "";
      const basicAuth = btoa(`${clientId}:${clientSecret}`);
      const tokenRes = await fetch("https://api.notion.com/v1/oauth/token", {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
      });
      if (!tokenRes.ok) {
        console.error(`[OAuth] Notion token exchange failed:`, await tokenRes.text());
        return NextResponse.redirect(`${appUrl}/settings/integrations?error=token_exchange`);
      }
      const tokens = await tokenRes.json();
      accessToken = tokens.access_token || "";
      accountEmail =
        tokens.owner?.user?.person?.email ||
        tokens.owner?.user?.name ||
        tokens.workspace_name ||
        "";
    } else if (oauthState.service === "slack") {
      // ── Slack token exchange ──────────────────────────────────────────────
      const clientId = process.env.SLACK_CLIENT_ID || "";
      const clientSecret = process.env.SLACK_CLIENT_SECRET || "";
      const basicAuth = btoa(`${clientId}:${clientSecret}`);
      const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ code, redirect_uri: redirectUri }),
      });
      if (!tokenRes.ok) {
        console.error(`[OAuth] Slack token exchange failed:`, await tokenRes.text());
        return NextResponse.redirect(`${appUrl}/settings/integrations?error=token_exchange`);
      }
      const tokens = await tokenRes.json();
      if (!tokens.ok) {
        console.error(`[OAuth] Slack oauth.v2.access error:`, tokens.error);
        return NextResponse.redirect(`${appUrl}/settings/integrations?error=token_exchange`);
      }
      accessToken = tokens.access_token || "";
      accountEmail = tokens.team?.name || "";
    } else {
      return NextResponse.redirect(`${appUrl}/settings/integrations?error=unsupported_service`);
    }

    if (!accessToken) {
      return NextResponse.redirect(`${appUrl}/settings/integrations?error=token_exchange`);
    }

    // Encrypt tokens
    const encryptedAccess = encrypt(accessToken);
    const encryptedRefresh = refreshToken ? encrypt(refreshToken) : null;

    // Upsert integration
    await supabase.from("client_integrations").upsert(
      {
        client_id: oauthState.client_id,
        service: oauthState.service,
        status: "connected",
        access_token: encryptedAccess,
        refresh_token: encryptedRefresh,
        token_expires_at: expiresAt,
        account_identifier: accountEmail,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "client_id,service" }
    );

    // Audit
    audit({
      userId: oauthState.user_id,
      action: "write",
      resource: "integration",
      reason: `${service} connected (${accountEmail})`,
      ip: getClientIp(req),
    }).catch(() => {});

    return NextResponse.redirect(`${appUrl}/settings/integrations?connected=${service}`);
  } catch (err) {
    console.error(`[OAuth] Callback error for ${service}:`, err);
    return NextResponse.redirect(`${appUrl}/settings/integrations?error=callback`);
  }
}
