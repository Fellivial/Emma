# How to Add Billing

Gate Emma's features behind paid plans using LemonSqueezy. Users pay → webhook fires → plan upgrades in Supabase → feature unlocks.

## Prerequisites

- Emma running with Supabase auth configured
- A [LemonSqueezy](https://lemonsqueezy.com) account with a Store created

---

## Step 1: Create products in LemonSqueezy

Create three products in your LemonSqueezy store:

| Product | Price | Type |
|---------|-------|------|
| Starter | $29/month | Subscription |
| Pro | $79/month | Subscription |
| Extra Response Pack | $9 one-time | Single payment |

For each subscription product, create a variant. Note the **Variant ID** for each — you'll need it.

---

## Step 2: Add LemonSqueezy env vars

```
LEMONSQUEEZY_API_KEY=eyJ...
LEMONSQUEEZY_STORE_ID=12345
LEMONSQUEEZY_WEBHOOK_SECRET=your-secret-string

# Variant IDs (from LemonSqueezy Dashboard → Products → your plan → Variants)
NEXT_PUBLIC_LEMON_VARIANT_STARTER=111111
NEXT_PUBLIC_LEMON_VARIANT_PRO=222222
NEXT_PUBLIC_LEMON_VARIANT_EXTRA_PACK=333333
```

`NEXT_PUBLIC_LEMON_VARIANT_*` variables are prefixed `NEXT_PUBLIC_` because the billing page (`/settings/billing`) is a client component and needs them at runtime.

---

## Step 3: Configure the webhook

In LemonSqueezy → Store → Webhooks → Add webhook:

- URL: `https://yourdomain.com/api/lemon/webhook`
- Signing secret: the value you put in `LEMONSQUEEZY_WEBHOOK_SECRET`
- Events: `subscription_created`, `subscription_updated`, `subscription_cancelled`, `order_created`

The webhook handler at `src/app/api/lemon/webhook/route.ts` verifies the HMAC signature before processing any event.

---

## Step 4: Verify the webhook locally

Use the LemonSqueezy CLI or [ngrok](https://ngrok.com) to tunnel your local server:

```bash
ngrok http 3000
```

Update the webhook URL in LemonSqueezy to your ngrok URL temporarily. Fire a test event from the LemonSqueezy dashboard — you should see the plan update in the `profiles` table.

---

## Step 5: Verify feature gating

After a user subscribes, their `profiles.plan_id` updates to `starter` or `pro`. The usage enforcer reads this plan at request time. Free plan users hitting feature-gated routes get a 403. Try it:

1. Log in as a free user
2. Try an autonomous task — it should be blocked (free plan has `actionsPerHour: 0`)
3. Subscribe to Starter
4. The same action now works (Starter: `actionsPerHour: 3`)

---

## Step 6: (Optional) Test the Extra Response Pack

The Extra Response Pack adds 500,000 tokens on top of a user's monthly budget. When purchased:

1. LemonSqueezy fires `order_created`
2. The webhook handler inserts a row into `extra_packs` with `tokens_remaining: 500000` and `valid_until` 30 days out
3. The usage enforcer adds pack tokens to the monthly limit

To test: bring a test account to its monthly token limit, purchase a pack, and confirm the next message goes through.

---

## Plan feature matrix

| Feature | Free | Starter | Pro | Enterprise |
|---------|------|---------|-----|------------|
| Chat | ✅ | ✅ | ✅ | ✅ |
| Memory | — | ✅ | ✅ | ✅ |
| Vision | — | ✅ | ✅ | ✅ |
| Emotion detection | — | ✅ | ✅ | ✅ |
| Routines & schedules | — | ✅ | ✅ | ✅ |
| Autonomous mode | — | 3/hr | 50/hr | unlimited |
| ElevenLabs TTS | — | — | ✅ | ✅ |
| Custom persona | — | — | ✅ | ✅ |
| Multi-user | — | — | 10 users | unlimited |
| Field encryption | — | — | — | ✅ |
| Monthly tokens | 300K | 1M | 2M | unlimited |

See [Reference: Plans](reference-plans.md) for the full token budget breakdown.

---

## Troubleshooting

**Webhook 400 "invalid signature"** — `LEMONSQUEEZY_WEBHOOK_SECRET` doesn't match what's in LemonSqueezy. Update one to match the other.

**Plan not updating after subscribe** — webhook not reaching your server. Check the webhook delivery log in LemonSqueezy.

**Billing page not showing plan buttons** — `NEXT_PUBLIC_LEMON_VARIANT_*` not set or wrong. These must be set at build time for `NEXT_PUBLIC_` vars.

---

## Related

- [Reference: Plans and limits](reference-plans.md) — full token budgets and feature flags
- [Reference: Environment variables](reference-env-vars.md) — all LemonSqueezy vars
- [Explanation: Architecture](explanation-architecture.md) — how usage enforcement works
