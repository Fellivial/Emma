# Emma Brain Gateway — Implementation Decision Log

Living artifact. Appended to by every Phase 6 implementation wave (6A–6F). Records **implementation-level** decisions only — narrow choices made while translating an already-approved ADR/Technical Design into code, where the governing document left a detail unspecified or an unforeseen repository fact required a judgment call. This log does **not** record architectural decisions (those belong in an ADR) or planning decisions (those belong in the Phase 5 Implementation Planning document). Every entry must trace to, and must not contradict, its cited ADR and Technical Design reference.

---

## Wave 6A — Core Infrastructure

### 2026-07-24 — Registry-lookup fallback preserves exact pre-6A unconfigured-provider behavior

- **Wave:** 6A
- **Decision:** `gateway.ts`'s new `selectedProvider()` helper calls `registry.getConfigured()[0]` first; when that is empty (no provider reports `isConfigured() === true`), it falls through to `registry.list()[0]` — the sole registered provider — rather than returning `undefined` or throwing a new Gateway-level error.
- **Related ADR:** [ADR-0006](adr/0006-provider-registry-capabilities-descriptor-adapter-layer.md)
- **Technical Design reference:** §3.4 (Lookup); Phase 5 §5.1 task 4 ("a direct, zero-behavior-change interim state")
- **Rationale:** the existing regression test `tests/unit/brain-gateway.test.ts:109-114` asserts `brainChat()` **throws** `"OPENROUTER_API_KEY is not set"` when unconfigured (raised inside `openrouter.ts`'s `openRouterHeaders()`), not a normalized `{ok:false, error}` return. A literal `registry.getConfigured()[0]` lookup would be `undefined` in that case, breaking this test with a different failure mode. Falling through to the sole registered provider regardless of its configured status preserves the exact existing throw, satisfying Phase 5's "zero-behavior-change" requirement as a verified fact (regression suite green, plus a stash-based rollback test reproducing the exact pre-6A baseline) rather than an assumption. Wave 6C's `PROVIDER_UNAVAILABLE` contract (Technical Design §5.3, §17.1) is the intended long-term replacement for this fallback, once a real routing decision exists — recorded as Technical Debt TD-6A-3.

### 2026-07-24 — OpenRouter's `contextWindowTokens` set to 128,000

- **Wave:** 6A
- **Decision:** `OPENROUTER_CAPABILITIES.contextWindowTokens` is set to `128_000`.
- **Related ADR:** [ADR-0006](adr/0006-provider-registry-capabilities-descriptor-adapter-layer.md)
- **Technical Design reference:** §4.3
- **Rationale:** Technical Design §4.3 specifies this field as "a static, hand-maintained constant, not derived from a live OpenRouter API call" but does not itself supply a number. 128,000 reflects the publicly documented context window of the `openai/gpt-oss-120b`/`gpt-oss-20b` model family (`BRAIN_MODELS`/`UTILITY_MODELS`), the binding minimum across the task-tier model set since `VISION_MODELS`' Gemini 2.5 Flash/Flash-Lite entries advertise a substantially larger window. No live API call was made (out of scope for this phase). Recorded as Technical Debt TD-6A-1.

### 2026-07-24 — `findByCapability()` matching semantics

- **Wave:** 6A
- **Decision:** for boolean fields, a requirement is satisfied only when explicitly `true` in `requirement` and the provider's descriptor also reports `true`; an absent or `false` field in `requirement` imposes no constraint. For `contextWindowTokens`, when present in `requirement`, it is treated as a minimum floor — satisfied by any provider whose own value is `>=` the required amount.
- **Related ADR:** [ADR-0006](adr/0006-provider-registry-capabilities-descriptor-adapter-layer.md), informs [ADR-0007](adr/0007-layered-routing-engine.md) (Layer 2's future consumer)
- **Technical Design reference:** §3.1 (interface signature only — exact matching semantics not specified beyond "restricted to configured providers")
- **Rationale:** Technical Design §3.1's `findByCapability(requirement: Partial<CapabilitiesDescriptor>)` signature leaves matching semantics unspecified. This is the natural reading consistent with ADR-0007's own "hard capability requirements" language (a required capability must be true, not merely unset) and with `contextWindowTokens`'s natural role as a budget floor. No production caller exists yet — Wave 6C (Routing Layer 2) is the first real consumer; this wave's own tests are the only current exercise of this logic.

### 2026-07-24 — Test file renamed to `brain-registry.test.ts`

- **Wave:** 6A
- **Decision:** the new Provider Registry test file is named `tests/unit/brain-registry.test.ts`, not the plan's literal `registry.test.ts`.
- **Related ADR:** N/A (naming only, no architectural content)
- **Technical Design reference:** Phase 5 §5.1 task 5 ("`registry.test.ts` (new)")
- **Rationale:** `tests/unit/registry.test.ts` already exists and tests the unrelated, pre-existing Account Deletion Resource Registry (`@/core/account-deletion/registry`, from the separate Account Deletion initiative, closed 2026-07-22). Overwriting it would have destroyed part of the regression suite this wave is required to keep green. This naming collision was not caught by Phase 5, Phase 5.1, or Phase 6 Kickoff's repository verification — none of them checked for an existing file at that exact test path. Renamed to `brain-registry.test.ts`, paralleling this directory's existing `brain-gateway.test.ts`/`openrouter.test.ts` convention.

### 2026-07-24 — `gateway.ts` header comment updated

- **Wave:** 6A
- **Decision:** the module-level header comment's "Provider selection" paragraph is rewritten to describe the Registry-backed lookup, replacing the stale "Routing/registry logic is explicitly out of scope until a second provider exists" sentence.
- **Related ADR:** N/A (documentation accuracy only)
- **Technical Design reference:** N/A
- **Rationale:** the header comment directly describes the code immediately below it. Leaving it asserting "registry logic is out of scope" while a Registry now exists three lines later would misinform the next reader. This is a correction to a comment describing code this wave already changed, not a scope expansion.
