# Changelog

All notable changes are documented here. Format: date, what changed, migration steps if any.

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
