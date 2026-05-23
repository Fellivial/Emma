# How to Deploy the SMB Intake Widget

Deploy a public lead-capture chat widget for a business client. Visitors talk to Emma, Emma collects their name, contact info, and reason for reaching out, then stores the lead and emails the business owner.

## Prerequisites

- Emma running with Supabase configured
- A `clients` record in the database for the business
- (Optional) `RESEND_API_KEY` for email notifications
- (Optional) `NEXT_PUBLIC_SMB_DOMAIN` for subdomain routing

## What you'll end up with

A public URL like `https://yourdomain.com/intake/acme` (or `https://acme.intake.yourdomain.com`) where any visitor can chat with Emma. No login, no user account. Leads are saved to the `leads` table and the business owner gets an email.

---

## Step 1: Create the client record

Insert a row into the `clients` table via the Supabase SQL Editor or your admin panel (`/admin`):

```sql
insert into clients (slug, name, owner_email, config)
values (
  'acme',
  'Acme Corp',
  'owner@acme.com',
  '{}'::jsonb
);
```

- `slug` — URL-safe identifier, becomes `/intake/acme`
- `owner_email` — gets the lead notification email
- `config` — optional JSON for custom settings (persona override, response tone, etc.)

---

## Step 2: Verify the intake page loads

Visit `http://localhost:3000/intake/acme` (replace `acme` with your slug). You should see the public chat interface with the neutral intake persona.

The intake chat:
- Uses the **neutral persona** — no "mommy" tone, purely professional
- Collects name + contact + reason via conversation
- Emits `[INTAKE_COMPLETE: {"name":"...","contact":"...","reason":"..."}]` when done
- IP-rate-limits at 20 messages/minute per IP+slug (in-memory, resets on restart)

---

## Step 3: Configure lead email notifications

Add to `.env.local`:

```
RESEND_API_KEY=re_...
EMAIL_FROM=Emma <emma@yourdomain.com>
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

When Emma detects `[INTAKE_COMPLETE:]` in the response, it:
1. Saves the lead to the `leads` table
2. Fires a Resend email to the `owner_email` on the `clients` record

Email failure is non-fatal — the lead is still saved even if Resend fails.

---

## Step 4: (Optional) Set up subdomain routing

To route `acme.intake.yourdomain.com` → `/intake/acme`, add to `.env.local`:

```
NEXT_PUBLIC_SMB_DOMAIN=intake.yourdomain.com
```

Then configure your DNS and hosting to route `*.intake.yourdomain.com` to your Emma deployment. `src/proxy.ts` handles the rewrite based on the subdomain.

---

## Step 5: Verify a lead capture

Open the intake page and complete a conversation until Emma says something like "I've noted your details — someone will be in touch." Check:

1. The `leads` table in Supabase has a new row with `client_id` matching your slug
2. The `owner_email` received a notification (if Resend is configured)

---

## Step 6: (Optional) Configure per-client settings

Business owners can configure their intake at `/business/[slug]/settings` (requires `owner_email` auth):

- Custom greeting message
- Google Sheets ID for real-time lead appending (`GOOGLE_SHEETS_SA_KEY` must be set)
- HubSpot integration for automatic deal/contact creation

For Google Sheets, add the service account JSON to `.env.local`:

```
GOOGLE_SHEETS_SA_KEY={"client_email":"sheets@project.iam.gserviceaccount.com","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"}
```

Share the target Google Sheet with the `client_email` address. Emma appends a row per lead.

---

## Troubleshooting

**Intake page 404** — no `clients` record exists for that slug. Check the `clients` table.

**Leads not saving** — check `SUPABASE_SERVICE_ROLE_KEY` is set; the `leads` table uses service-role writes (RLS denies all non-service-role access by design).

**Email not arriving** — `RESEND_API_KEY` missing or invalid. Lead is still saved.

**Rate limit hit** — visitor sent more than 20 messages/minute. In-memory limiter; resets on server restart. Normal usage won't hit this.

---

## Related

- [Reference: API routes](reference-api.md) — `/api/intake/[slug]/chat` and `/api/intake/[slug]/form` spec
- [Reference: Environment variables](reference-env-vars.md) — SMB-related variables
- [Explanation: Architecture](explanation-architecture.md) — how per-client metering works
