import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  decision: {
    allowed: false as const,
    operation: "persona_screen" as const,
    reason: "rate_limited" as "rate_limited" | "metering_unavailable",
    status: 429 as 429 | 503,
    message: "Too many paid operations.",
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  getUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: (table: string) => {
      if (table === "client_members") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { client_id: "c1" } }) }) }) };
      }
      if (table === "clients") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { plan_id: "pro" } }) }) }) };
      }
      return { upsert: async () => ({ error: null }) };
    },
  })),
}));

vi.mock("@/core/cost-gate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/core/cost-gate")>();
  return {
    ...actual,
    enforceCostGate: vi.fn(async () => state.decision),
    recordCostResult: vi.fn(),
  };
});

import { PUT } from "@/app/api/emma/persona/route";

function request(): NextRequest {
  return new NextRequest("http://localhost/api/emma/persona", {
    method: "PUT",
    body: JSON.stringify({ description: "A calm and concise companion." }),
    headers: { "Content-Type": "application/json" },
  });
}

describe("persona cost enforcement status", () => {
  beforeEach(() => {
    state.decision = {
      allowed: false,
      operation: "persona_screen",
      reason: "rate_limited",
      status: 429,
      message: "Too many paid operations.",
    };
  });

  it("preserves a 429 cost-gate response", async () => {
    const response = await PUT(request());
    expect(response.status).toBe(429);
  });

  it("preserves a 503 metering-unavailable response", async () => {
    state.decision = {
      allowed: false,
      operation: "persona_screen",
      reason: "metering_unavailable",
      status: 503,
      message: "Cost enforcement is temporarily unavailable.",
    };
    const response = await PUT(request());
    expect(response.status).toBe(503);
  });
});
