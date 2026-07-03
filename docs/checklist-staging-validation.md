# Checklist: Hosted Staging Validation

Use this checklist after [Runbook: Staging Environment Setup](runbook-staging-environment-setup.md) is complete. Record `PASS`, `FAIL`, or `BLOCKED` for every line. Do not mark a live journey as pass unless it was tested against the hosted staging URL.

## Validation Status — 2026-07-03 (Phase 1 repo-level preflight)

Hosted validation remains **BLOCKED**: no staging URL or provider credentials have been provisioned (unchanged since the `ops/p2-staging-validation` NO-GO recorded in the setup runbook). Every live-journey line below is therefore `BLOCKED` as of this date. The template below is intentionally left blank for the first hosted run.

Everything verifiable from the repository was verified as part of the Phase 1 trust-foundation pass:

- `PASS` Env var inventory — [.env.staging.example](../.env.staging.example) covers all variables required by `npm run check:staging-env` ([scripts/check-staging-env.mjs](../scripts/check-staging-env.mjs)) and the setup runbook's table, including billing, email, OpenRouter, Sentry, Inngest, push, and ingest secrets.
- `PASS` OAuth configuration — the runbook's provider redirect URIs match the implemented services exactly (`gmail`, `google_calendar`, `google_drive`, `notion`, `slack` in `src/app/api/integrations/[service]/oauth/start/route.ts`); HubSpot and ElevenLabs connect via API key and need no redirect URI.
- `PASS` Cron jobs — all 8 cron paths in `vercel.json` have matching route files under `src/app/api/emma/cron/` (email-sequences, scheduled-tasks, approvals-expiry, pattern-detection, memory-prune, reflection, heartbeat, connection-health), each authenticated by `CRON_SECRET`.
- `PASS` Monitoring surface — `/api/inngest` route exists; Sentry DSN/org/project variables are in the staging template and preflight script.
- `PASS` Build — `npm run build` passes on this commit (see Phase 1 verification results).
- `BLOCKED` All hosted checks (deployment, auth, onboarding, first conversation, billing sandbox, webhooks, admin diagnostics, GDPR journeys, browser QA, monitoring events) — require the founder-provided staging URL, Supabase staging project, Lemon sandbox, and provider keys listed in the setup runbook's owner checklist.

**Unblock path:** complete the "Setup Owner Checklist" in [Runbook: Staging Environment Setup](runbook-staging-environment-setup.md), then run this checklist against the hosted URL.

Staging URL: `_____________________________`  
Date: `_____________________________`  
Validator: `_____________________________`  
Test account: `_____________________________`

## Deployment Check

- [ ] `PASS / FAIL / BLOCKED` Staging URL loads over HTTPS.
- [ ] `PASS / FAIL / BLOCKED` `/api/emma/settings` returns `401` unauthenticated, not `500` or `503`.
- [ ] `PASS / FAIL / BLOCKED` `/api/emma/memory` returns `401` unauthenticated, not `500` or `503`.
- [ ] `PASS / FAIL / BLOCKED` Vercel logs show no startup validation failures.
- [ ] `PASS / FAIL / BLOCKED` Vercel env presence matches [.env.staging.example](../.env.staging.example).
- [ ] `PASS / FAIL / BLOCKED` `npm run build` passes for the deployed commit.

Evidence links or notes:

```text

```

## Auth Check

- [ ] `PASS / FAIL / BLOCKED` Signup or magic-link login sends email to the test inbox.
- [ ] `PASS / FAIL / BLOCKED` Email verification or magic link completes successfully.
- [ ] `PASS / FAIL / BLOCKED` Login lands on the intended authenticated route.
- [ ] `PASS / FAIL / BLOCKED` Logout clears the session and protected routes redirect to `/login`.
- [ ] `PASS / FAIL / BLOCKED` Session refresh survives a browser reload.
- [ ] `PASS / FAIL / BLOCKED` Password reset sends email and completes without exposing secrets.
- [ ] `PASS / FAIL / BLOCKED` Waitlist gate allows only approved staging user or admin email.

Evidence links or notes:

```text

```

## Onboarding Check

- [ ] `PASS / FAIL / BLOCKED` New approved user reaches onboarding.
- [ ] `PASS / FAIL / BLOCKED` Onboarding selections persist to settings/profile where expected.
- [ ] `PASS / FAIL / BLOCKED` User can proceed from onboarding to `/app`.
- [ ] `PASS / FAIL / BLOCKED` No console errors during onboarding.

Evidence links or notes:

```text

```

## First AI Conversation Check

- [ ] `PASS / FAIL / BLOCKED` First message streams a response from OpenRouter.
- [ ] `PASS / FAIL / BLOCKED` Response completes with a `done` SSE event.
- [ ] `PASS / FAIL / BLOCKED` Emotion tag is parsed and not shown as raw protocol text.
- [ ] `PASS / FAIL / BLOCKED` Usage/cost accounting records the request.
- [ ] `PASS / FAIL / BLOCKED` OpenRouter timeout behavior is observable and user-safe.
- [ ] `PASS / FAIL / BLOCKED` OpenRouter 5xx behavior is observable and user-safe.

Evidence links or notes:

```text

```

## Billing Sandbox Check

- [ ] `PASS / FAIL / BLOCKED` Starter checkout opens from staging and uses sandbox variant.
- [ ] `PASS / FAIL / BLOCKED` Pro checkout opens from staging and uses sandbox variant.
- [ ] `PASS / FAIL / BLOCKED` Extra Response Pack checkout opens from staging and uses sandbox variant.
- [ ] `PASS / FAIL / BLOCKED` Trial state is reflected if configured in Lemon sandbox.
- [ ] `PASS / FAIL / BLOCKED` Upgrade updates plan after webhook delivery.
- [ ] `PASS / FAIL / BLOCKED` Failed payment simulation reduces access according to billing rules.
- [ ] `PASS / FAIL / BLOCKED` Payment recovery restores access according to billing rules.
- [ ] `PASS / FAIL / BLOCKED` Cancellation preserves paid access until expiration.
- [ ] `PASS / FAIL / BLOCKED` Expiration falls back to Free limits.

Evidence links or notes:

```text

```

## Webhook Delivery Check

- [ ] `PASS / FAIL / BLOCKED` Lemon webhook endpoint receives sandbox event.
- [ ] `PASS / FAIL / BLOCKED` Webhook signature verification accepts valid events.
- [ ] `PASS / FAIL / BLOCKED` Webhook signature verification rejects invalid events.
- [ ] `PASS / FAIL / BLOCKED` Relevant client billing state changes in staging Supabase.
- [ ] `PASS / FAIL / BLOCKED` No production customer or subscription is touched.

Evidence links or notes:

```text

```

## Admin Diagnostics Check

- [ ] `PASS / FAIL / BLOCKED` Admin staging account can access `/admin`.
- [ ] `PASS / FAIL / BLOCKED` Non-admin staging account cannot access `/admin`.
- [ ] `PASS / FAIL / BLOCKED` Diagnostics lookup by email works for staging test account.
- [ ] `PASS / FAIL / BLOCKED` Diagnostics show billing, AI, user, and operations status.
- [ ] `PASS / FAIL / BLOCKED` Diagnostics do not expose secret values.

Evidence links or notes:

```text

```

## GDPR Export/Delete Check

- [ ] `PASS / FAIL / BLOCKED` Export returns directly user-owned staging data.
- [ ] `PASS / FAIL / BLOCKED` Delete removes directly user-owned app data in staging.
- [ ] `PASS / FAIL / BLOCKED` Delete does not remove unrelated tenant data.
- [ ] `PASS / FAIL / BLOCKED` Supabase Auth user preservation/deletion behavior matches public limitations.
- [ ] `PASS / FAIL / BLOCKED` Audit records are present where expected.

Evidence links or notes:

```text

```

## Browser QA Check

- [ ] `PASS / FAIL / BLOCKED` Chrome desktop core routes.
- [ ] `PASS / FAIL / BLOCKED` Firefox desktop core routes.
- [ ] `PASS / FAIL / BLOCKED` Edge desktop core routes.
- [ ] `PASS / FAIL / BLOCKED` Mobile viewport landing, login, app, settings, billing.
- [ ] `PASS / FAIL / BLOCKED` No blocking console errors.
- [ ] `PASS / FAIL / BLOCKED` Network failures produce user-safe states.
- [ ] `PASS / FAIL / BLOCKED` Screenshots are captured for each critical route.

Evidence links or notes:

```text

```

## Sentry/Inngest Monitoring Check

- [ ] `PASS / FAIL / BLOCKED` Staging Sentry receives a controlled staging event.
- [ ] `PASS / FAIL / BLOCKED` Sentry event is tagged as staging or lands in staging project.
- [ ] `PASS / FAIL / BLOCKED` Staging error does not page production channels.
- [ ] `PASS / FAIL / BLOCKED` `/api/inngest` is reachable in staging.
- [ ] `PASS / FAIL / BLOCKED` Inngest dashboard shows staging app/function registration.
- [ ] `PASS / FAIL / BLOCKED` Scheduled/background run evidence is separated from production.

Evidence links or notes:

```text

```

## Final Decision

Closed beta recommendation:

- [ ] GO
- [ ] NO-GO

Summary:

```text

```
