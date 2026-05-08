import { createClient } from "@supabase/supabase-js";

export interface McpServer {
  type: "url";
  url: string;
  name: string;
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Returns MCP server entries for the given client, ready to pass to the
 * Anthropic API as mcp_servers. Returns an empty array if Supabase is
 * unavailable or the client has no connected MCP integrations.
 */
export async function getMcpServersForClient(clientId?: string): Promise<McpServer[]> {
  if (!clientId) return [];

  const supabase = getSupabase();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from("client_integrations")
      .select("service, mcp_url")
      .eq("client_id", clientId)
      .eq("status", "connected")
      .like("service", "mcp_%");

    if (error || !data) return [];

    return data
      .filter(
        (row: { service: string; mcp_url: string | null }) =>
          typeof row.mcp_url === "string" && row.mcp_url.length > 0
      )
      .map((row: { service: string; mcp_url: string }) => ({
        type: "url" as const,
        url: row.mcp_url,
        name: row.service,
      }));
  } catch {
    return [];
  }
}
