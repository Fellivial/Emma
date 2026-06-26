import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ getUser: routeMocks.getUser }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: routeMocks.getSupabaseAdmin }));

import {
  buildSupportSummary,
  containsUnsafeDiagnosticData,
  resolveDiagnosticsLookup,
} from "@/core/admin-diagnostics";
import { GET } from "@/app/api/admin/diagnostics/route";

describe("admin diagnostics authorization", () => {
  beforeEach(() => {
    vi.stubEnv("EMMA_ADMIN_EMAILS", "founder@emma.test");
    routeMocks.getUser.mockReset();
    routeMocks.getSupabaseAdmin.mockReset();
  });

  it("rejects unauthenticated users before any service-role lookup", async () => {
    routeMocks.getUser.mockResolvedValue(null);

    const response = await GET(
      new Request("https://emma.test/api/admin/diagnostics?email=a@b.com")
    );

    expect(response.status).toBe(401);
    expect(routeMocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("rejects authenticated non-admin users before any service-role lookup", async () => {
    routeMocks.getUser.mockResolvedValue({ id: "user-1", email: "member@emma.test" });

    const response = await GET(
      new Request("https://emma.test/api/admin/diagnostics?email=a@b.com")
    );

    expect(response.status).toBe(403);
    expect(routeMocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });
});

describe("admin diagnostics lookup parsing", () => {
  it("accepts lookup by email", () => {
    expect(resolveDiagnosticsLookup(new URLSearchParams("email=Beta@Example.com"))).toEqual({
      type: "email",
      value: "beta@example.com",
    });
  });

  it("accepts lookup by user ID", () => {
    expect(resolveDiagnosticsLookup(new URLSearchParams("userId=user-123"))).toEqual({
      type: "userId",
      value: "user-123",
    });
  });

  it("accepts lookup by client ID", () => {
    expect(resolveDiagnosticsLookup(new URLSearchParams("clientId=client-123"))).toEqual({
      type: "clientId",
      value: "client-123",
    });
  });

  it("requires exactly one lookup key", () => {
    expect(() => resolveDiagnosticsLookup(new URLSearchParams(""))).toThrow(/exactly one/i);
    expect(() =>
      resolveDiagnosticsLookup(new URLSearchParams("email=a@b.com&userId=user-1"))
    ).toThrow(/exactly one/i);
  });
});

describe("admin diagnostics support summary", () => {
  it("summarizes launch support blockers without exposing message content", () => {
    const summary = buildSupportSummary({
      account: {
        status: "active",
        waitlistStatus: "approved",
        onboardingComplete: false,
      },
      billing: {
        planId: "free",
        subscriptionStatus: "past_due",
        paymentRecoveryState: "payment_failed",
      },
      usage: {
        tokenBalance: 0,
        overBudget: true,
      },
      tools: {
        toolsEnabled: ["chat"],
        mcpEnabled: false,
      },
      ai: {
        recentFailureCount: 2,
        recentCostGateBlocks: 1,
      },
    });

    expect(summary.whyCantUseEmma.join(" ")).toContain("over budget");
    expect(summary.whyStillFree.join(" ")).toContain("payment recovery");
    expect(summary.whyCantAccessTools.join(" ")).toContain("MCP is disabled");
    expect(summary.isOnboardingIncomplete).toBe(true);
    expect(summary.isBillingHealthy).toBe(false);
    expect(summary.hasRecentFailures).toBe(true);
  });
});

describe("admin diagnostics data exposure", () => {
  it("detects unsafe tokens, encrypted values, raw payloads, and message bodies", () => {
    expect(
      containsUnsafeDiagnosticData({
        access_token: "secret",
        refreshToken: "secret",
        raw_payload: { anything: true },
        content: "raw user message",
        memoryValue: "enc:v1:abc",
        nested: { tool_input: { secret: true } },
      })
    ).toBe(true);
  });

  it("allows sanitized counts, timestamps, statuses, and masked identifiers", () => {
    expect(
      containsUnsafeDiagnosticData({
        user: { id: "user-1", email: "b***@example.com" },
        ai: { recentConversationCount: 2, recentMessageCount: 8 },
        billing: { subscriptionStatus: "active", renewalDate: "2026-07-01T00:00:00Z" },
        logs: [{ action: "write", resource: "billing", createdAt: "2026-06-01T00:00:00Z" }],
      })
    ).toBe(false);
  });
});
