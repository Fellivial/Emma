# LemonSqueezy Billing — Deep-Dive Research

Research date: 2026-05-31. Sources: official LemonSqueezy docs, API reference, developer guides, Next.js tutorial.

---

## Table of Contents

1. [Checkout Flow](#1-checkout-flow)
2. [Subscription Management](#2-subscription-management)
3. [Webhooks](#3-webhooks)
4. [Customer Portal](#4-customer-portal)
5. [Usage-Based / Metered Billing](#5-usage-based--metered-billing)
6. [One-Time Purchases vs Subscriptions](#6-one-time-purchases-vs-subscriptions)
7. [Discount Codes and Coupons](#7-discount-codes-and-coupons)
8. [Tax Handling](#8-tax-handling)
9. [Key API Endpoints for SaaS](#9-key-api-endpoints-for-saas)
10. [Lemon.js Client SDK](#10-lemonjs-client-sdk)
11. [Test Mode](#11-test-mode)
12. [Affiliate / Referral Programs](#12-affiliate--referral-programs)
13. [Multi-Seat / Team Billing](#13-multi-seat--team-billing)
14. [Known Gotchas and Limitations](#14-known-gotchas-and-limitations)
15. [Emma-Specific Notes](#15-emma-specific-notes)

---

## 1. Checkout Flow

### Checkout URL structure

Every product variant has a static shareable checkout URL:

```
https://[STORE].lemonsqueezy.com/checkout/buy/[VARIANT_ID]
```

When a customer opens this URL in a browser, LemonSqueezy converts it to a single-use cart URL (`/checkout/?cart=...`). **Never share the cart URL — only the `/checkout/buy/` URL is reusable.**

### Hosted checkout vs overlay

| Mode                 | Description                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------- |
| **Hosted checkout**  | Opens in a full browser tab. Default when sharing a product link.                            |
| **Checkout overlay** | Opens as an iframe modal over your page (no page navigation). Requires Lemon.js on the page. |

To trigger the overlay mode, add `?embed=1` to the checkout URL, or set `checkout_options.embed = true` in the API.

### Creating checkouts via API

Use `POST /v1/checkouts`. Required: `store` and `variant` relationships.

```bash
curl -X "POST" "https://api.lemonsqueezy.com/v1/checkouts" \
  -H 'Accept: application/vnd.api+json' \
  -H 'Content-Type: application/vnd.api+json' \
  -H 'Authorization: Bearer {api_key}' \
  -d '{
    "data": {
      "type": "checkouts",
      "attributes": {
        "checkout_options": {
          "embed": true,
          "media": false,
          "logo": false,
          "discount": true
        },
        "checkout_data": {
          "email": "user@example.com",
          "custom": { "user_id": 123 }
        },
        "product_options": {
          "redirect_url": "https://yourapp.com/dashboard",
          "receipt_button_text": "Go to Dashboard"
        }
      },
      "relationships": {
        "store": { "data": { "type": "stores", "id": "1" } },
        "variant": { "data": { "type": "variants", "id": "1" } }
      }
    }
  }'
```

The response contains `data.attributes.url` — pass this to `LemonSqueezy.Url.Open()` on the frontend for overlay mode, or redirect the user directly for hosted mode.

### Checkout customization options

`checkout_options` fields:

- `embed` — boolean, overlay vs hosted
- `media` — show/hide product media
- `logo` — show/hide store logo
- `desc` — show/hide product description
- `discount` — show/hide discount code field
- `subscription_preview` — show/hide "You will be charged..." text
- `button_color` — hex color for checkout button
- `background_color`, `headings_color`, `primary_text_color`, `secondary_text_color`, `links_color`, `borders_color`, `checkbox_color`, `active_state_color`, `button_text_color`, `terms_privacy_color`
- `locale` — ISO 639 language code override (e.g. `en`, `fr`, `de`)

`product_options` fields:

- `name`, `description` — override product copy at checkout
- `media` — array of image URLs
- `redirect_url` — where the button in the confirmation modal goes
- `receipt_button_text`, `receipt_link_url`, `receipt_thank_you_note`
- `enabled_variants` — array of variant IDs to show (hide all others)

### Custom price

Override a product's price for a single checkout:

```json
"attributes": {
  "custom_price": 599
}
```

Value is in the currency's smallest unit (cents for USD). For subscriptions, the custom price persists for all future renewals of that checkout until the customer changes plan.

### Expiring checkout URLs

```json
"attributes": {
  "expires_at": "2024-12-31T23:59:59.000000Z"
}
```

Checkouts without `expires_at` are safe to cache indefinitely.

### Pre-filling checkout fields

Via URL query params:

```
?checkout[email]=user@example.com
&checkout[name]=John Doe
&checkout[billing_address][country]=US
&checkout[billing_address][zip]=10001
&checkout[discount_code]=SAVE20
```

Via API, use `checkout_data` object with `email`, `name`, `billing_address`, `tax_number`, `discount_code`, `variant_quantities`, `custom`.

### Passing custom data (critical for SaaS)

Pass `user_id` (or any identifier) at checkout so webhooks can link back to your user:

URL: `?checkout[custom][user_id]=123`

API: `"checkout_data": { "custom": { "user_id": 123 } }`

This shows up in all Order, Subscription, and License Key webhook events as:

```json
{
  "meta": {
    "event_name": "subscription_created",
    "custom_data": { "user_id": "123" }
  }
}
```

Note: values come back as strings even if you passed integers.

### After checkout

- Confirmation modal is shown (fully customizable per product)
- Customer receives receipt email (customizable text and button)
- Default confirmation button goes to "My Orders" — override with `redirect_url`

---

## 2. Subscription Management

### Subscription statuses

| Status      | Meaning                                                               |
| ----------- | --------------------------------------------------------------------- |
| `on_trial`  | Free trial period, awaiting first payment                             |
| `active`    | Current and valid                                                     |
| `paused`    | Payment collection paused, subscription still active                  |
| `past_due`  | Renewal failed — LemonSqueezy retries 4 times over ~2 weeks           |
| `unpaid`    | All 4 retries failed, dunning may apply                               |
| `cancelled` | Future payments cancelled, still valid until `ends_at` (grace period) |
| `expired`   | Fully ended, customer should lose access                              |

**Access rule**: Grant access for all statuses except `expired`.

### Key subscription fields

```json
{
  "status": "active",
  "cancelled": false,
  "pause": null,
  "trial_ends_at": null,
  "renews_at": "2024-12-01T00:00:00.000000Z",
  "ends_at": null,
  "billing_anchor": 12,
  "card_brand": "visa",
  "card_last_four": "4242",
  "payment_processor": "stripe",
  "urls": {
    "update_payment_method": "https://...",
    "customer_portal": "https://...",
    "customer_portal_update_subscription": "https://..."
  }
}
```

Signed URLs in `urls` expire after 24 hours — refetch from API when needed.

### Upgrade / downgrade (plan change)

```bash
curl -X "PATCH" "https://api.lemonsqueezy.com/v1/subscriptions/{id}" \
  -H 'Authorization: Bearer {api_key}' \
  -H 'Content-Type: application/vnd.api+json' \
  -d '{
    "data": {
      "type": "subscriptions",
      "id": "{id}",
      "attributes": {
        "variant_id": 456
      }
    }
  }'
```

Plan change takes effect immediately. The subscription object reflects the new variant right away.

### Proration

Default behaviour: proration is calculated and added to the next renewal.

| Option                        | Effect                                                |
| ----------------------------- | ----------------------------------------------------- |
| No option (default)           | Prorate; extra charge added to next invoice           |
| `"invoice_immediately": true` | Prorate and charge the difference immediately         |
| `"disable_prorations": true`  | No proration; customer pays new price at next renewal |

`disable_prorations` overrides `invoice_immediately` if both are sent.

Dashboard equivalents:

- "Apply changes with proration" is the default (no extra attributes)
- "Apply changes with proration and invoice immediately" is `invoice_immediately: true`
- "Apply changes without proration" is `disable_prorations: true`

### Cancel and resume

Cancel:

```bash
curl -X "DELETE" "https://api.lemonsqueezy.com/v1/subscriptions/{id}" \
  -H 'Authorization: Bearer {api_key}'
```

Returns the subscription in `cancelled` state. `ends_at` is set to the current billing period end. Customer retains access until then.

Resume (during grace period, before `ends_at`):

```bash
curl -X "PATCH" "https://api.lemonsqueezy.com/v1/subscriptions/{id}" \
  -H 'Authorization: Bearer {api_key}' \
  -H 'Content-Type: application/vnd.api+json' \
  -d '{
    "data": {
      "type": "subscriptions",
      "id": "{id}",
      "attributes": { "cancelled": false }
    }
  }'
```

After `ends_at` passes, the subscription transitions to `expired` and cannot be resumed.

### Pause and unpause

Pause:

```bash
curl -X "PATCH" "https://api.lemonsqueezy.com/v1/subscriptions/{id}" \
  -H 'Authorization: Bearer {api_key}' \
  -H 'Content-Type: application/vnd.api+json' \
  -d '{
    "data": {
      "type": "subscriptions",
      "id": "{id}",
      "attributes": {
        "pause": {
          "mode": "free",
          "resumes_at": "2024-06-30T00:00:00.000000Z"
        }
      }
    }
  }'
```

Pause modes:

- `free` — Subscription is active, no payments collected (use for customer self-service pause)
- `void` — Subscription active, invoices voided (use when you cannot provide service, e.g. maintenance)

`resumes_at` is optional — omit for indefinite pause. Unpause manually:

```bash
# PATCH with "pause": null
-d '{
  "data": {
    "type": "subscriptions",
    "id": "{id}",
    "attributes": { "pause": null }
  }
}'
```

### Change billing date

```bash
-d '{
  "data": {
    "type": "subscriptions",
    "id": "{id}",
    "attributes": { "billing_anchor": 1 }
  }
}'
```

Set `billing_anchor` to a day of month (1-31). LemonSqueezy calculates the next occurrence and issues a prorated trial until then. Use `null` or `0` to reset to today (also removes any active trial).

### Payment recovery / dunning

- LemonSqueezy auto-retries failed payments 4 times over ~2 weeks
- Each retry sends the customer an email with their `update_payment_method` URL
- Status goes `active` to `past_due` during retries
- After all 4 fail: `unpaid`
- Dunning emails (configurable schedule) then go out for a configurable period
- After dunning window: `expired`

PayPal subscriptions retry every 5 days, with a 2-failed-billing-cycle threshold before suspension.

### Updating payment method

Retrieve `urls.update_payment_method` from any Subscription API response. This is a signed URL valid for 24 hours. Open it via Lemon.js overlay or redirect:

```js
LemonSqueezy.Url.Open(subscription.urls.update_payment_method);
```

---

## 3. Webhooks

### Delivery

LemonSqueezy sends a `POST` to your configured URL. Your handler must return HTTP `200`. If it does not:

- Up to 3 retries using exponential backoff: ~5s, ~25s, ~125s
- After the 4th attempt fails, the request is marked failed — no more retries
- Respond `200` quickly; process asynchronously if needed

### Headers

```
Content-Type: application/json
X-Event-Name: subscription_created
X-Signature: {hmac_hex}
```

### Signature verification (Node.js / Next.js)

```typescript
import crypto from "node:crypto";

export async function POST(req: Request) {
  const rawBody = await req.text(); // MUST use text(), not json()
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET!;

  const hmac = crypto.createHmac("sha256", secret);
  const digest = Buffer.from(hmac.update(rawBody).digest("hex"), "utf8");
  const signature = Buffer.from(req.headers.get("X-Signature") || "", "utf8");

  if (digest.length !== signature.length || !crypto.timingSafeEqual(digest, signature)) {
    return new Response("Invalid signature", { status: 401 });
  }

  const event = JSON.parse(rawBody);
  // process event...
  return new Response("OK", { status: 200 });
}
```

Key detail: use `req.text()` not `req.json()` — the raw body is needed for the HMAC. Never parse JSON first.

### Payload structure

All webhook payloads follow JSON:API format:

```json
{
  "meta": {
    "event_name": "subscription_created",
    "custom_data": { "user_id": "123" }
  },
  "data": {
    "type": "subscriptions",
    "id": "1",
    "attributes": { "..." },
    "relationships": { "..." }
  }
}
```

### All event types

| Event                            | Payload type         | Description                                                                        |
| -------------------------------- | -------------------- | ---------------------------------------------------------------------------------- |
| `order_created`                  | Order                | New order placed                                                                   |
| `order_refunded`                 | Order                | Full or partial refund on an order                                                 |
| `customer_updated`               | Customer             | Customer data changed                                                              |
| `subscription_created`           | Subscription         | New subscription created (always paired with `order_created`)                      |
| `subscription_updated`           | Subscription         | Any subscription data change — catch-all                                           |
| `subscription_cancelled`         | Subscription         | Customer or merchant cancelled; subscription enters grace period                   |
| `subscription_resumed`           | Subscription         | Resumed after being cancelled                                                      |
| `subscription_expired`           | Subscription         | Subscription ended (grace period over, or dunning completed)                       |
| `subscription_paused`            | Subscription         | Payment collection paused                                                          |
| `subscription_unpaused`          | Subscription         | Payment collection resumed                                                         |
| `subscription_payment_success`   | Subscription invoice | Renewal payment successful                                                         |
| `subscription_payment_failed`    | Subscription invoice | Renewal payment failed                                                             |
| `subscription_payment_recovered` | Subscription invoice | Successful payment after a failed one (paired with `subscription_payment_success`) |
| `subscription_payment_refunded`  | Subscription invoice | Subscription payment refunded                                                      |
| `license_key_created`            | License key          | License created from order (paired with `order_created`)                           |
| `license_key_updated`            | License key          | License key updated                                                                |
| `affiliate_activated`            | Affiliate            | Affiliate activated                                                                |

### Recommended minimum for a subscription SaaS

```
subscription_created    — new subscriber
subscription_payment_success — track renewals
subscription_updated    — catch-all for all subscription state changes
```

Add `order_created` if selling one-time purchases too.

### Typical lifecycle event sequence

**New subscription:**

1. `order_created`
2. `subscription_created`
3. `subscription_payment_success`

**Renewal:**

1. `subscription_payment_success`
2. `subscription_updated`

**Customer cancels:**

1. `subscription_cancelled`
2. `subscription_updated`

**Grace period ends:**

1. `subscription_expired`
2. `subscription_updated`

**Payment fails, then recovers:**

1. `subscription_payment_failed` + `subscription_updated`
2. (retries...)
3. `subscription_payment_success` + `subscription_payment_recovered` + `subscription_updated`

### Simulate webhook events

LemonSqueezy dashboard: Settings > Webhooks > "Simulate webhook events" — sends test payloads to your endpoint without real transactions.

---

## 4. Customer Portal

### What it provides

A hosted, no-code billing portal at:

```
https://[STORE].lemonsqueezy.com/billing
```

Or with a custom domain:

```
https://yourcustomdomain.com/billing
```

Customers can:

- View active and expired subscriptions
- Change between subscription products/variants
- Pause/unpause and cancel/resume subscriptions
- Add, edit, delete payment methods and assign them to subscriptions
- Update billing information and tax ID
- View full billing history
- Access license keys and downloadable files

The portal is distinct from **My Orders** (a global cross-store page). Customer Portal is store-scoped.

### How to link to it

**Static URL** (requires magic link login):

```
https://[STORE].lemonsqueezy.com/billing
```

**Pre-authenticated signed URL** (preferred for SaaS):
Both `Subscription` and `Customer` API objects include a `urls.customer_portal` field — a signed URL valid for 24 hours that auto-authenticates the customer. One click, right into the portal.

```typescript
// Fetch subscription from API to get fresh signed URL
const sub = await getSubscription(subscriptionId);
const portalUrl = sub.data?.data.attributes.urls.customer_portal;
// Redirect or open in new tab
```

For PayPal subscriptions specifically, use `urls.customer_portal_update_subscription` to allow plan changes (the PATCH endpoint does not work for PayPal subscriptions).

### Customization

Configurable from Design settings in the dashboard — toggle features on/off, live preview.

---

## 5. Usage-Based / Metered Billing

LemonSqueezy supports real metered billing on subscription products.

### How it works

1. Enable "Usage is metered?" on a product/variant in the dashboard
2. Customers are NOT charged at checkout (the button says "Create subscription" not "Pay")
3. You report usage via the Usage Records API
4. LemonSqueezy bills customers at the next renewal date based on reported usage

### Aggregation modes

| Mode                            | Description                                      |
| ------------------------------- | ------------------------------------------------ |
| Sum of usage during period      | Total of all usage records in the billing period |
| Most recent usage during period | Latest record in the billing period (0 if none)  |
| Most recent usage               | Latest record ever, including previous periods   |
| Maximum usage during period     | Highest record in the billing period (0 if none) |

### Setup fee

Optional. If set, the customer is charged that fixed amount at checkout (e.g., $5 activation fee), then usage charges start at the next renewal.

### Reporting usage

```bash
curl -X "POST" "https://api.lemonsqueezy.com/v1/usage-records" \
  -H 'Authorization: Bearer {api_key}' \
  -H 'Content-Type: application/vnd.api+json' \
  -d '{
    "data": {
      "type": "usage-records",
      "attributes": {
        "quantity": 150
      },
      "relationships": {
        "subscription-item": {
          "data": { "type": "subscription-items", "id": "{subscription_item_id}" }
        }
      }
    }
  }'
```

To get the `subscription_item_id`, store `first_subscription_item.id` from the `subscription_created` or `subscription_updated` webhook.

### Limitation

You cannot mix usage-based and non-usage-based variants in a single plan change. Store `isUsageBased` per plan and only allow upgrades within the same billing type.

---

## 6. One-Time Purchases vs Subscriptions

LemonSqueezy supports both on the same store. Products are either `single_payment` or `subscription` type.

### Detecting purchase type in webhooks

Both trigger `order_created`. To distinguish:

- **Subscription**: `order_created` is fired alongside `subscription_created`. Check `data.type === "subscriptions"` in the paired event.
- **One-time**: `order_created` only, no accompanying `subscription_created`.

For extra/add-on packs (like Emma's Extra Response Pack), listen to `order_created` and check `data.attributes.first_order_item.variant_id` against your known one-time variant ID:

```typescript
case "order_created": {
  const orderVariantId = event.data?.attributes?.first_order_item?.variant_id;
  if (String(orderVariantId) === process.env.NEXT_PUBLIC_LEMON_VARIANT_EXTRA_PACK) {
    // grant tokens / credits
  }
  break;
}
```

### Custom data propagation

Custom data passed at checkout appears in webhooks for:

- All Order events
- All Subscription events
- All License Key events

For one-time orders without a subscription, `meta.custom_data` is available in the `order_created` payload exactly the same way.

---

## 7. Discount Codes and Coupons

### Discount object fields

| Field                      | Description                                                     |
| -------------------------- | --------------------------------------------------------------- |
| `code`                     | The coupon code string (uppercase letters/numbers, 3-256 chars) |
| `amount`                   | Value — percentage or cents depending on `amount_type`          |
| `amount_type`              | `percent` or `fixed`                                            |
| `is_limited_to_products`   | If true, only applies to specified products/variants            |
| `is_limited_redemptions`   | If true, max usage limit applies                                |
| `max_redemptions`          | Max uses (when `is_limited_redemptions` is true)                |
| `starts_at` / `expires_at` | ISO 8601 validity window                                        |
| `duration`                 | `once`, `repeating`, or `forever` (for subscriptions)           |
| `duration_in_months`       | Used when `duration` is `repeating`                             |
| `status`                   | `draft` or `published`                                          |

### Creating discounts via API

```bash
curl -X "POST" "https://api.lemonsqueezy.com/v1/discounts" \
  -H 'Authorization: Bearer {api_key}' \
  -H 'Content-Type: application/vnd.api+json' \
  -d '{
    "data": {
      "type": "discounts",
      "attributes": {
        "name": "20% off first month",
        "code": "LAUNCH20",
        "amount": 20,
        "amount_type": "percent",
        "duration": "once",
        "status": "published"
      },
      "relationships": {
        "store": { "data": { "type": "stores", "id": "1" } }
      }
    }
  }'
```

### Applying at checkout

Pre-fill the discount code in the checkout URL or API request:

```
?checkout[discount_code]=LAUNCH20
```

Or via API `checkout_data.discount_code`.

### Subscription discount duration

- `duration: "once"` — applies to the first payment only
- `duration: "repeating"` + `duration_in_months: 3` — applies for 3 months
- `duration: "forever"` — applies to all future renewals

---

## 8. Tax Handling

### LemonSqueezy as Merchant of Record

LemonSqueezy handles all tax collection and remittance on your behalf. You do not need to register for sales tax in any jurisdiction. This includes:

- US state sales tax
- EU VAT
- UK VAT
- GST (Australia, Canada, New Zealand, etc.)

### How it appears in payloads

Order objects include tax fields:

```json
{
  "subtotal": 999,
  "tax": 200,
  "total": 1199,
  "tax_name": "VAT",
  "tax_rate": "20.00",
  "subtotal_formatted": "$9.99",
  "tax_formatted": "$2.00",
  "total_formatted": "$11.99"
}
```

Tax is deducted from your payout. Example for a $15 product sold to a UK buyer (20% VAT):

- Subtotal: $15.00
- Tax: $3.00
- Total charged to customer: $18.00
- Platform fee: ~$1.67
- Net payout: ~$13.33

### Tax-inclusive pricing

Toggle available in store General Settings. When enabled, the price you set is the all-in price (tax extracted from it rather than added on top). Future subscription invoices apply the setting going forward; old invoices are not updated.

### EU VAT for B2B customers

Customers can enter their tax number (VAT ID) at checkout. LemonSqueezy validates it and may zero-rate the transaction if valid under reverse charge rules.

### Tax categories

Each product variant has a tax category setting that affects which tax rates apply. Set this correctly for SaaS/software vs physical goods.

### Your obligations

As a LemonSqueezy merchant, you may still owe income tax on payouts in your country. LemonSqueezy does not advise on this — consult a tax professional.

---

## 9. Key API Endpoints for SaaS

Base URL: `https://api.lemonsqueezy.com/v1/`

Authentication: `Authorization: Bearer {api_key}`

Rate limit: 300 requests/minute. Headers: `X-Ratelimit-Limit`, `X-Ratelimit-Remaining`.

API follows JSON:API spec — responses use `data.type`, `data.id`, `data.attributes`, `data.relationships`.

### Subscriptions

| Method   | Endpoint              | Use                                                           |
| -------- | --------------------- | ------------------------------------------------------------- |
| `GET`    | `/subscriptions`      | List all (filter by `store_id`, `status`, `user_email`, etc.) |
| `GET`    | `/subscriptions/{id}` | Get single (includes fresh signed URLs)                       |
| `PATCH`  | `/subscriptions/{id}` | Change plan, pause, unpause, cancel, resume, billing anchor   |
| `DELETE` | `/subscriptions/{id}` | Cancel subscription                                           |

### Checkouts

| Method | Endpoint          | Use                                     |
| ------ | ----------------- | --------------------------------------- |
| `POST` | `/checkouts`      | Create checkout with full customization |
| `GET`  | `/checkouts/{id}` | Retrieve a checkout                     |

### Customers

| Method  | Endpoint          | Use                                                  |
| ------- | ----------------- | ---------------------------------------------------- |
| `POST`  | `/customers`      | Create a customer                                    |
| `GET`   | `/customers/{id}` | Get customer (includes signed `customer_portal` URL) |
| `PATCH` | `/customers/{id}` | Update customer                                      |
| `GET`   | `/customers`      | List customers (filter by `store_id`, `email`)       |

### Orders

| Method | Endpoint                | Use              |
| ------ | ----------------------- | ---------------- |
| `GET`  | `/orders/{id}`          | Get order        |
| `GET`  | `/orders`               | List orders      |
| `POST` | `/orders/{id}/invoices` | Generate invoice |
| `POST` | `/orders/{id}/refunds`  | Issue refund     |

### Subscription Invoices

| Method | Endpoint                              | Use                           |
| ------ | ------------------------------------- | ----------------------------- |
| `GET`  | `/subscription-invoices/{id}`         | Get invoice                   |
| `GET`  | `/subscription-invoices`              | List invoices                 |
| `POST` | `/subscription-invoices/{id}/refunds` | Refund a subscription payment |

### Usage Records (metered billing)

| Method | Endpoint         | Use                                  |
| ------ | ---------------- | ------------------------------------ |
| `POST` | `/usage-records` | Report usage for a subscription item |
| `GET`  | `/usage-records` | List usage records                   |

### Discounts

| Method   | Endpoint          | Use             |
| -------- | ----------------- | --------------- |
| `POST`   | `/discounts`      | Create discount |
| `GET`    | `/discounts/{id}` | Get discount    |
| `DELETE` | `/discounts/{id}` | Delete discount |
| `GET`    | `/discounts`      | List discounts  |

### Webhooks (manage via API)

| Method   | Endpoint         | Use                     |
| -------- | ---------------- | ----------------------- |
| `POST`   | `/webhooks`      | Create webhook endpoint |
| `PATCH`  | `/webhooks/{id}` | Update webhook          |
| `DELETE` | `/webhooks/{id}` | Delete webhook          |
| `GET`    | `/webhooks`      | List webhooks           |

### Variants & Products (for syncing plan data)

| Method | Endpoint    | Use                                                                           |
| ------ | ----------- | ----------------------------------------------------------------------------- |
| `GET`  | `/variants` | List all variants (filter by `product_id`)                                    |
| `GET`  | `/products` | List products                                                                 |
| `GET`  | `/prices`   | List prices (filter by `variant_id`) — needed for usage-based billing details |

### Official JS SDK

```bash
pnpm install @lemonsqueezy/lemonsqueezy.js
```

```typescript
import {
  lemonSqueezySetup,
  createCheckout,
  getSubscription,
  updateSubscription,
  cancelSubscription,
  listProducts,
  listPrices,
} from "@lemonsqueezy/lemonsqueezy.js";

lemonSqueezySetup({ apiKey: process.env.LEMONSQUEEZY_API_KEY });
```

---

## 10. Lemon.js Client SDK

### Installation

```html
<script src="https://app.lemonsqueezy.com/js/lemon.js" defer></script>
```

Size: 2.3kB. Do not self-host — you will miss security patches and feature updates.

### Auto-initialization

On load, Lemon.js scans for `<a class="lemonsqueezy-button">` elements and intercepts clicks to open the checkout overlay:

```html
<a class="lemonsqueezy-button" href="https://mystore.lemonsqueezy.com/checkout/buy/123">
  Buy Now
</a>
```

### React / Next.js integration

Lemon.js initializes before React mounts components. Call `createLemonSqueezy()` manually after mount:

```tsx
useEffect(() => {
  if (typeof window.createLemonSqueezy === "function") {
    window.createLemonSqueezy();
  }
}, []);
```

### Programmatically opening overlays

```typescript
// Open a checkout URL as overlay
LemonSqueezy.Url.Open(checkoutUrl);

// Open payment method update overlay
LemonSqueezy.Url.Open(subscription.urls.update_payment_method);

// Close overlay
LemonSqueezy.Url.Close();
```

### Event handling

```typescript
LemonSqueezy.Setup({
  eventHandler: (event) => {
    switch (event.event) {
      case "Checkout.Success":
        // event.data is an Order object
        console.log("Order ID:", event.data.id);
        break;
      case "PaymentMethodUpdate.Updated":
        // Payment method was updated successfully
        break;
      case "PaymentMethodUpdate.Closed":
        // Overlay was closed
        break;
    }
  },
});
```

Available events:
| Event | Description |
|---|---|
| `Checkout.Success` | Payment completed (includes Order data in `event.data`) |
| `PaymentMethodUpdate.Mounted` | Update overlay opened |
| `PaymentMethodUpdate.Closed` | Update overlay closed |
| `PaymentMethodUpdate.Updated` | Payment method changed successfully |

---

## 11. Test Mode

### Overview

All new stores default to test mode. You must activate your store (ID verification) to process real payments.

Test mode is toggled per-store in the dashboard. API keys created in test mode only interact with test data.

### Test card numbers

| Card               | Number                |
| ------------------ | --------------------- |
| Visa               | `4242 4242 4242 4242` |
| Mastercard         | `5555 5555 5555 4444` |
| American Express   | `3782 822463 10005`   |
| Insufficient funds | `4000 0000 0000 9995` |
| Expired card       | `4000 0000 0000 0069` |
| 3D Secure          | `4000 0027 6000 3184` |

Use any future expiry date (e.g. 12/35) and any 3-digit CVC.

### Test mode behaviour

- Receipt emails in test mode go to you and team members only — not the email entered during checkout
- File downloads are disabled for test purchases
- Webhooks work normally in test mode
- Use "Simulate webhook events" in the dashboard to test without going through checkout
- Test products are separate from live products — use "Copy to Live Mode" to migrate

### Webhook testing in development

Use a tunnel service (ngrok, LocalCan, Cloudflare Tunnel) to expose your local endpoint publicly, then register that URL in LemonSqueezy webhook settings.

### Going live

Create a new API key in live mode (separate from test API key). Swap the key in your production environment. Test and live keys have completely separate data sets.

---

## 12. Affiliate / Referral Programs

LemonSqueezy has a built-in affiliate program — no third-party tools needed.

### Merchant setup

Configure in Settings > Affiliates:

- Set default commission rate (percentage of sale)
- Optionally set per-product commission rates
- Set tracking cookie length
- Specify which products earn referrals
- The affiliate signup URL is publicly shareable

### Affiliate tracking

Add the affiliate tracking script to your marketing site if your referral URL is not your LemonSqueezy storefront.

### Fees

- +3% on top of the platform fee for affiliate-referred sales (paid by merchant)
- +2% for affiliate payouts (deducted from affiliate earnings)

### Webhook event

`affiliate_activated` fires when a new affiliate joins your program.

### Limitations

The affiliate program is per-store and self-managed. There is no multi-level (MLM) affiliate structure. Affiliates must apply and be accepted before getting a referral link.

---

## 13. Multi-Seat / Team Billing

LemonSqueezy does **not** have native multi-seat or per-seat billing as a platform feature.

To implement seat-based pricing, options are:

1. **Create separate variants for each seat tier** — e.g., "Pro (1 seat)", "Pro (5 seats)", "Pro (10 seats)" — and use the plan change API for upgrades.
2. **Use usage-based billing** — report seat count as usage, configure aggregation to "Most recent usage" or "Maximum usage during period".
3. **Handle seat logic entirely in your app** — store a `seats` field alongside the plan, enforce it in your middleware.

LemonSqueezy does have a **Teams** feature for your own internal store admin access, but this is not an end-customer billing feature.

---

## 14. Known Gotchas and Limitations

### Cart URL vs checkout URL

**Critical**: when a customer opens a `/checkout/buy/` URL, the browser converts it to a single-use `/checkout/?cart=` URL. Never share or cache the cart URL. Only store and share the original `/checkout/buy/` URL.

### Signed URLs expire in 24 hours

The `urls.update_payment_method` and `urls.customer_portal` fields in Subscription and Customer API responses expire after 24 hours. Do not store these in your database long-term. Always fetch a fresh subscription from the API when you need a current signed URL.

### PayPal subscriptions behave differently

The PATCH `/subscriptions/{id}` endpoint **does not work for PayPal subscriptions**. Instead:

- Use `urls.customer_portal_update_subscription` to redirect the customer to the Customer Portal for plan changes
- PayPal retry logic is different: retries every 5 days, 2 failed cycles before suspension

### Rate limit is 300 requests/minute

For high-volume operations (syncing all variants on startup), cache aggressively. On 429, you get `X-Ratelimit-Remaining: 0` in the response.

### `subscription_created` includes `order_id`

You do not need to listen to `order_created` for subscriptions — `subscription_created` includes the `order_id`, so you can store everything from that one event.

### Custom data values come back as strings

If you pass `"user_id": 123` (integer), `meta.custom_data.user_id` in the webhook will be `"123"` (string). Always use `String()` comparison or parse in your handler.

### Existing subscriptions are not affected by price changes

If you change a variant's price in the dashboard, existing subscribers keep paying the original price. Only new subscriptions get the new price. To change an existing subscriber's price, use PATCH with a new `variant_id`.

### Products created in test mode are not in live mode

You must manually "Copy to Live Mode" each product. This includes discount codes. Do not forget this step before going live.

### Webhook retries are limited to 3 (4 total attempts)

After the 4th attempt fails, the webhook is dropped permanently. Return `200` immediately, then process asynchronously. Consider storing raw webhook events in a table and processing them separately to guarantee delivery.

### No native idempotency keys

LemonSqueezy does not send idempotency headers. Use `subscription_id` + `event_name` or `order_id` as your own idempotency key to guard against duplicate processing.

### `subscription_cancelled` does not mean access revoked

When a subscription is cancelled, the customer is still active and valid until `ends_at`. Do not revoke access on `subscription_cancelled`. Revoke only on `subscription_expired`.

### API uses JSON:API format — not plain REST

All responses wrap data in `data.attributes`. Navigate via `response.data.data.attributes`, not `response.attributes`. The official SDK abstracts this.

### No multi-currency pricing per product

LemonSqueezy stores sell in one base currency. They auto-convert to the customer's local currency at checkout using exchange rates, but you cannot set per-currency prices manually.

### Discount `duration_in_months` only works with `repeating`

Setting `duration: "once"` or `duration: "forever"` ignores `duration_in_months`.

### Free trials still require a payment method

LemonSqueezy requires a card even for free trials. The customer is not charged during the trial, but must enter card details upfront.

### `subscription_payment_failed` does not auto-reverse

If you reduce user access on `subscription_payment_failed`, you must explicitly restore it on `subscription_payment_recovered` (or `subscription_updated`). There is no automatic reversal.

---

## 15. Emma-Specific Notes

### Current implementation

Emma's webhook handler is at `src/app/api/lemon/webhook/route.ts`. It handles:

- `subscription_created` / `subscription_updated` / `subscription_resumed` — activate plan via `getPlanByLemonVariant(variantId)`
- `subscription_cancelled` — logs only, awaits `subscription_expired` (correct — do not revoke early)
- `subscription_expired` — downgrades to free tier
- `subscription_payment_failed` — reduces daily message limit to free tier limit
- `order_created` — detects Extra Response Pack via `NEXT_PUBLIC_LEMON_VARIANT_EXTRA_PACK` and grants tokens

### Potential improvements

**1. Handle `subscription_payment_recovered`**

Currently if a payment fails and then recovers, the daily limit reduction from `subscription_payment_failed` is not explicitly reversed. Add a case for `subscription_payment_recovered` that restores full plan limits (same logic as `subscription_updated`).

**2. Store subscription metadata**

Store `lemonSqueezyId`, `orderId`, `endsAt`, `renewsAt`, `cardBrand`, `cardLastFour` alongside the plan in your database. This lets you display billing info to users without extra API calls.

**3. Checkout URL generation**

When creating checkout sessions, ensure `custom.user_id` is always set so webhooks can always link back to the user. Consider generating server-side checkouts via the API (pre-fill email and user_id) rather than using static variant URLs from the frontend.

**4. `variantId` extraction in webhook handler**

The current code:

```typescript
const variantId = String(attrs?.variant_id || attrs?.first_subscription_item?.variant_id || "");
```

`first_subscription_item.variant_id` is not a real field on subscription items (they have `price_id`, not `variant_id`). Safe to simplify to `String(attrs?.variant_id || "")`.

**5. Idempotency**

The current handler does not guard against duplicate webhook deliveries. Consider storing processed `(event_name, data.id)` pairs in a `webhook_events` table to prevent double-grants.

### Data to store per subscription

Based on LemonSqueezy developer guide recommendations:

```typescript
{
  lemonSqueezyId: string; // subscription.id
  orderId: number; // attributes.order_id
  status: string; // attributes.status
  statusFormatted: string; // attributes.status_formatted
  variantId: number; // attributes.variant_id
  userId: string; // meta.custom_data.user_id
  renewsAt: string | null; // attributes.renews_at
  endsAt: string | null; // attributes.ends_at (populated on cancel)
  trialEndsAt: string | null; // attributes.trial_ends_at
  isPaused: boolean; // attributes.pause !== null
  cardBrand: string; // attributes.card_brand
  cardLastFour: string; // attributes.card_last_four
  // Do NOT store signed URLs — they expire in 24 hours
}
```

### Environment variables (Emma-relevant)

| Variable                               | Purpose                               |
| -------------------------------------- | ------------------------------------- |
| `LEMONSQUEEZY_API_KEY`                 | Server-side API calls                 |
| `LEMONSQUEEZY_STORE_ID`                | Filter API results to your store      |
| `LEMONSQUEEZY_WEBHOOK_SECRET`          | HMAC signature verification           |
| `NEXT_PUBLIC_LEMON_VARIANT_STARTER`    | Variant ID for $29/mo Starter plan    |
| `NEXT_PUBLIC_LEMON_VARIANT_PRO`        | Variant ID for $79/mo Pro plan        |
| `NEXT_PUBLIC_LEMON_VARIANT_EXTRA_PACK` | Variant ID for $9 Extra Response Pack |

---

_Sources: https://docs.lemonsqueezy.com/help, https://docs.lemonsqueezy.com/api, https://docs.lemonsqueezy.com/guides — accessed 2026-05-31_
