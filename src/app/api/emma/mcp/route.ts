import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { encrypt } from "@/core/security/encryption";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET /api/emma/mcp — list the authenticated user's MCP server configs
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const { data, error } = await supabase
    .from("user_mcp_servers")
    .select("id, name, url, auth_token, allowed_tools, blocked_tools, enabled, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const servers = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    url: row.url,
    hasToken: row.auth_token != null,
    allowedTools: row.allowed_tools ?? [],
    blockedTools: row.blocked_tools ?? [],
    enabled: row.enabled,
    createdAt: row.created_at,
  }));

  return NextResponse.json({ servers });
}

// POST /api/emma/mcp — add a new MCP server config
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.name !== "string" || typeof body.url !== "string") {
    return NextResponse.json({ error: "name and url are required" }, { status: 400 });
  }

  const { name, url, authToken, allowedTools, blockedTools } = body as {
    name: string;
    url: string;
    authToken?: string;
    allowedTools?: string[];
    blockedTools?: string[];
  };

  if (!URL.canParse(url)) {
    return NextResponse.json({ error: "url must be a valid URL" }, { status: 400 });
  }

  const encryptedToken = authToken ? encrypt(authToken) : null;

  const { data, error } = await supabase
    .from("user_mcp_servers")
    .insert({
      user_id: user.id,
      name,
      url,
      auth_token: encryptedToken,
      allowed_tools: allowedTools ?? [],
      blocked_tools: blockedTools ?? [],
    })
    .select("id, name, url, allowed_tools, blocked_tools, enabled, created_at")
    .single();

  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({
    id: data.id,
    name: data.name,
    url: data.url,
    hasToken: encryptedToken != null,
    allowedTools: data.allowed_tools,
    blockedTools: data.blocked_tools,
    enabled: data.enabled,
    createdAt: data.created_at,
  });
}
