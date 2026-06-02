import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

// Module-level cache — persists across warm-container requests
const ephemeralCache = new Map<string, number>();

/**
 * Sliding-window rate limiter for the brain route.
 *
 * Allows 10 requests per 10-second window per userId.
 * Fails open after 500 ms if Upstash is unreachable.
 * Null when env vars are not configured (local dev / missing config).
 */
export const brainRatelimit: Ratelimit | null =
  redisUrl && redisToken
    ? new Ratelimit({
        redis: new Redis({ url: redisUrl, token: redisToken }),
        limiter: Ratelimit.slidingWindow(10, "10 s"),
        ephemeralCache,
        prefix: "emma:rl:brain",
        analytics: false, // analytics adds ~1 extra Redis command; enable in Upstash dashboard instead
        timeout: 500, // fail-open: returns success:true if Upstash unreachable
      })
    : null;
