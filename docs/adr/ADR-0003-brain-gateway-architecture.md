# ADR 0003: Brain Gateway Architecture — the single, provider-independent inference boundary

- **Status:** Accepted
- **Date:** 2026-07-14
- **Phase:** 7A → 7B — "Brain Gateway"
- **Implementation:** Shipped in Phase 7B (`src/core/brain/`, all 16 inference call sites migrated) — see [Phase 7B Implementation Report](../phase7b-brain-gateway-implementation-report.md). Header corrected 2026-07-23 during [ADR-0006](0006-provider-registry-capabilities-descriptor-adapter-layer.md)'s authoring pass, closing the drift Phase 2's Gap Analysis identified as GAP-14 (see [Phase 3.1 Architecture Freeze](../phase3-1-brain-gateway-architecture-freeze.md) §2.9 governance action item and [ADR-0014](0014-brain-gateway-extension-model.md)).
- **Precursor:** [Phase 7A — Brain Architecture Readiness Review](../phase7a-brain-architecture-readiness.md) (verdict: CONDITIONAL GO, 6/10)

---

## Context

Emma is, by design, more than a wrapper around a language model. [Product Identity](../product-identity.md) and [ADR 0001](0001-behavior-flags.md) both establish — as a matter of product identity, not just engineering preference — that **the LLM is not Emma**. Emma's identity is produced by memory, relationship continuity, emotion fusion, the deterministic behavior-flags layer, tone, voice, and avatar — systems that already sit, verified by the Phase 7A audit, entirely above and independent of any specific inference provider. The LLM is the replaceable reasoning engine that renders what those systems decide; it is not the source of who Emma is.

That separation currently holds in the systems that matter most (`personas.ts`, `behavior-flags.ts`, `emotion-engine.ts`, `memory-db.ts`, `command-parser.ts` have zero provider knowledge) but it does **not** yet hold at the inference boundary itself. Phase 7A found Emma still in "Phase 1" of its own Brain Provider Roadmap: every inference call — chat, vision, emotion detection, memory extraction, summarization, reflection, embeddings, agent tool-calling — talks to OpenRouter directly, from nine-plus independent call sites, with no shared entry point a second provider (Ollama, vLLM, LM Studio, or a future purpose-built Emma model) could be substituted behind.

Phase 7A also found this Phase 1 implementation to be **unusually disciplined** for a codebase with no gateway: model selection is already centralized (`src/core/models.ts`), low-level request plumbing is already centralized (`src/lib/openrouter.ts`, used by 9 of 11 call sites), retry/backoff/error-typing is already centralized and provider-agnostic (`src/lib/errors.ts`), and cost accounting is already fully centralized and provider-agnostic (`src/core/cost-gate.ts`, keyed on token counts, not provider objects). The verdict was **CONDITIONAL GO**, not GO, specifically because there is no _seam_: response parsing has already drifted into three independent inline implementations, `src/lib/embeddings.ts` has already forked its own copy of the URL/header logic that `openrouter.ts` centralizes, and the one streaming call site has no normalized contract a second provider could plug into.

This ADR formalizes the decision Phase 7A recommended as its first, zero-risk step: **name the Brain Gateway as an explicit architectural boundary before any call site is migrated**, so that Phase 7B's mechanical migration work has a stable contract to converge on rather than being invented ad hoc, file by file.

### Long-term roadmap this ADR sits inside

Emma's Brain architecture is understood, per the roadmap Phase 7A audited against, as evolving in phases: a single-provider phase (today), a Brain Gateway phase (this ADR → Phase 7B), and later phases that may introduce a Capability Registry, cost- or latency-aware routing across multiple concurrently-available providers, and eventually a fine-tuned or purpose-built Emma model. This ADR governs only the Brain Gateway phase. It deliberately does not design, and does not need, any of the later phases to be correct — see **Out of Scope**.

---

## Problem Statement

The architectural problems this ADR exists to solve, as identified by the Phase 7A audit:

1. **Provider coupling.** Nine-plus files construct and send OpenRouter chat-completions requests directly. Application code — route handlers, the agent loop, utility routes — holds knowledge of OpenRouter's URL, headers, and payload shape that has no business being outside a provider layer.
2. **Duplicated provider integration.** `src/lib/embeddings.ts` independently re-implements the URL and auth-header construction that `src/lib/openrouter.ts` already centralizes, because embeddings had no shared boundary to extend instead.
3. **Scattered inference logic.** Two of nine-plus call sites (`route.ts`, `agent-loop.ts`) bypass the already-shared `extractText`/`extractUsage` helpers and redeclare their own response-shape types inline. The assumption "this is what an OpenRouter response looks like" is now encoded in three places instead of one.
4. **Lack of a shared inference entry point.** There is no `brain.chat()`-shaped seam. Every call site is a potential divergence point, and every future change to provider behavior (a header, an error code, a response field) must be found and fixed at each site independently.
5. **Future provider migration risk.** Model identifiers are OpenRouter-namespaced strings (`"openai/gpt-oss-120b:free"`); the `models: [...]` fallback-array field is an OpenRouter-specific capability with no equivalent in a single-model Ollama or vLLM deployment; streaming is parsed inline against OpenRouter's exact SSE chunk shape. None of this is wrong for a single-provider system, but all of it currently lives in application code, where a second provider cannot reach it without either duplicating nine call sites or rewriting them under time pressure.

None of these problems are urgent in isolation — Phase 7A rated the underlying technical debt Low-to-Medium across the board. They are an architecture problem because they compound: every call site added without a gateway is one more site Phase 7B must find and migrate later, and every day without a named boundary is a day the "LLM is not Emma" separation holds by convention at the inference layer rather than by structure.

---

## Decision

**The Brain Gateway becomes the single, provider-independent inference boundary for Emma.**

Every request that requires a language-model provider — chat completions (streaming or not), structured/JSON-schema generation, vision analysis, and embeddings — SHALL be issued through the Brain Gateway. Application code SHALL NOT construct a provider request, hold a provider URL or API key, or parse a provider-shaped response directly. The Brain Gateway is the only component in the system permitted to know what "OpenRouter," "Ollama," or any other provider looks like on the wire.

This is a **boundary decision**, not an implementation. This ADR does not specify the Brain Gateway's interface signature, its file or folder location, or the concrete shape of its streaming contract — those are Phase 7B implementation decisions, made against the constraints this ADR sets. See **Implementation Notes**.

---

## Architectural Principles

These principles govern all Brain Gateway design and evolution, in Phase 7B and beyond.

### 1. Single Inference Entry Point

Every inference request passes through the Brain Gateway. Application code MUST never communicate directly with an LLM provider. There is exactly one place in the system where a provider's URL, credentials, or wire format is known.

### 2. Provider Agnostic

Business logic — chat orchestration, the agent loop, memory extraction, summarization, vision analysis, emotion detection — MUST remain independent of provider implementations. Providers are replaceable infrastructure, not a fixed assumption baked into callers.

### 3. Separation of Concerns

Application logic and provider logic remain isolated. Business systems (context assembly, memory, emotion, behavior, prompt construction) MUST NOT contain provider-specific code, and the Brain Gateway MUST NOT contain business logic (persona rules, behavioral decisions, memory ranking). Each side of the boundary owns exactly one kind of knowledge.

### 4. Stable Contracts

The Brain Gateway exposes normalized request and response models that do not change shape when the underlying provider changes. Provider-specific payloads (OpenRouter's `models: [...]` fallback array, provider-specific headers, provider-specific error codes) remain internal implementation details of the Gateway and MUST NOT leak into caller-visible contracts.

### 5. Extensibility

New providers SHOULD be introduced without modifying application logic. Adding Ollama, vLLM, LM Studio, or a future Emma-owned model SHALL be achievable by adding a new provider implementation behind the Gateway boundary, not by touching the nine-plus call sites that currently exist or any call site added after this ADR.

### 6. Incremental Evolution

Future Brain capabilities — new task types, new modalities, richer routing, a Capability Registry — SHOULD extend the Brain Gateway rather than bypass it. If a future requirement seems to need a caller to reach past the Gateway to a provider directly, that is a signal the Gateway's contract is incomplete, not a license to bypass it.

---

## High-Level Architecture

```
                    ┌───────────────────────────────────────────────┐
                    │                Application Layer               │
                    │                                                 │
                    │  Context Builder · Memory · Emotion · Behavior  │
                    │  Prompt Builder · Workspace surfaces · UI       │
                    │                                                 │
                    │  (persona, relationship, tone — Emma's identity)│
                    └───────────────────────┬────────────────────────┘
                                             │  normalized inference requests
                                             ▼
                    ┌───────────────────────────────────────────────┐
                    │                 Brain Gateway                  │
                    │                                                 │
                    │  provider abstraction · request normalization  │
                    │  response normalization · streaming abstraction│
                    │  embedding abstraction · provider invocation   │
                    │  provider error normalization                  │
                    └───────────────────────┬────────────────────────┘
                                             │  provider-specific calls
                                             ▼
                    ┌───────────────────────────────────────────────┐
                    │                 Provider Layer                 │
                    │                                                 │
                    │   OpenRouter (today)                            │
                    │   Ollama · vLLM · LM Studio (future)            │
                    │   Future Emma-owned model (future)              │
                    └───────────────────────────────────────────────┘
```

Knowledge flows down this diagram, never up. The Application Layer knows nothing below the Brain Gateway line. The Provider Layer knows nothing above it. The Brain Gateway is the only component that touches both a normalized contract and a provider-specific wire format.

---

## Architectural Boundaries

### Application Layer

Owns everything that makes a response _Emma's_, not just _an_ LLM's:

- Context Builder — assembling what the model needs to know for this turn
- Memory — retrieval, ranking, extraction
- Emotion — fusion of voice/vision/text signal into an `EmotionState`
- Behavior — the deterministic flags layer (ADR 0001) that turns state into behavioral decisions
- Prompt Builder — rendering persona, memories, behavior directives, routines into a system prompt
- Workspace — the surfaces the user interacts with (chat, vision, future browser/notes/IDE/files)
- UI — presentation, avatar, voice delivery

The Application Layer issues normalized inference requests to the Brain Gateway and consumes normalized responses. It never sees a provider payload shape.

### Brain Gateway

Owns everything about _how_ an inference request reaches a provider and comes back, and nothing about _why_ the request was made:

- Provider abstraction — presenting one contract regardless of which provider serves it
- Request normalization — translating a normalized request into whatever a specific provider expects
- Response normalization — translating a provider's response back into Emma's normalized shape
- Streaming abstraction — presenting streaming as a provider-independent capability (see **Streaming Contract**)
- Embedding abstraction — presenting embeddings as a first-class inference capability alongside chat
- Provider invocation — the actual network call, retry/backoff/timeout behavior
- Provider error normalization — translating provider-specific failures (rate limits, overload codes, timeouts) into Emma's own error contract

The Brain Gateway does not decide persona, does not rank memories, does not derive behavior flags, and does not know what `[emotion: ...]` or `[EMMA_ROUTINE]` mean — those are prompt conventions owned by the Application Layer that happen to travel through the Gateway as opaque text.

### Provider Layer

Owns the concrete integration with a specific inference backend:

- OpenRouter — the sole provider today; all current chat, vision, and utility inference
- Ollama, vLLM, LM Studio — self-hosted/local inference backends anticipated by the roadmap
- A future Emma-owned or fine-tuned model — anticipated as the long-term direction, not designed here

Each provider implementation is responsible only for speaking its own wire protocol and satisfying the Gateway's normalized contract. A provider implementation MUST NOT be reachable from, or aware of, the Application Layer.

---

## Relationship to the Spatial Workspace

The AppShell (Emma's client-side composition root, `src/app/app/page.tsx` and the engines it wires together — avatar, vision, greeting, proactive speech, routines) and the Brain Gateway are **independent subsystems with a narrow, one-directional relationship**:

- **The AppShell owns workspace composition.** It decides what surfaces are visible, how they're laid out, and how they respond to user interaction and companion-state changes.
- **The Brain Gateway owns inference.** It decides how a request for model output is fulfilled, regardless of which surface asked for it.
- **Neither subsystem depends on the other's rendering lifecycle.** The Brain Gateway has no concept of layout, visibility, or UI state. The AppShell has no concept of which provider served a given response.

Workspace components — the browser/vision surface (`VisionPanel.tsx` today), a future screen-share surface, notes, an IDE surface, files, or future MCP-backed tools — MAY submit inference requests through the Brain Gateway on the same terms as the chat route: as a normalized request in, a normalized response (or stream) out. A workspace surface that needs model output is a **caller** of the Brain Gateway, structurally identical to every other caller. It SHALL NOT be granted a private provider integration, a bespoke request shape, or a shortcut around request/response/streaming normalization, no matter how specialized its use case appears. This is what "provider agnostic" means in practice for workspace expansion: new workspace surfaces are free to grow without ever becoming a tenth, eleventh, or twelfth direct-to-provider call site.

---

## Provider Abstraction

Provider isolation is total by design: application code — including workspace surfaces, utility routes, and the agent loop — communicates only with the Brain Gateway. No component outside the Provider Layer holds a provider API key, constructs a provider URL, or branches on which provider is active. If application code needs to know _whether_ a capability is available (e.g., "is streaming supported for this request"), that is a question the Gateway answers through its normalized contract — it is never answered by application code inspecting which provider is configured.

---

## Normalized Request & Response

The Brain Gateway exposes provider-independent request and response contracts. Conceptually — without prescribing a concrete interface — a request carries: the task's intent (which of chat, structured generation, vision analysis, or embedding is being performed), the conversation/content to reason over, generation constraints (e.g., a maximum output size, an optional structured-output schema), and whether the caller wants a streamed or single-shot result. A response carries: the generated content (or the embedding vector), usage/token accounting in the same shape `cost-gate.ts` already consumes today, and a normalized outcome/finish reason that does not require the caller to know a specific provider's vocabulary for "the model stopped because of X."

Provider-specific concepts that have no universal equivalent — OpenRouter's `models: [...]` fallback-array, provider-specific header attribution, a provider's exact finish-reason vocabulary — remain internal to the Gateway's provider implementations. Whether and how such a concept is exposed through the normalized contract (e.g., fallback as a first-class retry-with-alternate-model capability of the Gateway itself, rather than an OpenRouter-only feature) is a Phase 7B design decision, constrained by Principle 4 (Stable Contracts): whatever shape is chosen, it must not require callers to know it is OpenRouter-specific today.

---

## Streaming Contract

Streaming is a provider-independent **capability** the Brain Gateway exposes, not a detail of any one provider's transport. A caller that requests a streamed result receives a sequence of normalized incremental output events and a normalized completion event (carrying final usage and outcome), regardless of which provider or transport produced them underneath. Today, exactly one call site (the primary chat route) streams, and it does so by parsing OpenRouter's specific Server-Sent Events chunk shape inline — this is precisely the coupling the Gateway exists to remove.

This ADR intentionally does not choose between the possible concrete shapes of that abstraction (for example, whether the Gateway hands callers an async iterator of normalized events versus a stream the caller still partially parses). That choice is implementation-level, has real design weight — it is the highest-risk, highest-traffic piece of Phase 7B — and belongs in a Phase 7B design note, not in this architectural record. What this ADR does fix, as a constraint on that future decision: whatever shape is chosen, a caller consuming a stream MUST NOT need to know it is provider-shaped, and the mechanism by which usage/completion metadata is delivered (inline mid-stream, as OpenRouter does today, or as a trailing/synthetic event for providers that don't support inline usage) MUST be normalized by the Gateway, not left for each caller to detect.

---

## Embedding

Embeddings are an inference capability coordinated through the Brain Gateway, on equal footing with chat and vision — not a separate integration a caller reaches independently. A caller requesting a vector representation of content issues a normalized embedding request and receives a normalized vector result, the same way it would for a chat completion. The Gateway is responsible for knowing which provider and model serve embeddings today and for isolating that choice from callers, exactly as it does for chat.

---

## Future Providers

The Provider Layer is designed to grow. OpenRouter is the only provider implementation that exists today; Ollama, vLLM, and LM Studio represent anticipated self-hosted/local providers, and a future Emma-owned or fine-tuned model represents the long-term direction of the roadmap this ADR sits inside. Each is, architecturally, simply another implementation satisfying the Brain Gateway's normalized contract. Introducing one SHALL NOT require a change to the Application Layer, and SHOULD NOT require a change to more than the Gateway's own provider-selection surface.

This ADR does not define how a provider is selected when more than one is available — no routing, scoring, or capability-matching logic is specified here. That is explicitly future work. See **Out of Scope**.

---

## In Scope

This ADR governs:

- The existence and boundary of the Brain Gateway as the single inference entry point
- The principle that application code — including workspace surfaces — never talks to a provider directly
- The requirement that request, response, streaming, and embedding contracts be normalized and provider-independent
- The relationship between the Brain Gateway, the Application Layer, and the AppShell/Spatial Workspace
- The high-level shape of the Provider Layer as a set of interchangeable implementations behind that boundary

---

## Out of Scope

The following are explicitly not addressed by this ADR and are deferred to future, separate ADRs when they become relevant:

- Capability Registry (task → capability → provider matching)
- Cost-aware or latency-aware routing across multiple concurrently-available providers
- A local scheduler for on-device or self-hosted inference
- Workspace implementation details (how the AppShell renders or composes surfaces)
- Memory algorithms (retrieval, ranking, extraction logic)
- Emotion algorithms (fusion weighting, confidence thresholds)
- Prompt engineering (persona content, directive wording)
- Agent orchestration (the agent loop's planning/tool-dispatch logic)
- Fine-tuned model training or the design of a future Emma-owned model

---

## Non-Goals

This ADR does not attempt to redesign:

- The personality system
- The memory architecture
- The emotion engine
- The behavior engine (ADR 0001)
- The workspace/AppShell architecture
- Rendering or the avatar system

The purpose of Phase 7B is to introduce architectural abstraction at the inference boundary, not to redesign Emma. Every system named above is already, per the Phase 7A audit, correctly decoupled from the provider layer; this ADR's job is to make that decoupling structural at the one place it isn't yet — not to touch systems that already meet the bar.

---

## Consequences

**Positive:**

- The "LLM is not Emma" separation becomes structural at the inference boundary, not just true by convention in the layers above it.
- A provider swap or addition becomes a Provider Layer change, verifiable without touching the Application Layer.
- The three independent copies of "what does an OpenRouter response look like" collapse to one, inside the Gateway.
- Error handling, logging, and cost accounting — already provider-agnostic in contract — gain a single place to be invoked consistently instead of nine-plus.
- Emma's stated preference for data sovereignty and self-hostable inference (already a stated rationale for the custom agent loop, see [Explanation: Agent](../explanation-agent.md)) becomes architecturally reachable: a self-hosted provider (Ollama/vLLM) can be added without a parallel integration effort.

**Trade-offs:**

- An added layer of indirection between application code and the provider — every call site changes, even ones with zero behavioral risk today.
- The streaming contract requires genuine design work, not a mechanical wrapper, on the highest-traffic, highest-visibility path in the product.
- Until Phase 7B's migration is complete, two patterns (direct-to-provider at unmigrated call sites, Gateway-mediated at migrated ones) will coexist — this is an accepted, temporary state, not a target one (see Phase 7A's "architecture drift" risk).

**Migration implications:**

- Migration is incremental and reversible per call site; no call site's behavior depends on another's, so the Gateway can be introduced as a pure addition before any existing code is touched.
- The streaming call site is migrated last, after the pattern is proven on lower-traffic, non-streaming call sites.
- Concrete migration order, milestones, and complexity estimates are Phase 7B execution detail, already captured in the [Phase 7A report](../phase7a-brain-architecture-readiness.md#migration-strategy) and not repeated here.

**Long-term benefits:**

- New providers, including a future Emma-owned model, become additive work.
- The product's positioning against managed-agent-platform trade-offs (data control, compliance posture) is reinforced at the inference layer, not just the agent-loop layer.

---

## Alternatives Considered

**Continue direct provider integration (status quo).** Rejected. This is exactly the trajectory Phase 7A audited: a disciplined but ungoverned Phase 1 state where the number of direct call sites only grows over time, response-parsing has already drifted into three inline copies, and `embeddings.ts` has already forked its own provider plumbing rather than extend the shared one. Every day without a named boundary is a day more code is written against a call site instead of a gateway.

**Provider-specific services (a wrapper per provider, called ad hoc by whichever site needs it).** Rejected. This does not solve the core problem — the absence of a _single_ entry point — it only relocates duplication from "nine call sites each hitting OpenRouter" to "nine call sites each choosing which wrapper to import." It does not deliver Principle 1 (Single Inference Entry Point) or Principle 5 (Extensibility): adding a provider still means touching every caller that wants it.

**Introduce multi-provider routing immediately (build the Capability Registry and routing logic alongside the Gateway).** Rejected for this phase. No second provider exists in the codebase today, so routing has nothing real to route between yet, and Phase 7A explicitly scoped a Capability Registry and routing out of Phase 7B. Designing routing before the single-entry-point boundary exists solves a harder problem before the necessary one, and risks over-fitting the routing design to assumptions that a real second provider would immediately break. Routing belongs in a future ADR, once there is a second provider to route to.

---

## Implementation Notes

This ADR defines architecture, not implementation. It intentionally does not specify:

- The Brain Gateway's concrete interface or type signatures
- Its file or folder location within the repository
- The concrete shape of the streaming contract (async iterator vs. a caller-parsed stream)
- How `models: [...]`-style fallback semantics are represented in the normalized request contract
- The order and mechanics of migrating existing call sites

These are Phase 7B deliverables. The [Phase 7A report](../phase7a-brain-architecture-readiness.md) already documents a recommended migration order, complexity estimates, milestones, and success criteria consistent with this ADR's boundaries, and should be treated as the implementation-planning companion to this document — not duplicated here. Phase 7B implementation SHALL NOT begin as a consequence of this ADR being written; it begins only on separate, explicit authorization.

---

## Related

- [Phase 7A: Brain Architecture Readiness Review](../phase7a-brain-architecture-readiness.md)
- [ADR 0001: Behavior Flags](0001-behavior-flags.md)
- [ADR 0002: Companion State Persistence](0002-companion-state-persistence.md)
- [Explanation: Architecture](../explanation-architecture.md)
- [Explanation: Agent](../explanation-agent.md)
- [Product Identity](../product-identity.md)
