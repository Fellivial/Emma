# Cost Safety and Metered Operations

Emma routes every paid or potentially expensive operation through `src/core/cost-gate.ts` before provider or heavy worker execution. The gate resolves the authenticated user and client, loads the current plan, checks the existing five-hour usage window, verifies that the authoritative usage RPC is writable with a zero-unit probe, applies an operation-specific distributed rate cap, and logs a sanitized attempt. Completed provider work reconciles tokens or conservative units and logs its result.

## Metered operations

| Operation | Surfaces |
| --- | --- |
| Chat and retrieval | `/api/emma`, OpenRouter chat, query embeddings |
| Autonomous execution | `/api/emma/agent`, agent-loop model steps, task summaries, scheduled tasks |
| Vision and emotion | `/api/emma/vision`, `/api/emma/emotion` |
| Summarization and memory | `/api/emma/summarize`, memory extraction, history title/summary, persona screening, daily reflection |
| Speech | OpenAI STT and ElevenLabs TTS, including agent `speak_text` |
| Documents | synchronous and Inngest document ingest, OCR, scanned-PDF rasterization, embeddings |
| Inbound/background AI | WhatsApp replies and pattern suggestions |

Provider metadata calls that do not create inference usage—such as listing ElevenLabs voices or reading a subscription status—remain authenticated but are not charged as inference operations.

## Failure behavior

- Budget exhausted: block with HTTP 429 before the provider call.
- Route-specific rate cap exhausted: block with HTTP 429 and `Retry-After` where available.
- Missing identity, Supabase metering failure, missing Upstash configuration, or Upstash failure in production: fail closed with HTTP 503 or skip the background item. No provider call is made.
- A failed post-provider reconciliation marks the identity metering-unhealthy. Every later paid attempt must pass the authoritative zero-unit write probe, so work remains blocked while persistence is unavailable and resumes only after that probe succeeds.
- Streaming chat uses one idempotent accounting callback for completion, provider error, stream error, missing body, and client cancellation. Successful and failed paths cannot double-record the same stream.
- Development and tests: use the same plan checks when configured and bounded in-memory rate counters when Upstash is absent.
- Provider failure after an allowed attempt: record a failed result and return the route's existing safe error or fallback.

Cost logs contain only operation name, user/client identifiers, plan, allow/block reason, success, and numeric usage. They never contain prompts, document text, audio, provider keys, or generated content.

## Required production configuration

Both variables are mandatory:

```text
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

`validateProductionEnvironment()` rejects a production deployment without them, and the runtime cost gate independently fails closed. Supabase service-role configuration is also required because plan and usage-window checks are authoritative server-side operations.
