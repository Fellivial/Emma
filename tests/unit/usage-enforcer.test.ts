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
              or: () =>
                mockState.queryThrows
                  ? Promise.reject(new Error("simulated DB failure"))
                  : Promise.resolve({ data: mockState.windowRows }),
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

// Free plan derived limits: monthly=300_000, weekly=75_000, daily=10_714, msg/day=10
const FREE_DAILY_TOKENS = 10_714;
const FREE_DAILY_MSGS = 10;
const TEST_USER = "user-abc";

function makeRow(
  windowType: "daily" | "weekly" | "monthly",
  tokensUsed: number,
  messagesUsed = 0,
  warningSent = false
) {
  return {
    window_type: windowType,
    window_start: "2026-05-10T00:00:00.000Z",
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
    vi.unstubAllEnvs();
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
  it("returns ok when all windows have zero usage", async () => {
    mockState.windowRows = [];
    const result = await checkUsage(TEST_USER, "free");
    expect(result.status).toBe("ok");
    expect(result.allWindows).toHaveLength(3);
  });

  it("returns ok when usage is below 80%", async () => {
    mockState.windowRows = [makeRow("daily", Math.floor(FREE_DAILY_TOKENS * 0.5))];
    const result = await checkUsage(TEST_USER, "free");
    expect(result.status).toBe("ok");
  });

  it("returns warning when usage hits 80% and warning not yet sent", async () => {
    mockState.windowRows = [makeRow("daily", Math.floor(FREE_DAILY_TOKENS * 0.8), 0, false)];
    const result = await checkUsage(TEST_USER, "free");
    expect(result.status).toBe("warning");
    expect(result.warningWindow).toBeDefined();
    expect(result.message).toBeDefined();
  });

  it("returns ok (not warning again) when 80% hit but warning already sent", async () => {
    mockState.windowRows = [makeRow("daily", Math.floor(FREE_DAILY_TOKENS * 0.8), 0, true)];
    const result = await checkUsage(TEST_USER, "free");
    expect(result.status).toBe("ok");
  });

  it("returns blocked when token usage hits 100% of daily budget", async () => {
    mockState.windowRows = [makeRow("daily", FREE_DAILY_TOKENS)];
    const result = await checkUsage(TEST_USER, "free");
    expect(result.status).toBe("blocked");
    expect(result.blockedWindow).toBeDefined();
    expect(result.blockedWindow!.windowType).toBe("daily");
    expect(result.message).toBeDefined();
    expect(result.upgradeUrl).toBeDefined();
  });

  it("returns blocked when message limit hits 100% of daily messages", async () => {
    mockState.windowRows = [makeRow("daily", 100, FREE_DAILY_MSGS)];
    const result = await checkUsage(TEST_USER, "free");
    expect(result.status).toBe("blocked");
  });

  it("blocked window is the most constrained across all three windows", async () => {
    const FREE_WEEKLY_TOKENS = 75_000;
    mockState.windowRows = [
      makeRow("daily", 100),
      makeRow("weekly", FREE_WEEKLY_TOKENS),
      makeRow("monthly", 1_000),
    ];
    const result = await checkUsage(TEST_USER, "free");
    expect(result.status).toBe("blocked");
    expect(result.blockedWindow!.windowType).toBe("weekly");
  });

  it("extra pack tokens stack on monthly limit and prevent blocking", async () => {
    // Monthly at 100% of base budget — but extra pack adds 500K tokens
    const FREE_MONTHLY_TOKENS = 300_000;
    mockState.windowRows = [makeRow("monthly", FREE_MONTHLY_TOKENS)];
    mockState.extraPacks = [{ tokens_remaining: 500_000 }];
    // Effective monthly limit = 800_000; 300_000 used = 37.5% → ok
    const result = await checkUsage(TEST_USER, "free");
    expect(result.status).toBe("ok");
  });
});
