# ADR 0013: Brain Gateway Boundary & Dependency-Inversion Enforcement

- **Status:** Accepted
- **Date:** 2026-07-23
- **Phase:** 3.2 — "ADR Authoring" (documents a decision frozen in Phase 3.1, not a new one)
- **Domain:** Extension
- **Implementation:** None yet. Introduces CI-time tooling (lint rules) with binding force over future contributions. Technical Design (Roadmap Phase 4) specifies the concrete lint rule set.
- **Frozen by:** [Phase 3.1 — Architecture Freeze](../phase3-1-brain-gateway-architecture-freeze.md), §2.8, §3, §4 (GAP-10, GAP-11, GAP-15), §5 (Decision Inventory item 8)

---

## Context

Boundaries above the Gateway (Behavior ↔ Prompt Builder, Emotion ↔ downstream consumers) are defined in documentation but enforced by nothing — they hold today only because no violation has yet occurred (Phase 1 §3, GAP-10). Dependency inversion — the abstraction pattern that makes components substitutable — is applied in exactly two places in the entire Application Layer (`gateway.ts`'s `BrainProvider` interface, `cost-gate.ts`'s `CostGateDependencies`) and absent everywhere else, despite being available since at least `cost-gate.ts`'s introduction (GAP-11). Both gaps share Root Cause C, per the Phase 2 Independent Review (§4): "structure maintained by the absence of a violation, not by a barrier that would catch one." Separately, no dedicated workflow-orchestration abstraction beyond the agent loop's own multi-step pattern was found anywhere in the reviewed code (GAP-15) — a gap of unconfirmed need, not a confirmed defect.

Phase 3's Architecture Discovery catalogued these as three sub-domains with their own candidate sets: §11.1 Boundary Enforcement (Convention only; Static/lint; Runtime assertion), §11.2 Dependency Inversion (Module-by-module; Documented convention; Tooling-enforced), and §11.4 Workflow Concept (Agent-loop extension; Distinct orchestration layer). The already-shipped agent loop and tool-calling (`agent-loop.ts`) are preserved as a working precedent every candidate builds alongside, not replaces, per Phase 3's Current Architecture Preservation Report (§2) — Phase 2's Extension Readiness Assessment (§14) found tool execution and agents "already implemented and already routing through the Gateway," the hardest-sounding items on the roadmap's own extension checklist.

## Decision

**Three independent selections, one per sub-domain:**

1. **Boundary enforcement (§11.1):** Static enforcement — a lint rule / module-boundary tool (e.g., forbidding imports of `src/core/brain/providers/*` from outside `src/core/brain/`) enforced at CI time.
2. **Dependency inversion (§11.2):** Tooling-enforced DI — a lint rule against direct concrete-module imports where an interface exists, applied with the same enforcement philosophy as boundary enforcement.
3. **Workflow concept (§11.4):** Workflows remain an extension of the existing agent loop — no new orchestration abstraction is introduced. Multi-step/multi-session orchestration needs, if they arise, are met by composing multiple agent-loop invocations.

## Decision Drivers

- **Remain internally consistent.** Selecting the same enforcement philosophy (tooling, not convention) for both boundary enforcement and dependency inversion satisfies this principle directly — this domain should not enforce boundaries with tooling while enforcing DI with a document alone.
- **Resolve validated gaps with direct evidence, not hypothetical risk.** GAP-11 itself demonstrates the "no forcing function" failure mode has already happened — DI has been available since `cost-gate.ts` and adopted in only two places. This is not a hypothetical risk to guard against; it is an already-observed failure this decision closes.
- **Preserve validated architectural strengths.** The agent loop is one of the roadmap's own two hardest-sounding extension items, already done — building a new orchestration layer against an unevidenced need would directly contradict this principle.

## Alternatives Considered

**§11.1A — Convention only (status quo).** No mechanism; boundaries continue to hold because no violation has occurred. Zero cost, zero new tooling. Rejected: self-identified by Phase 3's own Risk Assessment (as corrected by the Phase 3 Independent Review, Finding M-2) as "the only candidate in this document whose risk is not offset by any compensating property" — nothing would catch a violation introduced by this very roadmap's own later implementation phases.

**§11.1C — Runtime assertion.** A runtime check (e.g., the Gateway asserting it is never called with a provider-shaped object from outside its own module) fails fast if a boundary is crossed. Catches what static analysis might miss (e.g., a string-constructed import path). Not selected as the primary mechanism: it fires later in the feedback loop than a CI-time lint failure and adds runtime overhead to every guarded boundary. Not rejected outright: recorded as a defense-in-depth addition Technical Design may layer on top of the selected static enforcement without conflict.

**§11.2A — Module-by-module DI (no forcing function).** Each module individually adopts `CostGateDependencies`'s DI shape as it is next touched. Fully incremental, reuses a pattern the codebase already proves works. Rejected: GAP-11 itself is direct evidence this exact approach has been available since at least `cost-gate.ts`'s introduction and has been adopted in only two places — "no forcing function" is not a hypothetical risk but an already-observed failure mode.

**§11.2B — Documented convention alone (DI, governed by an Extension Model artifact).** Same technical shape as Module-by-module, but adoption is a documented expectation checked in code review. Addresses the "no forcing function" weakness without requiring tooling. Rejected as the primary mechanism: a documentation-only convention is subject to the identical "holds by convention, not a barrier" risk (Root Cause C) already named for boundaries generally. Not discarded: its documentation half is retained, paired with tooling, in [ADR-0014](0014-brain-gateway-extension-model.md)'s Governance selection.

**§11.4B — A distinct workflow-orchestration layer (multi-agent, multi-session).** A new abstraction above the agent loop, coordinating multiple agent-loop runs, potentially across sessions. If a real multi-agent/multi-session need exists, purpose-building for it may be cleaner than stretching the single-agent-loop pattern. Rejected: Phase 2 (§14) found zero evidence of a distinct "workflow" need beyond the already-shipped, already-Gateway-integrated agent loop — building for an unevidenced need directly contradicts "preserve validated architectural strengths." Reconsideration condition: only once a concrete multi-agent or multi-session orchestration need is actually evidenced in product requirements — not evidenced anywhere in Phase 0–3's record.

## Consequences

**Positive:**

- A CI-time check catches a boundary violation before merge, including violations introduced by this roadmap's own later implementation phases.
- New substitutable components (the Context and Prompt Pipelines selected in [ADR-0008](0008-centralized-context-pipeline.md)/[ADR-0010](0010-prompt-pipeline-centralized-composition.md)) are DI-shaped by default, checked mechanically rather than left to individual module discipline.
- The proven, already-Gateway-integrated agent loop remains the sole orchestration mechanism, avoiding speculative complexity.

**Negative / Accepted trade-offs:**

- Tooling-enforced DI risks false positives where direct dependency is genuinely appropriate — not every dependency needs inversion, and over-applying this pattern contradicts avoiding unnecessary complexity.
- Agent-loop composition may prove insufficient for genuinely cross-session or multi-agent orchestration if that need materializes — this decision has, per Phase 2, no evidence either way at present.

**Accepted limitations:**

- **Coverage is "only as complete as the rules authored."** A new boundary (e.g., the Context or Prompt Pipelines selected above) needs its own rule written; this is accepted as an ongoing governance responsibility, not a one-time cost.

**Deferred considerations:**

- §11.1C's runtime-assertion defense-in-depth layer is deferred as optional, not required.
- The concrete lint rule set (which imports are forbidden, which concrete-module imports require inversion) is left to Technical Design.

## Architectural Impact

**Affected domain:** Extension. **Affected components:** introduces new CI tooling (lint configuration); no existing runtime component is modified. **Dependency implications:** every future boundary this initiative introduces (the Context Pipeline of [ADR-0008](0008-centralized-context-pipeline.md), the Prompt Pipeline of [ADR-0010](0010-prompt-pipeline-centralized-composition.md), the Provider Registry of [ADR-0006](0006-provider-registry-capabilities-descriptor-adapter-layer.md)) will need its own enforcement rule authored, not automatically inherited. **Extensibility implications:** mutually reinforcing with [ADR-0010](0010-prompt-pipeline-centralized-composition.md)'s centralized Prompt Pipeline — a new, substitutable component is exactly what DI-as-systemic-convention is meant to apply to going forward, built DI-shaped from its first line, per the same pattern `cost-gate.ts` already demonstrates.

## Traceability

```
GAP-10 (boundaries hold by convention only)     ─┐
GAP-11 (DI applied in only 2 of many places)     ─┼──► Phase 3.1 Freeze §2.8 ──► ADR-0013 ──► Technical Design (Phase 4):
GAP-15 (undetermined workflow concept)           ─┘                                          concrete lint rule set
```

## References

- [Phase 3.1 Architecture Freeze](../phase3-1-brain-gateway-architecture-freeze.md), §2.8, §3, §4, §5 (item 8), §6
- [Phase 3 Architecture Discovery](../phase3-brain-gateway-architecture-discovery.md), §11.1, §11.2, §11.4
- [Phase 3 Independent Review](../phase3-independent-review.md), §8 (Finding M-2)
- [Phase 2 Gap Analysis](../phase2-brain-gateway-gap-analysis.md), §4, §5, §14, §16 (GAP-10, GAP-11, GAP-15)
- [Phase 2 Independent Review](../phase2-independent-review.md), §4 (Root Cause C)
- [ADR-0014: Brain Gateway Extension Model](0014-brain-gateway-extension-model.md)
- [ADR-0008: Centralized Context Pipeline](0008-centralized-context-pipeline.md)
- [ADR-0010: Prompt Pipeline — Centralized Composition, Phased Migration](0010-prompt-pipeline-centralized-composition.md)
