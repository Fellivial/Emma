# Changelog

All notable changes are documented here. Format: date, what changed, migration steps if any.

---

## 2026-05-26

### OpenRouter migration
- **All LLM calls migrated to OpenRouter** — `ANTHROPIC_API_KEY` replaced by `OPENROUTER_API_KEY`. All routes (`/api/emma`, `/api/emma/agent`, `/api/emma/vision`, `/api/emma/emotion`, `/api/emma/memory`, `/api/emma/summarize`) now call `https://openrouter.ai/api/v1/chat/completions` via the unified `src/lib/openrouter.ts` helper.
- **Model IDs updated** — `src/core/models.ts` now uses OpenRouter model identifiers. Swap to `anthropic/claude-sonnet-4-5` / `google/gemini-2.5-flash` for production.
- **Dead code removed** — `@anthropic-ai/sdk` dependency removed. `tests/integration/anthropic-beta-headers.test.ts` removed. `FEATURES.md` removed.

---

## 2026-05-23

### API stability
- **Error responses include `status` and `code`** — The 502 JSON body now carries `{ error, status, code }` where `code` is one of `BAD_REQUEST | AUTH_ERROR | RATE_LIMIT | OVERLOADED | TIMEOUT | UPSTREAM_ERROR`. Enables programmatic error handling without parsing persona messages.
- **Upstream errors logged** — `console.error` fires before every 502 return. The same logging is in `agent-loop.ts` for autonomous task failures.

### Developer experience
- **Type safety** — `agent-loop.ts` `any` casts replaced with `MessageParam`, `ContentBlock`, and `SupabaseClient | null`. `ToolResult` gains `outputVar?: string`. `EmmaApiResponse` gains `status?` and `code?`. `stream-client.ts` unused `catch (err)` binding removed.

### Architecture note (Next.js 16.2.4)
Next.js 16.2.4 treats `src/proxy.ts` as a first-class routing construct. Having both `src/middleware.ts` and `src/proxy.ts` present causes a crash loop at startup — the server binds the port but never serves requests. Fix: delete `middleware.ts` and keep `proxy.ts` with an exported `proxy()` function. If you are upgrading from a version that had both files, delete `src/middleware.ts`.

---

## 2026-05-19

### Voice
- **WebSpeech sentence-splitting** — `speakFallback` now delivers each sentence as a separate utterance with a 250ms breath between them. Previous single-utterance delivery sounded robotic. `processForEmma` updated to use commas (not whitespace) for intra-sentence pauses — WebSpeech ignores spaces.
- **`speak_text` agentic tool** — registered in `tool-registry.ts`. Emma can now speak text during autonomous tasks via ElevenLabs (BYOK) with WebSpeech fallback. Returns `audioBase64` for client-side playback.
- **WebSpeech voice priority** — Win11 Natural voices (`Microsoft Aria`, `Microsoft Jenny`, `Microsoft Michelle`) added above legacy `Microsoft Zira`. `startsWith()` matching handles full voice name variants.

### Design system
- Touch targets: all icon-only buttons upgraded to 44px (`w-11 h-11`) across `InputBar`, `AvatarCanvas`, `Header`, `SchedulePanel`, `ApprovalBubble`, login page.
- Landing page: Barlow/Barlow Condensed replaced with Outfit (matches app body font).
- Chat input: Claude-style floating card input. Send button `rounded-full`.
- Mobile: full-screen immersive avatar layout for viewports < 1024px.
- `color-scheme: dark` and `text-wrap: balance` added globally.

### UI
- `AgentPlan` component: autonomous task visualization in `ChatPanel`.
- Shining "Emma is thinking" indicator replaces dot typing animation.

---

## 2026-05-16

### SMB Intake
- **Consumer/SMB split** — `/app` (consumer) and `/business/[slug]` (SMB) are separate route trees sharing `src/core/`. Business dashboard: lead counts, intake URL, leads table.
- **Subdomain routing** — `{slug}.NEXT_PUBLIC_SMB_DOMAIN` rewrites to `/intake/{slug}` via `src/proxy.ts`. Configure a Vercel wildcard domain to activate.
- **Lead retention** — `/api/emma/cron/leads-cleanup` deletes leads older than 90 days, runs daily at 03:00 UTC.
- **Google Sheets writer** — zero-dependency service account JWT auth. Appends leads to Sheet1 on save.
- **Slug enumeration protection** — unknown slugs return the same static page as inactive slugs (HTTP 200 in both cases).
- **Regulatory disclosure** — Tennessee SB 2652 AI disclosure banner + consent gate on intake.

### Auth
- Onboarding intro step: regulatory disclosure card with required checkbox.

### Migrations required
Run `supabase/migrations/20260516000001_form_steps.sql` then `20260516000002_client_owner_email_sheets.sql`.

---

## 2026-05-15

### Avatar
- Live2D placeholder mode — animated emoji reacting to all 10 expressions when no model files are present. No model files needed to test the full pipeline.
- 3 layout modes: side, overlay, PiP.

### SMB
- SMB leads table (`supabase/migrations/20250515000000_smb_leads.sql`).

---

## Earlier

See `git log --oneline` for pre-changelog history.
