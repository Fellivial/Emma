import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Module-level cache — persists across warm-container requests
const ephemeralCache = new Map();

/**
 * Sliding-window rate limiter for the brain route.
 *
 * Allows 10 requests per 10-second window per userId.
 * Fails open after 500 ms if Upstash is unreachable.
 */
export const brainRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "10 s"),
  ephemeralCache,
  prefix: "emma:rl:brain",
  analytics: false,
  timeout: 500,
});
