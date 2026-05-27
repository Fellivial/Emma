# Emma — AI Companion System

Vertically-integrated AI companion with animated avatar, voice, vision, memory, and autonomous agent capabilities. Built on Next.js + Supabase + OpenRouter.

## Quick Start

**Minimal (1 key, ~2 min)** — chat works; auth and memory persistence are disabled:

```bash
npm install
echo "OPENROUTER_API_KEY=sk-or-..." > .env.local
npm run dev  # localhost:3000
```

**Full (accounts required, ~8 min)** — auth, memory, billing, integrations:

```bash
npm install
cp .env.local.example .env.local

# Generate the encryption key and append it directly to .env.local
echo "EMMA_ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env.local

# Fill in OPENROUTER_API_KEY and the three SUPABASE_* vars in .env.local
# (see Environment Variables below for the full list)

# Run the database schema (pick one):
#   Option A — Supabase CLI (fastest):
npx supabase db push --local   # or: supabase db push (against remote)
#   Option B — Dashboard: SQL Editor → New query → paste supabase/schema.sql → Run
# Both are idempotent — safe to re-run on an existing database.

npm run dev  # localhost:3000
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
│   │   │   ├── route.ts            # Brain — streaming SSE via OpenRouter
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
│   ├── models.ts                   # OpenRouter model IDs (single source of truth)
│   ├── memory-engine.ts / memory-db.ts
│   ├── client-config.ts            # Per-client config from Supabase `clients` table
│   ├── usage-enforcer.ts           # 5-hour single-window token/message metering
│   ├── avatar-engine.ts            # Live2D: 10 expressions, lip sync, 3 layout modes
│   ├── emotion-engine.ts           # User emotional state detection
│   ├── autonomy-engine.ts          # Autonomy tiers (1=notify, 2=suggest, 3=execute)
│   ├── routines-engine.ts          # Built-in + user-defined workflows
│   ├── tool-registry.ts            # Every autonomous tool Emma can call; risk levels (safe/moderate/dangerous)
│   ├── integrations/adapter.ts     # OAuth token store + service adapters
│   ├── security/sanitise.ts        # Prompt injection detection + input cleaning
│   ├── security/encryption.ts      # AES-256-GCM field encryption
│   └── pricing.ts                  # Plan definitions and limits
└── proxy.ts                        # Supabase SSR auth gate + subdomain routing
```

## Request Flow

Every `/app` chat message:

1. `sanitiseInput()` — injection detection, length limits
2. `checkUsage()` — 5-hour rolling window metering
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

`src/proxy.ts` gates all routes via Supabase SSR and handles subdomain routing. Public paths:

- `/login`, `/register`, `/auth/callback`
- `/landing`, `/waitlist`
- `/intake/*`
- `/api/waitlist`, `/api/emma/webhook`, `/api/emma/unsubscribe`

Authenticated users are also checked against a waitlist gate: if `user.app_metadata.waitlist_approved !== true` and the user's email is not in `EMMA_ADMIN_EMAILS`, they are redirected to `/waitlist`. This gate applies to all non-public, non-API routes. Admins in `EMMA_ADMIN_EMAILS` bypass this check.

When `NEXT_PUBLIC_SUPABASE_URL` is not set, middleware is a no-op (local dev without Supabase).

## Environment Variables

| Variable                                    | Required | Purpose                                                                          |
| ------------------------------------------- | -------- | -------------------------------------------------------------------------------- |
| `OPENROUTER_API_KEY`                        | ✅       | All LLM calls (brain, vision, memory, emotion) — get key at openrouter.ai/keys   |
| `NEXT_PUBLIC_SUPABASE_URL`                  | ✅       | Auth + DB                                                                        |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`             | ✅       | Client-side auth                                                                 |
| `SUPABASE_SERVICE_ROLE_KEY`                 | ✅       | Server-side DB (bypasses RLS)                                                    |
| `EMMA_ENCRYPTION_KEY`                       | ✅       | AES-256 field encryption (`openssl rand -hex 32`)                                |
| `NEXT_PUBLIC_APP_URL`                       | ✅       | Base URL for OG images and email links                                           |
| `RESEND_API_KEY`                            | —        | Email sequences + intake lead notifications                                      |
| `EMAIL_FROM`                                | —        | Sender address for Resend                                                        |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | —        | Gmail + Google Calendar OAuth                                                    |
| `EMMA_ADMIN_EMAILS`                         | —        | Comma-separated emails allowed into `/admin` and bypassed past the waitlist gate |
| `CRON_SECRET`                               | —        | Authenticates Vercel cron calls                                                  |
| `LEMONSQUEEZY_API_KEY`                      | —        | Billing checkout + subscription management                                       |
| `LEMONSQUEEZY_STORE_ID`                     | —        | Billing checkout session creation                                                |
| `LEMONSQUEEZY_WEBHOOK_SECRET`               | —        | Webhook signature verification                                                   |
| `NEXT_PUBLIC_LEMON_VARIANT_STARTER`         | —        | LemonSqueezy variant ID for the Starter plan ($29/mo)                            |
| `NEXT_PUBLIC_LEMON_VARIANT_PRO`             | —        | LemonSqueezy variant ID for the Pro plan ($79/mo)                                |
| `NEXT_PUBLIC_LEMON_VARIANT_EXTRA_PACK`      | —        | Variant ID for the $9 Extra Response Pack                                        |
| `NEXT_PUBLIC_SMB_DOMAIN`                    | —        | Subdomain routing — e.g. `intake.yourdomain.com`                                 |
| `GOOGLE_SHEETS_SA_KEY`                      | —        | GCP service account JSON for Google Sheets lead appending                        |
| `HUBSPOT_API_KEY`                           | —        | HubSpot private app token for deal/contact sync                                  |
| `NOTION_CLIENT_ID` / `NOTION_CLIENT_SECRET` | —        | Notion OAuth app credentials                                                     |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET`   | —        | Slack OAuth v2 app credentials                                                   |
| `SENTRY_ORG`                                | —        | Sentry org slug for source map uploads at build time                             |
| `SENTRY_PROJECT`                            | —        | Sentry project slug                                                              |
| `SENTRY_AUTH_TOKEN`                         | —        | Sentry auth token for source map uploads (build only)                            |

## Database

### First-time setup

Paste `supabase/schema.sql` into the Supabase SQL Editor and run it. It creates all tables, RLS policies, and triggers. All statements use `IF NOT EXISTS` — safe to run again on an existing database.

### Ongoing migrations

After the initial schema, apply migration files in `supabase/migrations/` (in filename order) for any changes added since your last deploy:

```bash
# Via Supabase CLI (recommended)
supabase db push

# Or manually: paste each new file in supabase/migrations/ into the SQL Editor in order
```

**schema.sql vs migrations:** `schema.sql` is the canonical baseline — it produces a complete, correct database from scratch. The `migrations/` files are additive patches applied on top of an existing deployment. New deploys: run `schema.sql` only. Existing deploys upgrading from an earlier version: run the new migration files in order.

Key tables: `profiles`, `memories`, `usage_events`, `client_integrations`, `clients`, `leads`.

## Plans & Usage Limits

Four tiers defined in `src/core/pricing.ts`: `free`, `starter`, `pro`, `enterprise`.

Limits are enforced per 5-hour rolling window (UTC-aligned blocks). 80% of the window budget triggers an in-persona warning. 100% → hard block + Extra Response pack offer. Enterprise skips enforcement entirely.

## Testing

Tests live in `tests/unit/` and `tests/integration/`. Vitest with `@` path alias.

```bash
npx vitest run tests/unit/sanitise.test.ts   # single file
npm test                                       # all tests
npm run test:coverage                          # coverage report (v8)
```

Coverage targets `src/core/**` and `src/lib/**`.

### Feature availability

| Feature                              | Status          | Notes                                                          |
| ------------------------------------ | --------------- | -------------------------------------------------------------- |
| Chat (streaming)                     | Available       |                                                                |
| Vision, Memory, Emotion              | Available       |                                                                |
| Web search / web fetch               | Available       | No extra key needed                                            |
| Document generation (pptx/xlsx/docx) | **Unavailable** | Pending re-implementation for OpenRouter                       |
| ElevenLabs TTS                       | Available       | BYOK — users connect their own key via Settings → Integrations |

## Documentation

| Doc                                                        | Type        | What it covers                                                   |
| ---------------------------------------------------------- | ----------- | ---------------------------------------------------------------- |
| [Getting Started](docs/tutorial-getting-started.md)        | Tutorial    | From zero to working chat in 2 minutes; full setup with Supabase |
| [Connect Integrations](docs/howto-connect-integrations.md) | How-to      | Gmail, Google Calendar, Slack, Notion, HubSpot OAuth setup       |
| [SMB Intake Widget](docs/howto-smb-intake.md)              | How-to      | Deploy a public lead-capture chat widget for a business client   |
| [Add Billing](docs/howto-add-billing.md)                   | How-to      | LemonSqueezy setup, webhooks, plan feature gating                |
| [Chat History](docs/howto-chat-history.md)                 | How-to      | Enable persistent conversation history across page reloads       |
| [API Reference](docs/reference-api.md)                     | Reference   | Every API route — auth, request body, response shape             |
| [Environment Variables](docs/reference-env-vars.md)        | Reference   | Full env var table with how-to-get instructions                  |
| [Plans & Limits](docs/reference-plans.md)                  | Reference   | Token budgets, feature flags, multi-window enforcement           |
| [Architecture](docs/explanation-architecture.md)           | Explanation | Chat pipeline, two-block system prompt, prompt caching design    |
| [Security](docs/explanation-security.md)                   | Explanation | Prompt injection defense, AES-256-GCM field encryption           |
| [Autonomous Agent](docs/explanation-agent.md)              | Explanation | Agent loop, autonomy tiers, tool risk levels                     |

## Getting Help

- **Bugs / unexpected behavior** → [open an issue](https://github.com/Fellivial/Emma/issues/new?template=bug_report.md)
- **Feature requests** → [open an issue](https://github.com/Fellivial/Emma/issues/new?template=feature_request.md)
- **Questions / ideas** → [GitHub Discussions](https://github.com/Fellivial/Emma/discussions)

## Avatar

Live2D controller with 10 expressions (`neutral`, `smirk`, `warm`, `concerned`, `amused`, `skeptical`, `listening`, `flirty`, `sad`, `idle_bored`) and 3 layout modes (side, overlay, PiP).

If no model files are present in `public/live2d/emma/`, the avatar runs in placeholder mode — animated emoji that reacts to all 10 expressions. No model files needed to test the full pipeline.
