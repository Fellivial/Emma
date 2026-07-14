import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmmaError, RateLimitUnavailableError } from "@/lib/errors";

const state = vi.hoisted(() => ({
  limitImpl: vi.fn(),
}));

vi.mock("@upstash/ratelimit", () => {
  class Ratelimit {
    static slidingWindow = vi.fn(() => ({}));
    limit = state.limitImpl;
    constructor(_config: unknown) {}
  }
  return { Ratelimit };
});

vi.mock("@upstash/redis", () => ({
  Redis: class Redis {
    constructor(_config: unknown) {}
  },
}));

import { checkDistributedRateLimit, interpretDistributedRateLimitResult } from "@/lib/ratelimit";

describe("interpretDistributedRateLimitResult", () => {
  it("throws a typed RateLimitUnavailableError, not a bare Error, on timeout", () => {
    let caught: unknown;
    try {
      interpretDistributedRateLimitResult({
        success: true,
        reset: Date.now() + 1000,
        reason: "timeout",
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(RateLimitUnavailableError);
    expect(caught).toBeInstanceOf(EmmaError);
    expect((caught as EmmaError).status).toBe(503);
    expect((caught as EmmaError).retryable).toBe(true);
  });

  it("still allows/denies normally when there is no timeout", () => {
    expect(interpretDistributedRateLimitResult({ success: true, reset: 123 })).toEqual({
      allowed: true,
      resetAt: 123,
    });
    expect(interpretDistributedRateLimitResult({ success: false, reset: 456 })).toEqual({
      allowed: false,
      resetAt: 456,
    });
  });
});

describe("checkDistributedRateLimit — Upstash configured", () => {
  beforeEach(() => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
    state.limitImpl.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails closed with a typed error when Upstash reports a timeout", async () => {
    state.limitImpl.mockResolvedValue({
      success: true,
      reset: Date.now() + 1000,
      reason: "timeout",
    });
    await expect(
      checkDistributedRateLimit({
        key: "user-1",
        namespace: "req:brain",
        limit: 20,
        windowSeconds: 60,
      })
    ).rejects.toBeInstanceOf(RateLimitUnavailableError);
  });

  it("fails closed with the same typed error when the Redis call itself rejects", async () => {
    state.limitImpl.mockRejectedValue(new Error("ECONNRESET"));
    await expect(
      checkDistributedRateLimit({
        key: "user-1",
        namespace: "req:brain",
        limit: 20,
        windowSeconds: 60,
      })
    ).rejects.toBeInstanceOf(RateLimitUnavailableError);
  });

  it("still allows requests under the limit", async () => {
    state.limitImpl.mockResolvedValue({ success: true, reset: Date.now() + 1000 });
    const result = await checkDistributedRateLimit({
      key: "user-1",
      namespace: "req:brain",
      limit: 20,
      windowSeconds: 60,
    });
    expect(result.allowed).toBe(true);
  });

  it("still denies requests over the limit", async () => {
    state.limitImpl.mockResolvedValue({ success: false, reset: Date.now() + 1000 });
    const result = await checkDistributedRateLimit({
      key: "user-1",
      namespace: "req:brain",
      limit: 20,
      windowSeconds: 60,
    });
    expect(result.allowed).toBe(false);
  });
});

describe("checkDistributedRateLimit — local fallback (no Upstash configured)", () => {
  it("uses the in-memory window and never throws", async () => {
    const result = await checkDistributedRateLimit({
      key: "dev-user",
      namespace: "ratelimit-test-local-fallback",
      limit: 2,
      windowSeconds: 60,
    });
    expect(result.allowed).toBe(true);
  });

  it("denies once the local in-memory window count exceeds the limit", async () => {
    const input = {
      key: "dev-user-2",
      namespace: "ratelimit-test-local-fallback-deny",
      limit: 2,
      windowSeconds: 60,
    };
    const first = await checkDistributedRateLimit(input);
    const second = await checkDistributedRateLimit(input);
    const third = await checkDistributedRateLimit(input);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
  });
});

describe("checkDistributedRateLimit — production without Upstash configured", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    vi.stubEnv("NODE_ENV", originalNodeEnv ?? "test");
  });

  it("throws (fails hard, not fail-open) when Upstash is unconfigured in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(
      checkDistributedRateLimit({
        key: "prod-user",
        namespace: "ratelimit-test-prod-unconfigured",
        limit: 5,
        windowSeconds: 60,
      })
    ).rejects.toThrow("Distributed rate limiting is not configured");
  });
});
