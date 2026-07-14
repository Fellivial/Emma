import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  resolveUser: vi.fn(async () => ({
    status: "authenticated",
    user: {
      id: "user-1",
      email: "user@example.com",
      app_metadata: { waitlist_approved: true },
    },
  })),
  getUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => null),
}));

vi.mock("@/core/client-config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/core/client-config")>();
  return {
    ...actual,
    loadClientConfigForUser: vi.fn(async () => ({ id: "default", planId: "pro" })),
  };
});

vi.mock("@/core/addon-enforcer", () => ({
  checkAutonomousAccess: vi.fn(async () => ({ allowed: true })),
}));

// Regression coverage for IR-001: a distributed rate-limit check that fails
// closed (Upstash timeout/Redis failure) must surface as a typed, classified
// EmmaError — not a bare Error that every call site has to guess about.
vi.mock("@/lib/ratelimit", async () => {
  const { RateLimitUnavailableError } = await import("@/lib/errors");
  return {
    checkDistributedRateLimit: vi.fn(async () => {
      throw new RateLimitUnavailableError("Distributed rate limit check timeout");
    }),
  };
});

import { POST as chatPost } from "@/app/api/emma/route";
import { POST as agentPost } from "@/app/api/emma/agent/route";
import { checkDistributedRateLimit } from "@/lib/ratelimit";

describe("distributed rate limit timeout — consistent propagation (IR-001)", () => {
  it("chat route returns 503, not a generic 500, when the rate limit check fails closed", async () => {
    const response = await chatPost({ json: vi.fn() } as unknown as NextRequest);
    expect(response.status).toBe(503);
  });

  it("agent route returns 503, not a generic 500, when the rate limit check fails closed", async () => {
    const request = new NextRequest("http://localhost/api/emma/agent", {
      method: "POST",
      body: JSON.stringify({ action: "create", goal: "Regression coverage for IR-001" }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await agentPost(request);
    expect(response.status).toBe(503);
  });

  it("agent route still falls back to 500 for a plain (non-EmmaError) failure, not 503", async () => {
    vi.mocked(checkDistributedRateLimit).mockImplementationOnce(async () => {
      throw new Error("unexpected plain failure, not an EmmaError");
    });
    const request = new NextRequest("http://localhost/api/emma/agent", {
      method: "POST",
      body: JSON.stringify({ action: "create", goal: "Regression coverage: non-EmmaError path" }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await agentPost(request);
    expect(response.status).toBe(500);
  });
});
