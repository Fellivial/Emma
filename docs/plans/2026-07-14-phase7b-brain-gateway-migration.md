# Phase 7B — Brain Gateway Migration Plan

**Date:** 2026-07-14
**Authority:** [ADR 0003: Brain Gateway Architecture](../adr/ADR-0003-brain-gateway-architecture.md) (Accepted)
**Companion:** [Phase 7A: Brain Architecture Readiness Review](../phase7a-brain-architecture-readiness.md)
**Scope:** Introduce the Brain Gateway as the single provider-independent inference boundary and migrate every inference call site behind it. No behavior change, no new features, no routing, OpenRouter remains the only functional provider.

---

## 1. Verified call-site inventory

Grep-verified against `src/` on 2026-07-14. Phase 7A's "nine-plus" undercounted: there are **15 chat-completions call sites + 1 embeddings call site**.

| #   | File                                           | Task tier | Features used                                          | Transport today                                   |
| --- | ---------------------------------------------- | --------- | ------------------------------------------------------ | ------------------------------------------------- |
| 1   | `src/app/api/emma/route.ts` (chat)             | brain     | streaming SSE, dynamic max_tokens                      | `fetchWithRetry` (maxRetries 2, connTimeout 30 s) |
| 2   | `src/core/agent-loop.ts` (main loop)           | brain     | tool calling (`tools`, `tool_calls`)                   | `fetchWithRetry` (maxRetries 2)                   |
| 3   | `src/core/agent-loop.ts` (`evaluateTool`)      | utility   | temperature 0                                          | `fetchWithRetry` (maxRetries 0, connTimeout 8 s)  |
| 4   | `src/app/api/emma/vision/route.ts`             | vision    | image_url, json_schema                                 | raw `fetch` + `AbortSignal.timeout(20 s)`         |
| 5   | `src/app/api/emma/emotion/route.ts`            | vision    | image_url, json_schema                                 | raw `fetch` + `AbortSignal.timeout(20 s)`         |
| 6   | `src/app/api/emma/memory/route.ts`             | utility   | json_schema                                            | raw `fetch`                                       |
| 7   | `src/app/api/emma/persona/route.ts`            | utility   | plain                                                  | raw `fetch`                                       |
| 8   | `src/app/api/emma/summarize/route.ts`          | utility   | plain                                                  | raw `fetch`                                       |
| 9   | `src/app/api/emma/cron/reflection/route.ts`    | utility   | plain                                                  | raw `fetch`                                       |
| 10  | `src/app/api/emma/ingest/whatsapp/route.ts`    | utility   | plain                                                  | raw `fetch`                                       |
| 11  | `src/app/api/emma/history/route.ts` (title)    | utility   | plain                                                  | raw `fetch`                                       |
| 12  | `src/app/api/emma/history/route.ts` (summary)  | utility   | plain                                                  | raw `fetch`                                       |
| 13  | `src/core/pattern-detector.ts`                 | utility   | plain                                                  | `fetchWithRetry` (maxRetries 1)                   |
| 14  | `src/core/task-summarizer.ts`                  | utility   | plain                                                  | `fetchWithRetry` (maxRetries 1)                   |
| 15  | `src/core/tool-registry.ts` (generate_summary) | utility   | plain                                                  | raw `fetch`                                       |
| 16  | `src/lib/embeddings.ts`                        | embedding | `/embeddings` endpoint, duplicated URL/header plumbing | raw `fetch`                                       |

Out of scope (not LLM chat/vision/embedding providers per ADR 0003): `/api/emma/stt` (OpenAI Whisper — audio endpoint, OpenRouter has none), `/api/emma/tts` (ElevenLabs), `src/lib/stream-client.ts` (client-side, consumes Emma's own SSE envelope only). `pattern-detector.ts:175`'s env-key presence check migrates to a gateway `isBrainConfigured()` predicate.

## 2. Gateway design decisions

### 2.1 Location and modules

```
src/core/brain/
  types.ts                 — normalized contracts (requests, results, stream events, messages, tools, errors)
  gateway.ts               — public entry points: brainChat / brainChatStream / brainEmbed / isBrainConfigured
  providers/
    openrouter.ts          — the only Provider implementation: wire format, SSE parsing, headers,
                             URL constants, model fallback arrays, 529 mapping
```

`src/core/models.ts` remains the single source of truth for model IDs but becomes provider-internal configuration: after migration only `providers/openrouter.ts` imports its model constants. (`VISION_TIMEOUT_MS` remains importable by app code — it is a latency bound, not provider knowledge.)

### 2.2 Task tiers replace model arrays

Callers request `task: "brain" | "vision" | "utility"` instead of passing `BRAIN_MODELS` / `VISION_MODELS` / `UTILITY_MODELS`. The OpenRouter provider maps tier → its fallback array and sends OpenRouter's `models: [...]` field. **Fallback is therefore a provider capability**: a future single-model provider implements the same tier contract with sequential retry or a single model, and no caller changes. This resolves the fallback-semantics question ADR 0003 left to Phase 7B.

### 2.3 Error contract — mirrors existing semantics exactly

Two failure classes, chosen to map 1:1 onto every existing call site's branching:

- **Provider HTTP errors** (upstream responded non-2xx): returned as a value — `{ ok: false, error: { status, code, message, bodyPreview, retryable } }`. This mirrors today's `if (!res.ok)` branches. `code` is normalized vocabulary (`BAD_REQUEST`, `AUTH`, `RATE_LIMIT`, `OVERLOADED`, `TIMEOUT`, `UPSTREAM_ERROR`); the OpenRouter-specific 529 → `OVERLOADED` mapping lives in the provider (closes Phase 7A debt #7's leak at the boundary; `getPersonaErrorMessage` copy is unchanged).
- **Transport failures** (network error, connection timeout): thrown, exactly as `fetch`/`fetchWithRetry` throw today. Timeouts throw the existing `EmmaError("TIMEOUT", 504)`. Callers' `try/catch` blocks keep their current meaning.

Cost accounting (`enforceCostGate`/`recordCostResult`) **stays at call sites**, unchanged — per Phase 7A's explicit double-count/drop risk mitigation. The gateway only reports normalized usage.

### 2.4 Normalized request/response

```ts
BrainChatRequest  = { task, messages, maxTokens?, temperature?, responseFormat?, tools?, timeoutMs?, maxRetries? }
BrainChatSuccess  = { ok: true, text, toolCalls, finishReason, usage: { inputTokens, outputTokens } }
BrainEmbedRequest = { texts }
BrainEmbedSuccess = { ok: true, embeddings: number[][], usage: { inputTokens } }
```

`responseFormat` carries a named JSON schema (structured generation intent); the provider renders it as its wire format. Retry/timeout are generation constraints callers already express today per-site; the default is **no retries** (matching the raw-`fetch` majority), and sites that retry today pass their existing policy explicitly, so no site's retry behavior changes.

**Canonical message/tool shape:** Emma's normalized transcript shape is deliberately OpenAI-compatible (`role`/`content`/`tool_calls`/`tool_call_id`), declared in `types.ts` as Emma's own contract. Rationale: this exact shape is already persisted in `tasks.step_transcript` for approval-pause resume; inventing a different shape would require a data migration of paused tasks for zero architectural gain. Providers translate to/from their wire format — OpenRouter's translation is the identity function; a future Ollama/vLLM provider translates in its adapter. Stability of the contract is what ADR 0003 requires, not dissimilarity from any particular wire format.

### 2.5 Streaming contract (ADR 0003's open design decision)

**Decision: async iterator of normalized events**, not a caller-parsed stream.

```ts
brainChatStream(req) → { ok: true, stream: BrainStream } | { ok: false, error }   // pre-stream HTTP errors as values
BrainStream = {
  events(): AsyncGenerator<BrainStreamEvent>   // throws mid-stream on transport failure
  cancel(): Promise<void>                      // aborts the underlying provider stream
  usage: { inputTokens, outputTokens }         // live snapshot, for accounting on client cancel
}
BrainStreamEvent = { type: "delta", text } | { type: "done", usage, finishReason }
```

- Provider-side concerns (SSE buffering, `data:` framing, `[DONE]`, malformed-chunk skipping, usage/finish_reason capture from whichever chunk carries them) move inside the OpenRouter provider.
- Consumer-side concerns stay in the chat route: Emma's client SSE envelope (`delta`/`done`/`error`), tag suppression, `parseEmmaResponse`, behavior validation, cost accounting, companion-state snapshot, warning marking.
- The `done` event normalizes usage delivery: providers without inline usage-in-stream would synthesize the same trailing event — callers never know the difference (satisfies ADR 0003's streaming constraint).
- The `usage` snapshot preserves today's accounting-on-cancel behavior bit-for-bit.

### 2.6 Embeddings

`brainEmbed` becomes the only provider path for vectors. `src/lib/embeddings.ts` keeps its exported `embedBatch`/`embedText` API and its cost-gate logic (application concerns) but loses its forked URL/header plumbing (Phase 7A debt #3). Its three consumers (`route.ts`, `ingest/document`, `inngest/functions.ts`) are untouched.

## 3. Migration order and validation

Follows Phase 7A's recommended order; each step is independently revertible; validation after every step is `npm test` (all suites) plus targeted checks listed below.

| Step | Work                                                                                                                                           | Validation                                                                                                                                                                |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Gateway foundation (`src/core/brain/*`), zero call sites migrated                                                                              | New unit tests for translation/normalization/streaming parse; full suite green (pure addition)                                                                            |
| 2    | 10 low-risk one-shot sites (#6–15)                                                                                                             | Full suite; update `security-hardening-prod-readiness.test.ts` marker (`fetch(OPENROUTER_URL` → gateway call) keeping the ordering invariant                              |
| 3    | Vision + emotion (#4–5)                                                                                                                        | Full suite; fail-soft paths preserved (vision 504/502 statuses, emotion neutral fallback)                                                                                 |
| 4    | Embeddings (#16)                                                                                                                               | Full suite; `embedBatch` error message shape preserved                                                                                                                    |
| 5    | Agent loop (#2–3)                                                                                                                              | `agent-loop.test.ts` + `agent-loop-autonomy.test.ts` pass **unchanged** (they mock global fetch with OpenRouter wire shapes — the provider still speaks that wire format) |
| 6    | Streaming chat route (#1) — last, highest risk                                                                                                 | Full suite; `openrouter-e2e.test.ts` unchanged (E2E-gated); client-observed SSE envelope identical                                                                        |
| 7    | Cleanup: delete `src/lib/openrouter.ts`, repoint its unit test at the provider, grep-verify zero provider references outside `src/core/brain/` | Full suite; `npm run build`; audit grep returns only gateway-internal files                                                                                               |
| 8    | Docs: `explanation-architecture.md` (gateway boundary + fix stale tools claim, Phase 7A debt #8), `CLAUDE.md` engine table                     | Manual review                                                                                                                                                             |

## 4. Accepted, documented behavior deltas

Behavior is preserved except for two deliberate consolidations flagged by Phase 7A as the gateway "picking one contract" (debt #6):

1. **Vision/emotion timeout mechanism** changes from a whole-request `AbortSignal.timeout(20 s)` to the shared connection-timeout (headers-received) bound at 20 s with zero retries. The user-visible failure modes (vision → 504 "Vision analysis timed out"; emotion → neutral fail-soft) are unchanged; a response whose _body_ stalls after headers arrive is no longer covered by the 20 s bound. Judged acceptable: the bound exists to stop stalled providers holding the request open, which is overwhelmingly a pre-headers condition.
2. **Timeout error type** at those two sites becomes the shared `EmmaError("TIMEOUT")` instead of `DOMException("TimeoutError")` — internal only; the routes' catch blocks are updated in the same change.

## 5. Explicitly out of scope (per ADR 0003 / Phase 7B prompt)

Capability Registry, multi-provider routing/ranking, cost/latency routing, local scheduler, Ollama/vLLM/LM Studio implementations, fine-tuned Emma model, provider-conditional `env-validation.ts` (only meaningful once a second provider exists), STT/TTS providers, any redesign of Memory/Emotion/Behavior/Prompt/AppShell/Agent orchestration.
