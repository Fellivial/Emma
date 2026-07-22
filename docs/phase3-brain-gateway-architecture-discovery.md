# Emma Brain Gateway — Phase 3: Architecture Discovery Report

## Document Status

- Roadmap: [Brain Gateway Roadmap v1.0 (Frozen)](roadmaps/brain-gateway-roadmap-v1.md)
- Phase: Phase 3 — Architecture Discovery
- Type: **Discovery-only.** This document identifies, evaluates, and documents viable architectural approaches capable of addressing the validated gaps established by Phase 0, Phase 0 Independent Review, Phase 1, Phase 1 Independent Review, Phase 2, and Phase 2 Independent Review. It does **not** select a final architecture, does **not** produce implementation plans, does **not** create ADRs, and does **not** modify code or runtime behavior. Architecture selection is Phase 3.1 (Architecture Freeze) — a separate, later phase requiring its own explicit authorization.
- Branch: `feature/brain-gateway-phase3-architecture-discovery`
- Baseline treated as approved and not re-derived: [Brain Gateway Roadmap v1.0](roadmaps/brain-gateway-roadmap-v1.md), [Phase 0 Required Input Review](phase0-brain-gateway-required-input-review.md) + [Independent Review](phase0-independent-review.md), [Phase 1 Architecture Review](phase1-brain-gateway-architecture-review.md) + [Independent Review](phase1-independent-review.md), [Phase 2 Gap Analysis](phase2-brain-gateway-gap-analysis.md) + [Independent Review](phase2-independent-review.md), [ADR-0001](adr/0001-behavior-flags.md), [ADR-0002](adr/0002-companion-state-persistence.md), [ADR-0003](adr/ADR-0003-brain-gateway-architecture.md), [Phase 7B Implementation Report](phase7b-brain-gateway-implementation-report.md).
- Direct repository inspection performed by this phase (beyond what Phase 0–2 already established): read of the current `src/core/brain/gateway.ts` (71 lines), `src/core/brain/types.ts` (169 lines), `src/core/brain/providers/openrouter.ts`, `src/core/models.ts` (48 lines), `src/lib/errors.ts` (151 lines), `src/core/cost-gate.ts` (333 lines) — performed only to ground candidate architectures in the concrete current shapes those files already have, not to re-verify Phase 0/1/2's facts or gap findings, which are treated as established.

This single document contains the required Phase 3 deliverables as sections:

1. Architecture Discovery Report — Executive Summary & Methodology (§1)
2. Current Architecture Preservation Report (§2)
3. Gap-to-Architecture Mapping (§3)
4. Candidate Architecture Catalog, by domain (§4–§11: Provider, Routing, Context, Memory, Prompt, Operational, Configuration, Extension)
5. Architecture Trade-off Matrix (§12)
6. Architectural Pattern Assessment (§13)
7. Risk Assessment (§14)
8. Discovery Conclusion / Discovery Summary (§15)

The roadmap's own Phase 3 scope list (`roadmaps/brain-gateway-roadmap-v1.md`, "Phase 3 — Architecture Discovery") names sixteen design surfaces (system boundaries, Brain Gateway responsibilities, provider abstraction, Capability Registry, Model Registry, Routing Engine, Context/Memory/Behavior/Emotion/Prompt Pipelines, Response Validation, Retry, Fallback, Analytics, Cost Tracking, Configuration, Extension Model). The Phase 3 task brief additionally structures the work as fifteen numbered discovery tasks across the same domains, at finer grain. This document maps both lists onto the eight-domain, thirteen-section structure above — the same reconciliation pattern Phase 0, 1, and 2 each used for their own deliverable-list mismatches, endorsed as good practice by each phase's independent review. Behavior and Emotion (named separately in the roadmap's Phase 3 scope) are addressed within §4's Provider domain discussion only where they bear on provider selection; their own Pipeline discovery is addressed in §6 (Context) and cross-referenced from §3, because Phase 2 (GAP-05) established that Behavior/Emotion ownership-fragmentation is the same architectural pattern as Context/Prompt fragmentation, not a separately-shaped problem requiring a ninth domain.

---

## 1. Architecture Discovery Report

### 1.1 Executive Summary

This report explores candidate architectures for evolving Emma's Brain Gateway from its current state — a structurally sound, single-provider inference boundary (ADR-0003, shipped Phase 7B) surrounded by a fragmented Application Layer — toward the roadmap's stated destination: a provider-agnostic system capable of hybrid and self-hosted inference, with capability-based routing and operational visibility, without major application refactoring.

Fifteen validated gaps from Phase 2 (§16 of the Gap Analysis) are mapped in §3 to eight architectural domains: Provider, Routing, Context, Memory, Prompt, Operational, Configuration, and Extension. For each domain, this document catalogs two or three plausible candidate architectures, describes each objectively (strengths, weaknesses, complexity, maintainability, extensibility, operational impact), and records trade-offs and risks — without selecting or recommending any one candidate. Six recurring architectural patterns (Strategy, Registry, Pipeline, Chain of Responsibility, Adapter, Policy) are assessed for applicability across domains in §13.

The discovery consistently surfaces a structural observation, not a decision: every domain where Phase 2 found ownership fragmentation (GAP-05 — Context, Prompt, Behavior, error representation) has candidate architectures whose primary variable is **where reconciliation happens** — inside one new component (centralization), across existing owners coordinated by a shared contract (federation), or behind a thin composing layer (delegation) — while every domain where Phase 2 found total absence (GAP-02 Routing, GAP-04 Operational) has candidates whose primary variable is **how much is built versus adopted** (custom in-repo mechanism vs. an existing library/pattern). This document treats that as a useful frame for Phase 3.1's eventual selection, not as a conclusion in itself — the frame does not choose between its own options.

### 1.2 Discovery Methodology

This discovery was performed by: (1) reading the roadmap's Phase 3 scope list and the Phase 3 task brief's fifteen discovery tasks as the specification for what this document must cover; (2) treating Phase 2's Strategic Gap Register (fifteen gaps, GAP-01 through GAP-15) and its Gap Dependency Map, Gap Clustering, and Root Cause Grouping (Phase 2 Independent Review §2–§4) as the fixed input every candidate architecture must be shown to address; (3) for each of the eight domains named in §3's mapping, identifying two-to-three architecturally distinct candidate approaches drawn from established distributed-systems and application-architecture patterns, evaluated for fit against Emma's specific current code shapes (cited to file and line where this phase performed direct inspection) rather than described in the abstract; (4) evaluating every candidate against the roadmap's own Discovery Principles (preserve existing strengths, address one or more validated gaps, remain provider-agnostic, minimize coupling, maximize extensibility, avoid unnecessary complexity, remain incremental where possible) as explicit per-candidate criteria, not as a filter that eliminates candidates — a candidate that violates a principle is recorded as doing so, not discarded; (5) explicitly not choosing between candidates at any point, consistent with the roadmap's Phase 3 exit criterion ("architecture is complete but not yet frozen") and this phase's own Explicit Non-Goals.

### 1.3 Scope

Per the Phase 3 task brief: Current Architecture Preservation, Gap-to-Architecture Mapping, Candidate Architecture Discovery for Provider/Routing/Context/Memory/Prompt/Operational/Configuration/Extension domains, Architecture Trade-off Analysis, Architectural Pattern Assessment, and Risk Assessment, concluding in a Discovery Summary. Addressed as §2–§15 below.

### 1.4 Architectural Domains (overview)

| Domain               | Governing gaps (Phase 2 §16)           | Nature                                                             | Discussed in |
| -------------------- | -------------------------------------- | ------------------------------------------------------------------ | ------------ |
| Provider             | GAP-01, GAP-03, GAP-07                 | Unverified abstraction + boot-time single-provider assumption      | §4           |
| Routing              | GAP-02                                 | Total absence — clean-slate design                                 | §5           |
| Context              | GAP-09                                 | Two uncoordinated pipelines, no shared owner                       | §6           |
| Memory               | GAP-08                                 | Capacity ceiling coupled to retrieval mechanism                    | §7           |
| Prompt               | GAP-05 (prompt instance), GAP-06       | Six competing owners, no shared composition                        | §8           |
| Operational          | GAP-04                                 | Total absence of tracing/metrics/structured logging                | §9           |
| Configuration        | GAP-03, GAP-13                         | Boot-time provider lock-in + no runtime override/staged rollout    | §10          |
| Extension/Governance | GAP-10, GAP-11, GAP-12, GAP-14, GAP-15 | Convention-only boundaries, uneven DI, ungoverned extension policy | §11          |

### 1.5 Discovery Summary

See §15.

---

## 2. Current Architecture Preservation Report

Per the roadmap's Discovery Principle ("every architectural proposal must preserve existing architectural strengths"), this section names the qualities every candidate architecture in §4–§11 is evaluated against as a preservation constraint, not merely a nice-to-have.

- **The Application ↔ Brain Gateway ↔ Provider three-tier boundary itself.** Phase 1 rated this the one boundary in the system that is "genuinely future-proof" — it already absorbed streaming and tool-calling without a shape change, and Phase 2's Boundary Gap Assessment (§4) found no gap against it. **Why preserve:** every candidate architecture below assumes this boundary as fixed context, not a variable to redesign. A candidate that would relocate business logic (persona rules, memory ranking, behavior derivation) into the Gateway, or provider wire-knowledge into the Application Layer, is out of bounds regardless of what problem it claims to solve — ADR-0003 Principle 3 (Separation of Concerns) already settled this, and Phase 3 does not reopen ADR-0003.
- **Provider abstraction minimalism (`BrainProvider`, `types.ts:163-169`).** A four-method interface (`isConfigured`, `chat`, `chatStream`, `embed`, plus a `readonly name`) with no OpenRouter-shaped parameters. Phase 1 and Phase 2 both treat this minimalism as a positive signal for portability, even though it is empirically unverified (GAP-01). **Why preserve:** every Provider-domain candidate in §4 is evaluated on whether it keeps this interface's shape stable or requires widening it — widening is not forbidden, but any candidate that would widen it must be judged against the cost of touching the one interface every future provider implementation depends on.
- **Dependency direction (top-to-bottom, zero cycles).** Phase 1 §4 and Phase 2 §15 both found this the single architectural property applied with total consistency across the reviewed codebase. **Why preserve:** it is also the one property Phase 2 §15 observed "requires no cross-module coordination to maintain" — every candidate that would introduce a new cross-cutting concern (routing, operational tracing, a shared prompt pipeline) is evaluated on whether it can be added without a caller ever needing to import something upstream of it, mirroring how the Gateway boundary itself was added as a pure addition (ADR-0003, "Migration implications").
- **`BrainTask` as a capability-tier abstraction, not a model-ID abstraction.** Phase 1 (§1.4.5, Strength #3) and Phase 2 (§7) both independently rate the existing `"brain" | "vision" | "utility"` union as "exactly the right abstraction level" for future routing to extend, despite no routing existing yet. **Why preserve:** any Routing-domain candidate (§5) that would replace `BrainTask` with a lower-level (model-ID) or higher-level (free-text capability description) abstraction is recorded as a departure from an already-validated precondition, not a neutral design choice.
- **CostGate's dependency-inverted, provider-agnostic design (`cost-gate.ts`, `CostGateDependencies`).** One of exactly two places in the entire Application Layer where dependency inversion is applied (Phase 2 §5, §15 — GAP-11). It is keyed on token counts, not provider objects, and remains correct regardless of which candidate Provider architecture is eventually chosen. **Why preserve:** no candidate in this document proposes touching CostGate's contract; where a candidate (e.g., multi-provider cost aggregation) would need to extend it, that extension is recorded as additive to the existing `CostGateDependencies` shape, not a replacement of it.
- **Task abstraction — the shipped agent loop and tool-calling already routed through the Gateway (`agent-loop.ts`).** Phase 2's Extension Readiness Assessment (§14) found tool execution and agents "already implemented and already routing through the Gateway" — the hardest-sounding items on the roadmap's own extension checklist are done. **Why preserve:** every Extension-domain candidate (§11) treats this as a working precedent to build alongside, not a gap to close; a candidate that would require re-plumbing the agent loop to fit a new extension mechanism carries an explicit regression risk this document flags wherever it applies.
- **Response validation as a log-only, non-blocking concern (`response-validator.ts`, ADR-0001).** Deliberately never rewrites a response; it observes and records. **Why preserve:** any Prompt- or Operational-domain candidate that would make validation gating/blocking is a behavior change to an existing, deliberate design decision (ADR-0001), not a pure extension — recorded explicitly wherever a candidate implies this in §8 or §9.

**Summary judgment:** the current architecture's strengths are concentrated almost entirely at and below the Gateway boundary (provider isolation, dependency direction, the task abstraction, CostGate's DI). Every candidate architecture explored below for the Application-Layer-adjacent domains (Context, Prompt, Configuration-ownership) necessarily proposes _something new_, because Phase 2 found nothing at that layer to preserve beyond "composition ownership" in Context (§8 of the Gap Analysis) and "injection-point centralization" in Memory — both narrower claims than a domain-wide strength, and both explicitly called out as preserved-as-is in the relevant candidate sections below (§6, §7).

---

## 3. Gap-to-Architecture Mapping

Maps each of Phase 2's fifteen validated gaps to the architectural domain(s) this document explores a candidate design space for. No candidate or solution is named in this table — only the concern the gap raises.

| Gap ID | Gap (Phase 2 §16, one-line)                                           | Architectural concern                                                                                                                                      | Domain(s)                              |
| ------ | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| GAP-01 | `BrainProvider` proven only once                                      | Whether the normalized contract is actually provider-neutral or accidentally OpenRouter-shaped                                                             | Provider (§4)                          |
| GAP-02 | No routing/registry exists at all                                     | What a Routing Engine / Capability Registry / Model Registry would need to select between and on what basis                                                | Routing (§5)                           |
| GAP-03 | `OPENROUTER_API_KEY` unconditionally required at boot                 | Where provider identity is asserted — application boot vs. Gateway vs. provider config                                                                     | Provider (§4), Configuration (§10)     |
| GAP-04 | No tracing/metrics/structured logging anywhere in the AI pipeline     | Where and how cross-cutting operational concerns attach to a request's lifecycle                                                                           | Operational (§9)                       |
| GAP-05 | Ownership fragmentation recurring across 5 subsystems                 | Where reconciliation of "one nominal owner, several undocumented competitors" happens — centralize, federate, or delegate                                  | Context (§6), Prompt (§8)              |
| GAP-06 | Four disconnected error-representation shapes                         | Whether error taxonomy is unified at the Gateway boundary, the Application Layer, or a shared library both sides use                                       | Provider (§4), Operational (§9)        |
| GAP-07 | Per-site retry policy; provider-specific status code in a shared list | Where retry _policy_ (as opposed to the already-centralized retry _mechanism_) is decided, and how provider-specific vocabulary is kept out of shared code | Provider (§4), Routing (§5)            |
| GAP-08 | Memory retrieval/ranking coupled to the capacity cap                  | Whether ranking sophistication can scale independently of persistence capacity                                                                             | Memory (§7)                            |
| GAP-09 | Two uncoordinated context-summarization pipelines                     | Whether context has one lifecycle/owner or two coordinated ones                                                                                            | Context (§6)                           |
| GAP-10 | Boundaries hold by convention, not by a mechanism                     | Whether a structural (lint/module-boundary/runtime-assertion) enforcement layer belongs in this architecture at all, and where                             | Extension/Governance (§11)             |
| GAP-11 | Dependency inversion applied in only 2 of many places                 | Whether DI becomes a systemic convention and, if so, where it is enforced (per-module discipline vs. a shared pattern/tooling)                             | Extension/Governance (§11)             |
| GAP-12 | No governed Extension Model artifact                                  | Whether "how to add a provider/capability" becomes a documented policy, and where it lives                                                                 | Extension/Governance (§11)             |
| GAP-13 | No feature-flag/staged-rollout mechanism                              | Whether configuration architecture needs a runtime-toggle layer at all, and if so, built vs. adopted                                                       | Configuration (§10)                    |
| GAP-14 | ADR-0003 header drift ("Implementation: None yet")                    | Governance process, not runtime architecture — noted for completeness, no architectural candidate applies                                                  | Extension/Governance (§11, noted only) |
| GAP-15 | Undetermined "workflow" concept beyond the agent loop                 | Whether multi-agent/multi-session orchestration is a distinct architectural layer or an extension of the existing agent loop                               | Extension/Governance (§11)             |

No gap maps to zero domains, and no domain in §4–§11 is unmotivated by at least one gap — this satisfies the Phase 3 exit criterion that "every validated gap has been mapped to architectural concerns" before any candidate is explored.

---

## 4. Provider Architecture Discovery

Governs GAP-01 (unverified abstraction), GAP-03 (boot-time single-provider lock-in), and the provider-specific portion of GAP-07 (hardcoded status-code vocabulary in shared retry logic).

### Candidate A — Direct Provider Mapping (status quo, extended)

One `BrainProvider` implementation per backend, selected once at module-load time (as today), extended by adding new files under `src/core/brain/providers/` and widening `gateway.ts`'s single selection point to a static `if`/`switch` on an environment variable.

- **Strengths:** Zero new abstractions — the simplest possible extension of what exists today; fully consistent with ADR-0003's existing "one module-level provider instance" shape (Phase 2 §6); ships fastest for a second provider because it changes the fewest files.
- **Weaknesses:** Selection remains static (chosen once at boot, not per-request), so it does nothing to address per-request/per-capability provider selection (Phase 2 §6, "no mechanism to hold more than one provider instance at all"); does not by itself address GAP-03 (boot validation would need a parallel per-provider branch); every additional provider adds another branch to the same `if`/`switch`, which does not scale gracefully past two or three providers.
- **Complexity:** Low. **Maintainability:** Medium (degrades as branches accumulate). **Extensibility:** Low-Medium (each addition touches the shared selection point). **Operational impact:** None — no new operational surface is introduced.
- **Gaps addressed:** Partially closes GAP-01 (a second implementation would finally exercise the interface) without addressing the _selection_ half of the problem; does not address GAP-03 or GAP-07.
- **Discovery-principle fit:** Maximizes "remain incremental," minimizes "maximize extensibility."

### Candidate B — Provider Registry

A registry component (not necessarily a new class — could be a plain object/map) that holds all configured provider instances keyed by name/capability, replacing `gateway.ts`'s single module-level instance with a lookup. Provider selection becomes a registry query (`registry.get(providerName)` or `registry.forCapability(capability)`) rather than a static reference.

- **Strengths:** Directly targets the §6 finding that "the Gateway holds exactly one module-level provider instance, chosen once at import time, not per-request" — a registry is a per-request-queryable structure by construction; provides the natural home for the provider-selection mechanism GAP-01/GAP-02 both identify as currently absent; is the structural precondition Routing (§5) would need regardless of which Routing candidate is eventually chosen, since a Routing Engine selects _between_ registry entries.
- **Weaknesses:** Introduces a new component with its own lifecycle (when is the registry populated — boot time, lazily, per-request?) and its own failure mode (a capability requested with no matching registered provider); a registry with exactly one entry (today's reality) is arguably more machinery than the problem currently warrants, which is precisely the tension GAP-13's "neutral for the current single-provider system" framing (Phase 2 §16) describes for a structurally similar concern.
- **Complexity:** Medium. **Maintainability:** High once populated (single place to reason about "what providers exist"). **Extensibility:** High — this is the shape ADR-0003's own "Future Providers" section anticipates without naming. **Operational impact:** Low — a registry is a natural place to attach per-provider health/availability signal later (Operational domain, §9), though this document does not treat that as decided.
- **Gaps addressed:** Structural precondition for GAP-01 (second implementation), GAP-02 (routing needs something to route between), and the provider-selection half of GAP-03 (a registry could hold providers whose availability is not asserted at Emma's own boot time, only at first-use).

### Candidate C — Provider Capabilities Descriptor

Each provider implementation declares a capabilities descriptor (e.g., supports-streaming, supports-vision, supports-tool-calling, context-window-size, supports-embeddings) alongside its four `BrainProvider` methods. Selection and future routing logic can query capabilities rather than a hardcoded task-tier mapping.

- **Strengths:** Directly answers Phase 2 §6's "capability routing... no precedent exists" gap and the multimodal sub-gap ("whether a provider whose native multimodal interface differs structurally... would fit the current contract without a shape change") by making capability differences a first-class, queryable property instead of an assumption baked into `TASK_MODELS`; composes naturally with Candidate B (a registry of capability-annotated providers) rather than competing with it.
- **Weaknesses:** The capabilities descriptor's schema is itself a new design surface with real risk of becoming either too coarse (a boolean per capability, insufficient for e.g. "supports vision but only via a distinct endpoint," per §6's multimodal gap) or too fine (a capability negotiation protocol, which the current one-provider reality has zero evidence to size correctly — this is the same "n=1" root cause, Phase 2 Independent Review §4 Root Cause A, that undermines GAP-01 itself); with one provider, every field in the descriptor is definitionally true and untested against a provider that would return false for any of them.
- **Complexity:** Medium-High (schema design + the discipline to keep it accurate as providers evolve). **Maintainability:** Medium — a descriptor can drift from a provider's actual behavior if not kept current, a new instance of the "unverified assumption" pattern GAP-01 already describes for the interface as a whole. **Extensibility:** High, if the schema proves sufficiently general; unknown otherwise. **Operational impact:** Low.
- **Gaps addressed:** GAP-01 (makes provider differences explicit rather than assumed-away), the multimodal and local-inference sub-gaps of §6, and is a precondition for Routing's "capability routing" candidate (§5, Candidate B).

### Candidate D — Provider Adapter Layer (wire-format normalization as a distinct sub-layer)

Distinct from Candidates A–C (which address _how a provider is selected_), this candidate addresses _how a provider's wire format is normalized_: an explicit adapter sub-layer between `gateway.ts` and each `providers/*.ts` file, so that request/response normalization (currently inline inside `openrouter.ts`, per Phase 0/1's file reads) becomes a named, reusable interface every provider implementation composes with, rather than each provider file re-implementing its own normalization inline.

- **Strengths:** Directly targets GAP-06 (four disconnected error shapes) and GAP-07 (the hardcoded `529` status in `errors.ts`'s shared retry list) by giving each provider an explicit place to translate its own wire-specific error vocabulary into the Gateway's normalized `BrainRequestError` taxonomy, rather than that translation happening ad hoc inside the one provider file that exists today; makes the "what does this provider's response look like" question — the same question Phase 1 found answered three different, inline ways _above_ the Gateway (response-parsing drift, ADR-0003 Context) — impossible to re-litigate _below_ the Gateway as new providers are added, because the adapter interface would force every provider to answer it the same structured way.
- **Weaknesses:** With one provider, this is speculative generality — the adapter interface's shape is designed against a sample size of one wire format (OpenRouter's), which is the same evidentiary limitation Phase 2 (§6) already flags for `BrainProvider` itself; risks simply moving GAP-01's "empirically unproven with a second provider" problem one layer deeper rather than solving it.
- **Complexity:** Medium. **Maintainability:** High once two providers exist to validate the adapter shape against; unknown before that. **Extensibility:** High in principle, unverified in practice — identical risk profile to `BrainProvider` itself. **Operational impact:** None directly, though a well-designed adapter is a natural attachment point for the Operational domain's (§9) per-provider error/latency telemetry.
- **Gaps addressed:** GAP-06, GAP-07 directly; GAP-01 indirectly (a second provider implemented against a defined adapter contract is a stronger test of provider-neutrality than a second provider implemented against nothing but `BrainProvider`'s four methods).

---

## 5. Routing Architecture Discovery

Governs GAP-02 (total absence of routing/registry) and the routing-relevant portion of GAP-07. Every candidate here is, per Phase 2's own framing, a clean-slate design question — there is no partial implementation to extend, only the `BrainTask` union as a validated precondition (§2 above).

### Candidate A — Task Routing (extend `BrainTask` as-is)

Routing decisions continue to be made at the granularity of `BrainTask` ("brain" | "vision" | "utility"), with the existing static `TASK_MODELS` map as the only routing table — no new abstraction, just formalizing what already exists as "the routing layer."

- **Strengths:** Zero new components; directly consistent with Phase 1/Phase 2's shared finding that `BrainTask` is "exactly the right abstraction level" to extend; lowest possible migration risk since nothing changes structurally.
- **Weaknesses:** Does not address capability routing, policy routing, or fallback routing at all — task tiers are a coarse, closed, compile-time-fixed set (three values), which cannot express "route to whichever provider currently supports tool-calling" or "route by cost" without widening the union itself, which is a breaking change to every one of the Gateway's current 16 invocation sites.
- **Complexity:** Low. **Maintainability:** High (nothing new to maintain). **Extensibility:** Low — the ceiling of this candidate is the ceiling of a three-value closed union. **Operational impact:** None.
- **Gaps addressed:** Formalizes, but does not extend, the one positive precondition Phase 2 identified; does not close GAP-02's routing absence for capability/policy/fallback/hybrid routing.

### Candidate B — Capability Routing (registry-backed)

Routing decisions are made by matching a request's declared capability requirements (needs tool-calling, needs 128k context, needs vision) against the capabilities a registered provider (§4 Candidate C) actually offers, selecting the best match at request time rather than a fixed compile-time tier.

- **Strengths:** Directly closes the "capability routing... no precedent exists" gap (Phase 2 §7); composes with §4's Provider Registry (Candidate B) and Capabilities Descriptor (Candidate C) as its structural precondition, rather than duplicating them; generalizes past the three-tier ceiling of Candidate A without requiring the `BrainTask` union itself to grow unboundedly, since capability matching can be additive (new capability fields) rather than enumerative (new task-tier values).
- **Weaknesses:** Requires §4's Provider Registry and Capabilities Descriptor to exist first (a genuine sequencing dependency, not a soft preference — Phase 2 Independent Review §2.1 already names "GAP-01 → GAP-02" as a prerequisite relationship of this same shape); with one provider, capability matching has exactly one possible outcome, so this candidate cannot itself be validated as _routing_ until a second provider exists — it can only be validated as _not yet breaking anything_, the same "n=1" evidentiary gap Root Cause A already names.
- **Complexity:** Medium-High. **Maintainability:** Medium — correctness depends on the capabilities descriptor staying accurate (same risk as §4 Candidate C). **Extensibility:** High. **Operational impact:** Medium — a capability-routing miss (no provider matches) is a new failure mode requiring its own error/observability path (Operational domain, §9).
- **Gaps addressed:** GAP-02 (capability routing specifically), depends on and reinforces GAP-01's eventual resolution.

### Candidate C — Policy Routing (cost/latency/compliance-driven)

Routing decisions are made by a policy function that considers cost, latency, or data-sovereignty constraints (e.g., "prefer the cheapest provider that meets a latency SLA," "never route this request off-premises") ahead of, or alongside, capability matching.

- **Strengths:** Directly answers the roadmap's long-term stated destination ("cost- or latency-aware routing across multiple concurrently-available providers," ADR-0003 "Long-term roadmap this ADR sits inside") and Emma's own stated data-sovereignty positioning (ADR-0003 Consequences, citing `explanation-agent.md`); composes cleanly with CostGate (§2) as a second, independent input to the same decision CostGate already makes about budget, without requiring CostGate's own contract to change.
- **Weaknesses:** Explicitly named "Out of Scope" by ADR-0003 itself ("Cost-aware or latency-aware routing across multiple concurrently-available providers") and rated "Critical relative to the roadmap's stated destination; out of scope by design for the current phase" by Phase 2 (§2 Capability Gap Matrix, "Orchestration" row) — this candidate is the furthest from anything the current single-provider system has evidence to design against, with zero current precedent of any kind (not even a coarse one, unlike task routing); a policy engine without at least two providers with materially different cost/latency profiles has nothing real to optimize between, which is a more severe version of Candidate B's n=1 problem.
- **Complexity:** High. **Maintainability:** Unknown — no current analog exists to judge against. **Extensibility:** High if the underlying policy model is well-chosen; the risk is choosing a policy model (e.g., a fixed priority list vs. a scored/weighted function vs. a rules engine) before there is a second provider whose actual cost/latency characteristics could validate that choice.
- **Gaps addressed:** The most forward-looking slice of GAP-02, explicitly deferred by ADR-0003's own Out of Scope; recorded here for completeness of the discovery, per the Phase 3 brief's explicit instruction to explore routing alternatives including policy routing, not because Phase 2 or ADR-0003 treat it as ready.

### Candidate D — Layered Routing (task → capability → policy, composable)

Rather than choosing one of Candidates A–C, this candidate treats them as ordered layers: task routing narrows to a tier (as today), capability routing narrows further within that tier to providers that satisfy hard requirements, and policy routing (if present) breaks ties among capability-qualified candidates.

- **Strengths:** Each layer is independently addable — task routing (Candidate A) already exists and needs no change to serve as this candidate's first layer; capability routing (Candidate B) can be introduced whenever a second provider exists without requiring policy routing (Candidate C) to exist yet; this incremental composability directly matches the roadmap's Discovery Principle "remain incremental where possible" more closely than choosing any single layer as the entire routing story.
- **Weaknesses:** Is not a single mechanism but a layering _pattern_ — it requires each layer to have a well-defined "no match, pass through" contract with the layer below it, which is itself an interface design question this document does not resolve (per its non-goals); a partially-implemented layered router (e.g., task + capability, no policy yet) must clearly signal which layers are active, or callers may assume routing guarantees (e.g., cost-awareness) that do not yet exist — an integration risk distinct from any single layer's own risk.
- **Complexity:** Medium, rising with each layer added. **Maintainability:** High, if each layer's contract is kept independent (a change to policy routing should not require touching capability routing). **Extensibility:** High — this is architecturally the Chain of Responsibility pattern applied to provider selection (see §13). **Operational impact:** Medium — each layer is a natural place to record _why_ a routing decision was made, which is itself an Operational-domain (§9) concern this candidate creates a need for, rather than assumes.
- **Gaps addressed:** All of GAP-02's sub-types (task/capability/policy/fallback/hybrid) at the grain each is actually ready to be designed, rather than forcing one grain onto all of them simultaneously.

---

## 6. Context Architecture Discovery

Governs GAP-09 (two uncoordinated summarization pipelines, no shared budget model) and the Context-Pipeline portion of GAP-05 (ownership fragmentation). Composition ownership itself (what goes into a request, owned end-to-end by `route.ts`) is preserved as-is per §2 — no candidate below proposes relocating it.

### Candidate A — Centralized Context Pipeline (single new owner)

A single new module owns context lifecycle end-to-end — token-budget accounting, summarization triggering, and persistence — superseding both `context-manager.ts` (client) and `route.ts`'s server-side 20-message cap, which become callers of this one component rather than independent implementations.

- **Strengths:** Directly closes GAP-09 by construction — one lifecycle, one budget model, one place a caller can ask "what does the model already know from earlier in this conversation" (the exact question Phase 2 §8 says no current component can answer authoritatively); matches the roadmap's own naming ("Context Pipeline," singular) most literally.
- **Weaknesses:** Requires reconciling two _different concepts_ that currently share a name — client-side token-budget-aware summarization (100k-token budget, 4-char-per-token approximation) and server-side message-count-based summarization (flat 20-message cap, no token accounting) are not the same mechanism with two locations, per Phase 2 §8's explicit finding ("these are not two implementations of one concept but two different concepts... that share a name") — meaning this candidate's "centralize" framing understates the work as a location change when it is actually a semantics-reconciliation question, which Phase 3 (per its own non-goals) does not resolve here.
- **Complexity:** Medium-High (the reconciliation, not the centralization itself, is where the real design cost sits). **Maintainability:** High once reconciled. **Extensibility:** High — a single pipeline is the natural attachment point for future providers' differing tokenization (§8's scalability gap: "an approximation calibrated against one provider's tokenizer, with no evidence it holds for others"). **Operational impact:** Low.
- **Gaps addressed:** GAP-09 directly; the Context-Pipeline slice of GAP-05.

### Candidate B — Federated Context Pipeline (shared contract, existing owners retained)

Both existing summarization mechanisms (client, server) are retained as-is, but both are required to implement a shared, small interface (e.g., "given N messages and a token budget, return a summary and remaining budget") so that a caller composing a request can query either side through one contract without either side needing to be rewritten.

- **Strengths:** Lower migration risk than Candidate A — no existing summarization logic is replaced, only wrapped; directly respects the roadmap's "remain incremental where possible" principle more literally than centralization; does not require resolving the token-budget-vs-message-count semantic mismatch immediately, since the shared contract can normalize the _output_ (a summary + a budget-remaining figure) without requiring the _inputs_ to be unified first.
- **Weaknesses:** Does not fully close GAP-09 — "what does the model already know" still requires querying two owners and reconciling their answers at the call site, just through a nicer shared interface, rather than having one owner who already knows; risks becoming a second instance of Phase 2 §15's "one documented owner, undocumented competitor" pattern if the shared contract is not enforced (i.e., a third context mechanism could be added later without implementing the contract, exactly as `route.ts`'s server-side cap was added without coordinating with `context-manager.ts` in the first place).
- **Complexity:** Low-Medium. **Maintainability:** Medium — better than today, but the underlying two-concepts problem (§8) persists underneath a shared interface. **Extensibility:** Medium. **Operational impact:** Low.
- **Gaps addressed:** Partially closes GAP-09 (unifies the _querying_ of context state, not the _state_ itself); does not resolve the semantic mismatch Phase 2 identified as the deeper issue.

### Candidate C — Context as a Gateway-Adjacent Service (delegated ownership)

Context assembly and summarization move to a dedicated service-like module invoked by `route.ts` (today's composition root) but with its own persistence, lifecycle, and — notably — its own token-accounting logic that could, in principle, be informed by the Brain Gateway's own knowledge of which provider/model will consume the context (since token limits and tokenization are provider-specific, a fact the Gateway already normalizes for other purposes).

- **Strengths:** Is the only candidate in this domain that directly addresses the scalability gap's provider-diversity concern (§8: "a target architecture with more providers... inherits an approximation calibrated against one provider's tokenizer, with no evidence it holds for others") by placing context sizing where provider knowledge already lives, rather than duplicating provider-awareness into a context module that per ADR-0003 Principle 2 should otherwise remain provider-agnostic.
- **Weaknesses:** Directly tensions with ADR-0003's Separation of Concerns principle and this document's own §2 preservation constraint — the Brain Gateway "does not decide persona, does not rank memories... and does not know what [prompt conventions] mean" (ADR-0003); teaching the Gateway about context budgets risks exactly the kind of business-logic leak into the Gateway ADR-0003 rules out, unless very carefully scoped to "the Gateway can answer _how many tokens does provider X's tokenizer count this as_" (a provider fact) without ever deciding _what to summarize or when_ (a business decision) — a distinction this candidate's design would need to hold precisely, and easy to get wrong.
- **Complexity:** High (the ADR-0003 boundary discipline required is non-trivial). **Maintainability:** Unknown — depends entirely on whether the token-counting-vs-business-logic line is actually held. **Extensibility:** High if the line holds; a boundary violation if it doesn't. **Operational impact:** Low.
- **Gaps addressed:** The provider-diversity scalability concern within GAP-09 that Candidates A/B do not directly address; carries the highest boundary-violation risk of any Context candidate.

---

## 7. Memory Architecture Discovery

Governs GAP-08 (retrieval/ranking has no infrastructure beyond in-process keyword scoring; raising the capacity cap and improving ranking are coupled changes). Persistence ownership and injection-point centralization (`memory-db.ts`, `personas.ts`'s `serializeMemories()`) are preserved as-is per §2 — no candidate below proposes relocating either.

### Candidate A — Retrieval Ranking Extension (in-place, same owner)

`memory-db.ts` retains sole ownership; ranking sophistication (e.g., adding an embedding-similarity score alongside the existing keyword-overlap × confidence score) is added as a new scoring dimension within the same module and same query path, without introducing a new component.

- **Strengths:** No new ownership boundary — directly consistent with Phase 2's finding that memory has "zero ownership fragmentation," the one responsibility area where this document's §2 preservation logic applies most cleanly; lowest migration risk of the three candidates.
- **Weaknesses:** Does not, by itself, decouple the capacity cap from retrieval sophistication — Phase 2 §9 is explicit that "raising the current 200-active-memory-per-user cap and improving ranking quality are architecturally coupled changes... because full in-process scoring is only viable below that cap"; adding a better in-process score does not change the fact that it is still in-process, still bounded by what can be scored without a database-side mechanism.
- **Complexity:** Low-Medium. **Maintainability:** High (single owner, single file). **Extensibility:** Low — the ceiling of "in-process scoring, however improved" is the same ceiling GAP-08 already names.
- **Gaps addressed:** Improves ranking quality without addressing the cap-coupling itself.

### Candidate B — Database-Side Ranking Infrastructure (schema extension)

An embedding column (or equivalent database-native ranking mechanism) is added to the memory schema, with retrieval performed via a database-side `ORDER BY`/similarity query with a `LIMIT`, replacing the current "fetch all active rows, score only if the row count exceeds the requested limit" pattern (Phase 1 §1.4.7).

- **Strengths:** Directly decouples the capacity cap from retrieval sophistication — a database-side `LIMIT` with genuine ranking scales independently of how many rows exist, which is precisely what Phase 2 §9 identifies as currently impossible; aligns with the roadmap's Objective of scaling "without requiring major application refactoring," since the query interface (`getRelevantMemoriesForUser()`) can keep its existing signature while its implementation changes underneath.
- **Weaknesses:** A schema change and, likely, a new infrastructure dependency (a vector-capable column/index) — the highest-cost candidate in this domain by a wide margin; introduces a migration question (backfilling embeddings for existing memory rows) this document does not size, per its non-goals (no migration plans in Phase 3).
- **Complexity:** High. **Maintainability:** High once migrated. **Extensibility:** High — this is the only candidate that removes the cap-coupling structurally rather than deferring it. **Operational impact:** Low-Medium (an embedding-generation step becomes a new operation with its own latency/cost profile, itself a Brain Gateway-mediated call per ADR-0003's embedding-abstraction principle).
- **Gaps addressed:** GAP-08 fully, at the highest implementation cost of the three candidates.

### Candidate C — Tiered Retrieval (hybrid in-process + database-assisted)

A middle path: the database performs a cheap, coarse pre-filter (e.g., a `LIMIT` far above the eventual return count, or a simple recency/confidence `ORDER BY` already partially expressible in SQL without a schema change), and the existing in-process keyword×confidence scoring runs only over that reduced candidate set.

- **Strengths:** Requires no new schema or infrastructure dependency (unlike Candidate B) while still bounding the amount of in-process work performed, partially loosening the cap-coupling without fully removing it; a genuinely incremental step between Candidates A and B, consistent with "remain incremental where possible."
- **Weaknesses:** Does not fully decouple cap from ranking quality — a coarse pre-filter without genuine relevance ranking risks discarding relevant-but-not-recent memories before the in-process scorer ever sees them, trading one coupling (cap-vs-ranking) for a different, subtler one (pre-filter-recall-vs-ranking-quality) that Phase 2 did not evaluate because this specific hybrid shape does not exist today to evaluate.
- **Complexity:** Medium. **Maintainability:** Medium. **Extensibility:** Medium — a reasonable stepping-stone toward Candidate B, but not a substitute for it if true semantic ranking is eventually required.
- **Gaps addressed:** Partially closes GAP-08 (loosens, does not remove, the cap-ranking coupling) at lower cost than Candidate B.

---

## 8. Prompt Architecture Discovery

Governs the Prompt-Pipeline instance of GAP-05 (six competing owners: `personas.ts` nominal, five other call sites in practice) and the reuse/composition/consistency findings of Phase 2 §10. Isolation (prompt text never crossing into the Gateway as anything but opaque content) is preserved as-is per §2 — no candidate below proposes changing that boundary.

### Candidate A — Centralized Prompt Composition

A single module (extending or replacing `personas.ts`) becomes the sole prompt-construction owner; every current independent owner (`vision/route.ts`, `summarize/route.ts`, `ingest/whatsapp/route.ts`, the two owners in `history/route.ts`) becomes a caller supplying parameters to shared composition functions rather than constructing prompt text itself.

- **Strengths:** Most literally matches the roadmap's naming ("Prompt Pipeline," singular); directly closes the reuse gap (Phase 2 §10: "the `[EXTERNAL DATA]` prompt-injection guard is implemented three separate times") by construction, since a shared composition function has exactly one implementation of any given guard or template fragment; directly closes the consistency gap (a tone-rule change in one place propagates to every caller through the shared function, rather than requiring six manual edits).
- **Weaknesses:** The largest migration surface of any candidate in this domain — five external call sites change, plus internal restructuring of `personas.ts` itself to separate persona-voice content from protocol-tag instructions (Phase 1 §1.4.10's "interleaved as undifferentiated string literals" finding); risks becoming an over-general module if the five channels' actual prompt needs turn out to differ more than this candidate assumes (vision and WhatsApp prompts plausibly have structurally different needs than standard chat, a question this document does not resolve).
- **Complexity:** Medium-High. **Maintainability:** High once centralized. **Extensibility:** High — new channels become composition-function callers, not new independent prompt-construction sites.
- **Gaps addressed:** The ownership, reuse, and consistency sub-gaps of GAP-05's Prompt instance most completely of the three candidates.

### Candidate B — Modular Prompt Composition (composable fragments, no single owner)

Rather than one owning module, prompt construction is decomposed into independently-versioned, composable fragments (persona voice, protocol-tag instructions, injection guards, memory serialization, routine descriptions) that any caller can assemble in whatever order and combination its channel needs, without requiring a single top-level "build the prompt" function that decides for every caller.

- **Strengths:** Directly activates the dormant `buildSystemPromptBlocks()` stable/dynamic seam Phase 2 §10 already found — "a genuinely useful seam that anticipates prompt-caching... [but] provides zero runtime value today because the only function any caller actually invokes flattens it back into one string" — by making per-fragment composition the actual API surface rather than an internal implementation detail immediately discarded; more naturally accommodates channels (vision, WhatsApp) whose prompt needs differ, since each caller composes only the fragments it needs rather than receiving one fixed output shape.
- **Weaknesses:** Does not, by itself, guarantee consistency the way Candidate A's single owner does — five callers independently choosing which fragments to compose and in what order can still drift from each other in effect even if every fragment itself is shared and correct, a subtler version of the same "one pattern, multiple independent decision points" shape Phase 2 §3 already found in Behavior's invocation (not derivation); requires more upfront interface design (what are the right fragment boundaries?) than Candidate A's simpler "one function, all callers use it" shape.
- **Complexity:** Medium. **Maintainability:** Medium-High, contingent on fragment boundaries being well-chosen. **Extensibility:** High — directly enables prompt-caching (currently dormant infrastructure) and per-channel customization without requiring a monolithic prompt-builder to anticipate every channel's needs in advance.
- **Gaps addressed:** Reuse and the prompt-caching precondition most directly; consistency less completely than Candidate A.

### Candidate C — Layered Prompt Composition (persona/protocol separation, channel adapters on top)

A two-layer model: a base layer strictly separates persona-voice content from protocol-tag instructions (directly resolving Phase 1's "interleaved as undifferentiated string literals" finding within `personas.ts` itself, independent of the other five owners), and a second, thinner "channel adapter" layer sits above it per channel (vision, WhatsApp, summarization, history) that composes the base layer's output with channel-specific additions.

- **Strengths:** Decomposes the problem into two independently-sequenceable pieces — the internal `personas.ts` separation can be done without touching the other five owners at all, and each channel adapter can be introduced incrementally afterward — offering a more incremental path than Candidate A's single large migration while still converging toward one shared base, unlike Candidate B's fully decentralized fragments.
- **Weaknesses:** Until every channel adapter is introduced, this candidate is a strict subset of today's fragmentation with one additional internal layer — the five-owners problem persists exactly as-is until each adapter is built, meaning this candidate's gap-closure is back-loaded rather than immediate; the base/adapter boundary itself is a new design surface (what belongs in the shared base vs. what is channel-specific) with no existing precedent to validate it against.
- **Complexity:** Medium, distributed over time rather than concentrated. **Maintainability:** High once all adapters exist; unchanged from today until they do. **Extensibility:** High — new channels are new adapters, not new independent prompt-construction sites, once the model is fully adopted.
- **Gaps addressed:** The internal `personas.ts` mixing finding immediately; the six-owner fragmentation gradually, contingent on follow-through.

---

## 9. Operational Architecture Discovery

Governs GAP-04 (total absence of tracing, metrics, structured logging; Sentry at 3 of 16+ call sites; the Gateway's own header explicitly declining "Sentry capture policy" ownership with no compensating owner). This is, per Phase 2 §11 and the Phase 2 Independent Review's Discovery Readiness Matrix, the domain with the fewest existing artifacts of any explored in this document — every candidate here is closer to clean-slate than any other domain except Routing.

### Candidate A — Centralized Gateway-Level Instrumentation

All operational instrumentation (request correlation IDs, latency timing, error/retry counters, structured log emission) is added at exactly one point: inside `gateway.ts` itself, wrapping every call to `brainChat`/`brainChatStream`/`brainEmbed`, so that every one of the 16+ invocation sites gains instrumentation without any of them being individually modified.

- **Strengths:** Requires touching only the Gateway's three exported functions, not any of the 16+ call sites — the lowest-blast-radius way to close a total-absence gap; directly targets the specific finding that the Gateway's own header "explicitly declines... Sentry capture policy... with no other component picking it up" by making the Gateway the compensating owner explicitly, rather than leaving the question unresolved; consistent with the Gateway already being the single point through which every inference request passes (ADR-0003 Principle 1), making it the natural single point through which every inference request's _telemetry_ also passes.
- **Weaknesses:** Captures only Gateway-boundary events (a request went out, a response came back, how long it took, whether it errored) — it cannot, by construction, see _why_ a request was made (which behavior flags were active, which persona, which channel), because that context lives in the Application Layer above the Gateway and per ADR-0003 must not leak into the Gateway; a future incident investigation needing "why did this specific user's request take this shape" would still need to correlate Gateway-level telemetry with Application-Layer context via some shared identifier (a correlation ID), which this candidate must therefore also design for, not just latency/error counters alone.
- **Complexity:** Low-Medium. **Maintainability:** High (one place to change). **Extensibility:** High for Gateway-boundary concerns; does not by itself extend to Application-Layer observability (prompt construction, memory retrieval, behavior derivation each remain uninstrumented under this candidate alone).
- **Gaps addressed:** The Gateway-boundary slice of GAP-04 most directly and cheaply; leaves the Application-Layer slice (prompt/context/memory instrumentation) unaddressed.

### Candidate B — Distributed Instrumentation with a Shared Correlation Contract

Every layer (route handlers, Context/Memory/Prompt modules, the Gateway) independently emits structured log/metric events, unified only by a shared correlation-ID contract threaded through the request lifecycle (generated once per request, passed down through every layer, attached to every emitted event) — no single component owns all instrumentation, but every component's instrumentation is joinable after the fact.

- **Strengths:** Only candidate that can answer both "what happened at the Gateway boundary" and "why" (the Application-Layer decisions that led to that Gateway call), since correlation IDs let events from different layers be joined in whatever log/trace backend eventually consumes them; matches how observability is conventionally built in multi-layer systems (a correlation ID is the standard mechanism, not a novel one), reducing design risk relative to inventing a bespoke shape.
- **Weaknesses:** Requires touching every layer, not just the Gateway — a much larger blast radius than Candidate A, and reintroduces a version of the "16+ independent call sites" propagation problem GAP-04 itself is partly about, this time for instrumentation calls rather than provider calls; without a shared logging/tracing library already in place (Phase 2 §11 confirms none exists — no `pino`, `winston`, or `@opentelemetry/*` dependency), each layer's "structured event" would need to agree on a shared shape before any of this is useful, a coordination problem structurally identical to the ownership-fragmentation pattern (GAP-05) this document already found recurring elsewhere.
- **Complexity:** High. **Maintainability:** Medium — correctness depends on every layer actually propagating the correlation ID, which (absent enforcement, see GAP-10/GAP-11 in §11) could silently degrade to some layers doing it and others not, the same "holds by convention, not by a barrier" pattern Phase 2 §4 already found for boundary enforcement generally. **Extensibility:** High if adopted consistently; fragile otherwise.
- **Gaps addressed:** GAP-04 most completely of any candidate in this domain, at the highest implementation and coordination cost.

### Candidate C — Adopt an Existing Observability Library/Platform

Rather than building correlation-ID propagation, structured logging, and metrics from scratch (Candidates A/B), adopt an existing library (e.g., an OpenTelemetry SDK, or extending the already-present `@sentry/nextjs` dependency's tracing capabilities beyond its current 3-call-site usage) to provide correlation, tracing, and structured events as a platform capability rather than bespoke code.

- **Strengths:** Avoids designing a correlation-ID contract, event shape, or metrics taxonomy from scratch — these are exactly the kind of solved problems an observability platform exists to provide; `@sentry/nextjs` is already a dependency (Phase 2 §11 confirms this, and confirms no other observability library is present), meaning extending its existing, already-integrated usage has a lower adoption cost than introducing a net-new dependency like OpenTelemetry.
- **Weaknesses:** Introduces (for OpenTelemetry) a new dependency and its own operational surface (a collector, an exporter configuration, potentially new infrastructure) — a decision with cost/vendor implications this document explicitly does not evaluate, per its Explicit Non-Goals (no technology recommendations); extending Sentry's existing tracing is lower-cost but may not natively provide metrics/counters (Sentry's strength is error/trace capture, not necessarily gauge/histogram-style metrics), meaning this candidate may need to be a partial solution (tracing via Sentry, metrics via something else) rather than a single adopted platform covering every sub-gap GAP-04 names.
- **Complexity:** Medium (adoption/integration cost) but Low (design cost, since the taxonomy is externally defined). **Maintainability:** High — maintained by the platform, not bespoke code. **Extensibility:** High, bounded by whatever the adopted platform itself supports.
- **Gaps addressed:** GAP-04, with the specific sub-gaps addressed depending on which platform capability is adopted (tracing vs. metrics vs. structured logging may not all come from one choice).

---

## 10. Configuration Architecture Discovery

Governs GAP-03 (boot-time `OPENROUTER_API_KEY` requirement) and GAP-13 (no feature-flag/staged-rollout mechanism).

### Candidate A — Provider-Conditional Boot Validation

`env-validation.ts`'s `PRODUCTION_REQUIRED_ENV` is restructured so that provider credentials are validated conditionally on which provider(s) are configured to run, rather than unconditionally requiring `OPENROUTER_API_KEY` specifically — e.g., "at least one configured provider's credentials must be present" rather than "OpenRouter's credential must be present."

- **Strengths:** Directly and narrowly closes GAP-03 — the single most structurally consequential item in Phase 2's Configuration analysis ("blocked one layer earlier than configuration ownership itself would suggest") — without requiring any other domain's candidates to be chosen first; smallest possible change that removes the specific boot-time single-provider assumption.
- **Weaknesses:** Requires _some_ notion of "which provider(s) are configured to run" to already exist as a queryable fact at boot-validation time — which is exactly what §4's Provider Registry (Candidate B) would provide, but this candidate could also be implemented more narrowly (e.g., an explicit allow-list env var naming which provider(s) are active) without a full registry, at the cost of introducing yet another place ("which providers are active") that must be kept consistent with wherever the Gateway itself makes that determination.
- **Complexity:** Low-Medium. **Maintainability:** High. **Extensibility:** Medium — depends on whether it is implemented standalone or atop a registry.
- **Gaps addressed:** GAP-03 directly.

### Candidate B — Runtime Configuration Store (database or remote config)

Provider/model/routing configuration (today's compile-time `TASK_MODELS` map) moves to a runtime-mutable store (a database table, a remote config service) so that provider or routing behavior can change without a code change and redeploy — directly answering Phase 2 §13's "no runtime override... at any granularity" finding.

- **Strengths:** Enables exactly the capability Phase 2 names as absent ("changing provider/model/routing behavior without a code change and redeploy"); composes naturally with §4's Provider Registry and §5's Routing candidates, since a registry/router reading from a runtime store rather than a compile-time constant is a natural extension, not a competing design.
- **Weaknesses:** Introduces a new operational dependency (a database table or remote service must now be available for the Gateway to determine basic configuration, a new failure mode — "what happens if the runtime config store is unreachable" — that a compile-time constant never has); is more machinery than GAP-13/GAP-03 alone currently justify for a single-provider system, the same "more than the problem currently warrants" tension already noted for other domains' more elaborate candidates.
- **Complexity:** Medium-High. **Maintainability:** Medium — depends on how well the store's schema/interface is designed. **Extensibility:** High. **Operational impact:** Medium — a new dependency to monitor.
- **Gaps addressed:** The runtime-override sub-gap of GAP-13 and, indirectly, supports GAP-03 (provider validation could query the same store) and GAP-02 (routing tables could live here).

### Candidate C — Feature-Flag Layer (staged rollout, adopted or built)

A dedicated feature-flag mechanism (built in-house as a simple boolean/percentage config, or adopted from an existing library) gates staged rollout of new providers, routing policies, or capabilities — directly answering GAP-13's "no feature-flag-shaped mechanism to build a staged-rollout capability on top of."

- **Strengths:** Directly closes GAP-13; Phase 2 explicitly frames this as "neutral for the current single-provider system... becomes relevant the moment a target architecture needs to stage a provider rollout" — meaning this candidate's value is contingent on, and validated by, whichever Provider/Routing candidates are eventually chosen requiring a staged rollout, rather than being independently urgent today.
- **Weaknesses:** Building a bespoke feature-flag mechanism is speculative generality relative to today's actual needs (Phase 2 itself calls GAP-13 "Low" severity currently); adopting an existing library introduces a new dependency this document does not evaluate (per its non-goals, no technology recommendation) and which Phase 2 §11/§13 confirms is not currently present in `package.json` (no `flagsmith`, `launchdarkly`, `unleash`, or similarly-purposed dependency).
- **Complexity:** Low (bespoke, minimal) to Medium (adopted library, integration cost). **Maintainability:** Medium. **Extensibility:** High — directly enables staged multi-provider or routing-policy rollout, the specific future scenario GAP-13 names.
- **Gaps addressed:** GAP-13 directly; relevance is contingent on other domains' eventual selections (a dependency this document records per Phase 2 Independent Review §2.1's "GAP-02 → GAP-13" relationship, without resolving the sequencing).

---

## 11. Extension Architecture Discovery

Governs GAP-10 (boundaries hold by convention only), GAP-11 (dependency inversion applied in only 2 places), GAP-12 (no governed Extension Model artifact), GAP-14 (ADR-0003 header drift — governance only, no architectural candidate applies), and GAP-15 (undetermined "workflow" concept). Per §2, the already-shipped agent loop and tool-calling are preserved as a working precedent every candidate below builds alongside, not replaces.

### 11.1 Boundary Enforcement (GAP-10)

- **Candidate A — Convention only (status quo).** No mechanism; boundaries continue to hold because no violation has occurred. Strengths: zero cost, zero new tooling. Weaknesses: exactly the fragility Phase 2 §4 already names — "nothing would catch a new violation introduced by future work, including work done under this very roadmap's later phases." Complexity: none. Risk: the boundary violation this candidate cannot catch could be introduced by Phase 4+ implementation work under this very roadmap.
- **Candidate B — Static enforcement (lint rule / module-boundary tool).** A lint rule (e.g., forbidding imports of `src/core/brain/providers/*` from outside `src/core/brain/`) enforced at CI time. Strengths: catches violations before merge, zero runtime cost, directly matches Phase 2 §4's own suggested example ("a lint rule, a module-boundary tool"). Weaknesses: only as complete as the rules written — a new boundary (e.g., a future Context Pipeline) needs its own rule authored, so coverage grows only as fast as rules are added; does not catch dynamic/runtime violations (e.g., a string-constructed import path).
- **Candidate C — Runtime assertion.** A runtime check (e.g., the Gateway asserting it is never called with a provider-shaped object from outside its own module) fails fast if a boundary is crossed. Strengths: catches what static analysis might miss. Weaknesses: adds runtime overhead and code to every guarded boundary; a runtime assertion only fires once the violating code path actually executes, later in the feedback loop than a lint failure at CI time.

### 11.2 Dependency Inversion as Systemic Convention (GAP-11)

- **Candidate A — Extend DI pattern module-by-module.** Each Application Layer module (`personas.ts`, `behavior-flags.ts`, `memory-db.ts`) individually adopts the same dependency-injection shape `cost-gate.ts`'s `CostGateDependencies` already demonstrates, as each module is next touched. Strengths: fully incremental, no big-bang migration, reuses a pattern the codebase already proves works. Weaknesses: "as each module is next touched" has no forcing function — without GAP-10's enforcement mechanism, adoption could stall indefinitely, exactly as it already has (2 of many places, per Phase 2 §15) despite the pattern being available since at least `cost-gate.ts`'s introduction.
- **Candidate B — DI as a documented, required convention (governed by an Extension Model artifact, §11.3).** Same technical shape as Candidate A, but adoption is a documented expectation new/modified modules are held to, checked in code review, rather than an optional improvement. Strengths: addresses the "no forcing function" weakness of Candidate A without requiring tooling (Candidate C below). Weaknesses: a documentation-only convention is subject to the same "holds by convention, not a barrier" risk GAP-10 already names for boundaries generally — the same root cause (Root Cause C, Phase 2 Independent Review §4) applies here by construction.
- **Candidate C — Tooling-enforced DI (a lint rule against direct concrete-module imports where an interface exists).** Strengths: closes Candidate B's enforcement gap. Weaknesses: highest complexity of the three; risk of false positives where direct dependency is genuinely appropriate (not every dependency needs inversion — over-applying this pattern contradicts "avoid unnecessary complexity").

### 11.3 Extension Model Artifact (GAP-12)

- **Candidate A — A documented, versioned Extension Model (a markdown policy, analogous to this roadmap's own ADRs).** Describes, as a discoverable artifact, how to add a provider, a routing policy, a capability. Strengths: directly closes GAP-12 ("today's equivalent is prose in an implementation report, not an artifact a future contributor would discover by looking for one"); lowest-cost candidate in this sub-domain, consistent with how the roadmap itself already governs the broader initiative via documents, not tooling. Weaknesses: a document can drift from the code it describes without a forcing function to keep it current — precisely the failure mode GAP-14 already demonstrates for ADR-0003 itself ("Implementation: None yet," contradicted by shipped code); this candidate would need to avoid becoming a second instance of the same drift it is meant to prevent readers from experiencing.
- **Candidate B — A scaffolding/template mechanism (e.g., a code generator or template files for "add a new provider").** Strengths: cannot drift from the code the way a prose document can, since the template _is_ code; lowers the effort of following the Extension Model correctly. Weaknesses: highest complexity of the two candidates; a template only helps with the mechanical parts of extension (file structure, boilerplate), not the judgment calls (should this provider's quirk be normalized in the adapter or exposed to callers) an Extension Model document can at least attempt to guide.

### 11.4 Workflow Concept (GAP-15)

- **Candidate A — Workflows as an extension of the existing agent loop (no new abstraction).** Multi-step/multi-session orchestration needs, if they arise, are met by composing multiple agent-loop invocations rather than introducing a distinct "workflow" concept. Strengths: reuses a proven, already-Gateway-integrated mechanism (§2); avoids introducing a concept GAP-15 found no current evidence either confirms or rules out the need for. Weaknesses: agent-loop composition may prove insufficient for genuinely cross-session or multi-agent orchestration if that need materializes — this document has, per Phase 2, no evidence either way.
- **Candidate B — A distinct workflow-orchestration layer (multi-agent, multi-session).** A new abstraction above the agent loop, coordinating multiple agent-loop runs, potentially across sessions. Strengths: if multi-agent/multi-session orchestration is a real future need, purpose-building for it may be cleaner than stretching the single-agent-loop pattern past its design intent. Weaknesses: Phase 2 (§14) found "no evidence of a distinct 'workflow' concept... anywhere in the reviewed code" — this candidate would be designed against a need that is neither confirmed nor denied, the most speculative candidate in this entire document alongside Routing's Policy candidate (§5, Candidate C).

---

## 12. Architecture Trade-off Matrix

Complexity / Flexibility / Maintainability / Scalability / Operational Cost / Risk, each rated Low / Medium / High. Ratings are relative _within this document's candidate set_, not absolute engineering judgments, and reflect the qualitative analysis in §4–§11 — no candidate's rating implies a recommendation.

| Domain               | Candidate                                           | Complexity           | Flexibility | Maintainability          | Scalability | Operational Cost | Risk                         |
| -------------------- | --------------------------------------------------- | -------------------- | ----------- | ------------------------ | ----------- | ---------------- | ---------------------------- |
| Provider             | A. Direct Mapping                                   | Low                  | Low         | Medium                   | Low         | Low              | Low                          |
| Provider             | B. Provider Registry                                | Medium               | High        | High                     | High        | Low              | Medium                       |
| Provider             | C. Capabilities Descriptor                          | Medium-High          | High        | Medium                   | High        | Low              | Medium-High                  |
| Provider             | D. Adapter Layer                                    | Medium               | High        | High (post-2nd-provider) | High        | Low              | Medium                       |
| Routing              | A. Task Routing (as-is)                             | Low                  | Low         | High                     | Low         | None             | Low                          |
| Routing              | B. Capability Routing                               | Medium-High          | High        | Medium                   | High        | Medium           | Medium-High                  |
| Routing              | C. Policy Routing                                   | High                 | High        | Unknown                  | High        | Medium           | High                         |
| Routing              | D. Layered Routing                                  | Medium (rising)      | High        | High                     | High        | Medium           | Medium                       |
| Context              | A. Centralized Pipeline                             | Medium-High          | Medium      | High                     | High        | Low              | Medium                       |
| Context              | B. Federated Pipeline                               | Low-Medium           | Medium      | Medium                   | Medium      | Low              | Medium                       |
| Context              | C. Gateway-Adjacent Service                         | High                 | High        | Unknown                  | High        | Low              | High                         |
| Memory               | A. In-place Ranking Extension                       | Low-Medium           | Low         | High                     | Low         | Low              | Low                          |
| Memory               | B. Database-Side Ranking                            | High                 | High        | High (post-migration)    | High        | Medium           | Medium-High                  |
| Memory               | C. Tiered Retrieval                                 | Medium               | Medium      | Medium                   | Medium      | Low              | Medium                       |
| Prompt               | A. Centralized Composition                          | Medium-High          | Medium      | High                     | Medium      | None             | Medium                       |
| Prompt               | B. Modular Fragments                                | Medium               | High        | Medium-High              | High        | None             | Medium                       |
| Prompt               | C. Layered (persona/protocol + adapters)            | Medium (distributed) | High        | High (post-adoption)     | Medium      | None             | Medium                       |
| Operational          | A. Centralized Gateway Instrumentation              | Low-Medium           | Medium      | High                     | Medium      | Low              | Low                          |
| Operational          | B. Distributed + Correlation Contract               | High                 | High        | Medium                   | High        | Medium           | Medium-High                  |
| Operational          | C. Adopt Existing Platform                          | Medium (adoption)    | Medium-High | High                     | High        | Medium           | Medium                       |
| Configuration        | A. Provider-Conditional Boot Validation             | Low-Medium           | Medium      | High                     | Medium      | None             | Low                          |
| Configuration        | B. Runtime Configuration Store                      | Medium-High          | High        | Medium                   | High        | Medium           | Medium                       |
| Configuration        | C. Feature-Flag Layer                               | Low-Medium           | High        | Medium                   | High        | Low-Medium       | Low-Medium                   |
| Extension/Governance | Boundary: Static (lint)                             | Low                  | Medium      | High                     | High        | None             | Low                          |
| Extension/Governance | Boundary: Runtime assertion                         | Medium               | Medium      | Medium                   | Medium      | Low              | Low-Medium                   |
| Extension/Governance | Extension Model: Document                           | Low                  | Medium      | Medium (drift risk)      | High        | None             | Low-Medium                   |
| Extension/Governance | Extension Model: Scaffolding                        | Medium-High          | Medium      | High                     | Medium      | None             | Medium                       |
| Extension/Governance | Boundary: Convention only (status quo)              | None                 | High        | High (until violated)    | High        | None             | Medium-High                  |
| Extension/Governance | DI: Module-by-module (no forcing function)          | Low                  | Medium      | Medium (adoption stalls) | Medium      | None             | Medium                       |
| Extension/Governance | DI: Documented convention                           | Low                  | Medium      | Medium                   | Medium      | None             | Medium                       |
| Extension/Governance | DI: Tooling-enforced                                | Medium-High          | Medium      | High                     | Medium      | Low              | Low-Medium                   |
| Extension/Governance | Workflow: Agent-loop extension (no new abstraction) | Low                  | Medium      | High                     | Unknown     | None             | Medium (understatement risk) |
| Extension/Governance | Workflow: Distinct orchestration layer              | Medium-High          | High        | Unknown                  | Unknown     | Low              | Medium-High (overbuild risk) |

---

## 13. Architectural Pattern Assessment

Reusable architectural patterns applicable to the candidates above. Applicability described only — no pattern is recommended over another.

- **Strategy.** Directly underlies every Provider-domain candidate (§4): `BrainProvider` is already a Strategy interface (one contract, swappable implementations); Candidates B–D extend how strategies are selected/composed, not whether Strategy is the right pattern for provider substitutability — Phase 1/2 both already validate this fit.
- **Registry.** Directly underlies §4 Candidate B (Provider Registry) and is the structural precondition for §5 Candidate B (Capability Routing) — a registry is the natural pattern for "hold N interchangeable implementations, look one up by key or query." Also applicable to §10 Candidate B (Runtime Configuration Store) as a registry of configuration values rather than provider instances.
- **Pipeline.** Directly named by the roadmap for Context, Memory, Behavior, Emotion, and Prompt — applicable to §6 Candidate A (Centralized Context Pipeline) and §8 Candidates A/C (Centralized/Layered Prompt Composition) as a sequence of composable processing stages; less directly applicable to §6 Candidate B (Federated) and §8 Candidate B (Modular Fragments), which are better described by Adapter/composition patterns than a strict pipeline.
- **Chain of Responsibility.** Most directly applicable to §5 Candidate D (Layered Routing) — task routing narrows to capability routing narrows to policy routing, each layer either handling the request or passing it to the next, the textbook shape of this pattern; also loosely applicable to §11.1's boundary-enforcement candidates if multiple enforcement mechanisms (lint + runtime assertion) were ever combined, though this document does not propose that combination.
- **Adapter.** Directly applicable to §4 Candidate D (Provider Adapter Layer) — the pattern's textbook purpose (translating one interface to another expected by a client) matches exactly the wire-format-normalization problem that candidate addresses; also applicable to §8 Candidate C's "channel adapter" layer by name and shape.
- **Policy.** Directly applicable to §5 Candidate C (Policy Routing) and to §10 Candidate C (Feature-Flag Layer, where a policy determines rollout eligibility) — both candidates encode "a decision made by evaluating rules against context" as their core mechanism, the defining shape of the Policy pattern.
- **Cross-cutting observation:** every pattern above already has at least one existing, working instance somewhere in Emma's current codebase (Strategy in `BrainProvider`; a proto-Pipeline in `buildSystemPromptBlocks()`'s dormant seam) — this document treats that as relevant context for pattern-fit judgment (a pattern the codebase has already proven it can execute correctly once is lower-risk to extend than one with zero precedent anywhere), not as a recommendation for any specific candidate.

---

## 14. Risk Assessment

Risks associated with candidate architectures, by category. No risk below implies a candidate should be avoided — risk is one axis among several a future Phase 3.1 selection would weigh.

- **Migration complexity.** Highest for §6 Candidate A (Context centralization — requires reconciling two non-interoperable summarization concepts, per Phase 2 §8) and §8 Candidate A (Prompt centralization — five external call sites plus internal `personas.ts` restructuring); lowest for status-quo-adjacent candidates (§4 Candidate A, §5 Candidate A, §11.1 Candidate A) precisely because they change the least.
- **Operational complexity.** Highest for §9 Candidate B (Distributed Instrumentation — requires every layer to correctly propagate a correlation ID, a coordination burden with no existing precedent) and §10 Candidate B (Runtime Configuration Store — introduces a new operational dependency the Gateway did not previously have); Candidate C in both of those domains (adopt existing platform / adopt existing library) trades design risk for adoption/dependency risk instead.
- **Scalability.** Best addressed by §7 Candidate B (Database-Side Ranking, the only Memory candidate that structurally removes the cap-ranking coupling) and §5 Candidate D (Layered Routing, extensible by adding layers); worst-served by candidates that preserve today's shape most closely (§4 Candidate A, §5 Candidate A, §7 Candidate A) — each explicitly documented above as not solving the scalability-relevant gap, only avoiding new risk.
- **Coupling.** §6 Candidate C (Context as Gateway-Adjacent Service) carries the highest coupling risk in this document — it is the one candidate that risks reintroducing business-logic knowledge into the Gateway, directly tensioning ADR-0003's Separation of Concerns principle if not carefully scoped; every other candidate in this document was evaluated against, and found consistent with, the dependency-direction and boundary-preservation constraints in §2.
- **Maintenance burden.** §9 Candidate B and §5 Candidate C (Policy Routing) share the highest long-term maintenance uncertainty, both rated "Unknown" in §12 because neither has any existing analog in Emma's codebase to project maintenance cost from — this is a distinct risk from complexity (a candidate can be complex to build but cheap to maintain, or vice versa) and this document tracks them separately for that reason.
- **Evidentiary risk ("n=1"): a distinct, cross-cutting risk category.** Every candidate in the Provider (§4) and Routing (§5) domains that depends on validating provider-neutrality — Candidates B/C/D in §4, all of §5 except Candidate A — carries the same underlying risk Phase 2 Independent Review (§4, Root Cause A) already named: none of these candidates can be _proven_ correct until a second provider exists, because the current system has never had one. This is not a flaw in any specific candidate's design; it is a property of the current evidentiary base every candidate in these two domains inherits equally, and a future Phase 3.1 selection should weigh this as a shared constraint on confidence, not as a differentiator between these candidates.
- **Governance/documentation drift risk.** §11.3 Candidate A (a documented Extension Model) carries an explicit, self-acknowledged risk of repeating GAP-14's own failure mode (a document drifting from the code it describes) unless paired with some forcing function — this document does not resolve what that forcing function would be, consistent with its non-goals, but records the risk because it is directly evidenced by GAP-14 already having happened once in this exact initiative.
- **Unenforced boundary risk (§11.1).** Candidate A (Convention only, status quo) carries, by construction, the same risk GAP-10 itself names — "nothing would catch a new violation introduced by future work, including work done under this very roadmap's later phases" — with zero mitigating mechanism, the only candidate in this document whose risk is not offset by any compensating property. Candidates B (Static/lint) and C (Runtime assertion) trade this risk for coverage-completeness risk instead (a lint rule or assertion is only as complete as the rules/checks authored for it), a materially lower but non-zero risk.
- **Uneven-adoption risk (§11.2).** Candidate A (module-by-module DI adoption) carries the same "no forcing function" risk as §11.1 Candidate A, evidenced concretely by GAP-11 itself (dependency inversion has been available since at least `cost-gate.ts`'s introduction yet adopted in only 2 places). Candidate B (documented convention) reduces but does not eliminate this risk — a documentation-only convention is subject to the identical "holds by convention, not a barrier" pattern Root Cause C (Phase 2 Independent Review §4) already names for boundaries generally. Candidate C (tooling-enforced) trades this risk for false-positive risk (over-applying DI where direct dependency is genuinely appropriate).
- **Speculative-need risk (§11.4).** Both Workflow candidates share the risk Phase 2 (§14) already flagged for GAP-15: neither is evidenced by a confirmed present or absent need, since "no evidence of a distinct 'workflow' concept... anywhere in the reviewed code" was found. Candidate A's risk is understatement (agent-loop composition may prove insufficient if a real multi-agent need materializes); Candidate B's risk is overbuilding (purpose-building an orchestration layer against a need that may never materialize) — the two candidates carry opposite, mutually exclusive risk profiles for the same evidentiary gap.

---

## 15. Discovery Conclusion

### 15.1 Summary of discoveries

This document explored two-to-four candidate architectures across eight domains (Provider, Routing, Context, Memory, Prompt, Operational, Configuration, Extension/Governance), for a total of thirty-three distinct candidate architectures, each evaluated for strengths, weaknesses, complexity, maintainability, extensibility, and operational impact, and each traced to at least one of Phase 2's fifteen validated gaps (§3). Six architectural patterns (Strategy, Registry, Pipeline, Chain of Responsibility, Adapter, Policy) were assessed for cross-domain applicability (§13), and every pattern was found to already have at least one working precedent somewhere in Emma's current codebase. Risks were assessed both per-candidate (§12's matrix) and as cross-cutting categories spanning multiple candidates (§14), with the "n=1" evidentiary limitation identified as the single risk category with the broadest reach — affecting every Provider and Routing candidate except the lowest-ambition ones (§4 Candidate A, §5 Candidate A).

A structural pattern recurs across the domains explored: gaps of _fragmentation_ (Context, Prompt, and the DI/boundary-enforcement portion of Extension/Governance — GAP-05, GAP-10, GAP-11) admit candidates that trade off _where_ reconciliation happens (one new owner vs. a shared contract among existing owners vs. a thinner delegating layer), while gaps of _absence_ (Routing, Operational — GAP-02, GAP-04) admit candidates that trade off _how much is purpose-built versus adopted_ (a bespoke mechanism sized to Emma's exact current needs vs. an existing pattern/library carrying more general-purpose capability than currently required). This document surfaces that pattern as a useful lens for a future Phase 3.1 selection to apply consistently across domains; it does not itself apply the lens to choose an answer in any domain.

### 15.2 Traceability confirmation

Every discovery in §4–§11 traces to at least one gap identified in Phase 2's Strategic Gap Register (§16 of `phase2-brain-gateway-gap-analysis.md`), per the mapping established in §3 of this document. No candidate architecture was introduced that does not address at least one validated gap; no gap from Phase 2's fifteen was left unaddressed by at least one candidate (§3's table has no empty "Domain(s)" cell). GAP-14 (ADR-0003 header drift) is the sole gap with no architectural candidate proposed against it, correctly, because Phase 2 itself classifies it as a governance/documentation gap rather than a runtime-architecture gap (Phase 2 Independent Review §4, Root Cause E) — this document's own §14 risk assessment nonetheless references GAP-14 as live evidence informing the Extension Model artifact's drift risk (§11.3), so it is not ignored, only correctly not assigned a structural candidate.

### 15.3 Confirmation of non-goals honored

This document has not selected a preferred architecture in any of the eight domains explored. It has not created any ADR. It has not written an implementation plan, migration plan, or effort estimate for any candidate. It has not recommended a specific technology, library, or vendor (§9 Candidate C and §10 Candidate C name categories of adoption — "an OpenTelemetry SDK," "an existing feature-flag library" — as illustrative examples of the candidate's shape, not as a selection; per this phase's Explicit Non-Goals, no such choice is made here). It has not modified any runtime behavior or application code — the only files touched by this phase are this document itself.

### 15.4 Readiness to proceed to Architecture Decision (Phase 3.1)

**Sufficient architectural exploration has been completed to proceed to Phase 3.1 (Architecture Freeze).** Every domain named in the roadmap's Phase 3 scope and the Phase 3 task brief has at least two objectively-described candidate architectures with documented trade-offs (§4–§11, §12); every validated Phase 2 gap has at least one candidate addressing it (§3, §15.2); cross-cutting risks that would affect Phase 3.1's selection regardless of which candidates are chosen — most significantly the "n=1" evidentiary limitation on every multi-provider-dependent candidate — have been identified and are not domain-specific blind spots but a documented, shared constraint any future selection must weigh explicitly (§14). No domain was found where discovery could not proceed for lack of evidence; Phase 2's own Discovery Readiness Matrix (Phase 2 Independent Review §5) already established analytical readiness for every domain this document explores, and this phase's own candidate generation confirms that readiness held — no domain required speculation beyond what a "candidate architecture, objectively described" requires by its nature (a description of a design that does not yet exist cannot itself be verified against the repository the way a Phase 0/1/2 factual claim can; this is not the same as speculation about current-state facts, which this document does not do). Phase 3.1's task — selecting among these candidates, per domain, and producing the ADRs that would freeze those selections — has a complete, evidence-traced candidate set to select from.

---

## Explicit Non-Goals Confirmation

Per the Phase 3 spec, this document does not select a preferred architecture, does not create ADRs, does not write implementation plans, does not modify code, does not define migration plans, does not estimate implementation effort, does not recommend technologies, and does not modify runtime behavior. Every candidate architecture above is described objectively (strengths, weaknesses, complexity, maintainability, extensibility, operational impact) without a recommendation attached; where illustrative technology examples appear (§9 Candidate C, §10 Candidate C), they name categories of approach, not a selection among them. Trade-offs (§12) and risks (§14) are documented neutrally as inputs to a future decision, not as a scoring system that resolves to a winner.

## Success Criteria Checklist

- [x] Current architectural strengths have been identified (§2)
- [x] Every validated gap (Phase 2, GAP-01 through GAP-15) has been mapped to architectural concerns (§3)
- [x] Multiple architectural alternatives have been explored for every named domain — Provider, Routing, Context, Memory, Prompt, Operational, Configuration, Extension/Governance (§4–§11)
- [x] Trade-offs have been documented (§12)
- [x] Architectural patterns have been assessed (§13)
- [x] Risks have been documented (§14)
- [x] No architectural decision has been made (§15.3, confirmed; no candidate selected in any domain)
