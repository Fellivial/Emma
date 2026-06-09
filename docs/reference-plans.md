# Reference: Plans and Usage Limits

Four subscription tiers defined in `src/core/pricing.ts`. Limits are enforced by `src/core/usage-enforcer.ts` against a single 5-hour UTC-aligned rolling window per user.

---

## Plans

### Free — $0/month

| Limit              | Value                           |
| ------------------ | ------------------------------- |
| Monthly tokens     | 300,000                         |
| Weekly tokens      | 75,000                          |
| Daily tokens       | 10,714                          |
| Daily messages     | 10                              |
| Weekly messages    | 50                              |
| Autonomous actions | 0/hr (disabled)                 |
| TTS backend        | Web Speech API (browser)        |
| ElevenLabs         | User can connect own key (BYOK) |

Features enabled: chat, TTS.

---

### Starter — $29/month

| Limit              | Value                           |
| ------------------ | ------------------------------- |
| Monthly tokens     | 1,000,000                       |
| Weekly tokens      | 250,000                         |
| Daily tokens       | 35,714                          |
| Daily messages     | 40                              |
| Weekly messages    | 200                             |
| Autonomous actions | 3/hr                            |
| TTS backend        | Web Speech API (browser)        |
| ElevenLabs         | User can connect own key (BYOK) |

Features enabled: chat, TTS, memory, vision, emotion detection, routines, agent, webhooks, scheduled tasks.

---

### Pro — $79/month (includes ElevenLabs Starter ~$7/mo)

| Limit              | Value                     |
| ------------------ | ------------------------- |
| Monthly tokens     | 2,000,000                 |
| Weekly tokens      | 500,000                   |
| Daily tokens       | 71,428                    |
| Daily messages     | 80                        |
| Weekly messages    | 400                       |
| Autonomous actions | 50/hr                     |
| TTS backend        | ElevenLabs (high quality) |
| Max users          | 10                        |

Features enabled: all Starter features + ElevenLabs TTS, custom persona, API access, multi-user profiles, priority support.

---

### Enterprise — Custom pricing

| Limit              | Value                  |
| ------------------ | ---------------------- |
| Monthly tokens     | Unlimited              |
| Messages           | Unlimited              |
| Autonomous actions | Unlimited              |
| TTS backend        | ElevenLabs (dedicated) |
| Max users          | Unlimited              |
| Field encryption   | ✅                     |

Features enabled: all Pro features + AES-256-GCM field encryption, custom integrations, 99.9% SLA, white-label, dedicated support.

Enterprise skips all usage enforcement entirely — `checkUsage()` returns `{ status: "ok" }` immediately.

---

## Extra Response Pack — $9 one-time

Adds 500,000 tokens on top of the monthly budget. Stacks on the monthly limit only (not daily or weekly). Valid for 30 days from purchase. Multiple packs stack; oldest pack is consumed first.

---

## Window Enforcement

Every brain call is checked against a **single 5-hour UTC-aligned rolling window**. The window resets automatically at each UTC block boundary (00:00, 05:00, 10:00, 15:00, 20:00).

**Threshold behavior:**

- ≥80% of the window → soft warning injected into the next response (in-persona)
- ≥100% of the window → hard block (Emma refuses to respond, offers Extra Pack)

Warning message: `"Just so you know, baby — we're running low today."`  
Block message: `"Mmm. You've used me a lot today. Grab some extra time?"`

Both messages are defined in `LIMIT_WARNING_MESSAGE` and `LIMIT_BLOCK_MESSAGE` in `src/core/pricing.ts`. Override them to change the in-persona limit copy.

**Fail-open rule:** If the usage database is unreachable, `checkUsage()` returns `{ status: "ok" }`. Users are never blocked due to a metering infrastructure failure.

**Note on the `/api/emma/usage` response:** The usage endpoint returns a `windows` object with `daily`, `weekly`, and `monthly` keys for display purposes. Only `daily` corresponds to the active enforcement window; `weekly` and `monthly` show plan-level quota context but are not independently enforced.

---

## Token Calculation

Token budget formula:

```
weekly = floor(monthly / 4)
daily  = floor(weekly / 7)
```

Both input and output tokens count toward the budget. Usage is tracked in the `usage_windows` table via an atomic `increment_usage_window` Postgres RPC call.

---

## Tool Availability by Plan

Tools are enabled/disabled based on `plan.toolsEnabled`. The agent loop reads this list to decide which tools to offer.

| Tool                | Free | Starter | Pro | Enterprise |
| ------------------- | ---- | ------- | --- | ---------- |
| `chat`              | ✅   | ✅      | ✅  | ✅         |
| `tts`               | ✅   | ✅      | ✅  | ✅         |
| `memory`            | —    | ✅      | ✅  | ✅         |
| `vision`            | —    | ✅      | ✅  | ✅         |
| `emotion_detection` | —    | ✅      | ✅  | ✅         |
| `routines`          | —    | ✅      | ✅  | ✅         |
| `agent`             | —    | ✅      | ✅  | ✅         |
| `webhooks`          | —    | ✅      | ✅  | ✅         |
| `scheduled_tasks`   | —    | ✅      | ✅  | ✅         |
| `api_access`        | —    | —       | ✅  | ✅         |
| `multi_user`        | —    | —       | ✅  | ✅         |
| `custom_persona`    | —    | —       | ✅  | ✅         |
| `elevenlabs`        | —    | —       | ✅  | ✅         |
| `encryption`        | —    | —       | —   | ✅         |

---

## Helper Functions (`src/core/pricing.ts`)

| Function                           | Purpose                                       |
| ---------------------------------- | --------------------------------------------- |
| `getPlan(planId)`                  | Returns Plan object by ID, defaults to `free` |
| `getPlanByLemonVariant(variantId)` | Looks up plan by LemonSqueezy variant ID      |
| `inferPlanFromBudget(budget)`      | Infers plan tier from token budget number     |
| `getMRR(planName)`                 | Returns monthly price for a plan name         |
| `hasElevenLabs(planId)`            | True if plan includes ElevenLabs TTS          |

---

## Related

- [How to: Add Billing](howto-add-billing.md) — setting up LemonSqueezy
- [Reference: API routes](reference-api.md) — `/api/emma/usage` endpoint
- [Explanation: Architecture](explanation-architecture.md) — how usage enforcement fits in the request flow
