# Emma Security Audit

**Date:** 2026-05-31  
**Scope:** Full codebase — auth, API routes, webhooks, CSP headers, deps, input validation, encryption, GDPR  
**Auditor:** Claude Code (security-review skill)

---

## Executive Summary

Emma has a strong security baseline. Prompt injection protection, webhook HMAC verification, OAuth token encryption, audit logging, and security headers are all well-implemented. The gaps are concentrated in three areas: a missing rate limiter on the primary brain route, `unsafe-eval`/`unsafe-inline` in CSP that widens any XSS surface, and 7 dependency vulnerabilities (1 high, 6 moderate) that have available fixes.

---

## Findings

### P0 — HIGH

#### 1. Next.js Server Components DoS — `npm audit` (GHSA-8h8q-6873-q5fj, CVSS 7.5)

`npm audit` reports a high-severity vulnerability in the installed version of Next.js: a Server Components handler can be crashed by a malformed request, causing denial of service with no authentication required.

**Fix:** `npm audit fix` — also run `npm install` after to update `package-lock.json`.

---

### P1 — MEDIUM

#### 2. No rate limiting on `POST /api/emma` (the brain route)

The intake chat route (`/api/intake/[slug]/chat`) has IP-based rate limiting (20 req/60s). The main brain route has usage enforcement (5-hour window) but **no request-rate limiter**. Between the start of a request and the usage check, there is no protection against burst flooding. A user on the free tier can fire 50 parallel requests before any of them return and record usage.

**File:** `src/app/api/emma/route.ts` — no rate limiter call before `checkUsage`.

**Fix:** Add a lightweight in-memory or Redis token bucket at the top of the POST handler, keyed by `userId`.

```typescript
// Early in POST handler, before usage check
const rateCheck = await checkRateLimit(`brain:${userId}`, 10, 10_000); // 10 req/10s
if (!rateCheck.allowed) {
  return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 });
}
```

#### 3. CSP uses `unsafe-inline` and `unsafe-eval` globally

`next.config.js` applies `script-src 'self' 'unsafe-inline' 'unsafe-eval'` to all routes. A TODO comment acknowledges this should be replaced with nonce-based CSP once Live2D is stable.

In the current state, any DOM XSS (e.g., via a third-party script, a reflected value, or a React escape) gives full script execution with no CSP mitigation.

**File:** `next.config.js:42`

**Fix (incremental):** Apply `unsafe-eval` only to routes that load Live2D (`/app`). All other routes (settings, admin, intake) can use a stricter policy or nonce. This reduces the attack surface even before full nonce adoption.

#### 4. IP header spoofing bypasses intake rate limiting

`src/lib/get-client-ip.ts` trusts `x-real-ip` then `x-forwarded-for` directly. On Vercel these are set by the edge and can't be spoofed by the end user. But in self-hosted or proxy-in-front-of-proxy deployments, an attacker can set `X-Real-IP: 1.2.3.4` and bypass per-IP rate limits on the intake endpoint.

**File:** `src/app/api/intake/[slug]/chat/route.ts:69`

**Recommendation:** Document that this relies on Vercel's edge to set these headers correctly. If ever deployed outside Vercel, use a fixed trusted proxy list. Currently acceptable risk in a Vercel deployment.

---

### P2 — LOW

#### 5. Multimodal messages skip sanitisation

In the main brain route, `sanitiseInput()` is called only when `typeof lastUserMsg.content === "string"`. When content is an array (multimodal — images + text blocks), text blocks inside the array are not sanitised.

**File:** `src/app/api/emma/route.ts:146`

```typescript
if (lastUserMsg?.role === "user" && typeof lastUserMsg.content === "string") {
  // Only string content is sanitised — array content (multimodal) is skipped
```

**Fix:** Extract text from multimodal content and sanitise it:

```typescript
if (lastUserMsg?.role === "user") {
  const rawText =
    typeof lastUserMsg.content === "string"
      ? lastUserMsg.content
      : (lastUserMsg.content as ApiMessageContent[])
          .filter((b) => b.type === "text")
          .map((b) => b.text || "")
          .join(" ");
  const sanitised = sanitiseInput(rawText);
  if (sanitised.blocked) {
    /* ... reject ... */
  }
}
```

#### 6. GDPR deletion doesn't clear `client_integrations` (OAuth tokens)

`POST /api/emma/gdpr { action: "delete" }` deletes messages, conversations, memories, usage, client_members, tasks, and profile — but does **not** delete `client_integrations`. Encrypted OAuth tokens (Google, Slack, Notion) for that user's client remain in the database after account deletion.

**File:** `src/app/api/emma/gdpr/route.ts:120-175`

**Fix:** After step 5 (client_members deletion), resolve the `client_id` and delete `client_integrations`:

```typescript
const { data: membership } = await supabase
  .from("client_members")
  .select("client_id")
  .eq("user_id", user.id)
  .single();

if (membership) {
  await supabase.from("client_integrations").delete().eq("client_id", membership.client_id);
  deletionLog.push("client_integrations: cleared");
}
```

#### 7. Webhook goal template injection (indirect prompt injection risk)

`src/app/api/emma/webhook/route.ts` builds an agent goal by substituting `{{key}}` variables from attacker-controlled `eventData` into a DB-stored template. The sanitisation applied (`safe = String(value).replace(/\{\{|\}\}/g, "")`) prevents template recursion but does not prevent prompt injection via the substituted value itself.

An attacker who can send a webhook payload could embed injection patterns in event field values, which then appear in the agent's goal string.

**File:** `src/app/api/emma/webhook/route.ts:161-166`

**Fix:** Run `sanitiseInput()` on each substituted value before embedding it in the goal string.

```typescript
import { sanitiseInput } from "@/core/security/sanitise";
// ...
const safe = sanitiseInput(String(value)).clean.replace(/\{\{|\}\}/g, "");
```

#### 8. Six moderate dependency vulnerabilities

All fixable with `npm audit fix`:

| Package           | Issue                           | Severity | Fix             |
| ----------------- | ------------------------------- | -------- | --------------- |
| `brace-expansion` | Large numeric range DoS         | moderate | `npm audit fix` |
| `uuid`            | Buffer bounds check in v3/v5/v6 | moderate | `npm audit fix` |
| `svix`            | Via vulnerable `uuid`           | moderate | `npm audit fix` |
| `resend`          | Via vulnerable `svix`           | moderate | `npm audit fix` |
| `ws`              | Uninitialized memory disclosure | moderate | `npm audit fix` |

Note: `brace-expansion` is in `@typescript-eslint` (dev dep, not runtime). `ws`, `uuid`, `svix`, `resend` are runtime.

---

## What's Working Well

### Authentication

- Supabase SSR auth on every protected route via `getUser()` — never client-claimed IDs
- Session cookies managed by `@supabase/ssr` with proper `HttpOnly`/`Secure` handling
- Waitlist gate enforced both in middleware (`src/proxy.ts`) and inside the brain API handler — double-checked, no bypass path
- Admin gate uses email allowlist cross-checked against authenticated session, not a header or body param

### Prompt Injection Protection

- `sanitiseInput()` is a strong 4-layer defense: length limits, control character stripping, spam collapse, 15+ pattern categories
- High-severity patterns (jailbreak, DAN mode, instruction override) trigger a hard block with audit logging
- Applied on both the main brain route and the intake chat route

### Webhook Security

All four inbound webhook surfaces use `crypto.timingSafeEqual` HMAC-SHA256:

- LemonSqueezy (`x-signature`) — `src/app/api/lemon/webhook/route.ts:46-60`
- WhatsApp (`x-hub-signature-256`) — `src/app/api/emma/ingest/whatsapp/route.ts:33-38`
- Email ingest (`x-webhook-signature`) — `src/app/api/emma/ingest/email/route.ts:23-28`
- Emma custom webhooks (`x-emma-signature`) — `src/app/api/emma/webhook/route.ts:64-74`

### OAuth Token Storage

- Access and refresh tokens are AES-256-GCM encrypted before Supabase insert (`src/app/api/integrations/[service]/oauth/callback/route.ts:148-149`)
- OAuth state is single-use with TTL, deleted immediately on use (PKCE-equivalent for server-side flows)

### Field-Level Encryption

- `src/core/security/encryption.ts` implements AES-256-GCM correctly: random IV per encrypt, auth tag stored and verified on decrypt
- Graceful fallback with console warn when `EMMA_ENCRYPTION_KEY` is missing (not a silent no-op)

### Security Headers (`next.config.js`)

| Header                      | Value                                            |
| --------------------------- | ------------------------------------------------ |
| `X-Content-Type-Options`    | `nosniff`                                        |
| `X-Frame-Options`           | `SAMEORIGIN`                                     |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`                |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains`            |
| `Permissions-Policy`        | camera/mic self-only, no payment/geolocation/USB |
| `Content-Security-Policy`   | Present — see gap #3                             |
| `frame-src`                 | `none`                                           |
| `object-src`                | `none`                                           |

### Audit Logging

- Append-only audit log in Supabase with no delete policy
- Covers: billing events, agent approvals/rejections, GDPR exports/deletions, OAuth connections, injection attempts
- Non-blocking (failures logged but never thrown)

### Input Handling

- No raw SQL — all DB access through Supabase JS SDK (parameterized by default)
- Error messages returned to clients are generic; detailed errors only to `console.error`
- IPs hashed SHA-256 before storage in leads table

### Cron Authentication

- All cron routes check `Authorization: Bearer ${CRON_SECRET}` in non-development
- Dev mode bypass is explicit (`NODE_ENV !== "development"` check)

---

## Checklist

| Check                              | Status  | Notes                                                      |
| ---------------------------------- | ------- | ---------------------------------------------------------- |
| No hardcoded secrets               | PASS    | All secrets via env vars                                   |
| Input validation — string messages | PASS    | `sanitiseInput()` applied                                  |
| Input validation — multimodal      | FAIL    | Array content not sanitised — gap #5                       |
| SQL injection                      | PASS    | Supabase SDK throughout                                    |
| XSS / CSP                          | PARTIAL | Headers set, but `unsafe-inline`/`eval` — gap #3           |
| CSRF                               | PARTIAL | SameSite cookies via Supabase SSR; no explicit CSRF tokens |
| Auth tokens in httpOnly cookies    | PASS    | Supabase SSR handles this                                  |
| Auth on all private routes         | PASS    | Middleware + per-route `getUser()`                         |
| Rate limiting — intake             | PASS    | 20 req/60s per IP                                          |
| Rate limiting — brain route        | FAIL    | No request-rate limiter — gap #2                           |
| Rate limiting — webhooks           | PASS    | Client-level rate limiter                                  |
| Webhook HMAC                       | PASS    | `timingSafeEqual` on all 4 webhooks                        |
| OAuth tokens encrypted             | PASS    | AES-256-GCM at rest                                        |
| Sensitive data in logs             | PASS    | IPs hashed, no secrets in console output                   |
| Generic error messages             | PASS    | Internal detail stays server-side                          |
| Security headers                   | PASS    | 7 headers set                                              |
| HSTS                               | PASS    | 1-year, includeSubDomains                                  |
| Dependency vulnerabilities         | FAIL    | 7 vulns (1 high Next.js DoS) — gaps #1, #8                 |
| GDPR data deletion complete        | PARTIAL | Missing `client_integrations` — gap #6                     |
| Prompt injection                   | PASS    | Multi-layer, high-severity block                           |
| Audit logging                      | PASS    | Append-only, covers all sensitive ops                      |

---

## Recommended Fix Order

| Priority | Fix                                                                              | Effort |
| -------- | -------------------------------------------------------------------------------- | ------ |
| 1        | `npm audit fix` — closes 7 vulns including high-severity Next.js DoS             | 5 min  |
| 2        | Rate limit on `/api/emma` — `checkRateLimit("brain:userId", 10, 10_000)`         | 30 min |
| 3        | Sanitise multimodal content — extend string check to cover array text blocks     | 20 min |
| 4        | GDPR deletion — add `client_integrations` delete step                            | 15 min |
| 5        | Webhook goal injection — wrap substituted values through `sanitiseInput().clean` | 15 min |
| 6        | CSP nonce migration — restrict `unsafe-eval` to `/app` only as first step        | 2–4h   |
