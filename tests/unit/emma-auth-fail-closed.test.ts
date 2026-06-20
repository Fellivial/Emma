import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { POST } from "@/app/api/emma/route";

const validProductionEnv = {
  NODE_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: "https://emma-prod.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-production-value",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-production-value",
  OPENROUTER_API_KEY: "sk-or-production-value",
  EMMA_ENCRYPTION_KEY: "a".repeat(64),
  CRON_SECRET: "cron-production-value",
  EMMA_UNSUBSCRIBE_SECRET: "unsubscribe-production-value",
  NEXT_PUBLIC_APP_URL: "https://emma.acme.org",
};

describe("POST /api/emma production auth configuration", () => {
  beforeEach(() => {
    for (const [name, value] of Object.entries(validProductionEnv)) {
      vi.stubEnv(name, value);
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ["NEXT_PUBLIC_SUPABASE_URL", ""],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", ""],
    ["NEXT_PUBLIC_SUPABASE_URL", "not-a-url"],
    ["NEXT_PUBLIC_SUPABASE_URL", "https://placeholder.supabase.co"],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "placeholder"],
  ])("returns 503 before parsing the body when %s is invalid", async (variable, value) => {
    vi.stubEnv(variable, value);
    const json = vi.fn().mockResolvedValue({
      messages: [{ role: "user", content: "hello" }],
      activeUser: { id: "attacker-controlled-user-id" },
    });

    const response = await POST({ json } as unknown as NextRequest);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Server authentication is not configured correctly.",
    });
    expect(json).not.toHaveBeenCalled();
  });
});
