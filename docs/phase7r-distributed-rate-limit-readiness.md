# Phase 7R — Distributed Rate Limit Reliability Review

**Status:** Read-only architecture audit. No code changed.
**Date:** 2026-07-14
**Branch reviewed:** `feat/p7b-brain-gateway`
**Trigger:** Production 500 — `Distributed rate limit check timeout` at `src/lib/ratelimit.ts:27`, surfaced through `POST /api/emma`.

---

## 1. Current Architecture

### Request flow (chat path)

```
Client
  │
  ▼
POST /api/emma/route.ts
  │
  ├─ validateSupabaseAuthEnvironment() / validateProductionEnvironment()   (503 if env broken)
  ├─ resolveUser()                                                        (401 if unauthenticated)
  ├─ waitlist gate                                                        (403 if not approved)
  │
  ├─ checkDistributedRateLimit()  ◄── THIS REVIEW           src/lib/ratelimit.ts:37
  │     │
  │     ▼
  │   Upstash Ratelimit.limit()  (@upstash/ratelimit v2.0.8, sliding window, 20 req / 60 s)
  │     │
  │     ▼
  │   interpretDistributedRateLimitResult()                 src/lib/ratelimit.ts:20
  │     │  reason === "timeout"?  → throw Error (fail closed)
  │     │  else                   → { allowed, resetAt }
  │
  ├─ enforceCostGate({ operation: "chat" })                  src/core/cost-gate.ts
  │     │  (internally ALSO calls checkDistributedRateLimit, namespace "chat",
  │     │   but wraps it in enforce()'s try/catch → converts throw to a typed
  │     │   503 "metering_unavailable" decision)
  │
  ▼
Brain Gateway (brainChatStream)  — src/core/brain/gateway.ts (ADR-0003)
  │
  ▼
OpenRouter provider
```

### Responsibilities

| Component                             | Responsibility                                                                      | Boundary                                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/lib/ratelimit.ts`                | Sliding-window counting via Upstash Redis; local in-memory fallback in dev          | Pure function + Redis client, no HTTP concerns                                              |
| `interpretDistributedRateLimitResult` | Converts Upstash's own success/timeout signal into Emma's allow/deny decision       | Policy layer: decides fail-open vs fail-closed                                              |
| `route.ts` (chat)                     | Direct per-user throughput guard (20/60s), **unwrapped** call                       | Route-level, no dedicated catch                                                             |
| `agent/route.ts`                      | Direct per-user throughput guard (5/60s), **unwrapped** call                        | Route-level, no dedicated catch                                                             |
| `core/cost-gate.ts`                   | Paid-operation gate; wraps rate check + budget + usage persistence in one try/catch | Converts all internal throws (including rate-limit timeout) into a typed `CostGateDecision` |
| Brain Gateway                         | Provider-independent inference boundary (ADR-0003)                                  | Downstream of rate limiting; never reached if the limiter throws                            |

### Dependencies

- `@upstash/ratelimit@2.0.8`, `@upstash/redis@1.38.0`
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — required in production (`src/core/env-validation.ts:24-25`, `PRODUCTION_REQUIRED_ENV`). If missing entirely, `validateProductionEnvironment()` returns a clean 503 **before** any rate-limit call is attempted. The bug in question is a different case: Upstash **is** configured, but a single call to it times out.

---

## 2. Failure Modes

| Failure                                                     | Current behavior                                                                                                                                                                                                   | Expected behavior                                                                                                                     | Production impact                                                                                                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upstash responds within timeout, under limit                | `{ allowed: true }`                                                                                                                                                                                                | ✅ matches                                                                                                                            | None                                                                                                                                                    |
| Upstash responds within timeout, over limit                 | `{ allowed: false }` → 429 with `Retry-After`                                                                                                                                                                      | ✅ matches                                                                                                                            | User throttled correctly                                                                                                                                |
| **Upstash doesn't respond within 5000ms (library default)** | Library resolves `{success:true, reason:"timeout"}` → Emma overrides to `throw Error("...timeout")` → **uncaught at 2 of 3 call sites** → generic top-level `catch` → 500                                          | Should be a distinguishable, typed, retryable response (e.g. 503 with `Retry-After`), not indistinguishable from an application bug   | User sees a hard failure with no retry guidance; Sentry logs it as an unhandled exception, polluting error tracking with an expected/designed condition |
| Redis network partition / DNS failure                       | `Ratelimit.limit()` rejects (not a `reason:"timeout"` resolve, an actual promise rejection) — **not handled by `interpretDistributedRateLimitResult` at all**, propagates as whatever error the Upstash SDK throws | Same as timeout — typed, fail-closed, retryable                                                                                       | Same opaque 500, but with an even less predictable error shape (whatever the HTTP client library throws)                                                |
| Invalid Upstash credentials                                 | Upstash SDK returns an HTTP error from its REST call; surfaces as a rejected promise, same path as network partition                                                                                               | Should fail closed clearly, ideally caught at startup via env validation (credentials aren't format-validated, only presence-checked) | Opaque 500; no distinction from a genuine outage vs. a misconfigured/rotated token                                                                      |
| `UPSTASH_REDIS_REST_URL/TOKEN` missing (prod)               | `validateProductionEnvironment()` returns 503 with a clear message, checked before auth even runs                                                                                                                  | ✅ matches, this path is fine                                                                                                         | Correctly surfaced, not part of this bug                                                                                                                |
| Rate limit exceeded (legitimate)                            | 429 + `Retry-After` header                                                                                                                                                                                         | ✅ matches                                                                                                                            | Correct                                                                                                                                                 |
| Malformed/partial Upstash response                          | Not explicitly handled; would need to violate the SDK's own return type to occur                                                                                                                                   | N/A — SDK contract prevents this in practice                                                                                          | Low likelihood, no evidence found                                                                                                                       |

---

## 3. Timeout Analysis

`result.reason === "timeout"` → `throw new Error(...)` is **intentional at the policy level, but incompletely integrated at the plumbing level.**

Evidence:

- `@upstash/ratelimit`'s own default (`node_modules/@upstash/ratelimit/dist/index.js:766`, `this.timeout = config.timeout ?? 5e3`) is to **fail open** on timeout: after 5000ms with no Redis response, the library resolves the race with a synthetic `{success: true, reason: "timeout"}` — i.e., "let the request through, we couldn't check in time."
- Emma's `interpretDistributedRateLimitResult` (`src/lib/ratelimit.ts:25-28`) explicitly overrides that library default: `// Upstash reports timeouts as success=true; paid work must fail closed.` then throws.
- A unit test already encodes this as expected behavior: `tests/unit/cost-enforcement.test.ts:25` — _"fails closed when Upstash reports a timeout as successful"_ — asserts the throw. This is a deliberate, tested design decision, not an accident.
- **What is not intentional:** the throw is a bare `Error`, not one of the codebase's existing typed errors (`EmmaError`, `RateLimitError`, `ApiError` in `src/lib/errors.ts`) that already carry `status` and `retryable`. The codebase clearly has a taxonomy for exactly this situation and this throw doesn't use it.
- **What is inconsistent:** of the three call sites, only one handles the throw gracefully:
  - `src/core/cost-gate.ts:163` → wrapped inside `enforce()`'s try/catch (`cost-gate.ts:184-283`) → converted to `{ allowed: false, reason: "metering_unavailable", status: 503, message: "Cost enforcement is temporarily unavailable." }`. Tested at `tests/unit/cost-enforcement.test.ts:100-111`.
  - `src/app/api/emma/route.ts:126` → called directly, **no local catch** → falls to the route's generic `catch (err)` at line 664 → `Sentry.captureException`, `console.error("[EMMA API] Unexpected error:", err)`, 500 with generic persona copy. This is the exact production error reported.
  - `src/app/api/emma/agent/route.ts:62` → same pattern, falls to `catch (err)` at line 382 → 500 "Agent operation failed".

**Verdict: intentional fail-closed policy, accidental error-handling gap.** The design decision ("don't let a Redis hiccup grant free paid usage") is sound and already validated by tests in one code path. The bug is that this same primitive is called directly, unguarded, from two other request-level guards that were never updated to route the resulting throw into the same typed/graceful shape.

---

## 4. Fail-Closed Policy Analysis

**Advantages**

- Prevents unmetered LLM spend during Redis instability — the stated and legitimate concern (`paid work must fail closed`).
- Predictable cost ceiling: worst case is "briefly unavailable," not "briefly free-for-all."
- Already covered by a unit test, so the policy itself won't silently regress.

**Disadvantages**

- Couples product availability to a third-party dependency's tail latency. A default 5000ms timeout is long relative to typical Redis REST round-trips — most real Upstash calls resolving in this codebase's use are single-digit-to-low-double-digit ms; a 5s stall is itself already an anomaly, but when it happens, it is currently maximally punished (hard 500) rather than gracefully degraded.
- No distinction today between "Redis is genuinely down" (should stay fail-closed) and "one call was slow" (arguably fine to retry once before failing closed).

**Operational risk:** every authenticated chat request calls this limiter (`route.ts:126`, no per-user cache bypass), so Redis tail latency is on the hot path of 100% of chat traffic, not a background job.

**User experience impact:** the current uncaught path returns the generic 500 persona line ("Something went wrong on my end...") with no `Retry-After`, unlike the 429 path a few lines above it in the same file which does set `Retry-After`. A user hitting this mid-conversation gets a dead end, not a "try again in a second" signal, even though the underlying condition (a Redis timeout) is typically transient and self-resolving within seconds.

**Production cost impact:** none from the policy itself — it's doing its job (blocking usage it can't verify). The cost is entirely in noise: every timeout is Sentry-reported as an unhandled application exception, indistinguishable from a real bug, which degrades signal quality for on-call.

**Security impact:** none identified. No bypass path exists; fail-closed holds under all observed failure modes.

**Is the policy still appropriate?** Yes, for the specific concern it was built for (paid-operation budget protection, `cost-gate.ts`). It was seemingly written with that call site in mind. Whether it's the right default for the plain per-user throughput guards (`route.ts:126`, `agent/route.ts:62`, which are about abuse/throughput, not billing) is a narrower, separate question this review flags but does not resolve (see §13).

---

## 5. Availability Analysis

**Can one infrastructure dependency make Emma completely unavailable? Yes.**

Chain: `UPSTASH_REDIS_REST_URL/TOKEN` are in `PRODUCTION_REQUIRED_ENV` (`src/core/env-validation.ts:24-25`) — Upstash is a hard production dependency, not optional. Every authenticated call to `POST /api/emma` invokes `checkDistributedRateLimit` before any brain/LLM work happens (`route.ts:126`, ahead of `enforceCostGate` and the Brain Gateway). If Upstash is slow enough, often enough, across enough users concurrently, the chat endpoint returns 500 to all authenticated traffic — not just the affected user — since the failure is per-request, not user-scoped.

**Is this acceptable?** Partially, and only for the reason stated in §4: it's the deliberate cost of preventing unmetered spend. But today the "unavailable" experience is the least graceful version possible (bare 500, no retry signal, Sentry-flagged as a bug) when the underlying event is often a transient few-second blip that a differently-shaped response (typed 503, `Retry-After`, no Sentry noise) would handle with the same safety guarantee and much less user/on-call pain.

---

## 6. Error Propagation

```
Upstash Redis (slow/unavailable)
      │  (>5000ms, library default timeout)
      ▼
@upstash/ratelimit .limit() resolves { success:true, reason:"timeout" }
      │
      ▼
interpretDistributedRateLimitResult()   src/lib/ratelimit.ts:26-28
      │  throw new Error("Distributed rate limit check timeout")
      │  ── information present at this point: the string alone.
      │     No status code, no retryable flag, no namespace/operation context
      │     attached to the error object.
      ▼
route.ts POST handler — no local catch around checkDistributedRateLimit (line 126)
      │
      ▼
Top-level catch (route.ts:664-671)
      │  Sentry.captureException(err)        — logged as unhandled exception
      │  console.error("[EMMA API] Unexpected error:", err)
      │  status = err instanceof EmmaError ? err.status : 500   → 500 (plain Error, not EmmaError)
      │  body = { error: getPersonaErrorMessage(500) }          → generic persona copy
      ▼
Client (stream-client.ts) sees a 500, not an SSE stream
      ▼
UI shows a generic failure; no indication this was rate-limit infra, not the brain/LLM
```

**Is information lost? Yes, at two points:**

1. At the throw itself — the `Error` carries no status/retryable metadata, unlike `EmmaError`/`RateLimitError` which exist in the same codebase for this purpose.
2. At the top-level catch — it can't distinguish "the rate limiter's Redis call timed out" from "the code has a bug," because both arrive as anonymous `Error` instances. The `console.error` message string is the only surviving clue, and it's not machine-distinguishable in the response body or Sentry tagging.

By contrast, the `cost-gate.ts` path preserves the distinction perfectly: it catches the same throw and emits a purpose-built `reason: "metering_unavailable"` decision — proof that a clean version of this propagation already exists in the codebase, just not reused at the other two call sites.

---

## 7. Logging

**What exists:**

- `console.error("[EMMA API] Unexpected error:", err)` — includes the error object (stack + message), so the string "Distributed rate limit check timeout" is visible in logs.
- `Sentry.captureException(err)` — full stack trace captured, but tagged as a generic unhandled exception, not as a rate-limit-specific event.
- `cost-gate.ts`'s `dependencies.log(...)` — structured JSON logging (`event`, `operation`, `userId`, `clientId`, `planId`, `allowed`, `reason`) via `console.warn`, but only on the path that already catches the error (i.e., only for the `enforceCostGate` call site, not `route.ts:126` or `agent/route.ts:62`).

**What's missing:**

- No metric/counter for "how often did the distributed rate limiter time out" — currently indistinguishable from any other 500 in aggregate dashboards without opening individual Sentry events and reading stack traces.
- No latency measurement of the Upstash call itself (can't currently tell "it took 5001ms" from "it took 30s" — both look identical: a timeout after exactly 5000ms since that's a client-side race, not a measurement of actual Redis latency).
- No structured field distinguishing which namespace/limiter (`req:brain` vs `req:agent` vs a `cost-gate` namespace) was involved when the timeout is logged from `route.ts` or `agent/route.ts` — the thrown `Error` string is identical regardless of caller, so a log search can't tell which guard fired without correlating request path from the surrounding Sentry breadcrumb.
- Sentry tagging/fingerprinting to group these events separately from genuine application exceptions is absent — every timeout currently increments whatever "unhandled error" alert exists undifferentiated from real bugs.

**Sufficient to diagnose the reported incident?** Barely — the stack trace does point precisely to `ratelimit.ts:27`, which is why root cause here was fast to confirm. But it required opening a raw stack trace; there is no dashboard signal that would have surfaced "Upstash timeout rate is elevated" proactively.

---

## 8. Retry Strategy

**Do retries currently exist for this path? No.** `interpretDistributedRateLimitResult` throws on the first timeout signal; there is no re-attempt of the Redis call anywhere in `checkDistributedRateLimit`. (Note: `src/lib/errors.ts` has a general-purpose `fetchWithRetry` helper with exponential backoff used elsewhere in the codebase, but it is not wired into the rate-limit path — the Upstash SDK call bypasses it entirely.)

**Should retries exist? Recommend yes, for consideration, not as a mandate.** A single retry with a short bound (e.g., a second attempt within an additional 1-2s, well under typical user patience) would let Emma distinguish "transient blip" from "Redis is actually down," at the cost of added tail latency on the already-rare timeout path. This is worth evaluating but is explicitly **not implemented here** per the constraints of this review.

Caveat: retries interact with the 5000ms timeout already baked into the Ratelimit instance — a naive retry would double worst-case added latency to ~10s before any response reaches the user, which needs deliberate design (e.g., a shorter per-attempt timeout with one retry, rather than reusing the current 5000ms twice).

---

## 9. Configuration

| Setting                                                     | Configurable today?                                                                                                 | Where                                                                         |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Upstash timeout (5000ms default)                            | Yes, via `Ratelimit` constructor's `timeout` option — **not currently passed**, so the library default is in effect | `src/lib/ratelimit.ts:47-53`                                                  |
| Per-namespace limit/window (e.g., 20/60s chat, 5/60s agent) | Yes, passed per call site as `limit`/`windowSeconds`                                                                | `route.ts:126-131`, `agent/route.ts:62-67`, `cost-gate.ts` `OPERATION_LIMITS` |
| Retry count/backoff for the rate-limit check itself         | N/A — doesn't exist (§8)                                                                                            | —                                                                             |
| Fail-open vs fail-closed on timeout                         | Hardcoded in `interpretDistributedRateLimitResult`, not environment- or config-driven                               | `src/lib/ratelimit.ts:26-28`                                                  |
| Upstash credentials                                         | Yes, via env vars, presence-checked but not format/reachability-validated at boot                                   | `env-validation.ts`                                                           |

Nothing here is a blocker; it's simply worth noting that the timeout duration and the fail-open/closed choice are both currently code constants, not tunable without a deploy.

---

## 10. Production Readiness (platform-specific)

- **Vercel / serverless:** Each cold-started function instance gets its own `limiters`/`ephemeralCache`/`localWindows` Maps (module-level, `ratelimit.ts:4-7`) — these do not persist across cold starts or across concurrently-scaled instances, only within a single warm container. This is a correctness note independent of the timeout bug: the sliding-window count itself is only as consistent as Upstash (shared, correct) makes it; the local Maps are just a client cache, not the source of truth, so this is fine.
- **Intermittent Redis latency:** This is precisely the reported failure mode. The current design turns any single slow Upstash call (≥5000ms) into a hard 500 for that request, network-wide, with no smoothing.
- **Regional outages:** Not distinguished from a single slow call — same throw, same generic 500. A regional Upstash outage today produces a sustained wave of opaque 500s across all authenticated users rather than a single clear "service degraded" signal.
- **Serverless timeout budget:** A 5000ms internal timeout is a meaningful fraction of typical serverless function timeout budgets (commonly 10-30s on Vercel depending on plan) — on a bad day, this alone can eat a large slice of the available request budget before the brain call has even started, on top of whatever the brain/provider call itself takes.

---

## 11. Brain Gateway Independence (ADR-0003)

**Confirmed independent.** Evidence:

- `checkDistributedRateLimit` is called and throws at `route.ts:126`, **before** `brainChatStream` (`route.ts:23`, invoked later in the handler) is ever reached. The stack trace in the reported incident (`checkDistributedRateLimit → interpretDistributedRateLimitResult → POST`) contains no Brain Gateway or provider frames.
- `src/core/brain/gateway.ts` and its OpenRouter provider have no import of, or reference to, `src/lib/ratelimit.ts`.
- The Brain Gateway migration (Phase 7B, `feat/p7b-brain-gateway`) touched inference call sites only; it did not modify `src/lib/ratelimit.ts`, `src/core/cost-gate.ts`, or either route's rate-limit call sites.
- Conclusion: this is a pre-existing gap in `src/lib/ratelimit.ts`'s error-handling integration, unrelated to and unaffected by ADR-0003. Fixing or leaving it as-is has zero coupling to the Brain Gateway or provider abstraction.

---

## 12. Architecture Risks (prioritized)

**High**

1. Two of three call sites (`route.ts:126`, `agent/route.ts:62`) let a _designed_ fail-closed condition surface as an untyped, un-retryable 500 indistinguishable from a real bug — this is the direct cause of the reported incident and will recur on any Upstash latency spike.
2. Upstash is a hard, unconditional production dependency for the entire chat endpoint (§5) with no graceful-degradation path today — every chat request is gated on it before any LLM work.

**Medium** 3. No telemetry differentiates "rate-limit timeout" from "generic application exception" (§7) — on-call has no proactive signal, only reactive stack-trace reading. 4. No retry/backoff exists for a single slow Redis call (§8) — the system treats "briefly slow" and "genuinely down" identically.

**Low** 5. Timeout duration (5000ms) and fail-open/closed behavior are hardcoded rather than configurable (§9) — not urgent, but means any future tuning requires a code change + deploy. 6. No dedicated unit tests exercise the _route-level_ (uncaught) call sites' behavior under a rate-limit timeout — only `cost-gate.ts`'s handling of it is tested (`tests/unit/cost-enforcement.test.ts`). The untested paths are exactly the ones that produced the incident.

---

## 13. Recommendations (not implemented — for future scoping)

**Immediate**

- Wrap the two unguarded call sites (`route.ts:126`, `agent/route.ts:62`) so a rate-limit-check failure returns a typed, retryable response (mirroring what `cost-gate.ts` already does) instead of falling through to the generic top-level catch. This is the direct fix for the reported incident.
- Use one of the existing typed errors (`EmmaError`/`RateLimitError` in `src/lib/errors.ts`) for the thrown timeout, so `status`/`retryable` travel with the error instead of being re-derived ad hoc at each catch site.

**Short-term**

- Add a distinguishing Sentry tag/fingerprint (or skip Sentry entirely) for expected fail-closed conditions, so they stop polluting unhandled-exception alerting.
- Add a structured log line (matching `cost-gate.ts`'s pattern) at the two currently-silent call sites so timeout frequency is queryable without opening individual traces.
- Add unit tests for `route.ts` and `agent/route.ts` covering "rate-limit check throws" → asserts the _response shape_ (status, body, `Retry-After`), matching the existing `cost-gate.ts` test pattern.

**Long-term**

- Evaluate a bounded single retry with a shorter per-attempt timeout (not simply doubling the existing 5000ms) to reduce false-positive fail-closed events during brief Redis blips, without weakening the fail-closed guarantee for genuine outages.
- Revisit whether the throughput guards (`route.ts:126`, `agent/route.ts:62` — abuse/throughput protection) need the same fail-closed severity as the paid-operation cost gate (`cost-gate.ts` — billing protection), since they protect different things and a differentiated policy per namespace may be more appropriate than one global rule.
- Make the Upstash timeout duration configurable (env var) so it can be tuned without a deploy if Vercel function timeout budgets or Upstash region latency characteristics change.

---

## Dependency Analysis Summary

| Dependency                 | Required in prod?               | Failure isolation today                                                                                  |
| -------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Upstash Redis              | Yes (`PRODUCTION_REQUIRED_ENV`) | None — failure (slow or down) surfaces directly as request-level 500 at 2/3 call sites                   |
| Brain Gateway / OpenRouter | Yes                             | Fully independent of rate-limit path (§11); not implicated in this incident                              |
| Supabase                   | Yes                             | Independent — auth/waitlist gates run before rate-limit check, fail with their own distinct status codes |

## Production Readiness Score

**5.5 / 10** — The fail-closed _policy_ is sound, deliberate, and already proven in one code path (`cost-gate.ts`). The _implementation_ is incomplete: the same primitive is reused without its safety net at two higher-traffic call sites, turning a designed-for condition into user-visible, Sentry-flagged, unretried 500s. Nothing here indicates data loss, security exposure, or cost-control failure — this is strictly an error-handling/observability gap.

## GO / CONDITIONAL GO / NO GO

**CONDITIONAL GO.**

The system is safe to keep running as-is (no security or cost risk), but it is not production-hardened against Upstash latency variance, which is a realistic and recurring condition, not an edge case. Condition for full GO: apply the "Immediate" recommendation above (typed, retryable handling at the two unguarded call sites) before treating Upstash timeouts as a solved problem. Until then, expect this exact 500 to recur on any Redis latency spike, indistinguishable from a real bug in monitoring.

---

_This document is a read-only architecture review. No production code, configuration, or behavior was changed to produce it._
