# Emma — AI Companion System

Vertically-integrated AI companion with animated avatar, voice, vision, memory, and autonomous agent capabilities. Built on Next.js + Supabase + Anthropic.

## Quick Start

```bash
npm install
cp .env.local.example .env.local   # fill in required vars
npm run dev                         # localhost:3000
```

## Commands

```bash
npm run dev          # Next.js dev server
npm run build        # Production build + type check
npm run lint         # ESLint
npm run format       # Prettier
npm test             # Vitest (all tests)
npm run test:watch   # Watch mode
npm run test:coverage # Coverage report
```

## Architecture

```
src/
├── app/
│   ├── api/
│   │   ├── emma/
│   │   │   ├── route.ts            # Brain — streaming SSE to Anthropic
│   │   │   ├── memory/route.ts     # Memory CRUD + extraction
│   │   │   ├── vision/route.ts     # Claude Vision scene analysis
│   │   │   ├── emotion/route.ts    # Emotion detection via Claude
│   │   │   ├── tts/route.ts        # ElevenLabs TTS
│   │   │   ├── settings/route.ts   # User settings GET/PUT
│   │   │   ├── usage/route.ts      # Usage stats
│   │   │   ├── tasks/route.ts      # Autonomous tasks CRUD
│   │   │   └── agent/route.ts      # Agentic loop execution
│   │   ├── intake/[slug]/
│   │   │   └── chat/route.ts       # SMB intake chat (public, per-client metering)
│   │   ├── business/[slug]/
│   │   │   └── settings/route.ts   # Owner config CRUD (auth-gated)
│   │   ├── lemon/webhook/route.ts  # LemonSqueezy subscription webhooks
│   │   └── integrations/           # OAuth start + callback per service
│   ├── app/page.tsx                # Main chat shell (client component)
│   ├── intake/[slug]/page.tsx      # SMB intake UI (public)
│   ├── business/[slug]/            # SMB business dashboard (auth-gated)
│   │   └── settings/page.tsx       # Owner config — email + Google Sheets ID
│   ├── admin/                      # Internal ops dashboard (EMMA_ADMIN_EMAILS gated)
│   ├── landing/                    # Marketing landing page
│   ├── onboarding/                 # New user onboarding flow
│   └── settings/                   # Profile, usage, billing, integrations, tasks
├── components/
│   ├── landing/                    # Landing page sections + footer
│   └── ...                         # Chat, avatar, panels, settings UI
├── core/
│   ├── personas.ts                 # System prompt builder
│   ├── models.ts                   # Anthropic model IDs (single source of truth)
│   ├── memory-engine.ts / memory-db.ts
│   ├── client-config.ts            # Per-client config from Supabase `clients` table
│   ├── usage-enforcer.ts           # Multi-window token/message metering
│   ├── avatar-engine.ts            # Live2D: 10 expressions, lip sync, 3 layout modes
│   ├── emotion-engine.ts           # User emotional state detection
│   ├── autonomy-engine.ts          # Autonomy tiers (1=notify, 2=suggest, 3=execute)
│   ├── routines-engine.ts          # Built-in + user-defined workflows
│   ├── tool-registry.ts            # Every autonomous tool Emma can call; risk levels (safe/moderate/dangerous)
│   ├── integrations/adapter.ts     # OAuth token store + service adapters
│   ├── security/sanitise.ts        # Prompt injection detection + input cleaning
│   ├── security/encryption.ts      # AES-256-GCM field encryption
│   └── pricing.ts                  # Plan definitions and limits
└── middleware.ts                   # Supabase SSR auth gate
```

## Request Flow

Every `/app` chat message:

1. `sanitiseInput()` — injection detection, length limits
2. `checkUsage()` — multi-window metering (daily / weekly / monthly)
3. `POST /api/emma` — streaming SSE brain route
4. `parseEmmaResponse()` — extracts text, `[emotion:]` tag, `[EMMA_ROUTINE]` tag
5. Avatar, TTS, and timeline update on the client

## SMB Intake

Public widget deployed at `/intake/[slug]` for any `clients` record in the database. No auth required.

- **Neutral persona** — hardcoded intake assistant prompt, never uses per-client persona
- **Lead capture** — collects name + contact + reason via conversation; emits `[INTAKE_COMPLETE:]` tag server-side
- **Per-client metering** — tokens and messages tracked under `client:<slug>` (not user ID)
- **IP rate limiting** — 20 messages/minute per IP+slug (in-memory)
- **Lead storage** — written to `leads` table via service role; RLS denies all non-service-role access
- **Email notification** — Resend fires after lead is saved (non-fatal if it fails)
- **AI disclosure** — "This service uses artificial intelligence. You are interacting with an AI, not a human." per Tennessee SB 2652

## Auth & Middleware

`src/middleware.ts` gates all routes via Supabase SSR. Public paths:

- `/login`, `/auth/callback`
- `/landing`, `/waitlist`
- `/intake/*`
- `/api/waitlist`, `/api/emma/webhook`, `/api/emma/unsubscribe`

When `NEXT_PUBLIC_SUPABASE_URL` is not set, middleware is a no-op (local dev without Supabase).

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | Brain, vision, memory, emotion |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Auth + DB |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Client-side auth |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Server-side DB (bypasses RLS) |
| `EMMA_ENCRYPTION_KEY` | ✅ | AES-256 field encryption (`openssl rand -hex 32`) |
| `NEXT_PUBLIC_APP_URL` | ✅ | Base URL for OG images and email links |
| `RESEND_API_KEY` | — | Email sequences + intake lead notifications |
| `EMAIL_FROM` | — | Sender address for Resend |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | — | Gmail + Google Calendar OAuth |
| `EMMA_ADMIN_EMAILS` | — | Comma-separated emails allowed into `/admin` |
| `CRON_SECRET` | — | Authenticates Vercel cron calls |
| `LEMONSQUEEZY_API_KEY` | — | Billing checkout + subscription management |
| `LEMONSQUEEZY_STORE_ID` | — | Billing checkout session creation |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | — | Webhook signature verification |
| `NEXT_PUBLIC_LEMON_VARIANT_STARTER` | — | LemonSqueezy variant ID for the Starter plan ($29/mo) |
| `NEXT_PUBLIC_LEMON_VARIANT_PRO` | — | LemonSqueezy variant ID for the Pro plan ($79/mo) |
| `NEXT_PUBLIC_LEMON_VARIANT_EXTRA_PACK` | — | Variant ID for the $9 Extra Response Pack |
| `NEXT_PUBLIC_SMB_DOMAIN` | — | Subdomain routing — e.g. `intake.yourdomain.com` |
| `GOOGLE_SHEETS_SA_KEY` | — | GCP service account JSON for Google Sheets lead appending |
| `HUBSPOT_API_KEY` | — | HubSpot private app token for deal/contact sync |
| `NOTION_CLIENT_ID` / `NOTION_CLIENT_SECRET` | — | Notion OAuth app credentials |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` | — | Slack OAuth v2 app credentials |

## Database

Run `supabase/schema.sql` in the Supabase SQL Editor before first use (auth, memory, usage, integrations).

Apply migrations in order:

```bash
supabase db push
```

Key tables: `users`, `memories`, `usage_events`, `integration_tokens`, `clients`, `leads`.

## Plans & Usage Limits

Four tiers defined in `src/core/pricing.ts`: `free`, `starter`, `pro`, `enterprise`.

Limits are multi-window — daily / weekly / monthly, whichever hits first blocks. 80% of any window triggers an in-persona warning. 100% → hard block + Extra Response pack offer. Enterprise skips enforcement entirely.

## Testing

Tests live in `tests/unit/` and `tests/integration/`. Vitest with `@` path alias.

```bash
npx vitest run tests/unit/sanitise.test.ts   # single file
npm test                                       # all tests
```

Coverage targets `src/core/**` and `src/lib/**`.

## Avatar

Live2D controller with 10 expressions (`neutral`, `smirk`, `warm`, `concerned`, `amused`, `skeptical`, `listening`, `flirty`, `sad`, `idle_bored`) and 3 layout modes (side, overlay, PiP).

If no model files are present in `public/live2d/emma/`, the avatar runs in placeholder mode — animated emoji that reacts to all 10 expressions. No model files needed to test the full pipeline.
