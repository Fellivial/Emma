/**
 * Lightweight MCP Streamable HTTP client.
 * Implements JSON-RPC 2.0 over HTTP for tool discovery and invocation.
 * No external dependencies — uses Node fetch.
 */

const MCP_TIMEOUT_MS = 10_000;

interface McpRawTool {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Discover tools exposed by an MCP server.
 * Returns OpenAI-format function definitions.
 */
export async function listMcpTools(
  url: string,
  authToken?: string
): Promise<Array<{ name: string; description: string; parameters: Record<string, unknown> }>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    signal: AbortSignal.timeout(MCP_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`MCP server ${url} returned ${res.status}`);

  const data = (await res.json()) as { result?: { tools?: McpRawTool[] }; error?: unknown };
  if (data.error) throw new Error(`MCP tools/list error: ${JSON.stringify(data.error)}`);

  const tools = data.result?.tools ?? [];
  return tools.map((t) => ({
    name: t.name,
    description: t.description ?? t.name,
    parameters: {
      type: "object",
      properties: t.inputSchema?.properties ?? {},
      required: t.inputSchema?.required ?? [],
    },
  }));
}

/**
 * Invoke an MCP tool and return its text output.
 */
export async function callMcpTool(
  url: string,
  toolName: string,
  args: Record<string, unknown>,
  authToken?: string
): Promise<string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
    signal: AbortSignal.timeout(MCP_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`MCP tool call "${toolName}" returned ${res.status}`);

  const data = (await res.json()) as {
    result?: { content?: Array<{ type: string; text?: string }> };
    error?: { message?: string };
  };

  if (data.error) throw new Error(data.error.message ?? `MCP tool "${toolName}" error`);

  const content = data.result?.content ?? [];
  return (
    content
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n") || JSON.stringify(data.result ?? {})
  );
}
