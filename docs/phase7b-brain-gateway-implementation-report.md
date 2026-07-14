# Phase 7B — Brain Gateway Foundation Implementation Report

**Date:** 2026-07-14
**Authority:** [ADR 0003: Brain Gateway Architecture](adr/ADR-0003-brain-gateway-architecture.md) (Accepted)
**Plan:** [Phase 7B Migration Plan](plans/2026-07-14-phase7b-brain-gateway-migration.md)
**Precursor:** [Phase 7A Readiness Review](phase7a-brain-architecture-readiness.md) (CONDITIONAL GO)

---

## Outcome

The Brain Gateway is now the single, provider-independent inference boundary. All **15 chat-completions call sites and the embeddings call site** (one more file than Phase 7A's "nine-plus" count — `history/route.ts` ×2, `pattern-detector.ts`, `task-summarizer.ts`, `tool-registry.ts` were also direct callers) have been migrated. Zero provider knowledge remains outside `src/core/brain/`; `src/lib/openrouter.ts` has been deleted. Application behavior is unchanged — the full pre-existing test suite passes without modification to any behavioral assertion.

```
grep OPENROUTER_URL|openrouter.ai|openRouterHeaders|BRAIN_MODELS|VISION_MODELS|UTILITY_MODELS  src/
  → src/core/brain/providers/openrouter.ts   (the provider — the one permitted holder)
  → src/core/models.ts                        (model-ID config, consumed only by the provider)
  → src/core/env-validation.ts                (OPENROUTER_API_KEY in required-env list — deferred, see debt)
```

## Files created

| File                                                       | Purpose                                                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/core/brain/types.ts`                                  | Normalized contracts: requests, results, stream events, messages/tools, errors, `BrainProvider`  |
| `src/core/brain/gateway.ts`                                | Public boundary: `brainChat` / `brainChatStream` / `brainEmbed` / `isBrainConfigured`            |
| `src/core/brain/providers/openrouter.ts`                   | Sole provider: wire format, SSE parsing, headers/URLs, tier→fallback-array mapping, 529 handling |
| `tests/unit/brain-gateway.test.ts`                         | 23 tests: request translation, response/error normalization, streaming, embeddings               |
| `docs/plans/2026-07-14-phase7b-brain-gateway-migration.md` | Pre-implementation migration plan (required deliverable)                                         |

## Files migrated (all call sites)

| File                                         | Sites | Change                                                                                                                                                   |
| -------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/api/emma/route.ts` (streaming chat) | 1     | `brainChatStream` + normalized event loop; client SSE envelope, cost accounting, companion-state side effects unchanged                                  |
| `src/core/agent-loop.ts`                     | 2     | Main loop (tools) + `evaluateTool` → `brainChat`; transcript shape preserved for resume                                                                  |
| `src/app/api/emma/vision/route.ts`           | 1     | `brainChat` task `vision`, `timeoutMs`, structured output                                                                                                |
| `src/app/api/emma/emotion/route.ts`          | 1     | Same; neutral fail-soft preserved                                                                                                                        |
| `src/app/api/emma/memory/route.ts`           | 1     | `brainChat` task `utility`, structured output                                                                                                            |
| `src/app/api/emma/persona/route.ts`          | 1     | Classifier via `brainChat`                                                                                                                               |
| `src/app/api/emma/summarize/route.ts`        | 1     | `brainChat`                                                                                                                                              |
| `src/app/api/emma/cron/reflection/route.ts`  | 1     | `brainChat`                                                                                                                                              |
| `src/app/api/emma/ingest/whatsapp/route.ts`  | 1     | `brainChat`; sender-rate-before-LLM ordering invariant intact (test updated to new marker)                                                               |
| `src/app/api/emma/history/route.ts`          | 2     | Title + summary via `brainChat`                                                                                                                          |
| `src/core/pattern-detector.ts`               | 1     | `brainChat`; env-key check → `isBrainConfigured()`                                                                                                       |
| `src/core/task-summarizer.ts`                | 1     | `brainChat`                                                                                                                                              |
| `src/core/tool-registry.ts`                  | 1     | `generate_summary` tool via `brainChat`                                                                                                                  |
| `src/lib/embeddings.ts`                      | 1     | Rewired onto `brainEmbed`; exported `embedBatch`/`embedText` API and cost-gate behavior preserved; forked URL/header plumbing removed (Phase 7A debt #3) |

**Deleted:** `src/lib/openrouter.ts` (zero importers after migration).
**Tests updated (mechanical only):** `tests/unit/openrouter.test.ts` (import path → provider module; assertions byte-identical, proving relocation equivalence), `tests/unit/security-hardening-prod-readiness.test.ts` (HIGH-08 marker `fetch(OPENROUTER_URL` → `brainChat(`, same invariant).
**Docs updated:** `docs/explanation-architecture.md` (new Brain Gateway section; corrected the stale "chat route attaches tools" claim — Phase 7A debt #8; two-layer streaming explanation), `CLAUDE.md` (request flow, engines table, route notes).

## Key design decisions (as documented in the plan)

- **Task tiers, not model lists:** callers request `"brain" | "vision" | "utility"`; the OpenRouter provider maps tiers to its `models: [...]` fallback arrays. Fallback is a provider capability — resolves the fallback-semantics question ADR 0003 deferred to 7B.
- **Streaming = async iterator of normalized events** (`delta` / trailing `done` with usage + finish reason), plus `cancel()` and a live usage snapshot preserving accounting-on-cancel exactly. Provider SSE parsing is fully internal.
- **Error contract mirrors existing branching:** upstream HTTP errors are returned as `{ ok: false, error: { status, code, bodyPreview, retryable } }` values (the `if (!res.ok)` pattern); transport failures throw, timeouts as the existing `EmmaError("TIMEOUT")`. The 529 → `OVERLOADED` vocabulary now lives only in the provider (debt #7 contained).
- **Canonical message shape is deliberately OpenAI-compatible** — it is Emma's persisted `step_transcript` format; changing it would force a data migration of paused tasks for zero gain. Providers translate; stability, not novelty, is the contract requirement.
- **Cost gating/accounting stayed at call sites** per Phase 7A's double-count/drop risk mitigation. The gateway only reports normalized usage.

## Validation results

Run after **every** migration stage (foundation, one-shot sites, vision/emotion, embeddings, agent loop, streaming route, cleanup):

- `npm test`: **53 files passed, 1 skipped (E2E-gated) — 642 passed / 3 skipped**, at every stage including final. All pre-existing behavioral assertions unchanged; `agent-loop.test.ts` and `agent-loop-autonomy.test.ts` pass **unmodified** (they mock global fetch with OpenRouter wire shapes — the provider still speaks that wire format, proving equivalence).
- `npx tsc --noEmit`: clean.
- `npm run build`: production build succeeds.
- `npm run lint`: 0 errors (10 pre-existing warnings in files this phase did not touch).
- Boundary audit grep (Phase 7A success criterion): provider tokens appear only in `src/core/brain/providers/openrouter.ts`, `src/core/models.ts` (provider-only consumer), `src/core/env-validation.ts` (documented, deferred).
- New coverage: 23 gateway tests (request translation, status→code table, finish-reason normalization, malformed-chunk/[DONE] handling, usage-less streams, embed ordering/usage fallback, transport-throw semantics).

**Not run:** `tests/integration/openrouter-e2e.test.ts` (requires `E2E=true` + a real `OPENROUTER_API_KEY`; not available in this session). Recommended before the next deploy: `E2E=true npx vitest run tests/integration/openrouter-e2e.test.ts` plus one manual chat in the dev app to observe live SSE.

## Accepted behavior deltas (documented in plan §4)

1. Vision/emotion 20 s bound is now a connection (headers-received) timeout with zero retries, not a whole-request abort; user-visible failure modes unchanged.
2. Their internal timeout error type is `EmmaError("TIMEOUT")` instead of `DOMException("TimeoutError")`; catch blocks updated in the same change.
3. Unreachable edge: a 200-with-no-body streaming response now yields a 502 JSON error instead of an empty SSE stream (previously silent close). Not observable with real fetch implementations.
4. Log copy at migrated sites references "Brain provider"/normalized fields instead of raw OpenRouter body text; levels, Sentry captures, and cost accounting are unchanged.

## Remaining technical debt

- `env-validation.ts` still requires `OPENROUTER_API_KEY` unconditionally (Phase 7A debt #5) — deliberately deferred until a second provider exists to make it conditional.
- `getPersonaErrorMessage()` retains its 529 persona-copy case; harmless (resolved via normalized `error.status`) and the wire-vocabulary knowledge itself now lives in the provider.
- `tests/unit/cost-enforcement.test.ts`'s stream-catch locator anchors on `"while (true)"`, which no longer exists in `route.ts`; `indexOf`'s -1 fallback makes it still assert the right block, but the anchor is brittle and worth refreshing in a test-hygiene pass.
- `tool-registry.ts`'s inline `getSupabaseAdmin` duplication (Phase 7A optional item) is not inference-related and was left untouched per the no-scope-creep rule.
- Console-log prefixes across routes remain heterogeneous (standardization was optional; preserved to keep observability text stable).

## Known limitations

- OpenRouter is the only functional provider; `Ollama`/`vLLM`/`LM Studio` are not implemented (per phase scope).
- STT (`/api/emma/stt`, OpenAI Whisper — audio endpoint OpenRouter doesn't offer) and TTS (ElevenLabs) are separate modality providers outside ADR 0003's chat/vision/embedding scope.
- No provider routing, ranking, capability registry, or cost/latency awareness — explicitly out of scope until a second provider exists.

## Future extension points

- **New provider:** implement `BrainProvider` (`src/core/brain/types.ts`) in `src/core/brain/providers/<name>.ts`; extend the selection in `gateway.ts`. No caller changes — this is the abstraction's proof criterion from Phase 7A §8.
- **Provider-conditional env validation:** make `PRODUCTION_REQUIRED_ENV` depend on the active provider when a second one lands.
- **Capability registry / routing (future ADR):** extends `gateway.ts` behind the same caller-facing functions.
- **Fallback for single-model providers:** the tier contract permits implementing fallback as sequential retry inside a provider that lacks OpenRouter's `models: [...]` capability.
- **Prompt caching:** the stable/dynamic prompt split (`buildSystemPromptBlocks`) can be surfaced through the normalized request when a caching-capable provider is added.

## Success criteria check (Phase 7B prompt)

| Criterion                                                | Status                                                                        |
| -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Every inference request passes through the Brain Gateway | ✅ grep-verified                                                              |
| No application code performs provider-specific requests  | ✅                                                                            |
| No application code parses provider responses            | ✅ (`extractText`/`extractUsage` exist only inside the provider)              |
| Duplicated provider plumbing removed                     | ✅ (`embeddings.ts` fork, 3 inline response-type copies, `lib/openrouter.ts`) |
| Streaming uses the Gateway                               | ✅                                                                            |
| Embeddings use the Gateway                               | ✅                                                                            |
| Application behavior unchanged                           | ✅ (suite unchanged and green; deltas documented above)                       |
| All production validation continues passing              | ✅ tests/typecheck/build/lint                                                 |
