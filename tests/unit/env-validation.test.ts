import { describe, expect, it } from "vitest";
import {
  PRODUCTION_REQUIRED_ENV,
  validateEnvironment,
  validateProductionEnvironment,
  validateSupabaseAuthEnvironment,
} from "@/core/env-validation";

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
  UPSTASH_REDIS_REST_URL: "https://cost-limit.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "upstash-production-token",
  INNGEST_SIGNING_KEY: "signkey-prod-value",
  RESEND_API_KEY: "re_prod_value",
  EMAIL_FROM: "noreply@emma.acme.org",
};

describe("environment validation", () => {
  it("accepts a complete production environment", () => {
    expect(validateProductionEnvironment(validProductionEnv)).toEqual({ valid: true, issues: [] });
    expect(PRODUCTION_REQUIRED_ENV).toHaveLength(13);
  });

  it.each([
    "",
    "changeme",
    "change-me",
    "your-secret",
    "your-key",
    "placeholder",
    "dummy",
    "test",
    "example",
    "xxx",
    "todo",
  ])("rejects placeholder secret %s", (placeholder) => {
    const result = validateEnvironment({ ...validProductionEnv, CRON_SECRET: placeholder }, [
      "CRON_SECRET",
    ]);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual([
      { variable: "CRON_SECRET", reason: placeholder ? "placeholder" : "missing" },
    ]);
  });

  it("rejects malformed and placeholder Supabase URLs", () => {
    expect(
      validateSupabaseAuthEnvironment({
        NODE_ENV: "production",
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "valid-anon-key",
      }).issues
    ).toContainEqual({ variable: "NEXT_PUBLIC_SUPABASE_URL", reason: "invalid_url" });

    expect(
      validateSupabaseAuthEnvironment({
        NODE_ENV: "production",
        NEXT_PUBLIC_SUPABASE_URL: "https://placeholder.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "valid-anon-key",
      }).issues
    ).toContainEqual({ variable: "NEXT_PUBLIC_SUPABASE_URL", reason: "placeholder" });
  });

  it("rejects non-http application URLs", () => {
    const result = validateEnvironment(
      { ...validProductionEnv, NEXT_PUBLIC_APP_URL: "ftp://emma.acme.org" },
      ["NEXT_PUBLIC_APP_URL"]
    );

    expect(result.issues).toEqual([{ variable: "NEXT_PUBLIC_APP_URL", reason: "invalid_url" }]);
  });

  it("requires EMMA_ENCRYPTION_KEY to be exactly 64 hexadecimal characters", () => {
    for (const key of ["a".repeat(63), "a".repeat(65), "z".repeat(64)]) {
      const result = validateEnvironment({ ...validProductionEnv, EMMA_ENCRYPTION_KEY: key }, [
        "EMMA_ENCRYPTION_KEY",
      ]);
      expect(result.issues).toEqual([
        { variable: "EMMA_ENCRYPTION_KEY", reason: "invalid_format" },
      ]);
    }
  });

  it("allows missing configuration outside production", () => {
    expect(validateProductionEnvironment({ NODE_ENV: "development" })).toEqual({
      valid: true,
      issues: [],
    });
    expect(validateProductionEnvironment({ NODE_ENV: "test" })).toEqual({
      valid: true,
      issues: [],
    });
  });

  it("requires distributed rate limiting in production", () => {
    const result = validateProductionEnvironment({
      ...validProductionEnv,
      UPSTASH_REDIS_REST_URL: undefined,
      UPSTASH_REDIS_REST_TOKEN: undefined,
    });

    expect(result.issues).toEqual(
      expect.arrayContaining([
        { variable: "UPSTASH_REDIS_REST_URL", reason: "missing" },
        { variable: "UPSTASH_REDIS_REST_TOKEN", reason: "missing" },
      ])
    );
  });
});
