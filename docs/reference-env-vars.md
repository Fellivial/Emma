# Reference: Environment Variables

All variables go in `.env.local` for local development. In production, set them as environment variables in your hosting platform (Vercel, Railway, etc.).

Copy the template: `cp .env.local.example .env.local`

---

## Required

These must be set. Emma will start without them but core features will fail.

| Variable | Purpose | How to get it |
|----------|---------|--------------|
| `OPENROUTER_API_KEY` | All LLM calls (brain, vision, emotion, memory extraction) | [openrouter.ai/keys](https://openrouter.ai/keys) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Supabase Dashboard → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client-side auth (safe to expose) | Supabase Dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side DB operations (bypasses RLS — keep secret) | Supabase Dashboard → Settings → API |
| `EMMA_ENCRYPTION_KEY` | AES-256-GCM key for encrypting tokens and memories at rest | `openssl rand -hex 32` |
| `NEXT_PUBLIC_APP_URL` | Base URL for OG images, email links, and OAuth redirects | Your deployment URL, e.g. `https://emma.yourdomain.com` |

**Minimal local dev:** Only `OPENROUTER_API_KEY` is needed for chat to work. Supabase vars enable auth and persistence. `EMMA_ENCRYPTION_KEY` is required once Supabase is configured.

---

## Email

| Variable | Purpose | Default |
|----------|---------|---------|
| `RESEND_API_KEY` | Email sequences + SMB lead notifications | — (email disabled) |
| `EMAIL_FROM` | Sender address, e.g. `Emma <emma@yourdomain.com>` | — |

---

## Google OAuth (Gmail + Calendar + Drive)

| Variable | Purpose |
|----------|---------|
| `GOOGLE_CLIENT_ID` | OAuth 2.0 Client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth 2.0 Client Secret |

Create at [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials → Create OAuth 2.0 Client ID.

Required redirect URIs:
- `https://yourdomain.com/api/integrations/gmail/oauth/callback`
- `https://yourdomain.com/api/integrations/google_calendar/oauth/callback`
- `https://yourdomain.com/api/integrations/google_drive/oauth/callback`

---

## Slack

| Variable | Purpose |
|----------|---------|
| `SLACK_CLIENT_ID` | Slack app Client ID |
| `SLACK_CLIENT_SECRET` | Slack app Client Secret |

Create at [api.slack.com/apps](https://api.slack.com/apps). Required OAuth redirect: `https://yourdomain.com/api/integrations/slack/oauth/callback`.

---

## Notion

| Variable | Purpose |
|----------|---------|
| `NOTION_CLIENT_ID` | Notion OAuth app Client ID |
| `NOTION_CLIENT_SECRET` | Notion OAuth app Client Secret |

Create at [notion.so/my-integrations](https://www.notion.so/my-integrations) as a Public integration. Required redirect: `https://yourdomain.com/api/integrations/notion/oauth/callback`.

---

## HubSpot

| Variable | Purpose |
|----------|---------|
| `HUBSPOT_API_KEY` | Private app token (Portal Settings → Integrations → Private Apps) |

No OAuth flow — server-side only. Required scopes: `crm.objects.contacts.read/write`, `crm.objects.deals.read/write`, `crm.objects.notes.write`.

---

## WhatsApp Business

| Variable | Purpose |
|----------|---------|
| `WHATSAPP_ACCESS_TOKEN` | Meta permanent access token |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Business phone number ID |
| `WHATSAPP_VERIFY_TOKEN` | Secret string for webhook subscription verification |

From: [developers.facebook.com](https://developers.facebook.com) → your app → WhatsApp → API Setup.

---

## Billing (LemonSqueezy)

| Variable | Purpose |
|----------|---------|
| `LEMONSQUEEZY_API_KEY` | API key for checkout session creation and subscription management |
| `LEMONSQUEEZY_STORE_ID` | Your LemonSqueezy store ID |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | HMAC signing secret (you choose; set in LemonSqueezy webhook config) |
| `NEXT_PUBLIC_LEMON_VARIANT_STARTER` | Variant ID for the Starter plan ($29/mo) |
| `NEXT_PUBLIC_LEMON_VARIANT_PRO` | Variant ID for the Pro plan ($79/mo) |
| `NEXT_PUBLIC_LEMON_VARIANT_EXTRA_PACK` | Variant ID for the Extra Response Pack ($9) |

`NEXT_PUBLIC_*` variables are embedded in the client bundle at build time. Required for the billing page to show checkout buttons.

---

## SMB Intake

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SMB_DOMAIN` | Subdomain routing root, e.g. `intake.yourdomain.com`. Routes `{slug}.intake.yourdomain.com` → `/intake/{slug}` |
| `GOOGLE_SHEETS_SA_KEY` | GCP service account JSON (one line) for appending leads to Google Sheets. Format: `{"client_email":"...","private_key":"..."}` |

---

## Admin

| Variable | Purpose |
|----------|---------|
| `EMMA_ADMIN_EMAILS` | Comma-separated list of emails allowed to access `/admin` |
| `CRON_SECRET` | Bearer token for authenticating Vercel cron calls to `/api/emma/cron/*`. Generate: `openssl rand -hex 32` |

---

## Error Monitoring (Sentry)

| Variable | Purpose |
|----------|---------|
| `SENTRY_DSN` | Sentry project DSN for runtime error capture |
| `SENTRY_ORG` | Sentry organization slug (for source map uploads at build time) |
| `SENTRY_PROJECT` | Sentry project slug |
| `SENTRY_AUTH_TOKEN` | Sentry auth token for source map uploads |

---

## Notes

**`NEXT_PUBLIC_` prefix:** Variables with this prefix are embedded in the browser bundle. Never put secrets (service role key, API keys) in `NEXT_PUBLIC_` variables.

**Local dev without Supabase:** Leave all Supabase and encryption variables unset. Emma's middleware becomes a no-op and auth is skipped. Chat works, auth doesn't.

**Vercel deployments:** Set environment variables in Project → Settings → Environment Variables. `NEXT_PUBLIC_` vars must be set before building.

---

## Related

- [Tutorial: Getting Started](tutorial-getting-started.md) — minimum setup
- [How to: Connect Integrations](howto-connect-integrations.md) — OAuth app setup
- [How to: Add Billing](howto-add-billing.md) — LemonSqueezy setup
