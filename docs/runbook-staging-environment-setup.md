# Runbook: Staging Environment Setup

**Audience:** Founder, operator, or engineer preparing Emma for closed beta validation  
**Purpose:** Collect the hosted staging access, provider sandbox settings, and non-production credentials needed to unblock live validation.  
**Safety rule:** Do not paste real secrets into Git, docs, tickets, screenshots, or chat transcripts. Share secrets only through the provider dashboard or an approved password manager.

This runbook was created after the `ops/p2-staging-validation` pass returned **NO-GO** because hosted staging and provider credentials were unavailable. The goal is not to change product behavior. The goal is to make the missing external setup explicit.

## Setup Owner Checklist

| Area | Founder action | Done |
| --- | --- | --- |
| Vercel staging URL | Provide the deployed Preview/staging URL that maps to the staging branch or deployment. | [ ] |
| Vercel project access | Grant access to deployment logs and environment variable presence checks. | [ ] |
| Staging env vars | Set all required staging env vars in Vercel Preview/staging, using staging-only values. | [ ] |
| Supabase staging project | Create or identify the staging Supabase project. Do not point staging at production data unless running an intentional restore drill. | [ ] |
| Supabase Auth redirects | Add the staging URL to Site URL and redirect allow-list settings. | [ ] |
| Service role handling | Store the staging service role key only in Vercel/project secrets or an approved password manager. | [ ] |
| Test account | Provide one approved staging beta test account and mark it waitlist-approved. | [ ] |
| Test inbox | Provide inbox access for signup, magic link, verification, password reset, billing, and waitlist emails. | [ ] |
| Lemon sandbox | Configure LemonSqueezy sandbox store, variants, checkout, portal, and webhook. | [ ] |
| OpenRouter | Provide a staging OpenRouter key with enough credits/limits for validation. | [ ] |
| Sentry | Create or configure a staging Sentry environment/project and verify events are separated from production. | [ ] |
| Inngest | Provide staging signing and event keys; verify the staging app URL is registered. | [ ] |
| Backup validation | Provide staging Supabase credentials needed to run read-only backup health checks. | [ ] |
| Restore drill | Confirm whether the drill uses empty staging data or an intentional production backup restore. | [ ] |

## Vercel Staging Deployment

Provide these non-secret details to the validator:

- Staging URL, for example `https://staging-emma.example.com`.
- Vercel project name.
- Branch or deployment alias used for staging.
- Whether staging is a persistent environment or a Preview deployment.
- How to view Vercel runtime logs for the staging deployment.

Expected health checks:

```bash
curl -I https://<staging-url>/api/emma/settings
curl -I https://<staging-url>/api/emma/memory
```

Unauthenticated responses should be `401`, not `500` or `503`. A `503` usually means production startup validation or Supabase auth configuration failed closed.

## Required Vercel Environment Variables

Set these in the Vercel staging/Preview environment with staging-only values:

| Variable | Required for hosted staging validation | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Yes | Must be the staging URL. |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Staging Supabase URL only. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Staging anon key. Safe to expose, but still use staging value. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Secret. Staging project only. Never commit. |
| `OPENROUTER_API_KEY` | Yes | Staging key or restricted validation key. |
| `OPENAI_API_KEY` | Recommended | Needed for server-side STT validation. |
| `EMMA_ENCRYPTION_KEY` | Yes | 64 hex chars. Use a staging key unless intentionally validating restored encrypted data. |
| `EMMA_UNSUBSCRIBE_SECRET` | Yes | Staging HMAC secret. |
| `CRON_SECRET` | Yes | Staging cron bearer token. |
| `UPSTASH_REDIS_REST_URL` | Yes | Staging Redis REST URL. |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | Secret. Staging Redis token. |
| `INNGEST_SIGNING_KEY` | Yes | Required by production startup validation. |
| `INNGEST_EVENT_KEY` | Recommended | Needed for end-to-end Inngest event publishing. |
| `RESEND_API_KEY` | Yes | Staging email key or restricted test key. |
| `EMAIL_FROM` | Yes | Must not be an obvious placeholder. Use a monitored staging sender. |
| `EMMA_ADMIN_EMAILS` | Yes | Include the staging admin/test operator email. |
| `LEMONSQUEEZY_API_KEY` | Billing validation | Sandbox key only. |
| `LEMONSQUEEZY_STORE_ID` | Billing validation | Sandbox store ID. |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | Billing validation | Secret configured on the Lemon webhook. |
| `NEXT_PUBLIC_LEMON_VARIANT_STARTER` | Billing validation | Sandbox Starter variant ID. |
| `NEXT_PUBLIC_LEMON_VARIANT_PRO` | Billing validation | Sandbox Pro variant ID. |
| `NEXT_PUBLIC_LEMON_VARIANT_EXTRA_PACK` | Billing validation | Sandbox Extra Response Pack variant ID. |
| `SENTRY_DSN` | Monitoring validation | Staging Sentry DSN. |
| `SENTRY_ORG` | Build/source maps | Sentry org slug. |
| `SENTRY_PROJECT` | Build/source maps | Staging project slug. |
| `SENTRY_AUTH_TOKEN` | Build/source maps | Secret. Token scoped to source map upload. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Push validation | Public VAPID key for staging. |
| `VAPID_PRIVATE_KEY` | Push validation | Secret. Pair with staging public key. |
| `INGEST_EMAIL_WEBHOOK_SECRET` | Inbound email validation | Staging-only shared secret. |
| `WHATSAPP_ACCESS_TOKEN` | WhatsApp validation | Only if WhatsApp ingest is in validation scope. |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp validation | Only if WhatsApp ingest is in validation scope. |
| `WHATSAPP_VERIFY_TOKEN` | WhatsApp validation | Only if WhatsApp ingest is in validation scope. |
| `WHATSAPP_APP_SECRET` | WhatsApp validation | Only if WhatsApp ingest is in validation scope. |

Use [.env.staging.example](../.env.staging.example) as the variable-name checklist. It contains placeholders only.

## Supabase Staging Project Setup

1. Create a separate Supabase project for staging.
2. Run the current schema from [supabase/schema.sql](../supabase/schema.sql) or apply migrations with the Supabase CLI.
3. Confirm Row Level Security is enabled on public tables.
4. Configure Auth providers needed for validation, usually email magic link plus any OAuth providers used by beta users.
5. Set the Supabase Auth Site URL to the staging URL.
6. Add redirect URLs:

```text
https://<staging-url>/auth/callback
https://<staging-url>/login
https://<staging-url>/register
https://<staging-url>/waitlist
```

For OAuth integrations, also configure provider redirect URIs:

```text
https://<staging-url>/api/integrations/gmail/oauth/callback
https://<staging-url>/api/integrations/google_calendar/oauth/callback
https://<staging-url>/api/integrations/google_drive/oauth/callback
https://<staging-url>/api/integrations/notion/oauth/callback
https://<staging-url>/api/integrations/slack/oauth/callback
```

## Service Role Key Handling

- Use the **staging** Supabase service role key only.
- Store it in Vercel env vars or an approved password manager.
- Do not paste it into Markdown, GitHub issues, PR descriptions, logs, screenshots, or chat.
- Rotate it if it is ever exposed outside the secret manager.

## Approved Staging Test Account

Provide one test user for the validator:

| Item | Requirement |
| --- | --- |
| Email | A real inbox the founder or validator can access. |
| Waitlist status | Approved in staging, or listed in `EMMA_ADMIN_EMAILS`. |
| Plan state | Free initially, then upgraded through Lemon sandbox during validation. |
| Data safety | Staging-only account; no production personal data. |
| Admin test account | Separate account if admin diagnostics need elevated access. |

## Test Inbox Access

The validator needs to receive or inspect messages for:

- Signup or magic-link login.
- Email verification.
- Password reset.
- Waitlist accepted/waitlisted emails.
- Billing checkout and payment recovery emails.
- Unsubscribe link validation if email sequences are tested.

## LemonSqueezy Sandbox Setup

1. Create or identify the Lemon sandbox store.
2. Create sandbox variants:
   - Starter monthly.
   - Pro monthly.
   - Extra Response Pack one-time purchase.
3. Set the staging Vercel env vars:
   - `LEMONSQUEEZY_API_KEY`
   - `LEMONSQUEEZY_STORE_ID`
   - `LEMONSQUEEZY_WEBHOOK_SECRET`
   - `NEXT_PUBLIC_LEMON_VARIANT_STARTER`
   - `NEXT_PUBLIC_LEMON_VARIANT_PRO`
   - `NEXT_PUBLIC_LEMON_VARIANT_EXTRA_PACK`
4. Add the webhook URL:

```text
https://<staging-url>/api/lemon/webhook
```

5. Enable these webhook events:
   - `subscription_created`
   - `subscription_updated`
   - `subscription_cancelled`
   - `subscription_expired`
   - `subscription_payment_failed`
   - `subscription_payment_recovered`
   - `subscription_resumed`
   - order/payment events needed for Extra Response Pack delivery.

Record sandbox test card behavior in the validation notes. Do not use live billing credentials.

## OpenRouter Staging Key

Provide a staging or restricted OpenRouter key that can:

- Complete one normal first-conversation request.
- Run memory extraction or utility calls if enabled.
- Exercise timeout and provider-error handling through controlled test conditions.
- Stay within a known budget limit for validation.

Do not reuse a personal or production key unless it is intentionally scoped and monitored for staging.

## Sentry Setup

Create a staging environment or separate Sentry project. The validator needs:

- Staging DSN configured in Vercel.
- Environment tag set to `staging` where possible.
- Access to verify runtime events.
- Source map upload settings if build validation includes source maps.

Validation should prove that staging errors do not pollute production alerting.

## Inngest Setup

Provide staging values for:

- `INNGEST_SIGNING_KEY`
- `INNGEST_EVENT_KEY`

Then verify:

- `/api/inngest` is reachable on the staging URL.
- Inngest dashboard points at the staging deployment.
- Scheduled/background functions are separated from production.

## Backup Validation Requirements

To run [scripts/validate-backup-health.ts](../scripts/validate-backup-health.ts), provide staging-only values through local shell env or a secure operator session:

```bash
NEXT_PUBLIC_SUPABASE_URL=<staging-supabase-url>
SUPABASE_SERVICE_ROLE_KEY=<staging-service-role-key>
npx tsx scripts/validate-backup-health.ts
```

This script is read-only. It must not be run with production credentials for routine closed beta staging validation.

## Restore Drill Requirements

Use [Runbook: Restore Drill](runbook-restore-drill.md) when validating restore readiness.

Before the drill, decide which mode applies:

| Mode | Use when | Key handling |
| --- | --- | --- |
| Empty staging restore | You only need schema and smoke validation. | Use normal staging encryption key. |
| Production backup restored to staging | You need realistic data restore evidence. | Use the encryption key that matches the restored ciphertext, handled through the escrow process. |

Never overwrite production. Confirm every restore command points at the staging project before running it.

## Local Preflight

Create a local `.env.staging` from [.env.staging.example](../.env.staging.example), fill it with staging-only values outside Git, then run:

```bash
npm run check:staging-env -- .env.staging
```

The check prints only variable names and issue reasons. It does not print secret values and does not contact external services.

## Ready to Re-run Hosted Validation

Hosted staging validation is ready to restart when all of these are true:

- [ ] Staging URL is reachable.
- [ ] Vercel staging env presence check passes.
- [ ] Supabase staging Auth login works with the approved test account.
- [ ] Lemon sandbox checkout and webhooks are configured.
- [ ] OpenRouter staging key is set and budgeted.
- [ ] Sentry and Inngest staging dashboards are accessible.
- [ ] Backup health check can run against staging.
- [ ] Restore drill mode is selected and approved.
- [ ] Browser QA can run on Chrome, Firefox, Edge, and mobile viewport.

## Related

- [Staging Validation Checklist](checklist-staging-validation.md)
- [Reference: Environment Variables](reference-env-vars.md)
- [Runbook: Restore Drill](runbook-restore-drill.md)
- [Deployment Guide](../DEPLOY.md)
