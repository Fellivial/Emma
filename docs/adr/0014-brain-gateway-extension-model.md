# ADR 0014: Brain Gateway Extension Model

- **Status:** Accepted
- **Date:** 2026-07-23
- **Phase:** 3.2 — "ADR Authoring" (documents a decision frozen in Phase 3.1, not a new one)
- **Domain:** Governance
- **Implementation:** None yet. Establishes a new governed artifact and its relationship to [ADR-0013](0013-brain-gateway-boundary-dependency-inversion-enforcement.md)'s enforcement tooling. Technical Design (Roadmap Phase 4) may specify the artifact's concrete location and format.
- **Frozen by:** [Phase 3.1 — Architecture Freeze](../phase3-1-brain-gateway-architecture-freeze.md), §2.9, §3, §4 (GAP-12), §5 (Decision Inventory item 9)

---

## Context

No governed Extension Model artifact exists for the Brain Gateway. The current extension guidance is an informal note in the Phase 7B implementation report ("implement `BrainProvider`... extend `gateway.ts`'s selection"), not a designed and versioned policy a future contributor would discover by looking for one (GAP-12). This sits alongside a related, separately-tracked governance gap: ADR-0003's own header still asserts "Implementation: None yet," contradicting both the Phase 7B report and the shipped code (GAP-14) — evidence, cited directly in this decision's rationale, that a governance artifact can drift from the code it describes without a forcing function to keep it current. Both GAP-12 and GAP-14 share Root Cause E per the Phase 2 Independent Review (§4): "governance/documentation drift and missing governed artifacts... process causes about what is (and isn't) written down and kept current," distinct from the runtime-architecture root causes governing every other domain in this initiative.

Phase 3's Architecture Discovery catalogued two candidates for this sub-domain (§11.3: a documented, versioned Extension Model; a scaffolding/template mechanism).

## Decision

**A documented, versioned Extension Model artifact — a markdown policy, analogous to this roadmap's own ADRs — describes, as a discoverable artifact, how to add a provider, a routing policy, or a capability. [ADR-0013](0013-brain-gateway-boundary-dependency-inversion-enforcement.md)'s tooling-enforced dependency-inversion lint rule serves as this artifact's forcing function against drift: where the Extension Model document states a DI or boundary expectation, the lint rule makes that expectation checkable rather than merely written down.**

## Decision Drivers

- **Resolve the validated gap directly.** GAP-12 is closed: a discoverable, versioned policy exists for how to add a provider/capability, rather than prose buried in an implementation report.
- **Evidence-justified — the pairing directly answers a risk this same initiative has already demonstrated twice, not a hypothetical one.** A document can drift from the code it describes without a forcing function — exactly the failure mode GAP-14 already demonstrates for ADR-0003's own header, and the same "holds by convention, not a barrier" pattern GAP-11 demonstrates for dependency inversion generally. Pairing the document with [ADR-0013](0013-brain-gateway-boundary-dependency-inversion-enforcement.md)'s lint rule closes the specific gap between "documented" and "enforced" this initiative has now observed twice.

## Alternatives Considered

**A scaffolding/template mechanism (a code generator or template files for "add a new provider").** Cannot drift from the code the way a prose document can, since the template _is_ code; lowers the effort of following the Extension Model correctly. Rejected as the primary artifact: higher complexity than the documented-policy candidate, and a template only helps with the mechanical/boilerplate parts of extension (file structure, boilerplate), not the judgment calls (e.g., "should this provider's quirk be normalized in the adapter or exposed to callers") a governed policy document is meant to guide. Reconsideration condition: once the documented Extension Model is mature enough that its mechanical/boilerplate portions are well-understood and worth codifying into a template.

## Consequences

**Positive:**

- A discoverable, versioned policy exists for how to add a provider/capability, rather than prose buried in an implementation report.
- Pairing the document with tooling closes the specific "documented but not enforced" gap this initiative has observed twice (ADR-0003's header, GAP-11's DI-adoption history).

**Negative / Accepted trade-offs:**

- Lowest-cost candidate in this sub-domain, but still requires ongoing authorship discipline to keep current as new boundaries and components are introduced.

**Accepted limitations:**

- **A lint rule can only enforce what it is written to check** — it cannot verify a judgment call (e.g., "was this the _right_ place to normalize this provider quirk") the way a human reviewer consulting the Extension Model document can. The two mechanisms are accepted as complementary, not substitutes; neither is expected to fully replace the other's coverage.

**Deferred considerations:**

- The artifact's concrete file location and format are left open for Technical Design or subsequent documentation practice, consistent with how this roadmap's own governance already operates via documents rather than tooling for policy-level decisions.

## Governance action item (not a new architectural decision, executed by this ADR set)

ADR-0003's header field `Implementation: None yet` — the concrete instance of GAP-14 this decision's rationale cites as evidence — is corrected as part of [ADR-0006](0006-provider-registry-capabilities-descriptor-adapter-layer.md)'s authoring pass, since ADR-0006 extends the same document's Provider Layer section. This ADR does not itself edit ADR-0003; it records why the correction belongs to ADR-0006's authoring pass rather than a separate action.

## Architectural Impact

**Affected domain:** Governance. **Affected components:** introduces a new documentation artifact (no existing runtime component is modified). **Dependency implications:** depends on [ADR-0013](0013-brain-gateway-boundary-dependency-inversion-enforcement.md)'s lint rule existing to serve as its forcing function — a cross-reference, not a conflict. **Extensibility implications:** every future domain this initiative introduces (Provider, Routing, Context, Prompt) becomes a candidate entry in this artifact as it is built, keeping "how to extend the Gateway" centrally discoverable rather than re-derived per domain.

## Traceability

```
GAP-12 (no governed Extension Model artifact) ──► Phase 3.1 Freeze §2.9 ──► ADR-0014 ──► Technical Design (Phase 4):
                                                                                          artifact location/format
GAP-14 (ADR-0003 header drift, governance)    ──► corrected via ADR-0006's authoring pass (not a new ADR)
```

## References

- [Phase 3.1 Architecture Freeze](../phase3-1-brain-gateway-architecture-freeze.md), §2.9, §3, §4, §5 (item 9), §6
- [Phase 3 Architecture Discovery](../phase3-brain-gateway-architecture-discovery.md), §11.3
- [Phase 2 Gap Analysis](../phase2-brain-gateway-gap-analysis.md), §2, §14, §16 (GAP-12, GAP-14)
- [Phase 2 Independent Review](../phase2-independent-review.md), §4 (Root Cause E)
- [ADR-0003: Brain Gateway Architecture](ADR-0003-brain-gateway-architecture.md)
- [ADR-0006: Provider Registry, Capabilities Descriptor, and Adapter Layer](0006-provider-registry-capabilities-descriptor-adapter-layer.md)
- [ADR-0013: Brain Gateway Boundary & Dependency-Inversion Enforcement](0013-brain-gateway-boundary-dependency-inversion-enforcement.md)
