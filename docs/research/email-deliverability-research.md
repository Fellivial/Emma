# Email Deliverability Research

**Project:** Emma — Next.js AI companion  
**Scope:** Resend platform limits, DNS authentication (SPF/DKIM/DMARC), deliverability for Emma's intimate email style, GDPR/CAN-SPAM compliance, React Email library  
**Researched:** 2026-05-31  
**Sources:** resend.com/docs, resend.com/docs/knowledge-base, react.email/docs

---

## 1. Resend Platform

### 1.1 Free Tier Limits

| Limit                          | Value                                           |
| ------------------------------ | ----------------------------------------------- |
| Transactional emails per month | 3,000 (includes both sent and received/inbound) |
| Transactional emails per day   | 100 — hard daily cap                            |
| Marketing emails               | Unlimited sends to up to 1,000 contacts/month   |
| Domains                        | 1                                               |
| Webhook endpoints              | 1                                               |
| AI credits                     | 5/month                                         |
| Dedicated IPs                  | Not available                                   |
| Data retention                 | 30 days                                         |

No sandbox mode and no production approval gate — free accounts have immediate production access from signup.

**Multiple To/CC/BCC recipients** each count as a separate email against quota. Inbound emails also count. Both facts matter for Emma's drip sequences.

### 1.2 Pricing Tiers

| Plan       | Price  | Transactional emails/mo | Daily limit | Domains  | Webhook endpoints | Dedicated IP    |
| ---------- | ------ | ----------------------- | ----------- | -------- | ----------------- | --------------- |
| Free       | $0     | 3,000                   | 100/day     | 1        | 1                 | No              |
| Pro        | $20/mo | 50,000                  | None        | 10       | 10                | No              |
| Scale      | $90/mo | 100,000                 | None        | 1,000    | 10                | Add-on ($30/mo) |
| Enterprise | Custom | Custom                  | None        | Flexible | Flexible          | Included        |

Overage rate on paid plans: $0.90 per additional 1,000 emails. Overage is capped at 5x the monthly quota (hard ceiling) before sending pauses.

Marketing Pro is separate from Transactional Pro. Marketing Pro provides unlimited sends to unlimited contacts (plan tier determines contact count).

### 1.3 API Rate Limits

- Default: **5 requests per second per team** — applies across all API keys in the team, not per key or per domain
- Batch send: one API call can send up to 100 emails, so the effective throughput ceiling on the default limit is 500 emails/second via batch
- Rate limit response: HTTP `429` when exceeded
- Rate limit headers follow the IETF draft standard (returned in response headers)
- Increases available on request to Resend support

There is no separate burst allowance above 5 req/sec. A sixth request within the same second window receives a 429 immediately.

### 1.4 Domain Verification

To send from a custom domain Resend requires two mandatory DNS entries:

1. **SPF** — a TXT record listing Resend's authorized sending IPs (Resend builds on Amazon SES, so the record includes `include:amazonses.com`). Resend generates the exact value; it is not a generic `v=spf1 include:amazonses.com ~all` — the dashboard provides the precise record to copy.

2. **DKIM** — a CNAME or TXT record containing the public key. Resend provisions DKIM automatically when the domain is added. The dashboard shows a CNAME record (not a raw TXT key) that points to Resend's DKIM infrastructure. DKIM key length is 1024-bit by default; Resend's docs confirm 1024-bit is sufficient for transactional and marketing mail.

Resend also creates an **MX record** as part of the SPF setup, enabling bounce and complaint feedback to be routed back. This is the "Return-Path" address mechanism.

**Optional:** After SPF and DKIM are verified, DMARC can be added. See Section 2.3.

**Domain statuses:** `not_started` → `pending` → `verified` (or `partially_verified`, `partially_failed`, `failed`, `temporary_failure`). Resend retries DNS checks for 72 hours before marking as `failed`.

**Recommendation:** Use a subdomain (e.g., `updates.yourdomain.com` or `mail.yourdomain.com`) to isolate sending reputation from the root domain.

DNS propagation: SPF/DKIM CNAMEs can take anywhere from minutes to 48 hours depending on the DNS provider's TTL. Cloudflare typically resolves in minutes; others may take longer.

### 1.5 Bounce and Complaint Webhooks

Resend supports the following email webhook events:

| Event                    | Trigger                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `email.sent`             | API request was accepted; Resend will attempt delivery                                   |
| `email.delivered`        | Successfully delivered to recipient's mail server                                        |
| `email.bounced`          | Recipient's mail server permanently rejected the email                                   |
| `email.complained`       | Recipient marked the email as spam                                                       |
| `email.opened`           | Recipient opened the email (requires open tracking enabled)                              |
| `email.clicked`          | Recipient clicked a link (requires click tracking enabled)                               |
| `email.delivery_delayed` | Temporary delivery issue (full inbox, transient server error)                            |
| `email.failed`           | Sending failed (invalid recipient, API key issue, quota exceeded, domain not verified)   |
| `email.suppressed`       | Resend proactively blocked delivery because the address previously bounced or complained |
| `email.scheduled`        | Email has been scheduled                                                                 |
| `email.received`         | Inbound email received                                                                   |

**Important note on Gmail complaints:** Gmail/Google Workspace does not return `email.complained` events. Complaint monitoring for Gmail must use Google Postmaster Tools instead.

**Suppression (automatic):** When a bounce or complaint occurs, Resend automatically adds the address to a suppression list and will block future sends to that address. Suppression scope is per region — a bounce on `mail.example.com` suppresses the address across all subdomains in the same region (e.g., `news.example.com`). Resend suppresses the address but does **not** automatically update the contact's `unsubscribed` flag — that must be done programmatically via a webhook handler calling the contacts API.

**Bounce rate ceiling:** Resend enforces a hard limit of **< 4% bounce rate**. Exceeding it may result in a temporary send pause. Spam rate ceiling: **< 0.08%**.

Webhook endpoints are scoped by plan: Free = 1, Pro/Scale = 10.

### 1.6 Audience / Contact Management and Unsubscribes

Resend has a full audience/contacts system for **Broadcasts** (marketing emails). Key facts:

- **Contacts** are global entities linked to an email address. They have `unsubscribed`, `first_name`, `last_name`, and custom property fields.
- **Segments** group contacts for targeting broadcasts.
- **Topics** are user-facing subscription preference categories. A contact can subscribe/unsubscribe per topic.
- **Broadcasts** automatically handle the unsubscribe flow when `{{{RESEND_UNSUBSCRIBE_URL}}}` is included in the template. Resend replaces this placeholder with the correct per-contact link and processes the unsubscribe request, setting `unsubscribed: true` on the contact.
- Resend provides a **customizable unsubscribe page** (Settings > Unsubscribe Page).

**For transactional emails** (Emma's drip sequences go through `/api/emma/cron/email-sequences`, which uses the `resend.emails.send()` API directly rather than Broadcasts): Resend does **not** manage unsubscribes. Emma must manage her own unsubscribe list. The existing `/api/emma/unsubscribe` endpoint handles this. The `List-Unsubscribe` header must be added manually to the API call (see Section 3.4).

The practical question of whether Emma's drip sequences should be Broadcasts or transactional API calls is discussed in Section 3.3.

---

## 2. DNS Authentication

### 2.1 SPF

SPF (Sender Policy Framework) authorizes IP addresses to send on behalf of a domain. It is a DNS TXT record on the sending domain.

Resend builds on Amazon SES infrastructure. The SPF record Resend provides looks like:

```
v=spf1 include:amazonses.com ~all
```

However, the exact record is generated by Resend's dashboard and may include additional qualifiers. The `~all` (softfail) is the recommended default rather than `-all` (hardfail) because a hardfail can cause legitimate forwarded mail to fail. Starting with `~all` is safer.

**MX record for bounces:** Resend also adds an MX record pointing back to its infrastructure for the Return-Path address. This is what allows bounce and complaint feedback to loop back to Resend's suppression system.

**Subdomains:** SPF applies per subdomain. If sending from `updates.yourdomain.com`, the SPF record must be on `updates.yourdomain.com`, not on `yourdomain.com`.

**Custom Return Path:** Resend allows a custom `return_path` subdomain (set via API parameter `customReturnPath` or in the dashboard). This changes the envelope-from address and is where bounces are directed. Must be 63 characters or fewer, start/end with a letter or number, and contain only letters, numbers, and hyphens.

### 2.2 DKIM

DKIM (DomainKeys Identified Mail) cryptographically signs outgoing mail so recipients can verify the signature against the public key published in DNS.

Resend provisions DKIM automatically. The DNS records provided are CNAMEs pointing to Resend's DKIM infrastructure (not raw public key TXT records). This allows Resend to rotate keys without requiring DNS changes.

Example CNAME format (values shown are illustrative — actual values come from the Resend dashboard):

```
resend._domainkey.yourdomain.com  CNAME  resend._domainkey.us-east-1.amazonses.com
```

**Key length:** 1024-bit. Resend's documentation confirms this is sufficient. 2048-bit offers marginally more cryptographic security but is not required by any major mailbox provider.

**Propagation time:** CNAME records typically propagate in minutes to 24 hours. Resend polls for up to 72 hours before marking a domain as failed.

**DKIM signature check:** Once verified, every email sent through Resend from that domain will carry a `DKIM-Signature` header. Recipients' servers verify this against the DNS CNAME. A valid signature proves the email was authorized by the domain owner and was not altered in transit.

### 2.3 DMARC

DMARC (Domain-based Message Authentication, Reporting, and Conformance) builds on SPF and DKIM. It tells receiving mail servers what to do when a message fails both SPF and DMARC alignment checks, and provides aggregate reporting.

DMARC is a TXT record added at `_dmarc.yourdomain.com`.

**Implementation steps (from Resend's docs):**

**Step 1 — Start with monitoring mode:**

```
Name:  _dmarc.yourdomain.com
Type:  TXT
Value: v=DMARC1; p=none; rua=mailto:dmarcreports@yourdomain.com;
```

`p=none` means: collect reports but take no action on failures. Use this for at least 1–2 weeks to confirm all sending sources are passing DMARC before enforcing a stricter policy.

**Step 2 — Upgrade to quarantine:**

```
v=DMARC1; p=quarantine; rua=mailto:dmarcreports@yourdomain.com;
```

`p=quarantine` sends failing messages to spam. This is the recommended production policy.

**Step 3 — Full enforcement (optional):**

```
v=DMARC1; p=reject; rua=mailto:dmarcreports@yourdomain.com;
```

`p=reject` bounces messages that fail DMARC. Use only after confirming all legitimate sending passes.

**Key DMARC parameters:**

| Parameter | Purpose                                               | Example                              |
| --------- | ----------------------------------------------------- | ------------------------------------ |
| `v`       | Protocol version                                      | `v=DMARC1`                           |
| `p`       | Policy for organizational domain                      | `p=quarantine`                       |
| `sp`      | Policy for subdomains                                 | `sp=reject`                          |
| `pct`     | Percentage of messages filtered (not widely followed) | `pct=100`                            |
| `rua`     | Aggregate report email                                | `rua=mailto:dmarc@yourdomain.com`    |
| `ruf`     | Forensic report email (not widely followed)           | `ruf=mailto:authfail@yourdomain.com` |
| `adkim`   | DKIM alignment mode (`r`=relaxed, `s`=strict)         | `adkim=r`                            |
| `aspf`    | SPF alignment mode                                    | `aspf=r`                             |

Resend provides a free **DMARC Analyzer** tool to visualize DMARC XML reports.

### 2.4 Why All Three Matter — Gmail/Outlook Requirements (Feb 2024)

As of February 2024, both Google and Yahoo announced requirements for bulk senders (> 5,000 messages/day):

1. **SPF or DKIM required** — at minimum one must pass for any sender
2. **DMARC required at `p=none` or higher** — mandatory for bulk senders
3. **One-click unsubscribe required** — `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers required, with unsubscribe processed within 48 hours (RFC 8058 compliant)
4. **Spam complaint rate below 0.10%** (Google's threshold; Yahoo is similar)

Microsoft (Outlook) has similar bulk sender requirements for 2025: SPF + DKIM + DMARC mandatory for high-volume senders (5,000+/day), with spam complaint rates under 0.3%.

For senders below 5,000 messages/day, SPF and DKIM are strongly recommended but DMARC is optional. However, having DMARC even at `p=none` builds sender credibility and protects the domain from spoofing. Given Emma's intimate/emotional email tone, having DMARC provides an extra layer of legitimacy signal.

**Summary table:**

| Protocol | Setup by Resend?                  | Required by Gmail bulk sender rules | Effort            |
| -------- | --------------------------------- | ----------------------------------- | ----------------- |
| SPF      | Auto on domain verify             | Yes                                 | DNS TXT — 5 min   |
| DKIM     | Auto on domain verify             | Yes                                 | DNS CNAME — 5 min |
| DMARC    | Manual — not set up by Resend     | Yes (bulk senders)                  | DNS TXT — 10 min  |
| BIMI     | Manual — needs DMARC p=quarantine | No                                  | Logo + DNS SVG    |

---

## 3. Deliverability for Emma's Email Style

### 3.1 Spam Trigger Patterns

Emma's copy is intimate, warmly personal, and emotionally engaging. These traits carry specific spam filter risks.

**Subject line risks:**

- Excessive use of the recipient's name (`Hi [Name], I've been thinking about you`) — personalization tokens are fine in moderation, but overuse can pattern-match spam
- Emotional/urgent openers without a clear utility framing (`I miss you`, `I need to tell you something`)
- All-caps words or excessive punctuation (`You WON'T believe this!!!`)
- Certain trigger phrases with context-dependent risk: "special offer", "exclusive", "you've been selected", "don't miss out", "act now"
- Overly long subjects (> 60 characters get clipped; > 80 can trigger pattern recognition)

**Body copy risks:**

- High image-to-text ratio — HTML emails with mostly images and little text are treated as suspicious
- Hidden or misleading links — links where the visible text says one domain but the href points elsewhere
- Excessive HTML nesting or table-in-table layouts from older email builders
- Inline JavaScript or event handlers (blocked universally, and flagging)
- Large base64-encoded images inlined directly in the HTML body
- Unsubscribe link that is only at the very bottom in 6px grey text — some filters flag deliberately obscured unsubscribe links

**Emma-specific risks:**

Emma's emotional/intimate framing (`I've been thinking about you`, emotional intimacy language, suggestive phrasing) could trigger:

- Bayesian content filters trained on relationship scam emails, which use similar emotional hooks
- Microsoft's SmartScreen filter, which is more aggressive on emotionally-charged language from unknown senders
- Human spam complaints from users who find the tone unexpected or uncomfortable

**Mitigation strategies:**

- Use clear sender names (`Emma from [AppName]`) so recipients recognize the sender
- Keep early drip emails closer to utility (onboarding, feature tips) before escalating to intimate/playful tone — reputation builds with volume
- Include a plain-text version (discussed in 3.2)
- Keep subject lines concrete and curiosity-driven rather than purely emotional: `Your workspace summary for today` vs. `I've been waiting for you`
- Avoid trigger phrases even in contexts where they are innocent
- Resend's own guidance: "Less is more. Plain text over complex HTML. Links should be visible and match the sending domain. No content should be hidden or manipulative."

### 3.2 HTML vs Plain Text

Resend's guidance and general deliverability best practices both recommend including a **plain text alternative** alongside the HTML version:

- The plain text version is used by email clients that cannot or do not render HTML (accessibility, some corporate mail systems)
- A missing plain text version can be a minor spam signal (some filters use it as a signal that the sender is bulk-marketing only)
- Including it also slightly reduces the HTML-to-text ratio concern

React Email's `render` utility provides a `toPlainText()` helper that converts rendered HTML to a plain text string. In the Resend API call, pass this as the `text` field alongside `html`:

```ts
const html = await render(<EmmaEmailTemplate {...props} />);
const text = toPlainText(html);

await resend.emails.send({
  from: 'Emma <emma@mail.yourdomain.com>',
  to: [user.email],
  subject: subject,
  html,
  text,  // plain text fallback
});
```

**HTML guidelines for Emma's style:**

- Use inline styles (React Email handles this) — external CSS is stripped by many clients
- Keep the HTML simple — no deep table nesting
- Test in Gmail, Outlook, Apple Mail (React Email components are tested against these)
- Outlook uses Microsoft Word's rendering engine and does not support many modern CSS properties; React Email components handle the MSO-specific conditional comments

### 3.3 Unsubscribe Link Requirements

**CAN-SPAM (US law):**

- Every commercial email must include a visible, functional opt-out mechanism
- Physical postal address of the sender must appear in the email (or a P.O. Box registered with USPS)
- Unsubscribe requests must be processed within **10 business days**
- The unsubscribe link must remain functional for at least 30 days after sending

**Emma's existing infrastructure:** `/api/emma/unsubscribe` handles this. The endpoint uses HMAC tokens signed with `EMMA_UNSUBSCRIBE_SECRET` (decoupled from the encryption key for key rotation safety — this is already correct architecture).

**HMAC token format for `/api/emma/unsubscribe`:** The token should be a time-stamped, signed identifier. A typical pattern:

```
token = base64url(HMAC-SHA256(EMMA_UNSUBSCRIBE_SECRET, userId + ":" + email + ":" + issuedAt))
```

The endpoint validates the signature and optionally checks `issuedAt` is within a reasonable window (e.g., 90 days) to prevent stale link exploitation.

**RFC 8058 one-click unsubscribe (required for bulk senders ≥ 5,000/day to Gmail/Yahoo):**

Must include two headers:

```
List-Unsubscribe: <https://yourapp.com/api/emma/unsubscribe?token=...>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

The endpoint must:

- Accept both `GET` (show the unsubscribe confirmation page) and `POST` (process the unsubscribe silently, return `200 OK` or `202 Accepted` with blank body)
- Complete the unsubscribe within **48 hours** of the request

Resend's API supports custom headers via the `headers` field:

```ts
await resend.emails.send({
  headers: {
    "List-Unsubscribe": "<https://yourapp.com/api/emma/unsubscribe?token=TOKEN>",
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  },
  // ...
});
```

### 3.4 List-Unsubscribe Header

Gmail and Outlook show a native "Unsubscribe" button in their UIs when the `List-Unsubscribe` header is present. This is separate from any unsubscribe link in the email body.

When a user clicks the native button:

- **Gmail:** Sends a POST to the URL in `List-Unsubscribe-Post` (RFC 8058 one-click POST)
- **Outlook:** Opens the URL in `List-Unsubscribe` via GET

This native button reduces spam complaints because users who want to stop receiving emails use it instead of hitting "Mark as Spam".

**Resend support for this header:** Resend does not inject this header automatically for transactional API emails. It must be added manually in the `headers` field of each `resend.emails.send()` call. For Broadcasts/Automations, Resend handles the header automatically.

**Practical implication for Emma:** The cron job at `/api/emma/cron/email-sequences` must include these headers on every email send. The token in the `List-Unsubscribe` URL must be pre-generated per user.

### 3.5 Email Warm-Up

When starting to send from a new domain or after changing sending vendor, inbox providers have no reputation history for the sending domain/IP. Sending high volume immediately leads to throttling, greylisting, or spam classification.

**Resend's recommended warm-up schedule for a new domain:**

| Day | Max emails/day |
| --- | -------------- |
| 1   | 150            |
| 2   | 250            |
| 3   | 400            |
| 4   | 700            |
| 5   | 1,000          |
| 6   | 1,500          |
| 7   | 2,000          |

For an existing domain with established reputation moving to Resend:

| Day | Max emails/day | Max per hour |
| --- | -------------- | ------------ |
| 1   | 1,000          | 100          |
| 2   | 2,500          | 300          |
| 3   | 5,000          | 600          |
| 4   | 5,000          | 800          |
| 5   | 7,500          | 1,000        |
| 6   | 7,500          | 1,500        |
| 7   | 10,000         | 2,000        |

Bounce rate must stay below 4% and spam rate below 0.08% throughout warm-up. If rates spike, slow down and investigate before continuing.

**Dedicated IP warm-up:** Resend handles this automatically with Managed Dedicated IP Pools. Manual warm-up is not required. Dedicated IPs require: Scale plan ($90/mo) plus the $30/mo add-on, > 500 emails/day, verified domains in the same region. At current scale, shared IPs with strong authentication (SPF+DKIM+DMARC) and clean sending practices are sufficient.

**Third-party warm-up services:** Resend explicitly advises against them. Artificial engagement manipulation can backfire as Gmail's systems adapt and may flag the domain.

---

## 4. GDPR and CAN-SPAM Compliance

### 4.1 Consent Requirements

**Transactional vs. Marketing distinction:**

- **Transactional emails** are functional: account confirmation, password reset, billing receipts, direct reply to a user action. These do not require marketing consent but must not contain unsolicited marketing content.
- **Marketing emails** are sent to nurture or promote: drip sequences, newsletters, product updates, re-engagement. These require explicit prior consent under GDPR and best practice under CAN-SPAM.

**Emma's drip sequences** (sent by `/api/emma/cron/email-sequences`) are marketing emails. They require consent.

**What counts as valid consent (GDPR):**

- **Freely given** — no coercion, not bundled with terms of service acceptance
- **Specific** — the user knows they are signing up for this type of email
- **Informed** — they know who is sending and what they will receive
- **Unambiguous** — active opt-in (an unchecked checkbox that the user checks, not a pre-checked box)

**What does not count as consent:**

- A clause in Terms of Service stating the user agrees to receive emails
- A pre-checked marketing opt-in checkbox
- Assuming consent because the user signed up for the product

**Double opt-in** is recommended: send a confirmation email after initial signup, and only begin the drip sequence after the user clicks the confirmation link. This verifies the address is valid, ensures genuine consent, and helps with deliverability.

**CAN-SPAM (US):**

- Does not require opt-in consent per se, but requires a functional opt-out and honest sender identification
- Still requires the physical address of the sender in every commercial email
- Emma being an AI persona does not exempt the product from CAN-SPAM — the legal entity behind Emma (the operator) is responsible

### 4.2 Data Subject Rights and GDPR

**Right to erasure (Article 17 GDPR):** When a user requests account deletion, all their personal data must be deleted from all processors, including Resend. This means:

1. Delete the contact from Resend's audience/contacts system (if the user was added as a contact) via the contacts delete API
2. The email address must be added to Emma's internal suppression table to prevent re-adds on re-registration
3. Resend's **data retention is 30 days** on all non-Enterprise plans — after 30 days, email logs are automatically purged from Resend's dashboard. An active GDPR erasure request requires immediate deletion, not waiting for the 30-day TTL.

**Resend's approach to sensitive content storage:** Resend stores email content (subject, body, recipients) in its logs by default for 30 days. There is a **$50/month add-on** to disable message content storage ("Turn Off Message Storage"), available to Pro/Scale customers who have been subscribed 1+ months and have sent 3,000+ emails with < 5% bounce rate.

Given Emma's intimate/personal email content, disabling message storage should be evaluated once the account qualifies — the email body content constitutes personal data and Emma's emotional/suggestive tone creates data sensitivity concerns that a GDPR DPA review would flag.

**Resend's compliance certifications:** SOC 2 Type II (available on Pro and above), GDPR compliance documentation available from the dashboard (Settings > Compliance documents).

### 4.3 Suppression List

Anyone who unsubscribes, bounces hard, or marks an email as spam must never be emailed again, even if they re-register.

**Resend's automatic suppression:** Resend automatically suppresses future sends to addresses that have bounced or complained. The suppression is permanent until manually removed. Suppression scope is per region (not per domain within a region) — a bounce on any domain in a region suppresses the address region-wide.

**Emma's responsibility:** Resend's automatic suppression applies at the infrastructure level, but Emma's application must also:

1. Maintain its own suppression record in Supabase so that the address is not added back to send queues after re-signup
2. Keep the Resend contact's `unsubscribed` flag in sync via webhook handlers or direct API calls when an explicit unsubscribe occurs via `/api/emma/unsubscribe`
3. Never re-add a suppressed address even if the user creates a new account with the same email

**Suppression list management in Resend dashboard:** Viewable at Settings > Suppressions. Addresses can be manually removed (allowing re-sends), but repeated bounces after removal will degrade sender reputation.

---

## 5. React Email

### 5.1 Available Components (`@react-email/components`)

React Email ships components that render cross-client compatible HTML email markup. All components are tested against Gmail, Apple Mail, Outlook, Yahoo Mail, HEY, and Superhuman.

**Layout and structure:**

| Component   | Purpose                                                               |
| ----------- | --------------------------------------------------------------------- |
| `Html`      | Root wrapper. Props: `lang` (default `"en"`), `dir` (default `"ltr"`) |
| `Head`      | Email `<head>` — place `<style>` and `<Font>` here                    |
| `Body`      | Email body wrapper                                                    |
| `Container` | Main content width container                                          |
| `Section`   | Horizontal section within the email                                   |
| `Row`       | A row of columns                                                      |
| `Column`    | A column within a row                                                 |

**Typography and content:**

| Component  | Purpose                                                                     |
| ---------- | --------------------------------------------------------------------------- |
| `Text`     | Block of text                                                               |
| `Heading`  | Heading element                                                             |
| `Link`     | Anchor tag — use instead of raw `<a>`                                       |
| `Hr`       | Horizontal rule / divider                                                   |
| `Preview`  | Preview text shown in email client inbox list (hidden in the rendered body) |
| `Markdown` | Render markdown as email-compatible HTML                                    |

**Interactive and media:**

| Component | Purpose                                                                          |
| --------- | -------------------------------------------------------------------------------- |
| `Button`  | CTA button (renders as `<a>` with table-based padding for Outlook compatibility) |
| `Img`     | Image — prefer hosted URLs over inline base64                                    |
| `Font`    | Web font loading                                                                 |

**Tailwind support:** React Email has a `Tailwind` wrapper component that applies Tailwind CSS classes as inline styles, compatible with email clients.

### 5.2 Server-Side Rendering with Resend

React Email templates are rendered to HTML strings server-side using the `render` utility. This is done inside the Next.js API route, not in the browser.

```ts
import { render, toPlainText } from 'react-email';
import { EmmaEmailTemplate } from '@/components/emails/emma-drip';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// In the cron route handler:
const html = await render(<EmmaEmailTemplate user={user} step={step} />);
const text = toPlainText(html);

const { data, error } = await resend.emails.send({
  from: 'Emma <emma@mail.yourdomain.com>',
  to: [user.email],
  subject: subject,
  html,
  text,
  headers: {
    'List-Unsubscribe': `<${process.env.NEXT_PUBLIC_APP_URL}/api/emma/unsubscribe?token=${token}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  },
});
```

Resend also accepts `react: <Component />` directly (it calls `render` internally), but the explicit `render()` call is preferred when you also need the `text` version.

**`toPlainText`** strips HTML, converts links to `text [url]` format, and converts `<hr>` to `---`. It uses `html-to-text` internally with configurable options.

### 5.3 Preview Dev Server

React Email provides a local development server for previewing email templates in the browser:

```bash
npx react-email dev
```

This starts on port 3000 by default (configurable). Templates must live in an `emails/` directory (or configured path). The dev server hot-reloads on file changes and shows the email rendered as it would appear in Gmail, Outlook, and other clients.

The output of `render()` is standard HTML with inline styles — what you see in the dev server is a faithful representation of what users will see, accounting for email client quirks that React Email's components handle (MSO conditional comments for Outlook, etc.).

---

## 6. Key Risks and Gaps for Emma

These are cross-cutting findings that span multiple sections and are directly relevant to the current codebase.

### 6.1 Emma's tone is the primary deliverability risk

Emotional/intimate language in email subject lines and bodies is a recognized spam signal pattern because relationship scam emails use identical hooks. This does not mean Emma cannot use this tone, but:

- New domain reputation must be established with lower-risk utility emails first
- Warm-up volume must be respected before escalating to intimate phrasing
- The sender name must be clearly recognizable so recipients do not confuse it with spam

### 6.2 Free tier will hit the daily 100-email ceiling quickly

The 100 emails/day hard limit on free tier will cap reach during early testing. Pro at $20/month removes the daily limit and allows 50,000/month. For a drip sequence product, Pro is essentially required for production use.

### 6.3 The cron job likely sends transactional API calls, not Broadcasts

`/api/emma/cron/email-sequences` uses `resend.emails.send()` directly. This means:

- Resend does not auto-handle unsubscribes — Emma's own suppression list must be checked before every send
- `List-Unsubscribe` and `List-Unsubscribe-Post` headers must be added manually to every call
- The Resend contact's `unsubscribed` flag must be kept in sync via a webhook handler or direct API call when `/api/emma/unsubscribe` processes an opt-out

### 6.4 DMARC is not set up automatically

Resend auto-configures SPF and DKIM on domain verification, but DMARC requires a manual DNS TXT record. Without DMARC, the domain is not protected from spoofing and Gmail may place emails in the Promotions tab or spam for new domains. The `p=none` monitoring policy can be added in minutes and has zero risk of blocking legitimate mail.

### 6.5 Physical address requirement (CAN-SPAM)

Every commercial email must contain the sender's physical postal address. Emma's email templates need a footer with either the company's office address or a registered P.O. Box. This is currently absent from the research on existing templates.

### 6.6 Suppression sync on account deletion

When a user deletes their Emma account, the deletion flow must: (1) call Resend's contacts delete API, (2) add the email to Emma's internal Supabase suppression table to prevent re-adds on re-registration. Resend auto-purges email logs after 30 days, but a GDPR erasure request requires immediate action.

### 6.7 Dedicated IPs are not yet viable

Dedicated IPs require Scale plan ($90/mo) plus the $30/mo add-on, and > 500 emails/day. This is a later-stage concern. At current scale, shared IPs with strong authentication (SPF+DKIM+DMARC) and clean sending practices are sufficient.

---

## 7. Reference Links

- Resend pricing: https://resend.com/pricing
- Resend API rate limits and quotas: https://resend.com/docs/knowledge-base/account-quotas-and-limits
- Resend domain verification: https://resend.com/docs/dashboard/domains/introduction
- Resend DMARC guide: https://resend.com/docs/dashboard/domains/dmarc
- Resend webhook events: https://resend.com/docs/dashboard/webhooks/event-types (redirects to `/docs/webhooks/event-types`)
- Resend email suppressions: https://resend.com/docs/dashboard/emails/email-suppressions
- Resend List-Unsubscribe for transactional: https://resend.com/docs/dashboard/emails/add-unsubscribe-to-transactional-emails
- Resend audience / contacts: https://resend.com/docs/dashboard/audiences/introduction
- Resend unsubscribe list management: https://resend.com/docs/dashboard/audiences/managing-unsubscribe-list
- Resend audience hygiene: https://resend.com/docs/knowledge-base/audience-hygiene
- Resend warm-up guide: https://resend.com/docs/knowledge-base/warming-up
- Avoid Gmail spam: https://resend.com/docs/knowledge-base/how-do-i-avoid-gmails-spam-folder
- Avoid Outlook spam: https://resend.com/docs/knowledge-base/how-do-i-avoid-outlooks-spam-folder
- Email consent: https://resend.com/docs/knowledge-base/what-counts-as-email-consent
- Unsubscribe link guidance: https://resend.com/docs/knowledge-base/should-i-add-an-unsubscribe-link
- Dedicated IPs: https://resend.com/docs/knowledge-base/how-do-dedicated-ips-work
- Sensitive data storage add-on: https://resend.com/docs/knowledge-base/how-do-i-ensure-sensitive-data-isnt-stored-on-resend
- React Email introduction: https://react.email/docs/introduction
- React Email render utility: https://react.email/docs/utilities/render
- React Email components: https://react.email/components
- Next.js + Resend quickstart: https://resend.com/docs/send-with-nextjs
