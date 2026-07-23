# ADR 0012: Provider-Conditional Boot Validation

- **Status:** Accepted
- **Date:** 2026-07-23
- **Phase:** 3.2 — "ADR Authoring" (documents a decision frozen in Phase 3.1, not a new one)
- **Domain:** Configuration
- **Implementation:** None yet. Changes a production boot-time invariant (`env-validation.ts`'s required-env list) — a decision with direct deployment/operational consequence. Technical Design (Roadmap Phase 4) specifies the concrete validation logic.
- **Frozen by:** [Phase 3.1 — Architecture Freeze](../phase3-1-brain-gateway-architecture-freeze.md), §2.7, §3, §4 (GAP-03), §5 (Decision Inventory item 7)

---

## Context

`env-validation.ts`'s `PRODUCTION_REQUIRED_ENV` unconditionally requires `OPENROUTER_API_KEY` in production (Phase 1 §1.4.12). Phase 2's Gap Analysis rated this "the most structurally consequential single item" in its Configuration analysis (§13): the assumption sits one layer below the Gateway itself — production boot fails without OpenRouter specifically, not merely "without a configured provider." A target architecture where OpenRouter is one interchangeable provider among several inherits a validation layer that currently treats it as the only valid provider, meaning multi-provider readiness is blocked at configuration before a second provider's code could even be reached in a production deployment (GAP-03).

The Phase 2 Independent Review's Gap Dependency Map (§2.1) established GAP-03 as an independent precondition of the multi-provider end-state — not downstream of GAP-01/GAP-02, but a parallel blocker one layer lower. GAP-03 is also part of the "n=1" shared-root cluster (Root Cause A, alongside GAP-01, GAP-02, GAP-07, GAP-13) — a design premised on multiple providers that has never had a second provider to be defined or falsified against.

Phase 3's Architecture Discovery catalogued this decision alongside two others in the Configuration domain (Runtime Configuration Store; Feature-Flag Layer). The Phase 3 Independent Review's Candidate Independence Assessment found Configuration's three candidates structurally different in kind from every other domain's candidate set (Finding Ed-2): they address three different sub-gaps — this candidate addresses GAP-03, while the other two address different halves of GAP-13 — rather than three competing answers to one design question.

## Decision

**`env-validation.ts`'s `PRODUCTION_REQUIRED_ENV` is restructured so that provider credentials are validated conditionally on which provider(s) are configured to run, rather than unconditionally requiring `OPENROUTER_API_KEY` specifically** — e.g., "at least one configured provider's credentials must be present" rather than "OpenRouter's credential must be present."

This decision is selected now, standalone; Configuration's Runtime Configuration Store and Feature-Flag Layer are accepted-in-principle but explicitly deferred, contingent on other domains' future activation — see Deferred Considerations.

## Decision Drivers

- **Resolve a validated gap without waiting on contingent relevance.** GAP-03 is closed now, directly, without requiring the other two Configuration candidates' contingent future needs to materialize first.
- **Evidence-justified.** This sequencing is the structure the Phase 3 Independent Review already identified as the domain's actual shape (Finding Ed-2), not an invented one — adopted directly rather than re-derived.
- **Smallest change that removes the specific boot-time single-provider assumption**, without requiring any other domain's candidates to be chosen first.

## Alternatives Considered

Configuration's other two candidates are not rejected — they are accepted-in-principle and deferred, because Phase 3's own structural analysis (validated by the Independent Review's Finding Ed-2) established they address different sub-gaps, not a competing answer to this same question:

**Runtime Configuration Store (database or remote config).** Provider/model/routing configuration moves to a runtime-mutable store so that behavior can change without a code change and redeploy. Enables exactly the capability Phase 2 names as absent (§13). Deferred, not rejected: introduces a new operational dependency (a database table or remote service the Gateway did not previously have) that is more machinery than GAP-13 alone currently justifies for a single-provider system. Activation condition: once Routing's capability/policy layers ([ADR-0007](0007-layered-routing-engine.md), Layers 2–3) are activated and need a runtime home beyond a compile-time constant.

**Feature-Flag Layer (staged rollout, adopted or built).** A dedicated mechanism gating staged rollout of new providers, routing policies, or capabilities. Directly closes the staged-rollout half of GAP-13. Deferred, not rejected: Phase 2 explicitly frames it as "neutral for the current single-provider system," and building or adopting it now is speculative relative to today's actual needs. Activation condition: once a second provider or a routing-policy rollout actually needs staging.

## Consequences

**Positive:**

- Production boot no longer fails without OpenRouter specifically — it fails only if no configured provider's credentials are present.
- Directly closes the single most structurally consequential item in Phase 2's Configuration analysis, without requiring any other domain's selection to land first.

**Negative / Accepted trade-offs:**

- Requires "which provider(s) are configured" to already exist as a queryable fact at boot-validation time — supplied by [ADR-0006](0006-provider-registry-capabilities-descriptor-adapter-layer.md)'s Provider Registry. This dependency is accepted, not treated as a gap in this decision's own readiness, because the Provider domain's selection already satisfies it.

**Accepted limitations:**

- **The "n=1" evidentiary risk extends to this decision, not only to Provider/Routing** — this Freeze's boundary-consistency check (and the Phase 3 Independent Review's Finding Min-3) established that GAP-03's "n=1" root cause is shared with GAP-01/GAP-02/GAP-07/GAP-13; this decision cannot be proven correct in a genuinely multi-provider production deployment until a second provider actually exists.

**Deferred considerations:**

- Runtime Configuration Store and Feature-Flag Layer are accepted-in-principle but not activated by this ADR — an ADR is triggered for either only if/when they are activated, at which point they would likely amend this ADR or [ADR-0006](0006-provider-registry-capabilities-descriptor-adapter-layer.md)/[ADR-0007](0007-layered-routing-engine.md) rather than stand alone.

## Architectural Impact

**Affected domain:** Configuration. **Affected components:** `src/core/env-validation.ts` (`PRODUCTION_REQUIRED_ENV`'s provider-credential check becomes conditional rather than unconditional). **Dependency implications:** depends on [ADR-0006](0006-provider-registry-capabilities-descriptor-adapter-layer.md)'s Provider Registry supplying "which provider(s) are configured" as a queryable fact — a sequencing dependency, not a conflict. **Extensibility implications:** removes the configuration-layer blocker to hybrid/local-inference deployment one layer below where Provider-Layer work alone could reach.

## Traceability

```
GAP-03 (boot-time single-provider lock-in) ──► Phase 3.1 Freeze §2.7 ──► ADR-0012 ──► Technical Design (Phase 4):
                                                                                       concrete boot-validation logic
```

## References

- [Phase 3.1 Architecture Freeze](../phase3-1-brain-gateway-architecture-freeze.md), §2.7, §3, §4, §5 (item 7), §6
- [Phase 3 Architecture Discovery](../phase3-brain-gateway-architecture-discovery.md), §10
- [Phase 3 Independent Review](../phase3-independent-review.md), §4 (Finding Ed-2), §8 (Finding Min-3)
- [Phase 2 Gap Analysis](../phase2-brain-gateway-gap-analysis.md), §13, §14, §16 (GAP-03)
- [Phase 2 Independent Review](../phase2-independent-review.md), §2.1, §4 (Root Cause A)
- [ADR-0006: Provider Registry, Capabilities Descriptor, and Adapter Layer](0006-provider-registry-capabilities-descriptor-adapter-layer.md)
- [ADR-0007: Layered Routing Engine](0007-layered-routing-engine.md)
