import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const historyMocks = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
  getOrCreateConversation: vi.fn(),
  saveMessage: vi.fn(),
  getLatestConversationSummary: vi.fn(),
  getConversationMessages: vi.fn(),
  updateConversationSummary: vi.fn(),
  updateConversationTitle: vi.fn(),
  after: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: historyMocks.createServerSupabase,
}));

vi.mock("@/core/memory-db", () => ({
  getOrCreateConversation: historyMocks.getOrCreateConversation,
  saveMessage: historyMocks.saveMessage,
  getLatestConversationSummary: historyMocks.getLatestConversationSummary,
  getConversationMessages: historyMocks.getConversationMessages,
  updateConversationSummary: historyMocks.updateConversationSummary,
  updateConversationTitle: historyMocks.updateConversationTitle,
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: historyMocks.after };
});

import { BUILT_IN_ROUTINES } from "@/core/routines-engine";
import { buildDefaultSchedules } from "@/core/scheduler-engine";
import { callMcpTool, listMcpTools } from "@/core/integrations/mcp-client";
import { GET as getHistory, POST as postHistory } from "@/app/api/emma/history/route";

describe("P0 merge blockers", () => {
  beforeEach(() => {
    delete process.env.ENABLE_MCP_TOOLS;
    historyMocks.createServerSupabase.mockReset();
    historyMocks.getOrCreateConversation.mockReset();
    historyMocks.saveMessage.mockReset();
    historyMocks.getLatestConversationSummary.mockReset();
    historyMocks.after.mockReset();
    delete process.env.ENABLE_LEGACY_CHAT_FALLBACK;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds no active routine schedules while routines are disabled", () => {
    expect(buildDefaultSchedules(BUILT_IN_ROUTINES, false)).toEqual([]);
  });

  it("locks clients before checking vertical_id values", () => {
    const sql = readFileSync(
      resolve("supabase/migrations/20260619000001_drop_unused_client_vertical_id.sql"),
      "utf8"
    ).toLowerCase();
    const lockIndex = sql.indexOf("lock table public.clients in access exclusive mode");
    const valueCheckIndex = sql.indexOf("vertical_id is not null");

    expect(lockIndex).toBeGreaterThan(-1);
    expect(valueCheckIndex).toBeGreaterThan(lockIndex);
    expect(sql).toContain("raise exception");
  });

  it("blocks MCP discovery before making a network request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(listMcpTools("https://mcp.example.com")).rejects.toThrow(
      "MCP tools are disabled"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks MCP execution before making a network request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(callMcpTool("https://mcp.example.com", "delete_all", {})).rejects.toThrow(
      "MCP tools are disabled"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("writes new history through the encrypted message path only", async () => {
    const from = vi.fn();
    historyMocks.createServerSupabase.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
      from,
    });
    historyMocks.getOrCreateConversation.mockResolvedValue("conversation-1");
    historyMocks.saveMessage.mockResolvedValue(undefined);

    const request = new Request("http://localhost/api/emma/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "message-1",
        role: "user",
        content: "private content",
        display: "private content",
      }),
    });

    const response = await postHistory(request as never);

    expect(response.status).toBe(200);
    expect(historyMocks.saveMessage).toHaveBeenCalledWith(
      "conversation-1",
      "user-1",
      expect.objectContaining({ id: "message-1", content: "private content" })
    );
    expect(from).not.toHaveBeenCalled();
  });

  it("does not query legacy plaintext history unless the fallback flag is true", async () => {
    const from = vi.fn();
    historyMocks.createServerSupabase.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
      from,
    });
    historyMocks.getLatestConversationSummary.mockResolvedValue(null);

    const response = await getHistory();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ messages: [] });
    expect(from).not.toHaveBeenCalled();
  });

  it("allows the legacy read-only fallback only when explicitly enabled", async () => {
    vi.stubEnv("ENABLE_LEGACY_CHAT_FALLBACK", "true");
    const terminal = Promise.resolve({ data: [{ id: "legacy-1" }], error: null });
    const chain = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(() => terminal),
    };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.order.mockReturnValue(chain);
    const from = vi.fn(() => chain);
    historyMocks.createServerSupabase.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
      from,
    });
    historyMocks.getLatestConversationSummary.mockResolvedValue(null);

    const response = await getHistory();
    expect(await response.json()).toEqual({ messages: [{ id: "legacy-1" }] });
    expect(from).toHaveBeenCalledWith("chat_messages");
  });
});
