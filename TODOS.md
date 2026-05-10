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

### Regulatory Disclosure in Onboarding
**What:** Add clear AI disclosure ("This is an AI assistant") before the first consumer message. Required by Tennessee law (Q1 2026) and pending in 4 other states.
**Why:** Developer liability for emotional harm in Tennessee as of Q1 2026. Blocking for consumer self-serve launch.
**How to apply:** Consumer onboarding flow, first message before chat begins. Also add to intake persona greeting for good measure.
**Effort:** S (human ~2 hrs / CC ~30 min)
**Depends on:** Consumer launch decision

### Consent / AI Disclosure Footer on Intake Page
**What:** Add a consent notice and AI disclosure to `/intake/[slug]` before visitors submit any personal information.
**Why:** The intake page collects name/phone/email from anonymous visitors. Tennessee AI disclosure law (Q1 2026) requires disclosing AI involvement. GDPR requires consent before collecting PII from EU visitors.
**How to apply:** Footer on intake page with "This conversation is handled by an AI assistant" + checkbox consent before first message or before lead save.
**Effort:** S (human ~1 hr / CC ~20 min)
**Depends on:** Intake page built

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

### SMS Notification (Twilio)
**What:** Send SMS to business owner's phone when a lead is captured.
**Why:** More immediate than email. Design doc mentioned SMS. Design doc mentioned SMS. "You just got a text" is impressive in a live demo.
**How to apply:** `twilio` npm package + `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` env vars + `owner_phone` in ClientConfig.
**Effort:** S (human ~2 hrs / CC ~1 hr)
**Depends on:** First client asking for it, or email proving insufficient

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

- `src/app/api/emma/referral/route.ts:168` — Extend referrer subscription via LemonSqueezy (not implemented)
- `src/app/api/emma/waitlist-manage/route.ts:67` — Send invite email (not implemented)
- `src/app/api/waitlist/route.ts:122,149` — Create auth account + send welcome/confirmation emails (not implemented)
