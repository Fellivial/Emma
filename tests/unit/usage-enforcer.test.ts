import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mock state so factory can reference it before imports ─────────────
const mockState = vi.hoisted(() => ({
  windowRows: [] as any[],
  extraPacks: [] as any[],
  queryThrows: false,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === "usage_windows") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () =>
                  mockState.queryThrows
                    ? Promise.reject(new Error("simulated DB failure"))
                    : Promise.resolve({ data: mockState.windowRows }),
              }),
            }),
          }),
        };
      }
      if (table === "extra_packs") {
        return {
          select: () => ({
            eq: () => ({
              gt: () => ({
                gt: () =>
                  mockState.queryThrows
                    ? Promise.reject(new Error("simulated DB failure"))
                    : Promise.resolve({ data: mockState.extraPacks }),
              }),
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => Promise.resolve({ data: null }) }) };
    },
  })),
}));

import { checkUsage } from "@/core/usage-enforcer";

// Free plan: tokenBudgetDaily = floor(floor(300_000/4)/7) = 10_714
const FREE_WINDOW_TOKENS = 10_714;
const FREE_WINDOW_MSGS = 10;
const TEST_USER = "user-abc";

function makeRow(tokensUsed: number, messagesUsed = 0, warningSent = false) {
  return {
    window_type: "daily",
    window_start: new Date(Math.floor(Date.now() / (5 * 3600000)) * (5 * 3600000)).toISOString(),
    tokens_used: tokensUsed,
    messages_used: messagesUsed,
    warning_sent: warningSent,
  };
}

beforeEach(() => {
  mockState.windowRows = [];
  mockState.extraPacks = [];
  mockState.queryThrows = false;
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fake.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "fake-key");
});

describe("checkUsage — enterprise bypass", () => {
  it("returns ok immediately without hitting DB for enterprise plan", async () => {
    const result = await checkUsage(TEST_USER, "enterprise");
    expect(result.status).toBe("ok");
    expect(result.allWindows).toHaveLength(0);
  });
});

describe("checkUsage — fail-open contract", () => {
  it("returns ok when Supabase is not configured (no env vars)", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const result = await checkUsage(TEST_USER, "free");
    expect(result.status).toBe("ok");
  });

  it("returns ok when DB query throws — never block due to infra error", async () => {
    mockState.queryThrows = true;
    const result = await checkUsage(TEST_USER, "free");
    expect(result.status).toBe("ok");
  });
});

describe("checkUsage — window enforcement", () => {
  it("returns ok when window has zero usage", async () => {
    mockState.windowRows = [];
    const result = await checkUsage(TEST_USER, "free");
    expect(result.status).toBe("ok");
    expect(result.allWindows).toHaveLength(1);
  });

  it("returns ok when usage is below 80%", async () => {
    mockState.windowRows = [makeRow(Math.floor(FREE_WINDOW_TOKENS * 0.5))];
    const result = await checkUsage(TEST_USER, "free");
    expect(result.status).toBe("ok");
  });

  it("returns warning when usage hits 80% and warning not yet sent", async () => {
    mockState.windowRows = [makeRow(Math.floor(FREE_WINDOW_TOKENS * 0.8), 0, false)];
    const result = await checkUsage(TEST_USER, "free");
    expect(result.status).toBe("warning");
    expect(result.warningWindow).toBeDefined();
    expect(result.message).toBeDefined();
  });

  it("returns ok (not warning again) when 80% hit but warning already sent", async () => {
    mockState.windowRows = [makeRow(Math.floor(FREE_WINDOW_TOKENS * 0.8), 0, true)];
    const result = await checkUsage(TEST_USER, "free");
    expect(result.status).toBe("ok");
  });

  it("returns blocked when token usage hits 100% of window budget", async () => {
    mockState.windowRows = [makeRow(FREE_WINDOW_TOKENS)];
    const result = await checkUsage(TEST_USER, "free");
    expect(result.status).toBe("blocked");
    expect(result.blockedWindow).toBeDefined();
    expect(result.blockedWindow!.windowType).toBe("daily");
    expect(result.message).toBeDefined();
    expect(result.upgradeUrl).toBeDefined();
  });

  it("returns blocked when message limit hits 100% of window messages", async () => {
    mockState.windowRows = [makeRow(100, FREE_WINDOW_MSGS)];
    const result = await checkUsage(TEST_USER, "free");
    expect(result.status).toBe("blocked");
  });

  it("extra pack tokens stack on window limit and prevent blocking", async () => {
    mockState.windowRows = [makeRow(FREE_WINDOW_TOKENS)];
    mockState.extraPacks = [{ tokens_remaining: 500_000 }];
    const result = await checkUsage(TEST_USER, "free");
    expect(result.status).toBe("ok");
  });
});
