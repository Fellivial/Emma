# TODOS

Work considered and explicitly deferred. Pick these up once the SMB demo sprint has its first paying client.

---

## P1 — Before Consumer Launch

### ~~Consumer/SMB Split Architecture~~ ✅ Done (2026-05-16)
**What:** `/app` (consumer) and `/business/[slug]` (SMB) are now intentionally separate route trees sharing `src/core/`.
- `/business/[slug]/` — overview dashboard (lead counts, recent leads, intake URL)
- `/business/[slug]/leads/` — full leads table
- `_lib/auth.ts` — shared membership gate (user auth + `client_members` check)
- `/admin/[slug]` redirects to `/business/[slug]/leads` for backwards compat
- `/admin/` internal ops dashboard (MRR, churn) — unchanged, separate surface

### ~~Regulatory Disclosure in Onboarding~~ ✅ Done (2026-05-16)
Intro step now shows a bordered disclosure card with a required checkbox. "Let's go" is disabled until acknowledged.

### ~~Consent / AI Disclosure Footer on Intake Page~~ ✅ Done (2026-05-16)
Consent gate added to `/intake/[slug]` — checkbox must be checked before chat starts. Tennessee disclosure banner remains always-visible above the gate.

### ~~PII Retention Policy for Leads Table~~ ✅ Done (2026-05-16)
`/api/emma/cron/leads-cleanup` deletes leads older than 90 days. Runs daily at 03:00 UTC via Vercel cron.

### ~~Admin Lead View `/admin/[slug]`~~ ✅ Done (2026-05-16)
`/admin/[slug]` — server-rendered leads table, auth-gated to client members only. Ownership verified via `client_members` before any data is shown.

---

## P2 — After First SMB Client

### ~~Google Sheets Writer~~ ✅ Done (2026-05-16)
`src/lib/sheets.ts` — zero-dependency WebCrypto service account JWT auth + Google Sheets API v4 `values.append`. Wired into both `/api/intake/[slug]/chat` and `/api/intake/[slug]/form` on lead save (non-fatal). Config: `sheets_id` in `clients` table + `GOOGLE_SHEETS_SA_KEY` env var (JSON blob). Row format: `[ISO timestamp, name, contact, notes]` appended to `Sheet1!A:D`.

### ~~Slug Enumeration Protection~~ ✅ Done (2026-05-16)
`/intake/[slug]/page.tsx` is now a server component. Unknown slugs render the same static "This intake page is unavailable" page as inactive slugs — HTTP 200 in both cases so status codes reveal nothing. Chat UI extracted to `_components/IntakeChat.tsx`.

### ~~Subdomain Routing (Vercel Wildcard)~~ ✅ Done (2026-05-16)
`src/proxy.ts` — reads `Host` header at middleware entry; if it ends with `.<NEXT_PUBLIC_SMB_DOMAIN>`, extracts the slug and rewrites to `/intake/{slug}`. Configure a Vercel wildcard domain (`*.intake.yourdomain.com`) and set `NEXT_PUBLIC_SMB_DOMAIN=intake.yourdomain.com` to activate.

### ~~Lead Notification — Email~~ ✅ Done (2026-05-16)
Email notification via Resend wired in both `/api/intake/[slug]/chat` and `/api/intake/[slug]/form`. Sends to `owner_email` from `clients` table (falls back to `EMAIL_FROM`). WhatsApp option deferred until a client specifically requests it.

---

## P3 — Future

### ~~Multi-step Intake Forms~~ ✅ Done (2026-05-16)
**What:** Configurable intake question sequences (not just open chat). For high-volume use cases where consistency matters more than personality.
**Why:** Some SMB verticals (medical intake, legal intake) need specific questions in a specific order with validation.
**Effort:** M
**Depends on:** Client pattern revealing this need

### ~~HubSpot Deal Sync~~ ✅ Done (2026-05-16)
**What:** Auto-create a HubSpot deal when a lead is captured via intake.
**Why:** SMBs with established HubSpot workflows want leads to flow in automatically.
**Effort:** S (HubSpot integration already exists in codebase)
**Depends on:** Client using HubSpot

---

## Known TODOs in Code

- `src/app/api/emma/referral/route.ts` — ~~Extend referrer subscription by 1 month~~ → **20% discount code via LemonSqueezy + Resend notification** ✅ Done (2026-05-16)
