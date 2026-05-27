# QA Report — Full Audit

**Date:** 2026-05-27
**Branch:** qa/full-audit (main at commit 27cd3d6 — Merge PR #47 from fix/waitlist-access-hardening)
**Auditor:** Claude QA Agent (claude-sonnet-4-6)

---

## Executive Summary

| Metric              | Result                                                                   |
| ------------------- | ------------------------------------------------------------------------ |
| Overall health      | 6.5 / 10                                                                 |
| Test suite          | PASS — 185 passed, 3 skipped, 0 failed (19 files passed, 1 skipped)      |
| Build               | PASS — Next.js 16.2.4 Turbopack, 0 TypeScript errors, 62 routes compiled |
| Lint                | PASS with warnings — 0 errors, 10 warnings                               |
| Critical issues     | 1                                                                        |
| High issues         | 3                                                                        |
| Medium issues       | 5                                                                        |
| Low / Informational | 6                                                                        |

The codebase is in a stable state. The waitlist hardening shipped in `fix/waitlist-access-hardening` is mostly correct, but one cron route (`pattern-detection`) was missed in the hardening pass and still uses the old spoofable `Host` header bypass. There are also meaningful structural gaps: no dry-run mode in the backfill script, an email case mismatch in the auth callback update query, and 14.68% overall test coverage (proxy.ts and auth/callback have zero instrumented line coverage).

---

## Test Suite Results

```
Test Files  19 passed | 1 skipped (20)
Tests       185 passed | 3 skipped (188)
Duration    2.82s
```

All 185 tests pass. The 1 skipped file and 3 skipped tests are pre-existing intentional skips (not regressions). No failures.

The test file coverage spans: sanitise, encryption, context-manager, verticals, client-config, webhook-hmac, command-parser, middleware-intake, proxy-middleware-structure, agent-loop, errors, intake-chat, openrouter, pattern-detector, tools-and-limits, usage-enforcer, cron-auth-hardening, proxy-waitlist-gate.

---

## Build Results

```
Next.js 16.2.4 (Turbopack)
Compiled successfully in 14.0s
TypeScript: 0 errors
Static pages: 62/62 generated
```

Build is clean. All 62 routes (app, API, auth, admin, cron, intake, integrations) compiled without error. No type errors were emitted by the TypeScript checker.

---

## Lint Results

```
10 problems (0 errors, 10 warnings)
0 errors — 3 warnings potentially fixable with --fix
```

All lint issues are warnings only — no blocking errors.

| File                                    | Warning                                | Rule                                |
| --------------------------------------- | -------------------------------------- | ----------------------------------- |
| `src/app/api/emma/emotion/route.ts:100` | `'err' is defined but never used`      | `@typescript-eslint/no-unused-vars` |
| `src/app/api/waitlist/route.ts:251`     | `'err' is defined but never used`      | `@typescript-eslint/no-unused-vars` |
| `src/app/app/page.tsx:242`              | `setState synchronously within effect` | `react-hooks/set-state-in-effect`   |
| `src/app/layout.tsx:31`                 | Unused `eslint-disable` directive      | N/A                                 |
| `src/app/settings/usage/page.tsx:130`   | `Date.now()` called during render      | `react-hooks/purity`                |
| `src/app/settings/usage/page.tsx:132`   | `Date.now()` called during render      | `react-hooks/purity`                |
| `src/app/settings/usage/page.tsx:152`   | `setState synchronously within effect` | `react-hooks/set-state-in-effect`   |
| `src/core/avatar-engine.ts:104`         | Unused `eslint-disable` directive      | N/A                                 |
| `src/core/avatar-engine.ts:220`         | Unused `eslint-disable` directive      | N/A                                 |
| `src/core/voice-engine.ts:158`          | `setState synchronously within effect` | `react-hooks/set-state-in-effect`   |

None of these are blocking. The `react-hooks/set-state-in-effect` warnings in `app/page.tsx` and `voice-engine.ts` are pre-existing and architectural (history hydration and speech support detection), not introduced by the waitlist hardening.

---

## Security Audit: Waitlist Hardening

### proxy.ts — Waitlist Gate

**File:** `src/proxy.ts`

**Status: CORRECT with one behavioral edge-case**

The gate at lines 74–87 is logically sound:

```typescript
if (user && !isPublic && !isApi) {
  const adminEmails = (process.env.EMMA_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase());
  const isAdmin = adminEmails.includes(user.email?.toLowerCase() ?? "");

  const approved = user.app_metadata?.waitlist_approved === true;
  if (!isAdmin && !approved) {
    redirectUrl.pathname = "/waitlist";
    return NextResponse.redirect(redirectUrl);
  }
}
```

Findings:

- Gate correctly fires for authenticated non-admin users without `waitlist_approved === true`.
- `/waitlist` is correctly listed in `publicPaths` at line 59, preventing infinite redirect loops.
- `!isApi` guard at line 75 prevents API routes from being caught by the redirect (API routes authenticate inside each handler).
- Admin bypass via `EMMA_ADMIN_EMAILS` uses `.toLowerCase()` on both sides — correct.
- `app_metadata` strict boolean check (`=== true`) prevents falsy bypass via `waitlist_approved: 1` or `waitlist_approved: "true"`.

**Edge case (Medium):** The `isPublicUiRoute` redirect at lines 91–101 runs after the waitlist gate. An unapproved authenticated user hitting `/login` or `/register` would first hit the waitlist gate check — but `/login` and `/register` are in `publicPaths`, so `isPublic` is true, so the gate is skipped for those routes. They would then hit the `isPublicUiRoute` block and be sent to `/app`, which the gate would then catch on the next request. This is correct behavior but creates a two-hop redirect for unapproved users hitting `/login` directly (→ `/app` → `/waitlist`). Low priority but worth noting.

**Miss:** When `NEXT_PUBLIC_SUPABASE_URL` is not set (line 26: `if (!url || !key) return response`), the entire auth stack including the waitlist gate is bypassed. This is intentional for local dev but must never happen in production. The guard relies on env var presence rather than a `NODE_ENV` check, which is correct.

### auth/callback — app_metadata injection

**File:** `src/app/auth/callback/route.ts`

**Status: MOSTLY CORRECT — one email normalization bug**

The callback correctly:

- Checks `user.app_metadata.waitlist_approved === true` before allowing access (line 48).
- Queries `waitlist_v2` using `user.email.toLowerCase()` for the read query (line 53).
- Signs the user out and redirects to `/waitlist?blocked=1` if not approved (lines 64–65).
- Stamps `waitlist_approved: true` via `updateUserById` after first valid sign-in (lines 79–81).
- Converts `invited` status to `converted` on first sign-in (lines 69–75).

**Bug (High):** At line 73, the update query uses `user.email` without `.toLowerCase()`:

```typescript
await admin
  .from("waitlist_v2")
  .update({ status: "converted" })
  .eq("email", user.email) // NOT lowercased
  .eq("status", "invited")
  .gt("invite_expires_at", new Date().toISOString());
```

Since emails are stored lowercased in `waitlist_v2` (enforced by the join route and manage route), if `user.email` has any uppercase characters (e.g., Supabase OAuth may preserve case from the provider), this `.eq("email", user.email)` will not match any row. The `invited → converted` status transition would silently fail. The user would still be let in (because `isApproved` is computed before this update and the `waitlist_approved` stamp on auth user still happens at lines 79–81), but their waitlist row would remain stuck at `invited` status instead of advancing to `converted`. This means the seat counter on the waitlist dashboard would report incorrect data.

**No env-var guard needed here:** `getAdminClient()` at lines 6–11 returns `null` if `SUPABASE_SERVICE_ROLE_KEY` is absent, and the entire waitlist check block is wrapped in `if (admin && user.email)` at line 47 — correctly fail-open.

### Cron Routes — CRON_SECRET auth

**Files audited:**

- `src/app/api/emma/cron/approvals-expiry/route.ts`
- `src/app/api/emma/cron/email-sequences/route.ts`
- `src/app/api/emma/cron/scheduled-tasks/route.ts`
- `src/app/api/emma/cron/leads-cleanup/route.ts`
- `src/app/api/emma/cron/pattern-detection/route.ts`

**Status: 4/5 CORRECT — pattern-detection CRITICAL BYPASS**

The three cron routes targeted by the hardening PR all use the correct pattern:

```typescript
if (process.env.NODE_ENV !== "development") {
  if (!cronSecret) {
    return 500;
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return 401;
  }
}
```

`leads-cleanup` also uses the correct `NODE_ENV !== "development"` guard.

**CRITICAL — `pattern-detection` still uses the old spoofable localhost bypass:**

`src/app/api/emma/cron/pattern-detection/route.ts` lines 28–40:

```typescript
const isLocalhost =
  req.headers.get("host")?.includes("localhost") ||
  req.headers.get("host")?.includes("127.0.0.1");

if (!isLocalhost) {
  if (!cronSecret) { ... }
  if (authHeader !== `Bearer ${cronSecret}`) { return 401 }
}
```

The `Host` header is entirely client-controlled. Any attacker can send `Host: localhost` from the internet and bypass authentication entirely, gaining unauthenticated access to this route's agent execution capabilities (it runs pattern detection across all user tasks). This was explicitly the vulnerability that the hardening PR fixed in the other three routes, but `pattern-detection` was missed.

**Additional finding:** `leads-cleanup` is not covered by the `cron-auth-hardening.test.ts` file, which only tests `approvals-expiry`, `email-sequences`, and `scheduled-tasks`. The test suite would not have caught the `pattern-detection` regression.

### Brain Route — waitlist check

**File:** `src/app/api/emma/route.ts`

**Status: CORRECT**

The waitlist gate at lines 79–90 is correctly placed after session authentication:

```typescript
const adminEmails = (process.env.EMMA_ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase());
const isAdmin = adminEmails.includes(sessionUser.email?.toLowerCase() ?? "");
if (!isAdmin && sessionUser.app_metadata?.waitlist_approved !== true) {
  return new Response(JSON.stringify({ error: "Waitlist approval required" }), {
    status: 403,
    ...
  });
}
```

Returns 403 (correct — not 401, since the user is authenticated but not authorized). Admin bypass uses consistent `.toLowerCase()` normalization. The gate only fires when `NEXT_PUBLIC_SUPABASE_URL` is set (line 71), correctly failing-open in dev mode.

### Email normalization

**Status: CORRECT in join/invite flows — bug in callback update**

| Location                                            | Normalization                            | Status  |
| --------------------------------------------------- | ---------------------------------------- | ------- |
| `waitlist/route.ts` POST join — DB insert           | `email.toLowerCase().trim()`             | Correct |
| `waitlist/route.ts` POST join — duplicate check     | `email.toLowerCase()`                    | Correct |
| `waitlist-manage/route.ts` invite — generateLink    | `entry.email` (already stored lowercase) | Correct |
| `auth/callback/route.ts` — waitlist_v2 read         | `user.email.toLowerCase()`               | Correct |
| `auth/callback/route.ts` — invited→converted update | `user.email` (NOT lowercased)            | **Bug** |

---

## Test Coverage Analysis

Overall coverage is 14.68% statements — very low, but consistent with the project's integration-heavy architecture where most logic involves external services (Supabase, OpenRouter, Resend) that require mocking.

**Coverage for hardened paths:**

| File                                              | Stmt % | Branch % | Notes                                                                |
| ------------------------------------------------- | ------ | -------- | -------------------------------------------------------------------- |
| `src/proxy.ts`                                    | 0%     | 0%       | Not in coverage scope — Next.js middleware, not importable in Vitest |
| `src/app/auth/callback/route.ts`                  | 0%     | 0%       | Not in coverage scope — Route handler, not importable                |
| `src/app/api/emma/cron/approvals-expiry/route.ts` | 0%     | 0%       | Not in coverage scope                                                |
| `src/app/api/emma/cron/email-sequences/route.ts`  | 0%     | 0%       | Not in coverage scope                                                |
| `src/app/api/emma/cron/scheduled-tasks/route.ts`  | 0%     | 0%       | Not in coverage scope                                                |
| `src/app/api/emma/route.ts`                       | 0%     | 0%       | Not in coverage scope                                                |
| `src/core/security/sanitise.ts`                   | 97.5%  | 92.85%   | Excellent coverage                                                   |
| `src/core/usage-enforcer.ts` (legacy)             | 48.14% | 47.05%   | Moderate                                                             |
| `src/core/usage-enforcer.ts` (new)                | 60.31% | 50%      | Moderate                                                             |

Route handler files are not instrumented because the coverage config targets `src/core/**` and `src/lib/**`. This is by design but means zero automated line coverage on all the hardened auth paths. The proxy and auth callback tests use source-text string matching instead (structural tests), which is appropriate but limited.

**Critical uncovered branches in covered files:**

- `src/core/usage-enforcer.ts` lines 74–106: The extra pack stacking logic has no coverage.
- `src/core/security/encryption.ts` lines 95–133: The `encryptFields` and `decryptFields` helpers are not covered.

---

## Test Quality Review

### `tests/unit/proxy-waitlist-gate.test.ts`

**Assessment: Adequate structural coverage, weak on behavior**

Strengths:

- Tests verify the gate block is present in source text.
- Tests verify `waitlist_approved`, `app_metadata`, EMMA_ADMIN_EMAILS, `isAdmin`, `!isApi`, `!isPublic` are all present.
- Tests verify `/waitlist` is in `publicPaths` (no-infinite-redirect check).
- Tests verify `/waitlist` redirect target (not `/login`).

Weaknesses:

- All assertions are string-contains checks on raw source text. They confirm structure but not runtime behavior.
- No test verifies that an unapproved user hitting `/settings` would actually be redirected (behavioral gap).
- No test verifies the edge case where `EMMA_ADMIN_EMAILS` is empty string — the split produces `[""]` which incorrectly includes the empty-string value, matching a user with no email.
- No test exercises the `NEXT_PUBLIC_SUPABASE_URL` absent path.
- The `register/page.tsx` tests in the same file test a different concern (plan param forwarding) — should be in a separate test file for clarity.

### `tests/unit/cron-auth-hardening.test.ts`

**Assessment: Correct for the routes it covers, but has a critical gap**

Strengths:

- Tests all three hardened cron routes for `NODE_ENV !== "development"` guard.
- Tests absence of `isLocalhost`, `includes("localhost")`, `includes("127.0.0.1")`.
- Tests presence of `CRON_SECRET`, `Bearer`, `Unauthorized`.
- Tests `auth/callback` for waitlist gate structure.
- Tests `waitlist-manage` and `waitlist/route.ts` for `updateUserById` + `waitlist_approved: true`.

**Critical gap:**

- `src/app/api/emma/cron/pattern-detection/route.ts` is NOT in the `cronRoutes` array at line 10. The test would catch any future regression in the three listed routes, but it never tested `pattern-detection`, which is why the `isLocalhost` bypass was not detected.
- `src/app/api/emma/cron/leads-cleanup/route.ts` is also not tested, though its auth guard is correct.

All assertions use meaningful checks (not just `toBeDefined`). The failure path is tested (via the `Unauthorized` string presence check, though again only structurally). The pattern-detection omission is the primary quality gap.

---

## Integration Health

### `src/core/integrations/adapter.ts`

**Status: HEALTHY**

Token retrieval uses `decrypt()` from `src/core/security/encryption.ts` before returning credentials. The adapter correctly throws `IntegrationNotConfiguredError` if the DB is not available or the row is missing/disconnected. No tokens are logged. The `getSupabase()` helper returns `null` if env vars are missing and throws immediately — fail-safe.

Coverage: 0% — no unit tests for the adapter layer. Integration tests would require mocking Supabase and the OAuth providers.

### `src/core/security/sanitise.ts`

**Status: EXCELLENT**

- 97.5% statement coverage, 92.85% branch coverage.
- Three-layer defense: length limits → control char removal → injection pattern detection.
- Blocking threshold requires `threat === "high"` AND at least 2 non-noise flags — reduces false positives.
- Only uncovered line is 145 (one `else if` branch in threat escalation logic).
- The injection pattern list is comprehensive (instruction override, prompt extraction, encoding attacks, DAN mode, jailbreak keyword).

### `src/core/usage-enforcer.ts`

**Status: HEALTHY — fail-open confirmed**

The brain route at `src/app/api/emma/route.ts` lines 210–213 wraps the entire usage check in:

```typescript
try {
  enforcementResult = await checkUsage(...);
  ...
} catch {
  // Fail open — never block due to metering bug
}
```

This means any DB error, timeout, or unexpected exception in the enforcer silently falls through and allows the request. This is the documented and correct behavior. Enterprise plan exits early with no DB query.

48–60% coverage — the multi-window tracking paths (daily/weekly/monthly window logic, extra pack stacking lines 74–106) have no test coverage.

### `src/core/memory-engine.ts`

File does not exist at `src/core/memory-engine.ts`. The CLAUDE.md references it but the actual module is `src/core/memory-db.ts` (11.59% coverage). Documentation is inaccurate.

### `src/core/security/encryption.ts`

**Status: HEALTHY with one design note**

- AES-256-GCM is correctly implemented with per-encryption random IVs.
- `getKey()` returns `null` if the key is absent rather than throwing — callers handle this gracefully.
- When the key is absent, `encrypt()` returns plaintext with a one-time console warning (using a process-global flag to avoid log spam). This is appropriate.
- `decrypt()` on a `enc:v1:` prefixed string with no key returns `"[encrypted — key missing]"` — does not throw.
- Design note: The `encryptFields`/`decryptFields` helpers at lines 116 and 130 use `as any` casts. These are benign but could hide type errors if the object type is refined.

---

## Environment Variable Audit

### Documented in CLAUDE.md but not found in code

None — all documented vars are referenced in source.

### Used in code but NOT documented in CLAUDE.md

| Variable                      | Used in                                        | Impact                                              |
| ----------------------------- | ---------------------------------------------- | --------------------------------------------------- |
| `WHATSAPP_ACCESS_TOKEN`       | `src/core/integrations/whatsapp.ts:8`          | WhatsApp integration non-functional without this    |
| `WHATSAPP_PHONE_NUMBER_ID`    | `src/core/integrations/whatsapp.ts:9`          | WhatsApp integration non-functional without this    |
| `WHATSAPP_VERIFY_TOKEN`       | `src/app/api/emma/ingest/whatsapp/route.ts:14` | WhatsApp webhook verification fails without this    |
| `WHATSAPP_APP_SECRET`         | `src/app/api/emma/ingest/whatsapp/route.ts:23` | WhatsApp webhook HMAC validation fails without this |
| `INGEST_EMAIL_WEBHOOK_SECRET` | `src/app/api/emma/ingest/email/route.ts:8`     | Email ingest webhook auth fails without this        |

All five are integration-specific and only required if those integrations are enabled. They should be documented.

### Documented but potentially misleading

`HUBSPOT_API_KEY` is documented in CLAUDE.md as "HubSpot private app token" but the code in `src/core/integrations/hubspot.ts` uses it via the adapter's OAuth token store, not directly as a header key. Developers reading the docs may expect a simple API key pattern but actually need to go through the OAuth setup flow.

---

## Backfill Script Review

**File:** `scripts/backfill-waitlist-approved.ts`

### Dry-run mode

ABSENT. The script has no `--dry-run` flag or `DRY_RUN` env var. Running the script immediately begins updating `app_metadata` on auth users. This increases risk of an undetected bug causing mass incorrect updates with no preview capability.

### Safety checks before mutation

Adequate. The script:

1. Loads all auth users into memory before processing (lines 43–53) — avoids N+1 lookups.
2. Checks `authUser.app_metadata?.waitlist_approved === true` before updating (lines 83–87) — skips already-stamped users.
3. Prints `SKIP` for users with no auth account (lines 78–80).
4. Fails fast on DB errors during setup (lines 45–47, 62–64) via `process.exit(1)`.

Missing: no confirmation prompt before the script begins writing. For a script that modifies auth metadata for potentially thousands of users, a `--yes` flag or interactive confirmation would reduce the risk of accidental execution.

### Idempotency

YES — safe to run twice. The already-stamped check at line 83 prevents re-stamping users that were already processed. Running the script a second time will skip all previously updated users and only process any newly converted entries.

### SQL injection / unsafe operations

None. The script uses Supabase client methods with typed parameters — no raw SQL strings. The only string operations are `.toLowerCase()` on email addresses, which is safe.

### Exit code on partial failure

Correct. If any user fails to update (line 111), `process.exit(1)` is called. Since the script is idempotent, re-running after a partial failure is safe and explicitly instructed in the console output.

### Pagination

Correct. Auth users are fetched in pages of 1000 (line 44). Waitlist rows are paginated in batches of 1000 (lines 60–65). The loop correctly breaks when a page returns fewer than 1000 rows.

---

## Issues Found

### Critical

**C-1: `pattern-detection` cron route uses spoofable Host-header bypass**

- File: `src/app/api/emma/cron/pattern-detection/route.ts`, lines 28–40
- The `isLocalhost` check reads `req.headers.get("host")`, which is a client-supplied header. Any external caller can send `Host: localhost` and bypass `CRON_SECRET` authentication entirely.
- The fix applied to the other four cron routes (replacing host-header check with `process.env.NODE_ENV !== "development"`) was not applied here.
- Impact: Unauthenticated access to pattern detection across all user task history. This route reads completed task data for all users in the last 30 days and calls OpenRouter via `generateSuggestionsViaBatch`.
- Fix: Replace lines 28–40 with the same `NODE_ENV !== "development"` guard used in `approvals-expiry/route.ts`.

### High

**H-1: `auth/callback` — `invited→converted` update uses non-normalized email**

- File: `src/app/auth/callback/route.ts`, line 73
- `.eq("email", user.email)` does not apply `.toLowerCase()`. All `waitlist_v2` rows store emails in lowercase (enforced by insert logic). If `user.email` from Supabase has any uppercase characters (possible with OAuth providers like Google), the update silently matches zero rows.
- Impact: User's waitlist row stays at `invited` status instead of transitioning to `converted`. The seat counter dashboard shows inflated invited/available counts. Not a security issue, but a data integrity bug.
- Fix: `.eq("email", user.email.toLowerCase())`

**H-2: `pattern-detection` cron not covered by `cron-auth-hardening.test.ts`**

- File: `tests/unit/cron-auth-hardening.test.ts`, line 10–14 (the `cronRoutes` array)
- The test explicitly covers three routes but skips `pattern-detection` and `leads-cleanup`. This allowed C-1 to exist despite having a test suite dedicated to cron auth hardening.
- Fix: Add both missing route paths to the `cronRoutes` array. The test for `pattern-detection` would immediately fail, revealing C-1.

**H-3: No dry-run mode in backfill script**

- File: `scripts/backfill-waitlist-approved.ts`
- A one-shot script that updates auth metadata for all converted users in production has no way to preview what it will do without actually doing it.
- Fix: Add `const DRY_RUN = process.argv.includes("--dry-run");` and replace the `updateUserById` call with a log statement when in dry-run mode. Print a summary of what would be stamped before exiting.

### Medium

**M-1: Five undocumented environment variables**

- `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `INGEST_EMAIL_WEBHOOK_SECRET`
- Not listed in CLAUDE.md or `docs/reference-env-vars.md`. A developer setting up a new instance would have no way to know these are needed for WhatsApp/email-ingest features.
- Fix: Add to CLAUDE.md env var table and `docs/reference-env-vars.md`.

**M-2: Zero instrumented coverage on all hardened auth paths**

- All route handler files have 0% coverage in the v8 report. The coverage config targets `src/core/**` and `src/lib/**` only. The five hardened cron routes, proxy.ts, and auth/callback all have zero instrumented coverage.
- This is architecturally acceptable (route handlers require integration testing), but the absence of any integration test harness means the hardened auth paths are only structurally tested via source-text string matching.

**M-3: Proxy unapproved user hitting `/login` causes two-hop redirect**

- File: `src/proxy.ts`, lines 68–101
- An unapproved authenticated user visiting `/login` directly: `/login` is in `publicPaths` → waitlist gate skipped → `isPublicUiRoute` matches → redirect to `/app` → next request hits waitlist gate → redirect to `/waitlist`. Two redirects instead of one.
- Impact: Poor UX and slightly increased latency. Not a security issue.
- Fix: Before the `isPublicUiRoute` redirect block, add a check that if the user is authenticated but not approved and not admin, redirect to `/waitlist` directly.

**M-4: Sanitiser single-high-flag bypass**

- File: `src/core/security/sanitise.ts`, lines 151–156
- A message with exactly one high-severity flag is logged as threat but not blocked. The blocking threshold requires `threat === "high"` AND `flags.length >= 2` (excluding noise flags). A targeted single-pattern jailbreak (e.g., a message containing only the word `jailbreak`) gets threat level "high" but passes through with logging only.
- Impact: Low — messages are audited and the persona may naturally resist. The two-flag requirement reduces false positives, which is a deliberate design tradeoff.

**M-5: `email-templates.ts` reads `EMMA_ENCRYPTION_KEY` directly**

- File: `src/core/email-templates.ts`, line 29
- This file reads the encryption key directly rather than using the `src/core/security/encryption.ts` module. Creates a second code path for key access that could diverge from the canonical implementation over time.

### Low / Informational

**L-1: Lint warnings — `setState` in effect in `app/page.tsx`, `voice-engine.ts`, `settings/usage`**

- Pre-existing, not introduced by this PR. The pattern is common in Next.js data hydration. Should be cleaned up in a future pass.

**L-2: `src/core/memory-engine.ts` referenced in CLAUDE.md but doesn't exist**

- CLAUDE.md describes `memory-engine.ts` and `memory-db.ts` as separate files. Only `memory-db.ts` exists. Documentation should be corrected to reference `memory-db.ts` only.

**L-3: `calculateNextRun` in `scheduled-tasks/route.ts` is a partial cron parser**

- File: `src/app/api/emma/cron/scheduled-tasks/route.ts`, lines 125–184
- Complex cron expressions (step values on hour, month ranges, list values like `1,3,5`) will fall through to the 1-hour fallback. Schedulers using non-standard expressions will silently fire hourly instead of on their intended schedule. The code comment acknowledges this and recommends `cron-parser`.

**L-4: `'err' is defined but never used` in two catch blocks**

- `src/app/api/emma/emotion/route.ts:100` and `src/app/api/waitlist/route.ts:251`
- Caught errors are discarded. Should either be removed (`catch {}`) or logged.

**L-5: `EMMA_ADMIN_EMAILS` empty string produces edge-case match**

- Files: `src/proxy.ts` line 78, `src/app/api/emma/route.ts` line 82, `src/app/api/emma/waitlist-manage/route.ts` line 16
- If `EMMA_ADMIN_EMAILS` is not set, `"".split(",")` produces `[""]`. `adminEmails.includes(user.email?.toLowerCase() ?? "")` — when `user.email` is undefined, `?? ""` produces `""`, and `[""].includes("")` is `true`. This means a user with no email address would be treated as admin. Supabase always provides an email for authenticated users in practice, so this is theoretical, but the fix is simple: filter out empty strings after the split.

**L-6: `leads-cleanup` lacks outer try/catch**

- File: `src/app/api/emma/cron/leads-cleanup/route.ts`
- The Supabase delete call returns `{ count, error }` — the error is checked. However, a network-level exception (not a Supabase API error) would propagate as an unhandled 500. The other cron routes have outer `try/catch` blocks. Minor inconsistency.

---

## Recommendations

Prioritized by urgency:

1. **[Critical — fix before next deploy]** Patch `src/app/api/emma/cron/pattern-detection/route.ts`: replace the `isLocalhost` host-header check (lines 28–40) with `process.env.NODE_ENV !== "development"` guard matching the other four cron routes.

2. **[High — fix in next PR]** Add `src/app/api/emma/cron/pattern-detection/route.ts` and `src/app/api/emma/cron/leads-cleanup/route.ts` to the `cronRoutes` test array in `tests/unit/cron-auth-hardening.test.ts`. The test for pattern-detection would have caught C-1 before merge.

3. **[High — fix in next PR]** Fix email normalization in `src/app/auth/callback/route.ts` line 73: change `.eq("email", user.email)` to `.eq("email", user.email.toLowerCase())`.

4. **[High — fix before running backfill again]** Add `--dry-run` mode to `scripts/backfill-waitlist-approved.ts`.

5. **[Medium — documentation PR]** Document the five missing env vars (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `INGEST_EMAIL_WEBHOOK_SECRET`) in CLAUDE.md and `docs/reference-env-vars.md`.

6. **[Medium — low risk, good hygiene]** Fix the double-redirect for unapproved authenticated users hitting `/login` in `src/proxy.ts`.

7. **[Low]** Fix the empty `EMMA_ADMIN_EMAILS` edge case — filter out empty strings after split — in proxy.ts, brain route, and waitlist-manage.

8. **[Low]** Add outer `try/catch` to `leads-cleanup/route.ts` for consistency with the other cron routes.

9. **[Low]** Clean up lint warnings: replace `catch (err) {}` with `catch {}` in the two unused-err cases, or add logging.

10. **[Future]** Replace the hand-rolled `calculateNextRun` in `scheduled-tasks/route.ts` with a proper cron parser library to handle arbitrary cron expressions correctly.

---

## Ship Readiness

**NEEDS_FIXES**

**Blockers:**

- C-1: `pattern-detection` cron route has an active auth bypass via spoofable Host header. This should be patched before the next deploy or before the route is reachable in production.

**Non-blocking but strongly recommended before next release:**

- H-1: Email normalization bug in auth/callback (data integrity issue, not security)
- H-2: Test suite gap that allowed C-1 to ship

The test suite and build are clean. The three primary hardened paths (proxy gate, brain route, the three directly targeted cron routes) are correctly implemented. Once C-1 is fixed and the test coverage gap is closed, the branch is ready to ship.
