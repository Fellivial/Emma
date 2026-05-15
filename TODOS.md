# TODOS

Work considered and explicitly deferred. Pick these up once the SMB demo sprint has its first paying client.

---

## P1 — Before Consumer Launch

### Consumer/SMB Split Architecture
**What:** Design `/app` (consumer) and `/business` (SMB) route trees as intentionally separate surfaces sharing a core library.
**Why:** The design doc (Premise 3) calls this out explicitly. First SMB client will request audit logs, admin controls, or multi-user access that consumer should never have. Plan the split before a client forces it under time pressure.
**How to apply:** After 2 SMB clients reveal their actual feature requests, design the split. Do not do it speculatively.
**Effort:** M (human ~1 week / CC ~2 days)
**Depends on:** 2 SMB deployments revealing pattern

### ~~Regulatory Disclosure in Onboarding~~ ✅ Done (2026-05-16)
Intro step now shows a bordered disclosure card with a required checkbox. "Let's go" is disabled until acknowledged.

### ~~Consent / AI Disclosure Footer on Intake Page~~ ✅ Done (2026-05-16)
Consent gate added to `/intake/[slug]` — checkbox must be checked before chat starts. Tennessee disclosure banner remains always-visible above the gate.

### PII Retention Policy for Leads Table
**What:** Auto-delete lead records older than a configurable retention window (default 90 days).
**Why:** The `leads` table stores visitor names, phone numbers, and email addresses indefinitely. GDPR right-to-erasure liability. Data hoarding risk. Required before processing real visitor data.
**How to apply:** Supabase scheduled function or cron job (`/api/emma/cron/leads-cleanup`) + `retention_days` field in `ClientConfig`.
**Effort:** S (human ~2 hrs / CC ~30 min)
**Depends on:** First SMB client going live with real visitors

### Admin Lead View `/admin/[slug]`
**What:** Simple authenticated page for the business owner to see all captured leads from their intake flow.
**Why:** Currently the owner gets email only. Once they have 10+ leads, they want a table. This is the upgrade from "email per lead" to "lead management."
**How to apply:** Auth via Supabase magic link for the client owner. Query `leads` table by `client_slug`.
**Effort:** S (human ~4 hrs / CC ~1 hr)
**Depends on:** First SMB client going live

---

## P2 — After First SMB Client

### Google Sheets Writer
**What:** Write captured intake leads to a Google Sheet the client already uses, in real time.
**Why:** Design doc specifically mentioned this as the "wow factor" — lead appears in Sheets during demo. Some clients will prefer Sheets to email.
**How to apply:** `googleapis` package + Google service account per client + `sheets_id` in ClientConfig. Build as a tool in the tool-registry.
**Effort:** M (human ~1 day / CC ~4-5 hrs)
**Depends on:** First client explicitly requesting it

### Slug Enumeration Protection
**What:** Make `/intake/unknown-slug` indistinguishable from a disabled (but known) slug at the HTTP response level.
**Why:** A 404 on unknown slugs vs. a loaded page on real slugs reveals the full tenant list to any attacker iterating common names. Exposes which businesses are Emma customers before they've announced it.
**How to apply:** Return a generic "This intake page is unavailable" page (not 404) for both unknown and inactive slugs. Only the business owner's admin page reveals slug validity.
**Effort:** XS (human ~30 min / CC ~10 min)
**Depends on:** First SMB client confirmed (slug enumeration only matters when there are real slugs)

### Subdomain Routing (Vercel Wildcard)
**What:** Route `theirclinic.emma.yourdomain.com` → parse Host header for slug → load client config.
**Why:** Design doc mentioned custom subdomain. More impressive in demo. Client feels it's their own branded thing.
**How to apply:** Vercel wildcard domain `*.emma.yourdomain.com` + middleware reads `Host` header to extract slug.
**Effort:** S (human ~1 hr / CC ~30 min)
**Depends on:** First client confirmed (so we know the subdomain to configure)

### Lead Notification — Email or WhatsApp Business
**What:** Notify the business owner when a lead is captured via intake. Two options: (A) email via Resend (already wired in the app), or (B) WhatsApp Business API message.
**Why:** Immediate notification is the demo "wow factor" — owner sees the lead arrive in real time. Resend is zero-infra since it's already integrated. WhatsApp Business is more personal and harder to miss than email for SMBs in markets where WhatsApp is primary.
**How to apply:**
- Email: `resend.emails.send()` call in `/api/intake/[slug]/chat` route when `complete === true` + `owner_email` in ClientConfig. ~30 min.
- WhatsApp: Meta Cloud API (`https://graph.facebook.com/v18.0/{phone_number_id}/messages`) + `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` env vars + `owner_whatsapp` in ClientConfig. ~2 hrs.
**Effort:** S — Email (CC ~30 min) / WhatsApp (CC ~2 hrs)
**Depends on:** First SMB client confirmed and requesting notifications

---

## P3 — Future

### Multi-step Intake Forms
**What:** Configurable intake question sequences (not just open chat). For high-volume use cases where consistency matters more than consistency matters more than personality.
**Why:** Some SMB verticals (medical intake, legal intake) need specific questions in a specific order with validation.
**Effort:** M
**Depends on:** Client pattern revealing this need

### HubSpot Deal Sync
**What:** Auto-create a HubSpot deal when a lead is captured via intake.
**Why:** SMBs with established HubSpot workflows want leads to flow in automatically.
**Effort:** S (HubSpot integration already exists in codebase)
**Depends on:** Client using HubSpot

---

## Known TODOs in Code

- `src/app/api/emma/referral/route.ts` — ~~Extend referrer subscription by 1 month~~ → **20% discount code via LemonSqueezy + Resend notification** ✅ Done (2026-05-16)
