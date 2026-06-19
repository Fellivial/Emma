import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

const routeMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ getUser: routeMocks.getUser }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: routeMocks.getSupabaseAdmin }));

import {
  MCP_LIMITS,
  isMcpToolExplicitlyAllowed,
  listMcpTools,
  postMcpJsonRpc,
  validateMcpUrl,
  type McpTransportDependencies,
} from "@/core/integrations/mcp-client";
import { GET as getMcpTools, PATCH as patchMcpTools } from "@/app/api/integrations/mcp/tools/route";
import { POST as encryptMcpToken } from "@/app/api/integrations/mcp/encrypt-token/route";
import { proxy } from "@/proxy";
import { NextRequest } from "next/server";

const publicResolver = vi.fn(async () => [{ address: "93.184.216.34", family: 4 as const }]);

function transportReturning(
  statusCode: number,
  body: string,
  headers: Record<string, string> = {}
): McpTransportDependencies {
  return {
    resolve: publicResolver,
    send: vi.fn(async () => ({ statusCode, headers, body })),
  };
}

describe("MCP containment", () => {
  beforeEach(() => {
    delete process.env.ENABLE_MCP_TOOLS;
    publicResolver.mockClear();
    routeMocks.getUser.mockReset();
    routeMocks.getSupabaseAdmin.mockReset();
    routeMocks.getUser.mockResolvedValue({ id: "user-1" });
  });

  it("rejects MCP APIs while disabled", async () => {
    const getResponse = await getMcpTools(
      new Request("https://emma.example/api/integrations/mcp/tools?service=mcp_test") as never
    );
    const patchResponse = await patchMcpTools(
      new Request("https://emma.example/api/integrations/mcp/tools", {
        method: "PATCH",
        body: JSON.stringify({ service: "mcp_test", allowedTools: ["read"] }),
      }) as never
    );
    const tokenResponse = await encryptMcpToken(
      new Request("https://emma.example/api/integrations/mcp/encrypt-token", {
        method: "POST",
        body: JSON.stringify({ token: "secret" }),
      }) as never
    );

    expect(getResponse.status).toBe(503);
    expect(patchResponse.status).toBe(503);
    expect(tokenResponse.status).toBe(503);
    expect(routeMocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("gates the MCP settings route while disabled", async () => {
    const response = await proxy(new NextRequest("https://emma.example/settings/mcp"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://emma.example/settings/more");
  });

  it("keeps MCP disabled in the example environment", () => {
    const exampleEnv = readFileSync(resolvePath(".env.local.example"), "utf8");
    expect(exampleEnv).toMatch(/^ENABLE_MCP_TOOLS=false$/m);
  });

  it("blocks direct authenticated writes to MCP integration rows", () => {
    const migration = readFileSync(
      resolvePath("supabase/migrations/20260619000002_contain_mcp_client_integrations.sql"),
      "utf8"
    ).toLowerCase();
    expect(migration).toContain("members manage non-mcp integrations");
    expect(migration.indexOf("lock table public.client_integrations")).toBeLessThan(
      migration.indexOf("ambiguous service values")
    );
    expect(migration).toContain("service not like 'mcp\\_%'");
    expect(migration).toContain("refusing to tighten client_integrations service constraint");
    expect(migration).toContain("service like 'mcp\\_%'");
    expect(migration).toContain("with check");
    expect(migration).toContain("legacy/inert");
    expect(migration).toContain("to_regclass('public.user_mcp_servers') is not null");
  });

  it.each([
    "https://localhost/mcp",
    "https://127.0.0.1/mcp",
    "https://10.2.3.4/mcp",
    "https://172.16.0.1/mcp",
    "https://192.168.1.10/mcp",
    "https://169.254.10.20/mcp",
    "https://[::1]/mcp",
    "https://[fc00::1]/mcp",
    "https://[fe80::1]/mcp",
  ])("rejects local or private target %s", async (url) => {
    await expect(validateMcpUrl(url, publicResolver)).rejects.toThrow(/not allowed|public/i);
  });

  it("rejects cloud metadata hostnames", async () => {
    await expect(validateMcpUrl("https://metadata.google.internal/computeMetadata/v1"))
      .rejects.toThrow(/metadata/i);
  });

  it("rejects a hostname when DNS resolves to a private address", async () => {
    const privateResolver = vi.fn(async () => [{ address: "10.20.30.40", family: 4 as const }]);

    await expect(validateMcpUrl("https://mcp.example.com/rpc", privateResolver))
      .rejects.toThrow(/public/i);
  });

  it("rejects a redirect to a private address before the second request", async () => {
    process.env.ENABLE_MCP_TOOLS = "true";
    const send = vi.fn(async () => ({
      statusCode: 307,
      headers: { location: "https://127.0.0.1/internal" },
      body: "",
    }));

    await expect(
      postMcpJsonRpc(
        "https://mcp.example.com/rpc",
        { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
        undefined,
        { resolve: publicResolver, send }
      )
    ).rejects.toThrow(/not allowed|public/i);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("rejects an oversized response", async () => {
    process.env.ENABLE_MCP_TOOLS = "true";
    const dependencies = transportReturning(200, "x".repeat(MCP_LIMITS.maxResponseBytes + 1));

    await expect(
      postMcpJsonRpc(
        "https://mcp.example.com/rpc",
        { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
        undefined,
        dependencies
      )
    ).rejects.toThrow(/response.*large/i);
  });

  it("rejects excessive tool discovery", async () => {
    process.env.ENABLE_MCP_TOOLS = "true";
    const tools = Array.from({ length: MCP_LIMITS.maxTools + 1 }, (_, index) => ({
      name: `tool_${index}`,
      description: "read",
      inputSchema: { type: "object", properties: {} },
    }));
    const dependencies = transportReturning(
      200,
      JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools } })
    );

    await expect(listMcpTools("https://mcp.example.com/rpc", undefined, dependencies))
      .rejects.toThrow(/too many tools/i);
  });

  it("uses a default-deny allowlist", () => {
    expect(isMcpToolExplicitlyAllowed("read", null)).toBe(false);
    expect(isMcpToolExplicitlyAllowed("read", undefined)).toBe(false);
    expect(isMcpToolExplicitlyAllowed("read", [])).toBe(false);
    expect(isMcpToolExplicitlyAllowed("unknown", ["read"])).toBe(false);
    expect(isMcpToolExplicitlyAllowed("read", ["read"])).toBe(true);
  });

  it("does not treat an allowlist or caller-supplied flag as execution approval", async () => {
    process.env.ENABLE_MCP_TOOLS = "true";
    const dependencies = transportReturning(200, "{}");
    const { callMcpTool } = await import("@/core/integrations/mcp-client");

    await expect(
      callMcpTool(
        "https://mcp.example.com/rpc",
        "read",
        {},
        undefined,
        { approved: true, approvalId: "unverified" },
        dependencies
      )
    ).rejects.toThrow(/verified approval flow/i);
    expect(dependencies.send).not.toHaveBeenCalled();
  });

  it("does not expose the generic transport as a tool-execution bypass", async () => {
    process.env.ENABLE_MCP_TOOLS = "true";
    const dependencies = transportReturning(200, "{}");

    await expect(
      postMcpJsonRpc(
        "https://mcp.example.com/rpc",
        { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "read" } },
        undefined,
        dependencies
      )
    ).rejects.toThrow(/method is not allowed/i);
    expect(dependencies.send).not.toHaveBeenCalled();
  });
});
