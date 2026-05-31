/**
 * client-config-defaults.test.ts
 *
 * Covers the gaps added in T-3 / T-15:
 *   - DEFAULT_CONFIG.autonomyTier === 3
 *   - DEFAULT_CONFIG.customRoutines === []
 *   - loadClientConfigOrNull maps custom_routines: null  → customRoutines: []
 *   - loadClientConfigOrNull maps custom_routines: [...]  → customRoutines: [...]
 *   - loadClientConfigForUser maps custom_routines: null  → customRoutines: []
 *   - loadClientConfig falls back to DEFAULT_CONFIG when no slug given
 *
 * Called by: test runner only — no production code imports this file.
 * No existing file covers DEFAULT_CONFIG or customRoutines mapping.
 */

import { describe, it, expect, vi } from "vitest";

// ── Hoisted mock so the factory can reference it from the vi.mock() closure ──
const mockSingle = vi.hoisted(() => vi.fn());

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: (table: string) => {
      // client_members join (used by loadClientConfigForUser)
      if (table === "client_members") {
        return {
          select: () => ({
            eq: () => ({
              limit: () => ({
                single: mockSingle,
              }),
            }),
          }),
        };
      }
      // clients table (used by loadClientConfig / loadClientConfigOrNull)
      return {
        select: () => ({
          eq: () => ({
            single: mockSingle,
          }),
        }),
      };
    },
  })),
}));

vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");

import { DEFAULT_CONFIG, loadClientConfigForUser, loadClientConfig } from "@/core/client-config";

// ── Shared fixture ────────────────────────────────────────────────────────────

const BASE_ROW = {
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
  form_steps: null,
  owner_email: null,
  sheets_id: null,
  custom_routines: null,
};

const CUSTOM_ROUTINE = {
  id: "custom-r1",
  name: "Daily Briefing",
  icon: "📋",
  description: "Summarize overnight activity",
  commands: [],
  triggers: [],
  builtIn: false,
  autonomyTier: 2 as const,
};

// ── DEFAULT_CONFIG shape (T-3 / T-15) ────────────────────────────────────────

describe("DEFAULT_CONFIG", () => {
  it("autonomyTier is 3 (execute) — T-3", () => {
    expect(DEFAULT_CONFIG.autonomyTier).toBe(3);
  });

  it("customRoutines is an empty array — T-15", () => {
    expect(DEFAULT_CONFIG.customRoutines).toEqual([]);
    expect(Array.isArray(DEFAULT_CONFIG.customRoutines)).toBe(true);
  });

  it("id and slug are 'default'", () => {
    expect(DEFAULT_CONFIG.id).toBe("default");
    expect(DEFAULT_CONFIG.slug).toBe("default");
  });
});

// ── loadClientConfig fallback (no slug) ───────────────────────────────────────

describe("loadClientConfig — fallback", () => {
  it("returns DEFAULT_CONFIG when no slug supplied", async () => {
    const result = await loadClientConfig();
    expect(result.id).toBe("default");
    expect(result.autonomyTier).toBe(3);
  });

  it("returns DEFAULT_CONFIG when slug is 'default'", async () => {
    const result = await loadClientConfig("default");
    expect(result.id).toBe("default");
  });
});

// ── loadClientConfigForUser — customRoutines mapping (T-15) ──────────────────

describe("loadClientConfigForUser — customRoutines", () => {
  it("returns DEFAULT_CONFIG (autonomyTier 3) when no DB row found", async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { code: "PGRST116" } });
    const result = await loadClientConfigForUser("user-orphan");
    expect(result.autonomyTier).toBe(3);
    expect(result.customRoutines).toEqual([]);
  });

  it("maps custom_routines: null → customRoutines: []", async () => {
    mockSingle.mockResolvedValueOnce({
      data: {
        client_id: "client-1",
        clients: { ...BASE_ROW, custom_routines: null },
      },
      error: null,
    });
    const result = await loadClientConfigForUser("user-1");
    expect(result.customRoutines).toEqual([]);
  });

  it("maps custom_routines: [{...}] → customRoutines: [{...}]", async () => {
    mockSingle.mockResolvedValueOnce({
      data: {
        client_id: "client-1",
        clients: { ...BASE_ROW, custom_routines: [CUSTOM_ROUTINE] },
      },
      error: null,
    });
    const result = await loadClientConfigForUser("user-1");
    expect(result.customRoutines).toHaveLength(1);
    expect(result.customRoutines[0].name).toBe("Daily Briefing");
  });
});
