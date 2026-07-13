# Phase 7A — Brain Architecture Readiness Review

**Type:** Read-only engineering audit (no implementation, no refactoring)
**Date:** 2026-07-13
**Branch reviewed:** `verify/p6-production-validation` (current `main` state — Phase 6 merged)
**Scope:** Determine whether Emma is ready to introduce a dedicated Brain Gateway abstraction per `docs (external)/Emma Brain Architecture Notes`.

---

## Executive Summary

Emma is still architecturally in **"Phase 1"** of its own documented Brain Provider Roadmap: every inference call goes straight to OpenRouter, with no Brain Gateway, no Task Classifier, no Capability Registry, and no second provider anywhere in the codebase (`ollama`, `vllm`, `lm studio` — zero matches in `src`).

The good news: this Phase 1 implementation is **unusually disciplined** for a pre-gateway codebase. A `MODEL_BRAIN`/`MODEL_VISION`/`MODEL_UTILITY` registry (`src/core/models.ts`) already centralizes model selection with per-task fallback arrays. A shared `src/lib/openrouter.ts` module already centralizes the API URL, auth headers, and response-shape extraction. Nine of eleven inference call sites already import from that shared module rather than reinventing it. Retry/backoff/timeout logic is centralized in `src/lib/errors.ts`. Cost accounting is centralized in `src/core/cost-gate.ts`. This is far closer to "Brain Gateway minus the abstraction boundary" than a typical scattered integration.

The bad news, and the reason this is **CONDITIONAL GO, not GO**: there is no seam. `fetch(OPENROUTER_URL, ...)` is called directly from nine different files — the chat route, the agent loop (twice), the vision route, the emotion route, and five utility routes (memory, persona, summarize, reflection, whatsapp ingest) — each hand-building its own request body, and two of them (chat route, agent loop) bypassing the shared `extractText`/`extractUsage` helpers entirely and re-declaring inline response types. `src/lib/embeddings.ts` doesn't even reuse the shared header/URL constants — it duplicates them with a second hardcoded OpenRouter endpoint. Streaming (SSE) parsing exists in exactly one place (the chat route) with OpenRouter's specific `data: {...}` / `choices[0].delta.content` shape hand-rolled inline — there is no reusable stream-normalization boundary a second provider could plug into. And one concrete documentation/implementation gap was found: `docs/explanation-architecture.md` claims the chat pipeline "attaches tools: web_search, web_fetch, integration tools, MCP tools" — it does not; tool-calling exists only in the separate agent-loop path.

None of this is a crisis. It is exactly the shape of technical debt you'd expect from a team that centralized model config and low-level plumbing early but never had a second provider to force a real interface boundary. The fix is mechanical, not architectural: wrap the nine call sites behind one `brain.chat()`-shaped function. The risk is almost entirely in the streaming path (the chat route) and in getting the fallback-array semantics (`BRAIN_MODELS`, `VISION_MODELS`, `UTILITY_MODELS`) right inside the new abstraction, since OpenRouter's `models: [...]` fallback array is an OpenRouter-specific feature that a future Ollama/vLLM provider will not have.

**Verdict: CONDITIONAL GO.** Proceed to Phase 7B after two mandatory prerequisites (below) — both are refactors of existing call sites, not new capability.

---

## Context Review

**Documentation reviewed:** `CLAUDE.md`, `docs/explanation-architecture.md`, `docs/adr/0001-behavior-flags.md`, `docs/adr/0002-companion-state-persistence.md`, `docs/checklist-production-readiness.md`, `docs/reference-env-vars.md`, `docs/phase6-production-validation-report.md`, plus the three external architecture notes supplied for this review (Brain Architecture, AppShell Revision, AppShell Addendum). No `.claude/build.md`, README architecture section, or standalone "Project Vision" doc exists in the repo — `CLAUDE.md` is the closest equivalent and was treated as authoritative for conventions.

**Repository areas inspected:** `src/app/api/emma/route.ts` (chat), `src/app/api/emma/vision/route.ts`, `src/app/api/emma/emotion/route.ts`, `src/app/api/emma/memory/route.ts`, `src/app/api/emma/persona/route.ts`, `src/app/api/emma/summarize/route.ts`, `src/app/api/emma/cron/reflection/route.ts`, `src/app/api/emma/ingest/whatsapp/route.ts`, `src/core/agent-loop.ts`, `src/core/tool-registry.ts`, `src/core/models.ts`, `src/lib/openrouter.ts`, `src/lib/embeddings.ts`, `src/lib/errors.ts`, `src/lib/stream-client.ts`, `src/core/env-validation.ts`, `src/core/behavior-flags.ts`, `src/core/command-parser.ts`, `src/core/cost-gate.ts`, plus the test suite (`tests/unit/openrouter.test.ts`, `tests/integration/openrouter-e2e.test.ts`, `tests/unit/agent-loop*.test.ts`, `tests/unit/errors.test.ts`, `tests/unit/command-parser.test.ts`).

**Implementation differences discovered:**

1. `docs/explanation-architecture.md` line 31 states the chat pipeline "attach[es] tools: web_search, web_fetch, integration tools, MCP tools." **Verified false** — `src/app/api/emma/route.ts`'s OpenRouter request body (lines 503–508) has no `tools` key. Tool-calling exists only in `src/core/agent-loop.ts` (the separate autonomous-agent path behind `/api/emma/agent` and cron triggers). This is a stale doc line, not a code bug — flagged for correction, not remediation.
2. CLAUDE.md's engine table describes `personas.ts`, `models.ts`, etc. accurately; no other discrepancies found there.
3. No ADR or doc currently describes the OpenRouter coupling itself as a named architectural concern — ADR 0001 mentions it only in passing ("Emma routes through OpenRouter with a fallback model list") while rejecting fine-tuning as an alternative. There is no ADR for "why direct-to-OpenRouter, no gateway yet," which is fine for Phase 1 but is exactly the gap Phase 7B should close with an ADR of its own.

**Assumptions avoided:** Did not assume `docs/explanation-architecture.md` reflected the current `route.ts` — verified the tool-attachment claim directly against the request body construction. Did not assume `src/lib/openrouter.ts` was consistently used — verified per call site via grep, which is what surfaced the `embeddings.ts` duplication and the two call sites that bypass `extractText`/`extractUsage`.

---

## Current Inference Architecture

Actual runtime flow for the primary chat path (`POST /api/emma`):

```
User (browser)
  │
  ▼
sanitiseInput()                  src/core/security/sanitise.ts
  │
  ▼
POST /api/emma                   src/app/api/emma/route.ts
  ├─ auth (Supabase) + waitlist gate + per-user rate limit
  ├─ enforceCostGate()           src/core/cost-gate.ts   (plan/window check)
  ├─ getRelevantMemoriesForUser()  src/core/memory-db.ts (Supabase, fail-open)
  ├─ getLatestConversationSummary() (fail-open)
  ├─ loadClientConfigForUser()     (fail-open)
  ├─ deriveBehaviorFlags()       src/core/behavior-flags.ts   (pure, ADR 0001)
  ├─ buildSystemPrompt()         src/core/personas.ts
  │     (persona + memories + vision context + emotion + behavior directives)
  ├─ apiMessages built inline (Anthropic content blocks → OpenAI content parts,
  │     hand-rolled in route.ts, not shared with agent-loop.ts's equivalent path)
  │
  ▼
fetchWithRetry(OPENROUTER_URL, {headers: openRouterHeaders(), body: {models: BRAIN_MODELS, stream:true, ...}})
  │        src/lib/errors.ts (retry/backoff/timeout)  +  src/lib/openrouter.ts (URL/headers)
  ▼
Raw OpenRouter SSE stream — hand-parsed inline in route.ts
  (buffer/split on "\n", "data: " prefix, JSON.parse per line, usage + finish_reason
   captured from whichever chunk carries them — OpenRouter-specific chunk shape)
  │
  ▼
parseEmmaResponse()              src/core/command-parser.ts
  (strips [emotion:], [EMMA_ROUTINE] — provider-agnostic, operates on plain text)
  │
  ▼
validateResponseBehavior()       src/core/response-validator.ts  (log-only)
  │
  ▼
SSE "done" event → client        src/lib/stream-client.ts
  │
  ▼
saveCompanionState() (fire-and-forget, ADR 0002)
  │
  ▼
TTS (/api/emma/tts, ElevenLabs — separate provider, not OpenRouter) → Avatar (client-side Live2D)
```

Six other server-side inference calls exist outside this path, all one-shot (non-streaming) OpenRouter chat-completions calls with `response_format: json_schema` or plain text:

| Call site                                   | Model tier                                | Purpose                                                                     |
| ------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------- |
| `src/core/agent-loop.ts` (main loop)        | `BRAIN_MODELS`                            | autonomous tool-calling steps                                               |
| `src/core/agent-loop.ts` (`evaluateTool`)   | `UTILITY_MODELS`                          | tier-3 pre-execution safety check                                           |
| `src/app/api/emma/vision/route.ts`          | `VISION_MODELS`                           | scene analysis, structured JSON output                                      |
| `src/app/api/emma/emotion/route.ts`         | `VISION_MODELS`                           | facial-expression emotion detection                                         |
| `src/app/api/emma/memory/route.ts`          | `UTILITY_MODELS`                          | memory extraction                                                           |
| `src/app/api/emma/persona/route.ts`         | `UTILITY_MODELS`                          | persona description screening                                               |
| `src/app/api/emma/summarize/route.ts`       | `UTILITY_MODELS`                          | conversation summarization                                                  |
| `src/app/api/emma/cron/reflection/route.ts` | `UTILITY_MODELS`                          | weekly reflection generation                                                |
| `src/app/api/emma/ingest/whatsapp/route.ts` | `UTILITY_MODELS`                          | inbound message triage                                                      |
| `src/lib/embeddings.ts`                     | hardcoded `openai/text-embedding-3-small` | document embeddings (separate `/embeddings` endpoint, not chat-completions) |

Every one of these calls `enforceCostGate()` / `recordCostResult()` from `src/core/cost-gate.ts` before/after — cost accounting is already fully centralized and provider-agnostic (it takes token counts, not provider objects). This is a meaningful asset for Phase 7B: the gateway does not need to introduce cost tracking, only preserve the existing contract.

---

## Repository Findings

- **Model configuration is already centralized** (`src/core/models.ts`): three named tiers (`MODEL_BRAIN`, `MODEL_VISION`, `MODEL_UTILITY`) each with a documented purpose and a fallback array (`BRAIN_MODELS`, `VISION_MODELS`, `UTILITY_MODELS`). This is functionally a primitive Capability Registry already — it just maps task→model instead of task→capability→provider. Phase 7B's Capability Registry is an extension of this file, not a replacement.
- **Low-level provider plumbing is already centralized** (`src/lib/openrouter.ts`): URL constant, auth header builder, `extractText`/`extractUsage`. 9 of 11 call sites import it.
- **Two call sites silently duplicate the response-parsing logic instead of using the shared helpers**: `route.ts` (lines 587–598) and `agent-loop.ts` (lines 392–409, 1137–1144) each declare their own inline `OpenRouterData` type and manually index `data.choices?.[0]?.message`/`usage` rather than calling `extractText`/`extractUsage`. Functionally equivalent today, but it means the response-shape assumption is written three times instead of once — a provider migration has to find and update all three.
- **`src/lib/embeddings.ts` duplicates rather than reuses `src/lib/openrouter.ts`**: it hardcodes a second `OPENROUTER_API_KEY` header-builder (`headers()`, lines 6–15) and a second base URL (`EMBEDDINGS_URL`), instead of extending the shared module with an embeddings endpoint constant. Minor, but it is the one clear instance of provider-URL/key logic actually forking rather than centralizing.
- **Streaming exists in exactly one place** (`route.ts`) and is written directly against OpenRouter's SSE chunk shape (`chunk.choices?.[0]?.delta?.content`, `chunk.usage`, `chunk.choices?.[0]?.finish_reason`). No other call site streams, so there is no cross-site inconsistency risk here — but there is also no existing normalized "stream event" type to design a provider interface around; Phase 7B will be designing that shape from scratch, not extracting it from something that already exists in two places.
- **Retry/timeout/backoff is fully centralized and provider-agnostic** (`src/lib/errors.ts`): `fetchWithRetry()` takes a URL and `RequestInit`, has no OpenRouter-specific knowledge, and already normalizes failures into a typed `EmmaError`/`ApiError`/`RateLimitError` hierarchy with `getPersonaErrorMessage(status)` for in-persona user-facing copy. This is very close to the "Response Validator" / normalized-error-contract piece Brain Gateway needs — it just needs to move under the gateway boundary, not be redesigned.
- **`getSupabaseAdmin()` is independently re-implemented inline in `src/core/tool-registry.ts`** rather than imported from `src/lib/supabase/admin.ts`. Not inference-related, but noted since it's the same "centralization exists elsewhere but this file forked it" pattern seen in `embeddings.ts` — worth a single sweep during Phase 7B rather than two separate cleanup passes.
- **`OPENROUTER_API_KEY` is the single required env var for all LLM calls** (`docs/reference-env-vars.md`, `src/core/env-validation.ts` `PRODUCTION_REQUIRED_ENV`). No per-task or per-provider env var namespacing exists yet — introducing a second provider will need new env vars (`OLLAMA_BASE_URL`, etc.) and `env-validation.ts` will need to become conditional on which providers are active rather than a flat required list.
- **Behavior flags, personas, memory, emotion fusion, and command parsing are all already fully provider-agnostic.** `deriveBehaviorFlags()` takes plain data (memories, emotion state, persona id, hour) and returns an enum struct — zero OpenRouter knowledge. `parseEmmaResponse()` operates on plain response text via regex/tag extraction — zero OpenRouter knowledge. This is the strongest part of the architecture relative to the Brain Gateway vision: the "personality layer above the LLM" that the philosophy doc calls out is genuinely already provider-independent today. Brain Gateway work does not need to touch any of `personas.ts`, `behavior-flags.ts`, `emotion-engine.ts`, `memory-db.ts`, or `command-parser.ts`.

---

## Provider Dependency Audit

| Dependency type           | Where                                                                                                                                                      | Detail                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SDK usage                 | none                                                                                                                                                       | OpenRouter is called via raw `fetch`, not an SDK — actually simplifies migration (no SDK-specific types to unwind)                                                                                                                                                                                                                                                                   |
| REST endpoint             | `src/lib/openrouter.ts` (`OPENROUTER_URL`), `src/lib/embeddings.ts` (`EMBEDDINGS_URL`, duplicated)                                                         | two hardcoded OpenRouter endpoints                                                                                                                                                                                                                                                                                                                                                   |
| Model identifiers         | `src/core/models.ts`                                                                                                                                       | centralized, but values are OpenRouter-namespaced strings (`"openai/gpt-oss-120b:free"`, `"google/gemini-2.5-flash"`) — a non-OpenRouter provider (Ollama/vLLM) uses bare model names with no such namespacing, so the string format itself is OpenRouter-shaped                                                                                                                     |
| Provider payload shape    | 9 call sites                                                                                                                                               | `{ models: [...], messages: [...], stream, max_tokens, response_format, tools }` — this is OpenAI-compatible-API shape (which OpenRouter, Ollama, and vLLM's OpenAI-compat endpoints all speak), so payload shape is actually **not** a hard blocker; the `models` array (fallback-list) field is OpenRouter-specific and has no equivalent in a single-model Ollama/vLLM deployment |
| Provider response parsing | 9 call sites, 2 of which bypass the shared helpers                                                                                                         | `choices[0].message.content`, `usage.prompt_tokens`/`completion_tokens` — again OpenAI-compatible shape, portable to Ollama/vLLM's OpenAI-compat surface, but hand-parsed independently at each site                                                                                                                                                                                 |
| Provider configuration    | `OPENROUTER_API_KEY` env var, `HTTP-Referer`/`X-Title` headers (OpenRouter-specific attribution headers, harmless if sent to a provider that ignores them) | single env var, centralized                                                                                                                                                                                                                                                                                                                                                          |
| Error codes               | `route.ts` maps OpenRouter HTTP status → `getPersonaErrorMessage()` (400/401/429/500/502/503/504/529)                                                      | 529 ("overloaded") is an Anthropic-via-OpenRouter-specific status code baked into the persona-copy switch — a provider-specific detail leaking into otherwise-generic error handling                                                                                                                                                                                                 |

**Has provider knowledge leaked into business logic?** Mostly no. The `[emotion:]` tag convention, `[EMMA_ROUTINE]` tag, and behavior-flag directive rendering are all Emma's own prompt conventions, not OpenRouter's — they'd survive a provider swap untouched. The one place business logic and provider shape are entangled is the streaming loop in `route.ts`, where SSE chunk parsing, token accounting, and finish-reason interpretation (`"content_filter"` → `refused`, `"length"` → `contextWindowExceeded`) all happen inline together. That's the highest-value/highest-risk extraction target for Phase 7B.

---

## Coupling Analysis

- **UI ↔ API:** clean. `src/lib/stream-client.ts` only knows the SSE envelope Emma's own route emits (`type: "delta" | "done" | "error"`), not OpenRouter's chunk format — the chat route already does the translation. No client-side work needed for a provider swap.
- **API ↔ Brain services:** the chat route directly inlines context-building, memory-loading, behavior derivation, prompt assembly, _and_ the OpenRouter call in one function body (`route.ts` is 721 lines, one `POST` handler). There is no `ContextBuilder`/`MemorySelector`/`ModelRouter` module boundary — those are conceptual stages performed as sequential code in one file, not swappable units. This is the main "Layer Boundary" gap relative to the target architecture.
- **Brain services ↔ Provider:** Memory, Emotion, Behavior, and Prompt-building modules have zero import of `openrouter.ts` or `models.ts` — good, this boundary already holds. Only the route handlers and `agent-loop.ts` import the provider layer.
- **Streaming ↔ Provider:** tightly coupled — the SSE parser assumes OpenRouter's exact `data: {...}` chunk shape inline in `route.ts`. This is the piece most likely to break or require a real redesign (not just a wrapper) when a second streaming-capable provider (vLLM, Ollama) is added, because different providers' streaming chunk shapes are not guaranteed compatible even when both claim "OpenAI-compatible."
- **Migration impact:** Given payload/response shape is largely OpenAI-compatible already, a same-shape provider (Ollama's OpenAI-compat mode, vLLM's OpenAI-compat server) would require touching 9 files for the URL/header swap and 1 file (the streaming loop) for real behavioral verification. A structurally different provider (native Anthropic SDK, as hinted in `explanation-architecture.md`'s prompt-caching aside) would require the full Brain Gateway abstraction to avoid a second parallel implementation.

---

## Streaming Architecture Review

Server-Sent Events, not WebSockets (documented rationale in `explanation-architecture.md` is sound: unidirectional, Edge-Runtime-compatible, simpler reconnection). The single streaming call site:

1. Reads the raw `ReadableStreamDefaultReader<Uint8Array>` from the OpenRouter response body.
2. Manually buffers, splits on `\n`, strips `data: ` prefixes, skips `[DONE]`, `JSON.parse`s each line.
3. Extracts `delta.content`, `usage`, `finish_reason` from OpenRouter's specific chunk shape.
4. Re-emits its own SSE envelope to the client (`type: "delta"`/`"done"`).
5. Interleaves cost accounting (`accountOnce`), companion-state snapshotting, and warning-window marking directly inside the stream's `start()`/`cancel()` callbacks.

**Can this integrate into a provider abstraction without major redesign?** Partially. The outer shape (`ReadableStream` → Emma's own SSE envelope) can stay identical — that's already provider-agnostic from the client's perspective. What needs a real design decision, not just a wrapper, is: does `brain.chat({ stream: true })` return an async iterator of normalized delta events that the route then re-emits as SSE, or does it return a raw stream the route still has to parse? The former is the correct target (it's what lets Ollama/vLLM plug in without the route ever seeing a provider-shaped chunk), but it means the buffering/parsing logic in `route.ts` needs to move into the gateway as a provider-side concern, and the cost-accounting/companion-state side effects need to stay in the route as consumer-side concerns. That split is straightforward to specify but has not been designed yet — flagged as a Phase 7B design task, not a blocker.

**Assumptions that could complicate migration:** the code assumes `usage` and `finish_reason` arrive attached to _some_ chunk mid-stream (OpenRouter's behavior) rather than only in a final non-streamed summary object. Not all providers guarantee this. The gateway's normalized stream contract needs to define how a provider without inline usage-in-stream reports usage (e.g., a trailing synthetic event, or a required final non-streamed call).

---

## Configuration Review

- **Provider configuration:** centralized to one env var (`OPENROUTER_API_KEY`) and one constant (`OPENROUTER_URL`), except the `embeddings.ts` fork noted above. ✅ mostly centralized.
- **Model selection:** centralized in `src/core/models.ts`, task-keyed, with fallback arrays. ✅ centralized, and already close to the Capability Registry shape recommended in the Brain Architecture notes — the registry would replace flat `MODEL_BRAIN`/`BRAIN_MODELS` constants with a `capabilities: [...]` map per provider/model, but the task-keyed mental model transfers directly.
- **Environment variable isolation:** `PRODUCTION_REQUIRED_ENV` in `env-validation.ts` is a flat list with one entry for OpenRouter. Adding a second provider means this list needs to become conditional ("`OPENROUTER_API_KEY` required if OpenRouter is an active provider") rather than universally required — a small but real change, since today's fail-closed production boot check would reject a deployment that only configures Ollama.
- **Can future providers be added cleanly today?** Not without touching 9+ call sites individually — that's precisely the gap Phase 7B closes. But because payload shape is already OpenAI-compatible-ish and model selection is already centralized, "cleanly" here means "mechanically," not "requires redesigning the surrounding systems."

---

## Error Handling Review

- **Are provider errors normalized?** Partially. `src/lib/errors.ts` provides a real typed hierarchy (`EmmaError`/`ApiError`/`AuthError`/`RateLimitError`) and `fetchWithRetry()` normalizes network-level failures (timeout → `EmmaError("TIMEOUT", 504)`) uniformly across every call site that uses it. But **not every call site uses `fetchWithRetry`** — `vision/route.ts` and `emotion/route.ts` use a raw `fetch()` wrapped in their own try/catch with bespoke timeout handling (`AbortSignal.timeout(VISION_TIMEOUT_MS)`), producing a different error shape than the chat route's `fetchWithRetry`+`EmmaError` path. Two normalization patterns exist side by side.
- **Does application code depend on provider-specific error details?** Yes, in one place: `getPersonaErrorMessage()`'s switch statement includes `529` (Anthropic-via-OpenRouter's "overloaded" code) as a first-class case alongside generic HTTP codes. This is a small, contained leak — easy to keep as a provider-specific mapping table inside the gateway rather than in shared error-message logic.
- **Consistent error contracts?** The chat route returns errors as an HTTP 502 JSON body pre-stream, but _mid-stream_ errors are emitted as an SSE `{type:"error"}` event instead — two different error transports for the same route depending on failure timing. Not wrong (it's a reasonable consequence of SSE), but worth documenting explicitly as the gateway's stream-error contract rather than leaving it implicit.

---

## Logging & Observability

Current state: `console.error`/`console.warn` at each call site (inconsistent prefixes: `[EMMA]`, `[EMMA API]`, `[EMMA Vision API]`, `[EMMA Emotion API]`, `[Agent]`) plus `Sentry.captureException`/`captureMessage` at the route/agent-loop level only — the five smaller utility routes (memory, persona, summarize, reflection, whatsapp) have no Sentry instrumentation on their OpenRouter calls, only `console.error`. Cost/token accounting is captured per-call via `cost-gate.ts` (this is the closest thing to inference metrics that exists today — it's provider-agnostic and already answers "how many tokens, what did it cost, which operation").

**Where should these responsibilities live after Brain Gateway is introduced?** Logging prefix and Sentry-capture should become a single gateway-level concern (one wrapper around every provider call, not nine copies of `console.error(...)` with inconsistent tags) so that a provider swap doesn't also require re-adding instrumentation at each site. Cost/token accounting's current contract (`enforceCostGate`/`recordCostResult`, provider-agnostic token counts in/out) should be preserved as-is and simply invoked once from inside the gateway rather than at each call site — this is a low-risk move since the interface is already provider-independent.

---

## Folder & Module Organization

Current: no `providers/`, `brain/`, or `gateway/` directory exists anywhere in `src`. Provider-adjacent code lives flat in `src/lib/` (`openrouter.ts`, `embeddings.ts`, `errors.ts`) and `src/core/` (`models.ts`). This is a reasonable Phase 1 layout and does not block Phase 7B — it needs one new addition, not a reorganization: a `src/core/brain/` (or `src/lib/brain/`) directory to hold the gateway module, a `Provider` interface, and the OpenRouter provider implementation (which is largely a relocation of `openrouter.ts` + `models.ts` behind that interface, not new code). Existing files (`personas.ts`, `behavior-flags.ts`, `memory-db.ts`, `command-parser.ts`, `response-validator.ts`) need zero movement — they already sit at the correct layer above the provider boundary.

---

## Technical Debt Assessment

| #   | Issue                                                                                                                                                           | Architectural impact                                                                                                            | Migration difficulty                                      | Resolve before or during 7B?                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | 9 independent `fetch(OPENROUTER_URL, ...)` call sites, no shared `brain.chat()` seam                                                                            | This _is_ the missing Brain Gateway boundary — every other finding is downstream of this one                                    | Medium (mechanical, but streaming call needs real design) | **Before/during 7B — this is 7B's core deliverable**                                                                                             |
| 2   | 2 call sites (`route.ts`, `agent-loop.ts`) bypass `extractText`/`extractUsage` and redeclare response types inline                                              | Response-shape assumption lives in 3 places instead of 1; a provider swap has to find and update all 3                          | Low                                                       | During 7B (folds naturally into #1)                                                                                                              |
| 3   | `embeddings.ts` duplicates URL/header construction instead of extending `openrouter.ts`                                                                         | Same fix needed twice if OpenRouter's auth/headers ever change                                                                  | Low                                                       | During 7B                                                                                                                                        |
| 4   | Streaming SSE parsing hardcoded to OpenRouter's chunk shape, only one call site, no normalized "stream event" type exists to design a Provider interface around | Highest-risk piece of the whole migration — needs a real interface decision (async iterator vs. raw stream), not just a wrapper | Medium-High                                               | During 7B — first design spike, before touching other call sites                                                                                 |
| 5   | `env-validation.ts`'s `PRODUCTION_REQUIRED_ENV` treats `OPENROUTER_API_KEY` as unconditionally required                                                         | Blocks a future Ollama-only or hybrid deployment from passing production env validation                                         | Low                                                       | During 7B, once a second provider is actually being added (not urgent for the gateway abstraction itself, which can still front only-OpenRouter) |
| 6   | Two parallel error-normalization patterns: `fetchWithRetry`+`EmmaError` (chat/agent/utility routes) vs. raw `fetch`+bespoke try/catch (vision/emotion routes)   | Minor inconsistency; not blocking, but the gateway should pick one contract and route both patterns through it                  | Low                                                       | During 7B                                                                                                                                        |
| 7   | `529` (Anthropic-via-OpenRouter status) hardcoded into shared `getPersonaErrorMessage()`                                                                        | Small provider-specific leak into otherwise-generic error copy                                                                  | Low                                                       | Optional cleanup during 7B                                                                                                                       |
| 8   | `docs/explanation-architecture.md` claims chat route attaches tools; it does not                                                                                | Pure documentation debt, zero code risk                                                                                         | Trivial                                                   | Fix now (see Recommendations)                                                                                                                    |
| 9   | No ADR exists naming "direct-to-OpenRouter, gateway deferred" as a deliberate Phase 1 decision                                                                  | Minor — future readers (including future audits) have to reverse-engineer that this was intentional, not neglect                | Trivial                                                   | During 7B, write ADR 0003 alongside the implementation                                                                                           |

Nothing here is "must fix before 7B can safely start." Items 1 and 4 are not prerequisites _to_ 7B — they are 7B's actual scope.

---

## Migration Strategy

Recommended implementation order, lowest-risk to highest-risk:

1. **Fix the doc discrepancy (#8) and write ADR 0003** ("Brain Gateway — Provider Abstraction") documenting the decision, the interface shape, and explicitly the precedent this sets over the Phase 1→5 roadmap in the external notes. Zero code risk, clarifies scope for everything after.
2. **Introduce the `Provider` interface and an `OpenRouterProvider` implementation that is a near-literal relocation of `src/lib/openrouter.ts` + `src/core/models.ts`.** No call sites change yet. This is pure addition — nothing can regress because nothing existing is touched.
3. **Migrate the six non-streaming, non-agent utility call sites first** (memory, persona, summarize, reflection, whatsapp, vision, emotion — all one-shot request/response, no SSE, no tool-calling). These are the lowest-risk migration targets: swap `fetch(OPENROUTER_URL, ...)` for `brain.chat({task: "...", ...})` one file at a time, verify against existing tests (`env-validation.test.ts`, `cost-enforcement.test.ts`, `pattern-detector.test.ts` already exercise several of these paths) after each.
4. **Migrate `embeddings.ts`** onto the same `Provider` interface (or a sibling `embed()` method) — resolves debt item #3 as part of the same pass.
5. **Migrate `agent-loop.ts`'s two call sites**, including tool-calling (`tools` param) — verify against `tests/unit/agent-loop.test.ts` and `agent-loop-autonomy.test.ts`, which already cover this path's behavior and should catch regressions in tool-call dispatch.
6. **Design and migrate the streaming chat route last.** This is the one call site where "wrap the existing code" is not sufficient — the async-iterator-vs-raw-stream decision needs to be made explicitly (see Streaming Architecture Review), then `route.ts`'s SSE loop is rewritten against the new contract. Verify against `tests/integration/openrouter-e2e.test.ts` and manual SSE testing (the existing test suite's streaming coverage should be treated as a floor, not a ceiling — add explicit stream-normalization tests as part of this step).
7. **Only after step 6 is stable:** relax `env-validation.ts`'s flat required-var list to be provider-conditional (debt item #5), since this is only meaningful once a second provider actually exists to make conditional.

**Rollback considerations:** every step through 5 is reversible by reverting the individual file's diff — the old `fetch(OPENROUTER_URL, ...)` code and the new `brain.chat()` code can coexist file-by-file during the migration with zero cross-file risk, since no call site's behavior depends on another's. Step 6 (streaming) is the one step that should ship behind a feature flag or on a short-lived branch with easy revert, given it's the highest-traffic, highest-visibility path (every chat message) and the one place the abstraction isn't a pure lift-and-shift.

**Compatibility concerns:** the `models: [...]` fallback-array field is OpenRouter-specific — the `Provider` interface needs to decide whether "model fallback list" is a first-class concept in the gateway (translated to sequential retry-with-different-model for providers that don't support server-side fallback) or an OpenRouter-only feature exposed through a provider-specific options bag. This decision affects the shape of `brain.chat()`'s parameters and should be made explicitly in the ADR, not implicitly during implementation.

---

## Risks

| Risk                                                                                                        | Impact                                                                                                                                  | Mitigation                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Streaming regression during route.ts migration (step 6)                                                     | High — every chat message goes through this path; a bug here is maximally visible                                                       | Migrate last, after the pattern is proven on 8 lower-traffic call sites; feature-flag or short-lived branch; expand `openrouter-e2e.test.ts` coverage before touching production code                                   |
| `models: [...]` fallback semantics lost or changed during abstraction                                       | Medium — silent reliability regression (free-tier model outages currently fall back automatically; a naive abstraction could drop this) | Make fallback an explicit, tested capability of the gateway interface, not an incidental side effect of the OpenRouter provider                                                                                         |
| Cost accounting (`cost-gate.ts`) double-counted or dropped during migration                                 | Medium — billing/usage-enforcement correctness                                                                                          | `enforceCostGate`/`recordCostResult` already provider-agnostic; keep call sites' cost-gate invocations unchanged and only swap the fetch layer underneath, don't move cost-gate calls into the gateway in the same pass |
| Testing gaps in the 5 utility routes with no Sentry instrumentation                                         | Low-Medium — migration bugs in low-traffic paths (reflection, whatsapp ingest) could go unnoticed                                       | Add Sentry capture as part of migrating each of these routes (natural place to fix debt item alongside the swap)                                                                                                        |
| Architecture drift — gateway introduced but call sites not fully migrated, leaving two patterns permanently | Medium — worse than the current single consistent pattern                                                                               | Track migration completion as an explicit Phase 7B exit criterion (all 9+ call sites migrated, zero direct `fetch(OPENROUTER_URL, ...)` remaining outside the provider implementation itself)                           |

---

## Recommendations

**Mandatory (before or as part of Phase 7B):**

- Correct `docs/explanation-architecture.md`'s tool-attachment claim (debt #8) — either fix the doc or, if tool access on the main chat path is actually intended, that's a product decision to surface separately, not something to silently "fix" by adding tools to the chat route during this audit.
- Design the streaming provider contract (async-iterator vs. raw-stream) explicitly, in writing, before migrating `route.ts` — this is the one piece of real design work in an otherwise mechanical migration.
- Decide and document how `models: [...]` fallback-array semantics map onto the `Provider` interface.
- Write ADR 0003 for the Brain Gateway decision.

**Optional improvements (do not block Phase 7B):**

- Consolidate the two error-normalization patterns (`fetchWithRetry` vs. raw `fetch`+try/catch) onto one.
- Drop the `529`-specific case from `getPersonaErrorMessage()` into a provider-specific mapping.
- Fold the duplicated `getSupabaseAdmin()` in `tool-registry.ts` into the shared import (unrelated to Brain Gateway, but same "centralization exists but was forked" pattern — cheap to fix in the same sweep).
- Standardize console-log prefixes across the migrated call sites while touching each file anyway.

---

## Readiness Verdict

**CONDITIONAL GO.**

Justification: the two things that would make this a NO GO — scattered, undisciplined provider access with business logic entangled in provider-response parsing, and no existing centralization to build on — are both **not the case here**. Model config, low-level headers/URL, retry logic, and cost accounting are already centralized and already provider-agnostic in their public contracts. The personality/behavior/memory layer above the LLM is already fully decoupled from OpenRouter, which is the harder and more important half of the "LLM is not Emma" philosophy in the Brain Architecture notes.

What keeps this from a clean GO: there is no actual seam yet — nine call sites hit the provider directly, two bypass even the shared response-parsing helpers, and the one streaming path has no normalized contract to build a `Provider` interface against without new design work. These are exactly Phase 7B's job, not blockers to starting it, which is why this isn't NO GO. But calling it GO would understate that the streaming design decision (async iterator vs. raw stream) and the fallback-array semantics decision are real open questions that need answers before code, not during.

---

## Phase 7B Prerequisites

### 1. Implementation Order

See **Migration Strategy** above — summarized: ADR first → `Provider` interface + `OpenRouterProvider` (pure addition) → 6 non-streaming utility routes → embeddings → agent-loop (2 sites) → streaming chat route (designed separately, migrated last) → provider-conditional env validation.

### 2. Mandatory Prerequisites

- ADR 0003 written and accepted before any call-site migration begins.
- Streaming provider contract (async-iterator vs. raw-stream) decided and documented in the ADR or a design note.
- `models: [...]` fallback-array semantics decided and documented.
- No repository-side blockers beyond these three design decisions — everything else confirmed by this audit is either already in place (model config, cost accounting, retry logic, provider-agnostic personality layer) or is mechanical migration work.

### 3. Optional Improvements

- Error-normalization pattern consolidation.
- `529` status code cleanup.
- `tool-registry.ts` `getSupabaseAdmin()` dedup.
- Console-log prefix standardization.

None of these block Phase 7B; all are cheap to fold into the migration passes that touch the same files anyway.

### 4. Potential Blockers

- **None identified that would prevent starting Phase 7B.** The closest thing to a blocker is the streaming design question — but that is resolved by doing the design work as step 1, not by discovering during implementation that no design exists.

### 5. Estimated Refactoring Complexity

| Area                                        | Complexity | Justification                                                                                                                                               |
| ------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Provider` interface + `OpenRouterProvider` | Low        | Near-literal relocation of existing, already-centralized `openrouter.ts` + `models.ts`                                                                      |
| 6 non-streaming utility routes              | Low        | Mechanical swap, one-shot request/response, existing tests cover behavior                                                                                   |
| `embeddings.ts`                             | Low        | Same pattern, separate endpoint shape (embeddings vs. chat) needs a second method on the interface                                                          |
| `agent-loop.ts` (2 sites, tool-calling)     | Medium     | Tool-calling payload/response shape (`tool_calls`, `tools` param) needs to survive abstraction; existing autonomy-tier test coverage is a strong safety net |
| Streaming chat route                        | High       | No existing normalized contract to build from; highest-traffic path; genuine design work required, not just relocation                                      |
| `env-validation.ts` conditional providers   | Low        | Small, isolated change, only meaningful once a second provider exists                                                                                       |

**Overall implementation complexity: Medium.** Dominated by the streaming path; everything else is genuinely mechanical given the existing centralization.

### 6. Risk Assessment

See **Risks** table above.

### 7. Recommended Implementation Milestones

1. **Milestone: Gateway Foundation** — ADR 0003 accepted; `Provider` interface defined; `OpenRouterProvider` implemented and unit-tested against the existing `openrouter.test.ts` behavior (should pass unchanged, since it's the same logic relocated). _Completion criterion:_ new module exists, zero existing call sites changed, all existing tests still pass.
2. **Milestone: Utility Routes Migrated** — 6 non-streaming routes + embeddings migrated to `brain.chat()`/`brain.embed()`. _Completion criterion:_ zero direct `fetch(OPENROUTER_URL, ...)` remaining outside the provider implementation in these 7 files; existing route-level tests pass unchanged.
3. **Milestone: Agent Loop Migrated** — both agent-loop call sites migrated, tool-calling verified. _Completion criterion:_ `agent-loop.test.ts` and `agent-loop-autonomy.test.ts` pass unchanged; no behavior change in tool dispatch, approval gating, or evaluator logic.
4. **Milestone: Streaming Chat Route Migrated** — streaming contract designed, implemented, `route.ts` migrated last. _Completion criterion:_ `openrouter-e2e.test.ts` passes; manual SSE verification confirms identical client-observed behavior (delta events, done event shape, error event shape all unchanged from the client's perspective).
5. **Milestone: Cleanup** — provider-conditional env validation; optional-improvement items folded in. _Completion criterion:_ `env-validation.test.ts` updated and passing; no direct OpenRouter references remain anywhere outside the provider implementation (verifiable by the same grep used in this audit returning only gateway-internal files).

### 8. Success Criteria

- Zero call sites outside the provider implementation import `OPENROUTER_URL` or `openRouterHeaders` directly (grep-verifiable).
- All existing tests (`openrouter.test.ts`, `openrouter-e2e.test.ts`, `agent-loop*.test.ts`, `errors.test.ts`, `command-parser.test.ts`, plus every route-level test that currently exercises an OpenRouter call) pass unchanged, proving behavioral equivalence.
- `docs/explanation-architecture.md` updated to reflect the new gateway boundary and the corrected tool-attachment claim.
- ADR 0003 exists and is linked from `explanation-architecture.md`'s Related section, matching the pattern of ADR 0001/0002.
- A second provider (even a stub/test double) can be registered and selected for at least one task type without modifying any of the 9 migrated call sites — this is the actual proof that the abstraction boundary works, not just that code was moved.

### 9. Overall Recommendation

**Proceed to Phase 7B after resolving the three mandatory prerequisites** (ADR, streaming contract design, fallback-array semantics — all design/documentation work, zero code). Given the unusually strong existing centralization (model config, cost accounting, retry logic, and the entire personality/behavior/memory layer are already provider-agnostic), this is a lower-risk migration than the phrase "introduce Brain Gateway" might suggest — it is closer to "formalize a boundary that mostly already exists" than "retrofit an abstraction onto a tangled integration."

---

## Exit Criteria

The repository is **ready to proceed to Phase 7B — Brain Gateway Foundation Implementation** once ADR 0003 is written and the streaming-contract and fallback-array design decisions are documented in it. No further repository changes are required as prerequisites — Phase 7B's own milestones (above) constitute the implementation, not a separate readiness gate.

Implementation is not begun automatically as part of this audit, per Phase 7A scope.

---

## Readiness Scorecard

| Area                   | Score (0–10) |                                                                                  Status                                                                                  |
| ---------------------- | -----------: | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
| Architecture           |            6 |                                            Sound layering above the provider boundary; no boundary at the provider itself yet                                            |
| Provider Isolation     |            5 |                                                       Config/model selection centralized; call-site access is not                                                        |
| Layer Boundaries       |            6 |                            Personality/behavior/memory layer is genuinely clean; API-route layer conflates orchestration with provider calls                             |
| Streaming Architecture |            4 |                                                Works well, but zero abstraction seam exists; highest-risk migration item                                                 |
| Configuration          |            7 |                               Model registry and env-var handling are centralized; needs provider-conditionality for multi-provider future                               |
| Error Handling         |            6 |                                    Strong typed-error foundation exists but is inconsistently applied (2 of ~9 call sites bypass it)                                     |
| Documentation          |            6 |                                           Good ADR discipline (0001/0002) and architecture doc; one verified stale claim found                                           |
| Technical Debt         |            6 |                         All identified debt is low-to-medium difficulty and directly addressed by Phase 7B's own scope — nothing blocks starting                         |
| Testing Confidence     |            7 | Dedicated test files for the provider layer, error layer, agent loop (including autonomy tiers), and command parsing give a real regression safety net for the migration |

**Overall Readiness Score: 6/10**
**Overall Verdict: CONDITIONAL GO**
