import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { createServerClient } = vi.hoisted(() => ({
  createServerClient: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient,
}));

import { proxy } from "@/proxy";

describe("production auth configuration", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://emma-prod.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "valid-anon-key");
    createServerClient.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ["missing Supabase URL", "NEXT_PUBLIC_SUPABASE_URL", ""],
    ["missing anon key", "NEXT_PUBLIC_SUPABASE_ANON_KEY", ""],
    ["invalid Supabase URL", "NEXT_PUBLIC_SUPABASE_URL", "not-a-url"],
    ["placeholder Supabase URL", "NEXT_PUBLIC_SUPABASE_URL", "https://placeholder.supabase.co"],
    ["placeholder anon key", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "placeholder"],
  ])("blocks protected routes with %s", async (_label, variable, value) => {
    vi.stubEnv(variable, value);

    const response = await proxy(new NextRequest("https://emma.example.org/app"));

    expect(response.status).toBe(503);
    expect(await response.text()).toBe("Server authentication is not configured correctly.");
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("keeps explicitly public routes accessible during a configuration outage", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");

    for (const path of [
      "/login",
      "/register",
      "/auth/callback",
      "/landing",
      "/api/waitlist",
      "/api/emma/webhook",
      "/waitlist",
      "/api/emma/unsubscribe",
    ]) {
      const response = await proxy(new NextRequest(`https://emma.example.org${path}`));
      expect(response.status, path).toBe(200);
    }
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("preserves local no-Supabase mode", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    const response = await proxy(new NextRequest("http://localhost:3000/app"));

    expect(response.status).toBe(200);
    expect(createServerClient).not.toHaveBeenCalled();
  });
});
