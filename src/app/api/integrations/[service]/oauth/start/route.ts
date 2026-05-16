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

const GOOGLE_SCOPES: Record<string, string> = {
  gmail: "https://www.googleapis.com/auth/gmail.send",
  google_calendar: "https://www.googleapis.com/auth/calendar.events",
  google_drive: "https://www.googleapis.com/auth/drive.file",
};

const SUPPORTED_SERVICES = new Set([
  ...Object.keys(GOOGLE_SCOPES),
  "notion",
  "slack",
]);

export async function GET(req: NextRequest, { params }: { params: Promise<{ service: string }> }) {
  const { service } = await params;

  if (!SUPPORTED_SERVICES.has(service)) {
    return NextResponse.json({ error: `${service}: not supported` }, { status: 501 });
  }

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

    if (!membership) return NextResponse.json({ error: "No client found" }, { status: 404 });

    const state = crypto.randomBytes(32).toString("hex");

    await supabase.from("oauth_states").insert({
      state,
      client_id: membership.client_id,
      user_id: user.id,
      service,
    });

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL || req.headers.get("origin") || "http://localhost:3000";
    const redirectUri = `${appUrl}/api/integrations/${service}/oauth/callback`;

    // ── Google OAuth ─────────────────────────────────────────────────────────
    if (GOOGLE_SCOPES[service]) {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        return NextResponse.json(
          { error: "Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." },
          { status: 501 }
        );
      }
      const oauthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      oauthUrl.searchParams.set("client_id", clientId);
      oauthUrl.searchParams.set("redirect_uri", redirectUri);
      oauthUrl.searchParams.set("response_type", "code");
      oauthUrl.searchParams.set("scope", GOOGLE_SCOPES[service]);
      oauthUrl.searchParams.set("access_type", "offline");
      oauthUrl.searchParams.set("prompt", "consent");
      oauthUrl.searchParams.set("state", state);
      return NextResponse.redirect(oauthUrl.toString());
    }

    // ── Notion OAuth ─────────────────────────────────────────────────────────
    if (service === "notion") {
      const clientId = process.env.NOTION_CLIENT_ID;
      if (!clientId) {
        return NextResponse.json(
          { error: "Notion OAuth not configured. Set NOTION_CLIENT_ID." },
          { status: 501 }
        );
      }
      const oauthUrl = new URL("https://api.notion.com/v1/oauth/authorize");
      oauthUrl.searchParams.set("client_id", clientId);
      oauthUrl.searchParams.set("redirect_uri", redirectUri);
      oauthUrl.searchParams.set("response_type", "code");
      oauthUrl.searchParams.set("owner", "user");
      oauthUrl.searchParams.set("state", state);
      return NextResponse.redirect(oauthUrl.toString());
    }

    // ── Slack OAuth v2 ───────────────────────────────────────────────────────
    if (service === "slack") {
      const clientId = process.env.SLACK_CLIENT_ID;
      if (!clientId) {
        return NextResponse.json(
          { error: "Slack OAuth not configured. Set SLACK_CLIENT_ID." },
          { status: 501 }
        );
      }
      const oauthUrl = new URL("https://slack.com/oauth/v2/authorize");
      oauthUrl.searchParams.set("client_id", clientId);
      oauthUrl.searchParams.set("scope", "channels:read,chat:write,files:write");
      oauthUrl.searchParams.set("redirect_uri", redirectUri);
      oauthUrl.searchParams.set("state", state);
      return NextResponse.redirect(oauthUrl.toString());
    }

    return NextResponse.json({ error: "Unhandled service" }, { status: 500 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
