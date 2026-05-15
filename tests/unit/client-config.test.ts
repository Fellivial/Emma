import { describe, it, expect, vi } from "vitest";

// ── Mock Supabase ─────────────────────────────────────────────────────────────

const mockSingle = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: mockSingle,
        }),
      }),
    }),
  })),
}));

vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");

import { loadClientConfigOrNull } from "@/core/client-config";

const MOCK_ROW = {
  id: "client-1",
  slug: "acme",
  name: "Acme Corp",
  persona_name: "Emma",
  persona_prompt: null,
  persona_greeting: null,
  voice_id: null,
  tools_enabled: null,
  token_budget_monthly: 500_000,
  token_budget_daily: 50_000,
  message_limit_daily: 50,
  plan_id: "starter",
  autonomy_tier: 2,
  proactive_vision: false,
  vertical_id: null,
};

describe("loadClientConfigOrNull", () => {
  it("returns config for a known slug", async () => {
    mockSingle.mockResolvedValueOnce({ data: MOCK_ROW, error: null });
    const result = await loadClientConfigOrNull("acme");
    expect(result).not.toBeNull();
    expect(result?.slug).toBe("acme");
    expect(result?.planId).toBe("starter");
  });

  it("returns null when slug not found", async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { code: "PGRST116", message: "No rows" },
    });
    const result = await loadClientConfigOrNull("unknown-slug");
    expect(result).toBeNull();
  });

  it("returns null on DB throw (not DEFAULT_CONFIG)", async () => {
    mockSingle.mockRejectedValueOnce(new Error("connection refused"));
    const result = await loadClientConfigOrNull("acme");
    expect(result).toBeNull();
  });
});
