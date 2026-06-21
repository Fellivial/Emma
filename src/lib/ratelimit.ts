import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

// Module-level cache — persists across warm-container requests
const ephemeralCache = new Map<string, number>();
const limiters = new Map<string, Ratelimit>();
const localWindows = new Map<string, { count: number; resetAt: number }>();

export interface DistributedRateLimitInput {
  key: string;
  namespace: string;
  limit: number;
  windowSeconds: number;
}
export interface DistributedRateLimitResult {
  allowed: boolean;
  resetAt: number;
}

export function interpretDistributedRateLimitResult(result: {
  success: boolean;
  reset: number;
  reason?: string;
}): DistributedRateLimitResult {
  // Upstash reports timeouts as success=true; paid work must fail closed.
  if (result.reason === "timeout") {
    throw new Error("Distributed rate limit check timeout");
  }
  return { allowed: result.success, resetAt: result.reset };
}

/**
 * Shared paid-operation limiter. Production requires Upstash and propagates
 * provider errors so callers can fail closed. Development and tests use a
 * bounded process-local counter only to keep local workflows usable.
 */
export async function checkDistributedRateLimit(
  input: DistributedRateLimitInput
): Promise<DistributedRateLimitResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    const cacheKey = `${input.namespace}:${input.limit}:${input.windowSeconds}`;
    let limiter = limiters.get(cacheKey);
    if (!limiter) {
      limiter = new Ratelimit({
        redis: new Redis({ url, token }),
        limiter: Ratelimit.slidingWindow(input.limit, `${input.windowSeconds} s`),
        ephemeralCache,
        prefix: `emma:cost:${input.namespace}`,
        analytics: false,
      });
      limiters.set(cacheKey, limiter);
    }
    const result = await limiter.limit(input.key);
    return interpretDistributedRateLimitResult(result);
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Distributed rate limiting is not configured");
  }

  const now = Date.now();
  const localKey = `${input.namespace}:${input.key}`;
  const existing = localWindows.get(localKey);
  const current =
    existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + input.windowSeconds * 1000 };
  current.count += 1;
  localWindows.set(localKey, current);
  return { allowed: current.count <= input.limit, resetAt: current.resetAt };
}
