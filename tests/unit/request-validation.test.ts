import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseAgentRequest,
  parseHistoryMessages,
  parseMcpServerInput,
} from "@/core/request-validation";

describe("request validation", () => {
  it("requires approvalId for approval actions", () => {
    expect(parseAgentRequest({ action: "approve" })).toEqual({
      ok: false,
      error: "approvalId is required for approve",
    });
    expect(parseAgentRequest({ action: "approve", approvalId: "approval-1" }).ok).toBe(true);
  });

  it("rejects unknown agent actions and invalid history limits", () => {
    expect(parseAgentRequest({ action: "execute_everything" }).ok).toBe(false);
    expect(parseAgentRequest({ action: "history", limit: 500 }).ok).toBe(false);
  });

  it("accepts valid encrypted-history messages and rejects malformed messages", () => {
    expect(
      parseHistoryMessages({
        id: "message-1",
        role: "user",
        content: "hello",
        display: "hello",
        timestamp: Date.now(),
      }).ok
    ).toBe(true);

    expect(
      parseHistoryMessages({ id: "message-1", role: "admin", content: "hello", display: "hello" })
        .ok
    ).toBe(false);
    expect(parseHistoryMessages([]).ok).toBe(false);
  });

  it("requires HTTPS MCP URLs and validates tool allow/block lists", () => {
    expect(parseMcpServerInput({ name: "Local", url: "http://example.com" }).ok).toBe(false);
    expect(
      parseMcpServerInput({
        name: "Remote",
        url: "https://mcp.example.com",
        allowedTools: ["read_calendar"],
        blockedTools: ["delete_calendar"],
      }).ok
    ).toBe(true);
    expect(
      parseMcpServerInput({
        name: "Remote",
        url: "https://mcp.example.com",
        allowedTools: "all",
      }).ok
    ).toBe(false);
  });
});

describe("P0 route regressions", () => {
  it("passes the task client id to an approved tool", () => {
    const source = readFileSync(resolve("src/app/api/emma/agent/route.ts"), "utf8");
    expect(source).toMatch(/toolDef\.handler\([\s\S]*?clientId:\s*task\.client_id/);
  });

  it("keeps legacy plaintext history read-only", () => {
    const source = readFileSync(resolve("src/app/api/emma/history/route.ts"), "utf8");
    const postSource = source.slice(source.indexOf("export async function POST"));
    expect(postSource).not.toContain('.from("chat_messages")');
    expect(source).toContain("Legacy read-only fallback");
  });
});
