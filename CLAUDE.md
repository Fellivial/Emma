# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Next.js dev server (localhost:3000)
npm run build        # Production build (also validates types)
npm run lint         # ESLint on src/
npm run format       # Prettier write
npm test             # Run all tests (Vitest)
npm run test:watch   # Vitest watch mode
npm run test:coverage # Coverage report (v8)
```

Run a single test file:

```bash
npx vitest run tests/unit/sanitise.test.ts
```

## Architecture Overview

Emma is a Next.js AI workspace agent. The app shell lives at `src/app/app/page.tsx` — a large client component that wires all hooks together. The main chat route (`/app`) is the primary UX; `/settings/*` provides profile, usage, billing, integrations, tasks, and workflows management.

### Request Flow

Every user message goes through:

1. `sanitiseInput()` (`src/core/security/sanitise.ts`) — injection detection, length limits
2. `checkUsage()` (`src/core/usage-enforcer.ts`) — 5-hour rolling window metering
3. `POST /api/emma` (`src/app/api/emma/route.ts`) — streaming SSE brain route via OpenRouter
4. `parseEmmaResponse()` (`src/core/command-parser.ts`) — extracts text, `[emotion:]` tag, `[EMMA_ROUTINE]` tag

The brain route streams SSE deltas to the client. After the full response is collected, it appends a `{"type":"done", ...}` event with the parsed expression and routineId. Client-side streaming is handled by `src/lib/stream-client.ts`.

### Core Engines

All engines are React hooks or plain modules in `src/core/`:

| Engine                    | Purpose                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| `personas.ts`             | Builds the full system prompt: persona + memories + vision context + emotion state + routines |
| `models.ts`               | Single source of truth for OpenRouter model IDs (brain/utility/vision)                        |
| `memory-db.ts`            | In-memory store + Supabase persistence with AES-256-GCM field encryption                      |
| `client-config.ts`        | Per-client config loaded from Supabase `clients` table; falls back to `DEFAULT_CONFIG`        |
| `usage-enforcer.ts`       | 5-hour single-window token/message metering; must fail-open (never block on DB errors)        |
| `avatar-engine.ts`        | Live2D controller; 10 expressions, lip sync, 3 layout modes (side/overlay/pip)                |
| `emotion-engine.ts`       | Detects user emotional state from voice/text; feeds into system prompt                        |
| `autonomy-engine.ts`      | Autonomy tier system (1=notify, 2=suggest, 3=execute)                                         |
| `routines-engine.ts`      | Workflow routines — built-in and user-defined                                                 |
| `integrations/adapter.ts` | OAuth token store + adapter interface for Gmail, Google Calendar, Slack, Notion, HubSpot      |
| `security/sanitise.ts`    | Prompt injection detection and input cleaning                                                 |
| `security/encryption.ts`  | AES-256-GCM field encryption (key: `EMMA_ENCRYPTION_KEY` env var)                             |

### API Routes

All routes are under `src/app/api/`:

- `emma/route.ts` — Brain (streaming SSE)
- `emma/memory/route.ts` — Memory CRUD + extraction
- `emma/vision/route.ts` — Scene analysis via OpenRouter (vision model)
- `emma/emotion/route.ts` — Emotion extraction via OpenRouter (utility model)
- `emma/tts/route.ts` — ElevenLabs TTS
- `emma/settings/route.ts` — User settings (GET/PUT)
- `emma/usage/route.ts` — Usage stats
- `emma/tasks/route.ts` — Autonomous tasks CRUD
- `emma/agent/route.ts` — Agentic loop execution
- `lemon/webhook/route.ts` — LemonSqueezy subscription webhooks
- `integrations/[service]/oauth/` — OAuth start + callback

### Auth & Middleware

`src/proxy.ts` gates all routes via Supabase SSR. Public paths: `/login`, `/register`, `/auth/callback`, `/landing`, `/api/waitlist`, `/api/emma/webhook`, `/waitlist`, `/api/emma/unsubscribe`, `/intake/`. API routes authenticate inside each handler. When `NEXT_PUBLIC_SUPABASE_URL` is not set (local dev), middleware is a no-op.

Authenticated users are also checked against a waitlist gate: if `user.app_metadata.waitlist_approved !== true` and the user's email is not in `EMMA_ADMIN_EMAILS`, they are redirected to `/waitlist`. This gate runs on all non-public, non-API routes.

### Personas

Two personas in `src/core/personas.ts`: `mommy` (default — playful, warm, teasing) and `neutral`. The system prompt is assembled from the persona base + routine list + memories + optional vision context + optional emotion state. Emma appends `[emotion: <expression>]` to every response; this tag is stripped before display and used to drive the avatar.

### DeviceGraph — Deprecated

`DeviceGraph` types in `src/types/emma.ts` are inert stubs kept for type compatibility. Emma no longer controls physical devices. The device graph is always passed as `{}`.

## Environment Variables

| Variable                                    | Purpose                                                                                                                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENROUTER_API_KEY`                        | Required — all LLM calls (brain, vision, memory, emotion)                                                                                                              |
| `OPENAI_API_KEY`                            | Required for STT fallback (`/api/emma/stt`) — OpenRouter doesn't expose audio endpoints; Whisper models: `gpt-4o-mini-transcribe` (Starter), `gpt-4o-transcribe` (Pro) |
| `NEXT_PUBLIC_SUPABASE_URL`                  | Required for auth/DB (skip for local dev)                                                                                                                              |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`             | Required for client-side auth                                                                                                                                          |
| `SUPABASE_SERVICE_ROLE_KEY`                 | Required for server-side DB operations                                                                                                                                 |
| `EMMA_ENCRYPTION_KEY`                       | AES-256 field encryption key (`openssl rand -hex 32`)                                                                                                                  |
| `EMMA_UNSUBSCRIBE_SECRET`                   | HMAC key for unsubscribe link tokens — decoupled from `EMMA_ENCRYPTION_KEY` so key rotation doesn't break sent links (`openssl rand -hex 32`)                          |
| `NEXT_PUBLIC_APP_URL`                       | Base URL for OG images and email links (e.g. `https://yourapp.com`)                                                                                                    |
| `ELEVENLABS_API_KEY`                        | Not a server var — users connect their own key via Settings → Integrations                                                                                             |
| `RESEND_API_KEY`                            | Email sequences + intake lead notifications                                                                                                                            |
| `EMAIL_FROM`                                | Sender address for Resend emails                                                                                                                                       |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Gmail + Google Calendar OAuth                                                                                                                                          |
| `EMMA_ADMIN_EMAILS`                         | Comma-separated emails allowed into `/admin` and bypassed past the waitlist gate                                                                                       |
| `CRON_SECRET`                               | Authenticates Vercel cron calls to `/api/emma/cron/*` routes                                                                                                           |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`              | VAPID public key for Web Push (generate with `npx web-push generate-vapid-keys`)                                                                                       |
| `VAPID_PRIVATE_KEY`                         | VAPID private key for Web Push (server-only, never expose to client)                                                                                                   |
| `UPSTASH_REDIS_REST_URL`                    | Upstash Redis REST endpoint for distributed rate limiting (from Upstash console → database → REST API)                                                                 |
| `UPSTASH_REDIS_REST_TOKEN`                  | Upstash Redis REST token (same location as URL)                                                                                                                        |
| `LEMONSQUEEZY_API_KEY`                      | Billing — checkout + subscription management                                                                                                                           |
| `LEMONSQUEEZY_STORE_ID`                     | Billing — checkout session creation                                                                                                                                    |
| `LEMONSQUEEZY_WEBHOOK_SECRET`               | Billing — webhook signature verification                                                                                                                               |
| `NEXT_PUBLIC_LEMON_VARIANT_STARTER`         | LemonSqueezy variant ID for the Starter plan ($29/mo)                                                                                                                  |
| `NEXT_PUBLIC_LEMON_VARIANT_PRO`             | LemonSqueezy variant ID for the Pro plan ($79/mo)                                                                                                                      |
| `NEXT_PUBLIC_LEMON_VARIANT_EXTRA_PACK`      | LemonSqueezy variant ID for the $9 Extra Response Pack                                                                                                                 |
| `NEXT_PUBLIC_SMB_DOMAIN`                    | Subdomain routing — e.g. `intake.yourdomain.com` → `{slug}.intake.yourdomain.com` maps to `/intake/{slug}`                                                             |
| `GOOGLE_SHEETS_SA_KEY`                      | JSON blob of a GCP service account for Google Sheets lead appending (`client_email` + `private_key`)                                                                   |
| `HUBSPOT_API_KEY`                           | HubSpot private app token for deal/contact sync (Portal Settings → Integrations → Private Apps)                                                                        |
| `NOTION_CLIENT_ID` / `NOTION_CLIENT_SECRET` | Notion OAuth app credentials (api.notion.com → My Integrations)                                                                                                        |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET`   | Slack OAuth v2 app credentials (api.slack.com → Your Apps)                                                                                                             |
| `SENTRY_ORG`                                | Sentry org slug for source map uploads at build time                                                                                                                   |
| `SENTRY_PROJECT`                            | Sentry project slug                                                                                                                                                    |
| `SENTRY_AUTH_TOKEN`                         | Sentry auth token for source map uploads (build only)                                                                                                                  |
| `WHATSAPP_ACCESS_TOKEN`                     | WhatsApp Cloud API access token (Meta for Developers → App → WhatsApp → API Setup)                                                                                     |
| `WHATSAPP_PHONE_NUMBER_ID`                  | WhatsApp Cloud API phone number ID (same dashboard as above)                                                                                                           |
| `WHATSAPP_VERIFY_TOKEN`                     | Webhook verify token for WhatsApp ingest endpoint (`/api/emma/ingest/whatsapp`)                                                                                        |
| `WHATSAPP_APP_SECRET`                       | Meta app secret used for HMAC signature validation on incoming WhatsApp webhooks                                                                                       |
| `INGEST_EMAIL_WEBHOOK_SECRET`               | Shared secret for authenticating inbound email webhook calls to `/api/emma/ingest/email`                                                                               |

## Database Setup

Run `supabase/schema.sql` in the Supabase SQL Editor before first use. Required for auth, memory, usage tracking, and integrations.

## Testing

Tests live in `tests/unit/` and `tests/integration/`. Vitest is configured in `vitest.config.ts` with the `@` path alias. Coverage targets `src/core/**` and `src/lib/**`.

## Tailwind Design Tokens

The design uses a custom `emma-*` color palette and `surface-border` tokens. Background is `#0d0a0e`. Use `emma-950/90` for glass surfaces with `backdrop-blur-2xl`.

## Typography

Body: `font-sans` → Outfit. Display/italic: `font-display` → Cormorant Garamond. Both loaded via `src/app/layout.tsx`.

## Plans & Usage Limits

Four tiers: `free`, `starter`, `pro`, `enterprise` (defined in `src/core/pricing.ts`). Limits are enforced per 5-hour rolling window (UTC-aligned blocks). 80% of the window budget → in-persona warning. 100% → hard block + Extra Response pack offer. Enterprise skips enforcement entirely.

## Hooks (GateGuard)

Two hooks are active that block operations until facts are presented:

**Before creating a new file** (`pre:edit-write`), state:

1. What files/lines will call this new file
2. Confirmation no existing file serves the same purpose
3. Field structure if the file reads/writes data
4. The user's instruction verbatim

**Before the first Bash command each session** (`pre:bash`), state:

1. The current user request in one sentence
2. What this specific command verifies or produces

Recovery: set `ECC_GATEGUARD=off` in env, or add `pre:edit-write:gateguard-fact-force` / `pre:bash:gateguard-fact-force` to `ECC_DISABLED_HOOKS`.

## gstack

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

Available skills: `/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`, `/design-shotgun`, `/design-html`, `/review`, `/ship`, `/land-and-deploy`, `/canary`, `/benchmark`, `/browse`, `/connect-chrome`, `/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`, `/setup-deploy`, `/setup-gbrain`, `/retro`, `/investigate`, `/document-release`, `/codex`, `/cso`, `/autoplan`, `/plan-devex-review`, `/devex-review`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`, `/learn`

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:

- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Code review/diff check → invoke /review
- Full review + QA pipeline → invoke /review then /qa
- Bugs/errors → invoke /investigate
- Performance issues → invoke /benchmark
- QA/testing site behavior → invoke /qa or /qa-only
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
