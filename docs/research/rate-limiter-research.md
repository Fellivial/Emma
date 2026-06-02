# Rate Limiter Architecture Research — Emma Serverless

**Date:** 2026-05-31  
**Scope:** Distributed rate limiting for Emma on Vercel serverless (Next.js App Router)  
**Status:** Research only — no implementation

---

## 1. Why In-Memory Rate Limiters Fail in Serverless

Emma's current `src/core/rate-limiter.ts` uses a `Map<string, counter>` as a fallback and makes two separate Supabase calls (a `SELECT` then an `RPC` increment) as the "production" path. Both approaches break under Vercel's execution model.

### Stateless invocations

Each Vercel serverless function invocation runs in an isolated Node.js process. There is no shared memory between invocations. The in-memory `memCounters` Map in `rate-limiter.ts` is only valid for the lifetime of that process. A "warm" function container may reuse the Map across a few sequential calls to the same container, but:

- There is no guarantee two requests from the same user hit the same container.
- Any concurrent requests will each see their own Map, so counters are silently independent.
- When the container is evicted (cold start) the Map resets to zero.

The in-memory Map was explicitly labelled "tests / local dev" in the code comments, but the code still falls back to it whenever Supabase throws an error — meaning production can silently degrade to non-functional rate limiting.

### Cold starts

Cold starts spin up a fresh process with an empty Map. A user who hits a rate limit on one warm container and is redirected (or makes a parallel request) to a freshly cold-started container will see a counter of zero and bypass the limit entirely.

### No shared state across regions

Vercel deploys functions to multiple edge regions. Two requests from the same user can — and under real load, will — land in different regions. Each region has its own process pool. In-memory state is region-local. This means the effective per-user counter is multiplied by the number of active regions, making the limit largely meaningless at scale.

### The current DB path has a separate problem (addressed in section 3)

The Supabase path (`checkRateLimit` reads the counter, then `consumeRateLimit` increments via RPC) is a check-then-act pattern with no atomicity between the two operations. Two concurrent requests both pass the check before either increments, allowing both through.

---

## 2. Upstash Redis + @upstash/ratelimit

### What Upstash Redis is

Upstash is a serverless Redis-as-a-service. Unlike a traditional TCP Redis connection, Upstash exposes an HTTP/REST API, which means it works in any environment that can make HTTP requests — including Edge Runtime, Cloudflare Workers, and Vercel serverless. No persistent TCP socket is required.

The `@upstash/redis` SDK communicates entirely over HTTPS with `fetch`. This is the only Redis option that works in Next.js Middleware (Edge Runtime) without the `nodejs` runtime flag.

### Free tier

| Metric          | Free    | Pay-as-you-go  |
| --------------- | ------- | -------------- |
| Commands/month  | 500,000 | $0.20 per 100K |
| Data size       | 256 MB  | 100 GB         |
| Bandwidth/month | 10 GB   | Unlimited      |

**Note on the pricing page:** The Upstash pricing page at time of research lists the free tier as "500K Monthly Commands" with a data cap of 256 MB. An older figure of "10,000 commands/day" appears in some older docs and blog posts; that figure is outdated.

### Installation

```
npm install @upstash/ratelimit @upstash/redis
```

### Initialisation

```typescript
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});
```

`Redis.fromEnv()` is the shorthand when the env vars are named `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

### The three algorithms

#### Fixed Window

```typescript
Ratelimit.fixedWindow(10, "10 s");
```

Time is divided into fixed slices (e.g. every 10 seconds). A counter increments per request. If the counter exceeds the limit, the request is rejected. At the boundary between two windows the counter resets, meaning a user can send 10 requests just before midnight and 10 more just after — effectively 20 in a short burst.

- **Redis commands per allowed request:** 2–3 (EVAL + INCR + PEXPIRE on first hit, EVAL + INCR thereafter)
- **Cheapest** of the three algorithms
- **Best for:** coarse limits where burst at boundary is acceptable (e.g. cron routes, intake webhooks)

#### Sliding Window

```typescript
Ratelimit.slidingWindow(10, "10 s");
```

Uses a weighted approximation of a rolling window. The current count is calculated as: `(requests_in_previous_window × time_remaining_in_previous_window / window_duration) + requests_in_current_window`. This eliminates the hard boundary burst problem.

- **Redis commands per allowed request:** 4–5 (EVAL + GET + GET + INCR + PEXPIRE on first hit)
- **More expensive** than fixed window, but still sub-millisecond in practice
- **Note:** The `reset` field in the response gives the start of the next window, not an exact per-request reset time
- **Best for:** user-facing AI endpoints (brain route) where smooth limiting is important

#### Token Bucket

```typescript
Ratelimit.tokenBucket(5, "10 s", 10);
// refillRate=5, interval="10 s", maxTokens=10
```

A bucket fills at `refillRate` tokens per `interval` up to `maxTokens`. Each request consumes one token. If the bucket is empty the request is rejected. Setting `maxTokens` higher than `refillRate` allows genuine burst capacity (a user who has been quiet can send a burst, then settles back to the refill rate).

- **Redis commands per request:** 4 (EVAL + HMGET + HSET + PEXPIRE on first/intermediate)
- **Most expensive** of the three
- **Best for:** agent loop endpoints where short bursts are expected but sustained hammering must be blocked

### The `limit()` return value

```typescript
const { success, limit, remaining, reset } = await ratelimit.limit(identifier);
// success: boolean — whether the request is allowed
// limit: number — the configured max
// remaining: number — tokens/requests left in the window
// reset: number — unix ms timestamp when the window/bucket resets
```

A rejected request (success=false) should return HTTP 429 with:

```
Retry-After: <seconds until reset>
X-RateLimit-Limit: <limit>
X-RateLimit-Remaining: 0
X-RateLimit-Reset: <reset timestamp ms>
```

### Edge Runtime compatibility

`@upstash/redis` and `@upstash/ratelimit` are Edge Runtime compatible because they use `fetch` not `net`/`tls`. This means they can run in:

- Next.js Middleware (`middleware.ts`) — important for IP-based limits before the route handler runs
- API route handlers with `export const runtime = "edge"`
- Regular Node.js serverless functions (the majority of Emma's routes)

### Multi-region replication

`MultiRegionRatelimit` accepts an array of Redis instances (one per region). It checks the closest instance and asynchronously replicates state to others. This reduces latency for globally-distributed users but increases Redis command count significantly — especially for sliding window (the Upstash docs explicitly warn against using sliding window with MultiRegion). For Emma's current scale, a single Upstash Redis instance with the built-in global replication (available on pay-as-you-go and fixed plans) is the practical choice.

### Ephemeral in-process cache

```typescript
const cache = new Map(); // declared OUTSIDE the handler — module-level singleton
const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "10 s"),
  ephemeralCache: cache,
});
```

When `ephemeralCache` is enabled, a blocked identifier is cached in the module-level Map for the duration of the block. Subsequent requests from that identifier are rejected without hitting Redis. This only works while the function container is warm, but it meaningfully reduces Redis command usage during a burst attack on a single container. The Map must be declared at module level (outside the handler) — valid in Vercel's Node.js runtime.

### Async synchronization (important for Vercel)

When `analytics: true` or `MultiRegionRatelimit` is used, `ratelimit.limit()` does some background work after returning. In Vercel serverless this background work may be killed when the response is sent. The fix:

```typescript
const { success, pending } = await ratelimit.limit(identifier);
// In a Vercel Edge Function or when using waitUntil:
context.waitUntil(pending);
```

For standard Node.js Vercel functions (not Edge), `pending` can be awaited directly or ignored — the function stays alive until the response object is closed, so background microtasks complete naturally.

---

## 3. Supabase-backed Rate Limiting — Current Design and Its Race Condition

### What Emma currently does

`checkRateLimit` executes a `SELECT` to read current counters. If allowed, the caller then calls `consumeRateLimit`, which calls the `increment_rate_limit` Postgres function via Supabase RPC.

The `increment_rate_limit` function uses `INSERT ... ON CONFLICT DO UPDATE` (UPSERT):

```sql
insert into public.rate_limit_counters (client_id, hour_window, task_count, token_count, updated_at)
values (p_client_id, p_hour_window, p_tasks, p_tokens, now())
on conflict (client_id, hour_window)
do update set
  task_count = rate_limit_counters.task_count + p_tasks,
  token_count = rate_limit_counters.token_count + p_tokens,
  updated_at = now();
```

The UPSERT increment itself is atomic — Postgres ensures `task_count + p_tasks` is read and written in a single statement with row-level locking. **The increment operation is not the race condition.**

### Where the race condition lives

The problem is the gap between `checkRateLimit` (read) and `consumeRateLimit` (increment). In serverless, these are two separate HTTP round-trips to Supabase, and nothing prevents another concurrent invocation from performing its own read between them:

```
Invocation A: SELECT → task_count=19 (allowed, limit=20)
Invocation B: SELECT → task_count=19 (allowed, limit=20)
Invocation A: UPSERT → task_count=20
Invocation B: UPSERT → task_count=21  ← over limit, was allowed anyway
```

The severity depends on concurrency. For a single user with sequential requests this rarely manifests. Under parallel load (e.g. the agent loop spawning multiple sub-tasks) it can allow a meaningful number of over-limit requests.

### Can `pg_advisory_xact_lock` fix this?

A Postgres advisory transaction lock would allow the check-and-increment to run atomically:

```sql
create or replace function public.check_and_increment_rate_limit(...)
returns boolean as $$
begin
  perform pg_advisory_xact_lock(hashtext(p_client_id::text || p_hour_window::text));
  -- now SELECT, check, and UPDATE are serialised per (client_id, hour_window)
  ...
end;
$$ language plpgsql;
```

This would work — it serialises all concurrent calls for the same key. However:

- **Connection pooling conflict:** Supabase uses PgBouncer in transaction pooling mode by default. Advisory locks acquired within a transaction are released when the transaction ends. Session-level advisory locks (`pg_advisory_lock`) do not survive across statements in transaction pooling mode because the connection is returned to the pool between calls. Transaction-level locks (`pg_advisory_xact_lock`) work in transaction pooling, but require the entire check-and-increment to run inside a single function/transaction.
- **Lock contention latency:** Every rate-limit call takes an exclusive lock on a key. Under high concurrency for a popular `client_id`, requests queue behind the lock holder. A typical Postgres advisory lock round-trip on Supabase adds 5–20ms per call on top of normal query latency.
- **Connection pressure:** Supabase free tier allows ~500 concurrent connections (shared via PgBouncer). Serialising rate-limit checks through Postgres under load is a bottleneck that does not exist with Redis.

**Conclusion:** `pg_advisory_xact_lock` is technically viable and eliminates the race condition, but it trades correctness for latency and connection pressure. It is the right fix only if Upstash is ruled out entirely. For Emma's use case (LLM request gating), the added DB load is not desirable.

### Why the Supabase table is still useful

The `rate_limit_counters` table and `increment_rate_limit` RPC serve a different purpose well: **hourly quota tracking** (max tasks per hour, max tokens per hour) where a small over-limit by 1–2 requests is acceptable business-wise. The table should be retained for usage analytics and reporting. It should not be the primary enforcement mechanism for per-request burst rate limiting.

---

## 4. Vercel KV — Status and Comparison

### Vercel KV is deprecated and gone

As of December 2024, Vercel KV has been shut down. The Vercel docs at `https://vercel.com/docs/storage/vercel-kv` now redirect to `https://vercel.com/docs/redis` with the notice:

> "Vercel KV is no longer available. If you had an existing Vercel KV store, we automatically moved it to Upstash Redis in December 2024. For new projects, install a Redis integration from the Marketplace."

Vercel KV was always Upstash Redis under the hood — Vercel was reselling Upstash with a simplified console integration. The `@vercel/kv` SDK was a thin wrapper around `@upstash/redis`.

### Using Upstash directly vs. via Vercel Marketplace

Vercel's Marketplace now lists Upstash as a native integration. Installing via the Marketplace automatically injects `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` into Vercel's environment variables. The underlying service is identical to signing up at upstash.com directly.

**Pricing difference:** None. The tiers and per-command pricing are the same whether billing goes through Upstash or Vercel. The only difference is the billing surface.

**Recommendation for Emma:** Use Upstash directly (not via Vercel Marketplace). It avoids Vercel vendor dependency, and the env var names are identical either way. If Emma migrates hosting in future, the Upstash client is infrastructure-neutral.

---

## 5. Rate Limit Identifiers for Emma

### Brain route (`/api/emma/route.ts`) — `userId`

The brain route already extracts `userId` from the Supabase JWT session. This is the correct identifier for rate limiting: stable, non-spoofable, and tied to the billing/plan context. A per-user limit of (e.g.) 10 requests per 10 seconds prevents rapid-fire spam without affecting normal conversational usage.

### Agent loop (`src/core/agent-loop.ts`) — `clientId`

The agent loop currently uses `clientId` as the rate limit key. This is correct for multi-tenant/enterprise scenarios where `clientId` maps to an organisation. For solo users where `clientId` is 1:1 with `userId`, either identifier is fine.

### Intake and ingest endpoints — IP address

`/api/emma/ingest/whatsapp`, `/api/emma/ingest/email`, `/api/emma/ingest/document` are unauthenticated webhooks (authenticated via HMAC signatures, not user sessions). The natural identifier is IP address.

Emma already has `src/lib/get-client-ip.ts` which correctly prefers `x-real-ip` (set by Vercel's edge network, not spoofable by clients) over `x-forwarded-for` (whose first entry can be spoofed by clients inserting fake headers). The existing implementation is correct for Vercel deployments.

**`x-vercel-forwarded-for` note:** Vercel also sets `x-vercel-forwarded-for`, which is the client IP as seen by Vercel's edge before any proxy chain. For rate limiting purposes it is equivalent to `x-real-ip`. The current `getClientIp()` function using `x-real-ip` first is the right choice.

**IP rate limiting caveat:** Corporate NAT gateways and mobile carrier NAT can cause many legitimate users to share a single IP. A per-IP limit of (e.g.) 60 requests per minute is appropriate for intake endpoints — strict enough to block abuse, loose enough to allow enterprise webhook bursts. This limit should be significantly more permissive than per-user limits on authenticated routes.

### Cron routes — do they need rate limiting?

Emma's cron routes (`/api/emma/cron/*`) are authenticated via the `CRON_SECRET` header checked against `Authorization: Bearer`. Only Vercel's infrastructure can trigger them on schedule. The cron handlers already call `checkRateLimit` per `client_id` for the tasks they execute, which is the correct pattern — rate-limiting the execution of scheduled tasks, not the cron trigger itself. The cron trigger endpoint does not need additional rate limiting at the HTTP layer.

---

## 6. Recommended Implementation Pattern for Next.js App Router

### Shared singleton in `src/lib/ratelimit.ts`

The ratelimit instance should be a module-level singleton (created once per warm container, reused across requests to that container):

```typescript
// src/lib/ratelimit.ts — singleton pattern (research reference, not yet implemented)
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const ephemeralCache = new Map(); // module-level, survives across warm-container requests

export const brainRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "10 s"),
  ephemeralCache,
  prefix: "emma:rl:brain",
  analytics: false, // keep command count low; enable when on pay-as-you-go
  timeout: 500, // fail-open after 500ms
});

export const agentRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.tokenBucket(5, "10 s", 10),
  ephemeralCache,
  prefix: "emma:rl:agent",
  timeout: 500,
});

export const intakeRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(60, "1 m"),
  ephemeralCache,
  prefix: "emma:rl:intake",
  timeout: 500,
});
```

**Why multiple instances:** Different routes have different semantics. Brain needs smooth limiting (sliding window). Agent benefits from burst allowance (token bucket). Intake/webhooks need cheap, coarse limiting (fixed window). Separate `prefix` values ensure Redis keys do not collide.

### Usage in route handlers — early-return 429

```typescript
// Pattern (research reference, not yet implemented)
const { success, limit, remaining, reset } = await brainRatelimit.limit(userId);
if (!success) {
  return new Response("Too Many Requests", {
    status: 429,
    headers: {
      "Retry-After": String(Math.ceil((reset - Date.now()) / 1000)),
      "X-RateLimit-Limit": String(limit),
      "X-RateLimit-Remaining": "0",
      "X-RateLimit-Reset": String(reset),
    },
  });
}
```

The `Retry-After` header is required by RFC 6585 and is used by clients and monitoring tools to back off correctly.

### Middleware alternative for IP-based limits

Next.js `middleware.ts` (at the project root, next to `package.json`) runs on the Vercel Edge network before any route handler. Because `@upstash/ratelimit` is Edge Runtime compatible, IP-based limits can be enforced in middleware before reaching the route handler at all. This is the most efficient placement for intake endpoint protection.

Emma does not currently have a `middleware.ts`. The existing `src/proxy.ts` is used as a library function called by route handlers, not as the Next.js middleware export. Adding a `middleware.ts` for IP-based rate limiting would need to co-exist with the Supabase SSR cookie refresh logic currently in `proxy.ts` — this requires care to avoid double-processing.

### Fallback behaviour

The `timeout` option should be set to 500–1000ms on all ratelimit instances. If Upstash is unreachable (network blip, outage), `ratelimit.limit()` times out and the request is allowed through (fail-open). This matches Emma's existing fail-open design in `usage-enforcer.ts`.

---

## 7. Cost Estimate — Free Tier Sufficiency

### Load scenario

- 1,000 daily active users (DAU)
- 20 messages/day per user on the brain route
- Agent loop: ~25% of users trigger 1 agent run/day with ~5 sub-calls = 1,250 agent rate-limit checks
- Intake webhooks: ~500/day total

### Redis commands per rate-limit call

| Algorithm              | State                | Commands |
| ---------------------- | -------------------- | -------- |
| Sliding window (brain) | Intermediate (warm)  | 4        |
| Sliding window (brain) | First call in window | 5        |
| Token bucket (agent)   | All states           | 4        |
| Fixed window (intake)  | Intermediate         | 2        |

### Daily command budget

| Route                  | Calls/day | Avg commands/call | Total/day       |
| ---------------------- | --------- | ----------------- | --------------- |
| Brain (sliding window) | 20,000    | ~4.1              | ~82,000         |
| Agent (token bucket)   | 1,250     | 4                 | ~5,000          |
| Intake (fixed window)  | 500       | 2                 | ~1,000          |
| **Total**              |           |                   | **~88,000/day** |

Monthly: ~88,000 × 30 = **~2,640,000 commands/month**

The free tier cap is **500,000 commands/month**. At 1,000 DAU × 20 messages/day, Emma needs the **pay-as-you-go tier** at approximately $5.28/month ($0.20 per 100K commands × 26.4 units). This is small relative to LLM API costs.

### Free tier breakeven

Free tier holds up to roughly **830 DAU at 20 messages/day** (500,000 / (20 × 30 × ~4.1 commands/msg) ≈ 202 users before multiplying by day span — actually: 500,000 / (4.1 × 20 msgs × 30 days) ≈ 203 users on brain alone). More precisely: the brain route alone uses ~2,460 commands/user/month at 20 messages/day. 500,000 / 2,460 ≈ **203 users** before hitting the free tier on brain route only.

At sub-200 DAU (early beta), the free tier comfortably covers rate limiting. Moving to pay-as-you-go requires no code change and no service interruption.

Keeping `analytics: false` saves 1 command per call (~20% reduction).

---

## 8. Current Code Locations Summary

| File                                             | Role                                                                                      |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `src/core/rate-limiter.ts`                       | Current implementation: check-then-act Supabase pattern + in-memory fallback              |
| `src/core/agent-loop.ts`                         | Calls `checkRateLimit(rateLimitKey)` and `consumeRateLimit(rateLimitKey, 1, totalTokens)` |
| `src/app/api/emma/cron/scheduled-tasks/route.ts` | Calls `checkRateLimit` and `consumeRateLimit` per scheduled task                          |
| `src/app/api/emma/webhook/route.ts`              | Calls `checkRateLimit` and `consumeRateLimit`                                             |
| `src/lib/get-client-ip.ts`                       | Already correct: `x-real-ip` first, then `x-forwarded-for`                                |
| `supabase/schema.sql`                            | `rate_limit_counters` table + `increment_rate_limit` RPC function                         |

The `rate_limit_counters` table and `increment_rate_limit` RPC are safe to retain for hourly quota analytics. The enforcement logic in `checkRateLimit` is what needs replacing.

---

## 9. Open Questions Before Implementation

1. **Limit values per route.** The current defaults (20 tasks/hour, 100K tokens/hour) are hourly quotas tracked via Supabase. Per-second/per-minute burst limits for Upstash Redis are a separate concern and need values decided per route.

2. **Coexistence with Supabase hourly quotas.** Both can run in parallel: Upstash handles burst limiting (sub-minute), Supabase handles hourly quota enforcement. The check-and-increment race in Supabase is acceptable for hourly quotas (off by 1–2 is fine); it is not acceptable for strict per-second limits.

3. **`increment_rate_limit` atomicity.** If the hourly Supabase quota needs to be tightened (e.g. strict token enforcement for Pro plan), the stored procedure should be rewritten as a single check-and-increment that returns the allowed/blocked decision, eliminating the read-modify-write gap. This is a separate issue from burst rate limiting.

4. **Middleware for intake endpoints.** Adding `middleware.ts` for IP-based limits on `/api/emma/ingest/*` is cleaner than per-route handler checks, but requires the middleware to chain with the Supabase SSR auth logic currently in `proxy.ts`.

5. **Free tier vs. pay-as-you-go.** At sub-200 DAU the free tier holds. The transition is seamless; no code change required. Deciding when to upgrade is a business call.

---

## Sources

- Upstash Ratelimit TS overview: https://upstash.com/docs/redis/sdks/ratelimit-ts/overview
- Upstash Ratelimit getting started: https://upstash.com/docs/redis/sdks/ratelimit-ts/gettingstarted
- Upstash algorithms: https://upstash.com/docs/redis/sdks/ratelimit-ts/algorithms
- Upstash costs (Redis command counts per algorithm state): https://upstash.com/docs/redis/sdks/ratelimit-ts/costs
- Upstash features (caching, multi-region, analytics): https://upstash.com/docs/redis/sdks/ratelimit-ts/features
- Upstash pricing: https://upstash.com/pricing
- Vercel KV deprecation notice: https://vercel.com/docs/redis (redirected from /docs/storage/vercel-kv)
- Emma codebase: `src/core/rate-limiter.ts`, `src/lib/get-client-ip.ts`, `supabase/schema.sql`
