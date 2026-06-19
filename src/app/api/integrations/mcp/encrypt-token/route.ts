import { NextRequest, NextResponse } from "next/server";
import { encrypt } from "@/core/security/encryption";
import { getUser } from "@/lib/supabase/server";
import { isMcpToolsEnabled } from "@/core/integrations/mcp-client";

export async function POST(req: NextRequest) {
  try {
    if (!isMcpToolsEnabled()) {
      console.warn("[MCP API] Blocked token configuration: ENABLE_MCP_TOOLS is not true");
      return NextResponse.json({ error: "MCP tools are disabled" }, { status: 503 });
    }
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const token = typeof body?.token === "string" ? body.token.trim() : "";

    if (!token) {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }
    if (token.length > 4096) {
      return NextResponse.json({ error: "token too long" }, { status: 400 });
    }

    const encrypted = encrypt(token);
    return NextResponse.json({ encrypted });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
