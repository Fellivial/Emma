# OpenRouter Model Reliability & Free-Tier Research

> **Status: RESEARCH ONLY — do not implement until instructed.**
> Sources: OpenRouter docs (`https://openrouter.ai/docs/llms-full.txt`) and live Models API (`https://openrouter.ai/api/v1/models`) — live-browsed 2026-05-31.

---

## Overview

Emma currently routes all LLM calls through OpenRouter using two free-tier models: `openai/gpt-oss-120b:free` (brain + utility) and `google/gemma-4-31b-it:free` (vision). Both models do support the `tools` parameter and SSE streaming. The critical risks are:

1. Free-tier daily limits are low (50 req/day without credits, 1000 req/day with $10+ credits) — unsuitable for any production or multi-user load.
2. No per-request token limit is enforced at the OpenRouter layer (`per_request_limits: null` for both), so context overflow is handled by the upstream provider and returns HTTP 400/413.
3. `gemma-4-31b-it:free` does support vision (image + video input modalities) and tools, making it a usable free vision model — but the same daily RPD limits apply.
4. When a free model is at capacity, OpenRouter returns HTTP 429 with a `Retry-After` header. The `models` array fallback mechanism can route automatically to a second model without a second request from the client.
5. `deepseek/deepseek-r1:free` is no longer listed in the live catalog. The paid `deepseek/deepseek-r1` (163K ctx, $0.70/1M input) does support tools.

---

## Free-Tier Rate Limits by Model

### Global Free-Tier Rules (apply to all `:free` model variants)

| Condition                         | Requests per Day (RPD)                          | Requests per Minute (RPM) |
| --------------------------------- | ----------------------------------------------- | ------------------------- |
| Account has **< $10** in credits  | **50 req/day** (total across all free models)   | 20 req/min                |
| Account has **>= $10** in credits | **1000 req/day** (total across all free models) | 20 req/min                |

Source: rendered FAQ page (HTML values confirmed): `50 requests per day total` / `1000 requests per day` at `$10 credits threshold`. RPM not directly published as a rendered number — docs reference `{FREE_MODEL_RATE_LIMIT_RPM}` template variable; the service tiers doc and community reports suggest 20 RPM.

**Important:** These limits are shared across all `:free` model calls on the account, not per-model.

### Per-Model Details (live from `/api/v1/models`, 2026-05-31)

| Model ID                                 | Context | Max Completion | Supports Tools | Vision Input        | `per_request_limits` |
| ---------------------------------------- | ------- | -------------- | -------------- | ------------------- | -------------------- |
| `openai/gpt-oss-120b:free`               | 131,072 | 131,072        | YES            | No                  | null                 |
| `openai/gpt-oss-20b:free`                | 131,072 | —              | YES (listed)   | No                  | null                 |
| `google/gemma-4-31b-it:free`             | 262,144 | 32,768         | YES            | YES (image + video) | null                 |
| `google/gemma-4-26b-a4b-it:free`         | 262,144 | —              | YES            | —                   | null                 |
| `meta-llama/llama-3.3-70b-instruct:free` | 131,072 | —              | YES            | No                  | null                 |

`per_request_limits: null` means OpenRouter does not enforce a per-request token cap at its layer. Overflow is handled by the upstream provider, typically returning an error.

### Notes on `deepseek/deepseek-r1:free`

This model ID was **not present** in the live catalog at query time (2026-05-31). Available DeepSeek-R1 variants are all paid:

| Model ID                                | Context | Pricing Input/1M | Tools |
| --------------------------------------- | ------- | ---------------- | ----- |
| `deepseek/deepseek-r1`                  | 163,840 | $0.70            | YES   |
| `deepseek/deepseek-r1-0528`             | 163,840 | $0.50            | YES   |
| `deepseek/deepseek-r1-distill-qwen-32b` | 128,000 | $0.29            | No    |

---

## Tool Calling Support

### How It Works on OpenRouter

- Tool calling uses the OpenAI `tools` / `tool_choice` parameters. OpenRouter passes these through to the underlying provider.
- OpenRouter's **Auto Exacto** feature automatically re-orders providers for tool-calling requests to prefer providers with stronger tool-call quality signals (instead of pure price-weighting). This is on by default.
- To opt out of Auto Exacto (restore price-weighted routing), use `provider: { sort: "price" }` or append `:floor` to the model slug.
- For best tool-call reliability, append `:exacto` to the model slug: `openai/gpt-oss-120b:free:exacto` — this forces quality-first provider sorting.

### Programmatic Detection via Models API

```bash
# Filter models to only those supporting tool calling
curl "https://openrouter.ai/api/v1/models?supported_parameters=tools"
```

In the response, each model object includes:

```json
{
  "supported_parameters": ["tools", "tool_choice", "temperature", ...]
}
```

If `"tools"` is not in `supported_parameters`, that model will silently ignore or error on tool calls. The `gpt-oss-20b:free` has `tools` listed — but per the research brief, `gpt-oss-20b` (without `:free`) reportedly does not emit `tool_calls` in the response. This is a known discrepancy between declared and actual capability. Always test empirically.

### Confirmed Tool-Calling Status for Emma's Models

| Model                        | `tools` in `supported_parameters` | Practical Status                                                        |
| ---------------------------- | --------------------------------- | ----------------------------------------------------------------------- |
| `openai/gpt-oss-120b:free`   | YES                               | Known working (per brief)                                               |
| `google/gemma-4-31b-it:free` | YES                               | Listed, not independently confirmed — test before relying on agent loop |
| `openai/gpt-oss-20b:free`    | YES (listed)                      | Known broken at output level (no `tool_calls` in response per brief)    |

### Free Gemini Models

`google/gemini-2.5-flash:free` is **not** listed in the current catalog as a free variant (no `:free` slug found). The paid `google/gemini-2.5-flash` does support tools (`"tools"` in `supported_parameters`). The free model `google/gemma-4-31b-it:free` supports tools and is a distinct product (Gemma, not Gemini).

---

## OpenRouter Models API

### Endpoint

```
GET https://openrouter.ai/api/v1/models
```

No authentication required. Response is a JSON object with a `data` array of model objects.

### Key Fields per Model Object

| Field                                | Type                                           | Description                                             |
| ------------------------------------ | ---------------------------------------------- | ------------------------------------------------------- |
| `id`                                 | string                                         | Model slug used in API requests                         |
| `context_length`                     | number                                         | Max context window in tokens                            |
| `pricing.prompt`                     | string                                         | USD per input token (string to preserve precision)      |
| `pricing.completion`                 | string                                         | USD per output token                                    |
| `per_request_limits`                 | `{ prompt_tokens, completion_tokens }` or null | Per-request token caps (null = no OpenRouter-level cap) |
| `supported_parameters`               | string[]                                       | List of supported API parameters                        |
| `architecture.input_modalities`      | string[]                                       | Supported inputs: `["text"]`, `["image","text"]`, etc.  |
| `top_provider.context_length`        | number                                         | Provider-level context cap                              |
| `top_provider.max_completion_tokens` | number                                         | Max output tokens at provider level                     |

### Filter by Tool Support

```bash
curl "https://openrouter.ai/api/v1/models?supported_parameters=tools"
```

### Filter Free Models Only

```bash
curl "https://openrouter.ai/api/v1/models" | jq '[.data[] | select(.pricing.prompt == "0")]'
```

---

## Error Handling & Fallback Patterns

### HTTP Status Codes

| Code | Meaning             | When it occurs                                                |
| ---- | ------------------- | ------------------------------------------------------------- |
| 400  | Bad Request         | Invalid parameters, prompt injection block, malformed request |
| 402  | Payment Required    | Negative credit balance (also blocks free model access)       |
| 403  | Forbidden           | Guardrail blocked the request                                 |
| 408  | Request Timeout     | Request exceeded time limit                                   |
| 413  | Payload Too Large   | Context window exceeded                                       |
| 429  | Too Many Requests   | Rate limit hit (free tier daily/per-minute cap)               |
| 502  | Bad Gateway         | Upstream provider returned an error or is down                |
| 503  | Service Unavailable | No available provider meeting routing requirements            |

### 429 Behavior in Detail

When a free model hits its rate limit:

- HTTP status `429 Too Many Requests` is returned
- Response body: `{ "error": { "code": 429, "message": "...", "metadata": {...} } }`
- OpenRouter **may** include a `Retry-After` header (integer seconds to wait)

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 60
```

### Retry Strategy

OpenRouter docs recommend honoring the `Retry-After` header. The OpenRouter SDK, OpenAI SDK, and Vercel AI SDK all respect this header automatically. For raw `fetch`:

```typescript
const res = await fetch('https://openrouter.ai/api/v1/chat/completions', { ... });
if (res.status === 429 || res.status === 503) {
  const retryAfter = Number(res.headers.get('Retry-After'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    await new Promise(r => setTimeout(r, retryAfter * 1000));
    // retry the request
  }
}
```

For free models specifically: a 429 on a free model at its **daily cap** will NOT clear by waiting — it resets at midnight UTC. Retrying with exponential backoff is only useful for per-minute rate limit breaches (RPM), not for daily cap exhaustion (RPD).

### Mid-Stream Errors

If streaming has already started and an error occurs, OpenRouter sends an SSE event with HTTP 200 but includes the error in the stream body:

```json
{
  "error": { "code": "server_error", "message": "Provider disconnected" },
  "choices": [{ "delta": { "content": "" }, "finish_reason": "error" }]
}
```

Emma's `stream-client.ts` should detect `finish_reason: "error"` to handle mid-stream failures.

### Model Array (Automatic Fallback)

Instead of a single `model`, pass `models` (array) to automatically fall back:

```json
{
  "models": [
    "openai/gpt-oss-120b:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "openai/gpt-4o-mini"
  ],
  "messages": [...]
}
```

OpenRouter tries models in order. Triggers include: provider down, rate limit, content moderation block. The `model` field in the response body indicates which model was actually used. This mechanism is the recommended way to handle free-tier exhaustion gracefully.

---

## Model Routing Strategy for Emma

### Current State

| Route in Emma                     | Current Model                | Issue                                                                  |
| --------------------------------- | ---------------------------- | ---------------------------------------------------------------------- |
| Brain (`POST /api/emma`)          | `openai/gpt-oss-120b:free`   | Low daily cap, text-only, shared RPD pool                              |
| Utility (JSON extraction, memory) | `openai/gpt-oss-120b:free`   | Same cap, tools confirmed working                                      |
| Vision (`POST /api/emma/vision`)  | `google/gemma-4-31b-it:free` | Max completion 32K, tools supported, vision supported                  |
| Agent loop (`agent-loop.ts`)      | `openai/gpt-oss-120b:free`   | Tool calling confirmed, but daily cap will block agentic loops quickly |

### Recommended Strategy (for when implementation is approved)

**Brain route:**

```json
{
  "models": ["openai/gpt-oss-120b:free", "meta-llama/llama-3.3-70b-instruct:free"],
  "fallback to paid": "openai/gpt-4o-mini"
}
```

**Utility route (JSON extraction, small tasks):**

- `openai/gpt-oss-120b:free` is good for this — fast, tool-capable
- Paid fallback: `google/gemini-2.5-flash-lite` ($0.10/1M input — cheapest with tools)

**Vision route:**

- `google/gemma-4-31b-it:free` works (image + video input, tools), 262K context, but 32K max output
- Paid fallback: `google/gemini-2.5-flash` ($0.30/1M input, 1M context, tools)

**Agent loop (`agent-loop.ts`):**

- This is the highest-risk use case for free models. Each agentic step = 1 RPD request. A 10-step agent task burns 10 of the 50-1000 daily requests.
- Recommend: detect whether the free tier has budget remaining (via `GET /api/v1/key` credit check) before starting an agent run; fall back to paid model if budget is low.
- `openai/gpt-oss-120b:free` supports `tools` and `tool_choice` which are required for agent loops.

**Free Router meta-model:**

```json
{ "model": "openrouter/free" }
```

This `openrouter/free` meta-model automatically selects a free model for each request. It follows the same RPD limits. It supports tools.

---

## Cost Reference (Paid Fallback)

All prices are per 1M tokens from the live API, USD.

| Model                               | Context   | Input/1M | Output/1M | Tools | Best For                                           |
| ----------------------------------- | --------- | -------- | --------- | ----- | -------------------------------------------------- |
| `google/gemini-2.5-flash-lite`      | 1,048,576 | $0.10    | $0.40     | YES   | Cheapest paid with tools — utility tasks           |
| `meta-llama/llama-3.3-70b-instruct` | 131,072   | $0.10    | $0.32     | YES   | Cheap, open-weight, reliable tools                 |
| `openai/gpt-4o-mini`                | 128,000   | $0.15    | $0.60     | YES   | Established, reliable tool calling, widely tested  |
| `google/gemini-2.5-flash`           | 1,048,576 | $0.30    | $2.50     | YES   | Vision + tools, large context, best vision quality |
| `anthropic/claude-haiku-4.5`        | 200,000   | $1.00    | $5.00     | YES   | High-quality instruction following, expensive      |
| `deepseek/deepseek-r1-0528`         | 163,840   | $0.50    | —         | YES   | Reasoning tasks only                               |

**Recommended paid brain fallback:** `openai/gpt-4o-mini` — best price/reliability ratio for streaming chat with tool calling.

**Recommended paid vision fallback:** `google/gemini-2.5-flash` — native vision, large context, tools, reasonable price.

**Recommended paid utility fallback:** `google/gemini-2.5-flash-lite` — $0.10/1M input is near-free, tools supported, 1M context.

---

## Streaming on Free Models

- SSE streaming (`stream: true`) works on all free `:free` models. No known restriction specific to the free tier.
- Free model requests still go through standard SSE delivery: `data: {...}\n\n` chunks, terminated with `data: [DONE]`.
- Mid-stream errors (provider disconnect, context overflow) are delivered as SSE events with `finish_reason: "error"` at HTTP 200, not as a new HTTP error status.
- The `stream: true` path is what Emma's brain route already uses — this is confirmed compatible.

---

## Context Window Limits

| Model                        | Context Window                             | Behavior When Exceeded                          |
| ---------------------------- | ------------------------------------------ | ----------------------------------------------- |
| `openai/gpt-oss-120b:free`   | 131,072 tokens                             | HTTP 400/413 from upstream provider             |
| `google/gemma-4-31b-it:free` | 262,144 tokens (input) / 32,768 max output | Upstream error; note max output cap is separate |
| `openai/gpt-4o-mini`         | 128,000 tokens                             | HTTP 400/413 from upstream provider             |
| `google/gemini-2.5-flash`    | 1,048,576 tokens                           | HTTP 400/413 from upstream provider             |

When context is exceeded, the Responses API (`/api/v1/responses`) transforms `context_length_exceeded` into a successful completion with `finish_reason: "length"`. The chat completions API (`/api/v1/chat/completions`) — which Emma uses — returns a 400 or 413.

Emma's personas + memories + vision context can grow large. At 131K tokens, `gpt-oss-120b:free` will struggle with long conversation histories. `gemma-4-31b-it:free`'s 262K context is more forgiving for vision requests, but its 32K max output may truncate verbose responses.

---

## Relevance to Emma

### `src/core/agent-loop.ts`

- Each loop iteration is 1 API request = 1 RPD count against the shared free tier pool.
- A multi-step agent task (say 8 tool calls) consumes 8 of 50 daily requests on a zero-credit account.
- Tool calling is confirmed working for `gpt-oss-120b:free`. Adding `:exacto` suffix improves quality-first provider routing.
- Implement `Retry-After` header handling. The current OpenRouter streaming client in `src/lib/stream-client.ts` should check for 429 and surface it to the caller to decide between retry and fallback.

### `src/app/api/emma/route.ts` (brain SSE route)

- Add a `models` array to the request body with at least one free fallback and one paid fallback.
- Track which model was returned in the response `model` field — this can feed into the `done` event sent downstream.

### `src/app/api/emma/vision/route.ts`

- `google/gemma-4-31b-it:free` supports `["image", "text", "video"]` as input modalities. It is the correct free vision model.
- Its max output is 32,768 tokens (provider cap). This is sufficient for scene analysis but should not be used for generating long text.

### `src/core/models.ts`

- Should export a `MODELS_FALLBACK` array per route type (brain, utility, vision) so each API route can pass `models: [primary, ...fallbacks]` rather than a single `model`.
- Add a helper to detect if a model slug includes `tools` in `supported_parameters` using the live `/api/v1/models` endpoint (or a cached snapshot).

### Free Tier Warning UX

- Consider a soft warning at the UI layer when the account has fewer than 10 credits (no-credits tier gives only 50 RPD, which is 50 total messages per day for a single user if each message = 1 call, or far fewer if each message triggers multiple calls including memory and emotion routes).

---

## Sources

- `https://openrouter.ai/docs/llms-full.txt` — full documentation snapshot, browsed 2026-05-31
- `https://openrouter.ai/api/v1/models` — live models API, queried 2026-05-31
- `https://openrouter.ai/docs/faq` (rendered HTML) — rate limit numbers: 50 RPD (no credits), 1000 RPD ($10+ credits), $10 credit threshold
- OpenRouter docs sections referenced: Model Fallbacks, Free Variant, Service Tiers, Rate Limits, Tool Calling, Zero Completion Insurance, Streaming, Error Handling, Model API Standard
