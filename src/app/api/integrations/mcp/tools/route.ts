/**
 * GET  /api/integrations/mcp/tools?service=mcp_xxx
 *   Discovers tools from a connected MCP server and returns them alongside
 *   the current allowedTools filter from client_integrations.metadata.
 *
 * PATCH /api/integrations/mcp/tools
 *   { service: "mcp_xxx", allowedTools: string[] | null }
 *   Persists the explicit tool allowlist. null and [] both deny all tools.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { decrypt } from "@/core/security/encryption";
import { isMcpToolsEnabled, listMcpTools } from "@/core/integrations/mcp-client";

function isMcpService(service: string | null | undefined): service is string {
  return typeof service === "string" && /^mcp_[a-z0-9_]{1,95}$/.test(service);
}

async function resolveClientId(userId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase
    .from("client_members")
    .select("client_id")
    .eq("user_id", userId)
    .single();
  return (data?.client_id as string | null) ?? null;
}

export async function GET(req: NextRequest) {
  if (!isMcpToolsEnabled()) {
    console.warn("[MCP API] Blocked tool discovery: ENABLE_MCP_TOOLS is not true");
    return NextResponse.json({ error: "MCP tools are disabled" }, { status: 503 });
  }
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = new URL(req.url).searchParams.get("service");
  if (!isMcpService(service)) {
    return NextResponse.json({ error: "Invalid MCP service" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "No DB" }, { status: 503 });

  const clientId = await resolveClientId(user.id);
  if (!clientId) return NextResponse.json({ error: "No client" }, { status: 404 });

  const { data: row } = await supabase
    .from("client_integrations")
    .select("mcp_url, access_token, metadata, status")
    .eq("client_id", clientId)
    .eq("service", service)
    .single();

  if (!row || row.status !== "connected") {
    return NextResponse.json({ error: "MCP server not connected" }, { status: 404 });
  }

  const mcpUrl = row.mcp_url as string;
  let authToken: string | undefined;
  if (row.access_token) {
    try {
      authToken = decrypt(row.access_token as string);
    } catch {}
  }

  let tools: Array<{ name: string; description: string }> = [];
  try {
    const raw = await listMcpTools(mcpUrl, authToken);
    tools = raw.map((t) => ({ name: t.name, description: t.description }));
  } catch (err) {
    return NextResponse.json(
      { error: `Could not reach MCP server: ${(err as Error).message ?? String(err)}` },
      { status: 502 }
    );
  }

  const allowedTools =
    (row.metadata as { allowedTools?: string[] | null } | null)?.allowedTools ?? null;

  return NextResponse.json({ tools, allowedTools });
}

export async function PATCH(req: NextRequest) {
  if (!isMcpToolsEnabled()) {
    console.warn("[MCP API] Blocked tool policy update: ENABLE_MCP_TOOLS is not true");
    return NextResponse.json({ error: "MCP tools are disabled" }, { status: 503 });
  }
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "No DB" }, { status: 503 });

  const clientId = await resolveClientId(user.id);
  if (!clientId) return NextResponse.json({ error: "No client" }, { status: 404 });

  let body: { service: string; allowedTools: string[] | null };
  try {
    body = (await req.json()) as { service: string; allowedTools: string[] | null };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isMcpService(body.service)) {
    return NextResponse.json({ error: "Invalid MCP service" }, { status: 400 });
  }
  if (
    body.allowedTools !== null &&
    (!Array.isArray(body.allowedTools) ||
      body.allowedTools.length > 32 ||
      body.allowedTools.some(
        (name) => typeof name !== "string" || name.length === 0 || name.length > 128
      ))
  ) {
    return NextResponse.json({ error: "allowedTools must be an array or null" }, { status: 400 });
  }

  // Merge into existing metadata so other keys are preserved
  const { data: existing } = await supabase
    .from("client_integrations")
    .select("metadata")
    .eq("client_id", clientId)
    .eq("service", body.service)
    .single();

  const merged = {
    ...((existing?.metadata as Record<string, unknown>) ?? {}),
    allowedTools: body.allowedTools,
  };

  const { error } = await supabase
    .from("client_integrations")
    .update({ metadata: merged, updated_at: new Date().toISOString() })
    .eq("client_id", clientId)
    .eq("service", body.service);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
