# WhatsApp Inbound Loop Research

**Date:** 2026-05-31
**Scope:** How Emma sends replies back to WhatsApp users, conversation threading, the 24-hour session window, webhook security, and rate limits/costs. Research only — no implementation.

---

## 1. Sending Messages: The WhatsApp Cloud API

### 1.1 Endpoint

```
POST https://graph.facebook.com/v23.0/{PHONE_NUMBER_ID}/messages
```

`{PHONE_NUMBER_ID}` is the business phone number ID — Emma already has this as `WHATSAPP_PHONE_NUMBER_ID`. The version (`v23.0`) should be pinned to the latest stable version in the implementation; Meta deprecates older versions.

### 1.2 Required Headers

| Header          | Value                            |
| --------------- | -------------------------------- |
| `Authorization` | `Bearer {WHATSAPP_ACCESS_TOKEN}` |
| `Content-Type`  | `application/json`               |

### 1.3 Sending a Plain Text Reply

```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "{user_wa_id}",
  "type": "text",
  "text": {
    "body": "Emma's response here"
  }
}
```

`recipient_type` defaults to `"individual"` and can be omitted, but is explicit best practice. The `to` field takes the user's WhatsApp phone number (E.164 format, e.g. `+628123456789` or just `628123456789`) — this is the `from` field from the inbound webhook payload.

### 1.4 Sending a Reply In-Thread (Contextual Reply)

To quote the user's specific message (shows as a bubble inside their chat):

```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "{user_wa_id}",
  "type": "text",
  "context": {
    "message_id": "{wamid}"
  },
  "text": {
    "body": "Emma's response here"
  }
}
```

The `context.message_id` value is the `wamid` of the message being replied to — extracted from `entry[0].changes[0].value.messages[0].id` in the inbound webhook payload. This is optional but improves UX in multi-message threads.

### 1.5 Response Format

A successful 200 response returns:

```json
{
  "messaging_product": "whatsapp",
  "contacts": [
    {
      "input": "628123456789",
      "wa_id": "628123456789"
    }
  ],
  "messages": [
    {
      "id": "wamid.HBgL...",
      "message_status": "accepted"
    }
  ]
}
```

`message_status` values: `accepted` (processing started), `held_for_quality_assessment` (under Meta review), `paused` (delivery suspended due to quality issues). The returned `id` is the wamid of Emma's outbound message — store this for reply threading and audit.

---

## 2. Authentication: Access Token Types

Emma uses `WHATSAPP_ACCESS_TOKEN`. There are two distinct token types:

### 2.1 Temporary User Access Token

- Generated automatically in Meta for Developers App Dashboard under WhatsApp > API Setup
- **Expires in under 24 hours**
- Only appropriate for initial testing and development
- Never use this in production

### 2.2 System User Access Token (Production)

- Created through Meta Business Manager > Business Settings > System Users
- Represents the app or business, not a human user
- Configurable expiration: can be set to "never expire" (no rotation required) or a fixed window
- The recommended production credential
- Requires the `whatsapp_business_messaging` permission assigned to the system user

**How to generate:**

1. Meta Business Manager > Business Settings > System Users
2. Add or select a system user
3. Assign the system user to your WhatsApp Business Account with full access
4. Click "Generate New Token", select your app, set expiration to "Never", assign `whatsapp_business_messaging` and `whatsapp_business_management` permissions
5. Copy the token — it is shown only once

**Security guidance from Meta:** Never embed access tokens in client-side code. Store in cloud secret management (AWS Secrets Manager, GCP Secret Manager) or environment variables. The current `WHATSAPP_ACCESS_TOKEN` env var approach is correct for server-side use.

### 2.3 Token Refresh

System user tokens with "never expire" setting do not need rotation. If a fixed expiration was chosen, tokens must be regenerated manually through Business Manager — there is no programmatic OAuth refresh flow for WhatsApp system user tokens. If expiry is needed for compliance, set a calendar reminder and regenerate before expiry.

---

## 3. The 24-Hour Conversation Window

### 3.1 What It Is

WhatsApp enforces a **24-hour customer service window**. When a user sends a message to a business:

- A 24-hour window opens
- The business can send any free-form message (text, image, video, document) within this window
- **Each new message from the user resets the 24-hour clock**
- When 24 hours pass without a user message, the window closes
- After window close, the business **cannot send free-form messages** — only pre-approved Message Templates

This rule exists to prevent businesses from spamming users who made one-off contact.

### 3.2 Service Conversations (Within the Window)

Messages sent within the open window are called **Service conversations**. As of November 2024 these are completely free and unlimited — Meta removed the previous 1,000/month cap. This is the pricing category that applies to Emma's primary use case (responding to a user who just messaged).

### 3.3 What Happens After the Window Closes

If Emma needs to send a proactive message or a task result after 24+ hours of user silence, it must use a **Message Template** from a pre-approved category. Attempting to send a free-form message to a closed window returns an API error.

**Key implication for Emma:** If an autonomous task (e.g., a background agent job) completes after 24 hours of user inactivity, Emma cannot send the result as a plain text message. It must use a template.

---

## 4. Message Templates

### 4.1 Categories

Templates are grouped into three categories that determine approval criteria and cost:

| Category           | Purpose                                             | Example uses                                                                           | Cost (US)      |
| ------------------ | --------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------- |
| **Utility**        | Transactional, operational updates the user expects | Task completion, order confirmation, appointment reminder, opt-in/opt-out confirmation | $0.004/message |
| **Marketing**      | Promotional, engagement, or non-essential content   | Promotions, product announcements, re-engagement                                       | $0.025/message |
| **Authentication** | OTP and verification codes only                     | Login codes, two-factor auth                                                           | $0.004/message |

Utility and authentication templates sent **within** an already-open 24-hour window are also free. Marketing templates are always charged regardless of window state.

**Important as of April 2025:** Meta auto-corrects category submissions. If you submit a template as Utility but Meta determines it is Marketing, it is approved as Marketing (with Marketing pricing). You have 60 days to contest.

### 4.2 Creating and Submitting a Template for Approval

1. Go to Meta Business Suite > WhatsApp Manager > Message Templates > Create Template
2. Choose category (Utility, Marketing, or Authentication)
3. Write the template body — use `{{1}}`, `{{2}}` etc. for dynamic variables
4. Add examples for each variable (required — Meta uses these to judge content)
5. Submit for review

Review time: typically 30 minutes to 24 hours. Templates can be approved, rejected, or auto-recategorized.

**Rejection reasons:** misleading content, requesting sensitive info, content that mimics system messages, policy violations.

### 4.3 Recommended Template for Emma

For the autonomous task completion case, a **Utility** template is appropriate. An example to create and submit for approval:

**Template name:** `emma_task_complete`
**Category:** Utility
**Body:**

```
Hi! Emma has finished working on your request: "{{1}}". Here's what was done: {{2}}

Reply to continue the conversation.
```

This is transactional (user-initiated task, Emma completing it) which fits Utility. Marketing would not be appropriate since Emma is not promoting anything.

### 4.4 Sending a Template Message via API

```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "{user_wa_id}",
  "type": "template",
  "template": {
    "name": "emma_task_complete",
    "language": {
      "code": "en_US"
    },
    "components": [
      {
        "type": "body",
        "parameters": [
          {
            "type": "text",
            "text": "Research the Q3 market report"
          },
          {
            "type": "text",
            "text": "Summarized 5 sources and saved to your memory."
          }
        ]
      }
    ]
  }
}
```

Same endpoint as text messages: `POST https://graph.facebook.com/v23.0/{PHONE_NUMBER_ID}/messages`. Same `Authorization: Bearer` header.

The `language.code` must match the language the template was submitted in. If users may be in different locales, multiple language variants of the same template must be submitted separately.

---

## 5. Conversation Threading

### 5.1 `wa_id` — User Identifier

`wa_id` is the user's WhatsApp phone number in E.164 format without the `+` prefix (e.g., `628123456789`). It is the stable identifier for a WhatsApp user and should be used as the conversation key in the `ingested_whatsapp` table and any conversation history store.

In the inbound webhook payload, `wa_id` is found at:

```
entry[0].changes[0].value.contacts[0].wa_id
```

The `from` field in `messages[0].from` is the same value — they are interchangeable, but `wa_id` from the `contacts` array is the canonical form.

### 5.2 `wamid` — Message Identifier

`wamid` (WhatsApp Message ID) is a unique identifier for each message. Format: `wamid.HBgLNjI4...` (base64-like string prefixed with `wamid.`).

In the inbound webhook: `entry[0].changes[0].value.messages[0].id`

Uses:

- Pass as `context.message_id` in the send body to display Emma's reply as a quoted response
- Use as the deduplication key for idempotency (see Section 6.3)
- Store in the database as `message_id` — Emma's current ingest route already does this via `upsert` on `message_id`

### 5.3 Full Inbound Webhook Payload Structure

```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "<WABA_ID>",
      "changes": [
        {
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "<BUSINESS_DISPLAY_PHONE_NUMBER>",
              "phone_number_id": "<BUSINESS_PHONE_NUMBER_ID>"
            },
            "contacts": [
              {
                "profile": {
                  "name": "<USER_DISPLAY_NAME>"
                },
                "wa_id": "<USER_WA_ID>"
              }
            ],
            "messages": [
              {
                "from": "<USER_WA_ID>",
                "id": "wamid.HBgL...",
                "timestamp": "1700000000",
                "type": "text",
                "text": {
                  "body": "Hello Emma, can you help me with..."
                }
              }
            ]
          },
          "field": "messages"
        }
      ]
    }
  ]
}
```

Status update webhooks (delivery receipts) have a `statuses` array instead of `messages` — the ingest handler should check for `messages` presence before processing.

### 5.4 Conversation History for Emma's Context

Emma currently stores inbound messages in `ingested_whatsapp` keyed by `message_id` with `from_number`. To give Emma context across a multi-turn WhatsApp conversation, the response handler would need to:

1. On each inbound message, query `ingested_whatsapp` for the last N rows where `from_number = wa_id` ordered by `received_at DESC`
2. Format as a conversation history array (role: user / assistant pairs)
3. Pass to the Emma brain along with the new message

Currently the table stores only inbound messages. Outbound messages (Emma's replies) are not stored back, so the history is one-sided. A complete implementation would also write Emma's outbound message and the returned wamid to the same table (or a linked table) after each send.

**Recommended schema additions for full threading:**

- `direction` column: `"inbound"` or `"outbound"`
- `wamid` for outbound messages (from the send API response)
- `window_expires_at` to track when the 24h window closes (set to `received_at + 24h` on each inbound row, reset on each new inbound)

---

## 6. Webhook Security

### 6.1 GET Verification Handshake

When a webhook URL is registered in Meta's App Dashboard, Meta sends a one-time GET request:

```
GET /api/emma/ingest/whatsapp?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=RANDOM_STRING
```

Emma's endpoint must:

1. Check `hub.mode === "subscribe"`
2. Check `hub.verify_token === WHATSAPP_VERIFY_TOKEN` (env var)
3. Respond with `hub.challenge` as the plain-text body and HTTP 200

Emma's current implementation in `route.ts` already handles this correctly.

### 6.2 HMAC Signature Validation

Every POST webhook from Meta includes:

```
X-Hub-Signature-256: sha256={HMAC_HEX}
```

The HMAC is computed as `HMAC-SHA256(raw_request_body, WHATSAPP_APP_SECRET)`.

Emma's current implementation already does this correctly:

- Reads raw body via `req.text()` before JSON parsing
- Strips `sha256=` prefix from header
- Computes `HMAC-SHA256(body, WHATSAPP_APP_SECRET)` using `crypto.createHmac`
- Compares with `crypto.timingSafeEqual` (timing-safe, prevents timing attacks)

**Critical:** The raw body must be read before any JSON parsing middleware that might transform or re-serialize it — changing even whitespace would invalidate the signature. Emma's current approach of calling `req.text()` first is correct.

### 6.3 Idempotency / Deduplication

Meta delivers webhook notifications **at-least-once** — the same event may arrive multiple times (network retries, etc.). Emma already handles this: the `ingested_whatsapp` upsert uses `onConflict: "message_id"`, so duplicate deliveries of the same `wamid` are no-ops at the DB level.

The response handler (when built) must also be idempotent — if a wamid has already been replied to, don't send a second reply. This can be tracked by a `replied_at` timestamp or `outbound_wamid` column in `ingested_whatsapp`.

---

## 7. End-to-End Architecture for Emma's WhatsApp Reply Loop

The complete flow, from user message to Emma's reply:

```
1. User sends WhatsApp message
       |
2. Meta webhook POST → /api/emma/ingest/whatsapp?client_id={uuid}
       |
3. Verify X-Hub-Signature-256 (WHATSAPP_APP_SECRET)     <- already implemented
       |
4. Parse payload, extract wa_id, wamid, message text    <- already implemented
       |
5. Deduplicate: upsert on message_id                    <- already implemented
       |
6. [NEW] Load conversation history: last N rows from ingested_whatsapp
         WHERE from_number = wa_id ORDER BY received_at DESC LIMIT 20
       |
7. [NEW] Check 24-hour window: is there a user message in last 24h?
         Yes → can use free-form text reply
         No  → must use pre-approved Utility template
       |
8. [NEW] Call Emma brain with WA conversation history as context
       |
9. [NEW] Send response via WhatsApp Cloud API:
         POST https://graph.facebook.com/v23.0/{PHONE_NUMBER_ID}/messages
         Authorization: Bearer {WHATSAPP_ACCESS_TOKEN}
         Body: free-form text OR template (based on step 7)
       |
10. [NEW] Store outbound message + returned wamid to ingested_whatsapp
          (direction: outbound, wamid: response wamid)
       |
11. Return 200 to Meta (always, even on internal errors)
```

**Step 11 is important:** Emma's ingest route should always return 200 to Meta, even if internal processing fails. On non-200, Meta will retry the webhook multiple times, potentially causing duplicate processing. Internal errors should be logged separately.

---

## 8. Rate Limits

### 8.1 Business-Level Throughput

The default Cloud API throughput is **80 messages per second (MPS)** per phone number. This can be upgraded to 1,000 MPS automatically when:

- The business portfolio has an unlimited messaging tier
- 100,000+ messages sent in 24 hours
- Quality score remains high

For Emma's use case (AI companion responding to individual users), 80 MPS is effectively unlimited — no realistic user or small portfolio will approach this.

### 8.2 Daily Messaging Volume (Tier System)

New portfolios without completed business verification start at **Tier 0: 250 messages/24h**. After Meta Business Verification:

| Tier   | Unique customers per 24h |
| ------ | ------------------------ |
| Tier 1 | 1,000                    |
| Tier 2 | 10,000                   |
| Tier 3 | 100,000                  |
| Tier 4 | Unlimited                |

As of October 2025 these limits apply per Business Portfolio, not per phone number. All numbers under the same Business Manager share the highest tier among them.

### 8.3 Pair Rate Limiting

A per-recipient rate limit exists (undocumented exact value) to prevent spamming a single user. Meta returns error code `131056` when hit. Practical guidance: do not send more than one message per few seconds to the same `wa_id`. For Emma (one response per user message), this is not a concern.

---

## 9. Pricing

**Pricing model as of July 1, 2025:** Meta switched from per-conversation (24-hour window) to **per-message** billing. Every delivered template message is billed individually.

### 9.1 Service Messages (Free)

Free-form messages sent within an open 24-hour window = **Service conversations** = **free and unlimited** (cap removed November 2024). This covers Emma's primary reply flow — as long as Emma is responding within 24 hours of the last user message, it costs nothing.

### 9.2 Template Message Costs (Per-Message, Post July 2025)

| Category       | United States | India    | Indonesia |
| -------------- | ------------- | -------- | --------- |
| Utility        | $0.004        | ~$0.0014 | ~$0.022   |
| Marketing      | $0.025        | ~$0.0094 | ~$0.036   |
| Authentication | $0.004        | ~$0.0014 | ~$0.022   |
| Service        | Free          | Free     | Free      |

Note: Utility templates sent **within** an open 24-hour window are also **free** even post-July 2025. The charge only applies to templates sent outside the window (business-initiated session).

### 9.3 Click-to-WhatsApp Ad Entry Point

If a user contacts Emma via a click-to-WhatsApp ad or Facebook Page CTA button, all messages including templates are **free for 72 hours** (extended window). Not relevant to Emma's current architecture but worth noting if ads are ever used.

### 9.4 Cost Projection

For Emma's use case (AI companion, responsive within 24h), the expected cost is effectively $0 per message — the free Service conversation tier covers all normal interactions. Template costs only apply to proactive out-of-window sends. At $0.004 per Utility template send, 10,000 out-of-window task completions per month = $40.

---

## 10. Key Open Questions for Implementation

These are unresolved decisions that the engineer implementing this feature will need to answer:

1. **Where does the reply logic live?** The current ingest route returns 200 immediately after storing. Should replies happen synchronously in the webhook handler (adding latency to the Meta response) or via a background job queue?

2. **Which Emma brain call?** The brain route (`/api/emma`) is tied to the web app's SSE streaming. A WhatsApp reply handler needs a non-streaming, JSON-response brain call. The existing `POST /api/emma/agent` route may be more appropriate, or a new headless route is needed.

3. **Conversation history depth?** How many prior messages to load as context — too few loses thread continuity, too many blooms the system prompt. 10-20 messages is a typical starting point.

4. **Multi-client routing:** The ingest URL accepts `client_id`. The reply sender needs to know which `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_ACCESS_TOKEN` to use. Currently Emma has one set of env vars for one phone number. Multi-tenant (per-client phone numbers) would require moving these credentials to the `clients` table.

5. **Template pre-creation:** The `emma_task_complete` template (or equivalent) must be created and approved in Meta Business Manager before any out-of-window sends can work. Approval can take up to 24 hours.

6. **Language handling:** If Emma serves Indonesian users (likely given the pricing research focus on Indonesia), a Bahasa Indonesia variant of all templates must be submitted separately.

---

## Sources

- [Meta: Messages API Reference](https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages/)
- [Meta: Messaging Guide (Send Messages)](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages/)
- [Meta: WhatsApp Message API](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/message-api)
- [Meta: Pricing on WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)
- [Meta: Template Categorization](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization)
- [Meta: Auth Tokens Blog Post](https://developers.facebook.com/blog/post/2022/12/05/auth-tokens/)
- [Meta: Access Tokens Documentation](https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens/)
- [Hookdeck: Guide to WhatsApp Webhooks](https://hookdeck.com/webhooks/platforms/guide-to-whatsapp-webhooks-features-and-best-practices)
- [EngageLab: WhatsApp Business API Pricing 2026](https://www.engagelab.com/blog/whatsapp-business-api-pricing)
- [smsmode: 24-Hour Window and Templates Guide](https://www.smsmode.com/en/whatsapp-business-api-customer-care-window-ou-templates-comment-les-utiliser/)
- [Chatarmin: WhatsApp Messaging Limits 2026](https://chatarmin.com/en/blog/whats-app-messaging-limits)
- [WASenderAPI: Rate Limits Explained](https://www.wasenderapi.com/blog/whatsapp-api-rate-limits-explained-how-to-scale-messaging-safely-in-2025)
- [Wati: Meta Template Approval Updates](https://support.wati.io/en/articles/12320234-understanding-meta-s-latest-updates-on-template-approval)
