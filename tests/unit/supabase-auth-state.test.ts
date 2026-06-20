import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

import { resolveUser } from "@/lib/supabase/server";

describe("resolveUser", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("distinguishes production configuration failure", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    await expect(resolveUser()).resolves.toEqual({ status: "configuration_error" });
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });

  it("distinguishes development bypass", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    await expect(resolveUser()).resolves.toEqual({ status: "development_bypass" });
  });

  it("distinguishes an unauthenticated request from configuration failure", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://emma-prod.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "valid-anon-key");
    mocks.cookies.mockResolvedValue({ getAll: vi.fn(), set: vi.fn() });
    mocks.createServerClient.mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    });

    await expect(resolveUser()).resolves.toEqual({ status: "unauthenticated" });
  });
});
