# ADR 0007: Layered Routing Engine (task → capability → policy)

- **Status:** Accepted
- **Date:** 2026-07-23
- **Phase:** 3.2 — "ADR Authoring" (documents a decision frozen in Phase 3.1, not a new one)
- **Domain:** Routing
- **Implementation:** None yet. Introduces the roadmap's first Routing Engine/Capability Registry — a wholly new architectural component with no prior ADR coverage. Technical Design (Roadmap Phase 4) specifies the layer-to-layer "no match, pass through" contract.
- **Frozen by:** [Phase 3.1 — Architecture Freeze](../phase3-1-brain-gateway-architecture-freeze.md), §2.2, §3, §4 (GAP-02), §5 (Decision Inventory item 2)

---

## Context

No routing exists in the Brain Gateway today. `TASK_MODELS` is a static, compile-time map from the closed three-value `BrainTask` union (`"brain" | "vision" | "utility"`) to a fallback array; there is no runtime selection, scoring, or capability matching (Phase 1 §1.4.5, Phase 2 §7). This is a gap of total absence, not partial implementation — Phase 2's Gap Analysis (GAP-02) confirmed by independent repository-wide search that zero routing-shaped code exists anywhere in `src/`. ADR-0003 itself explicitly named "Capability Registry (task → capability → provider matching)" and "cost-aware or latency-aware routing across multiple concurrently-available providers" as Out of Scope for the Brain Gateway phase, deferring both to future work.

Phase 1 and Phase 2 independently identified `BrainTask` as "exactly the right abstraction level" for future routing to extend, despite no routing existing yet — a validated precondition Phase 3's Current Architecture Preservation Report (§2) treats as a preservation constraint on every candidate explored. Phase 3's Architecture Discovery catalogued four candidates (Task Routing as-is; Capability Routing; Policy Routing; Layered Routing), the last of which Phase 3 itself presented not as a fourth independent alternative but as a composition of the first three — a relationship the Phase 3 Independent Review's Candidate Independence Assessment confirmed is transparently disclosed, not hidden duplication (Independent Review §4).

The Phase 2 Independent Review's Gap Dependency Map (§2.1) established GAP-01 → GAP-02 as a genuine prerequisite relationship: a Routing Engine selects _between_ provider implementations, so the contract it routes across (GAP-01, addressed by [ADR-0006](0006-provider-registry-capabilities-descriptor-adapter-layer.md)) must be shown to actually abstract more than one backend before capability routing can be soundly designed.

## Decision

**Routing is adopted as a layered composition — task routing, capability routing, policy routing — each layer activated only once its precondition is met, rather than as a single mechanism chosen among the three.**

- **Layer 1 — Task routing.** Already exists (`BrainTask` narrows to a tier), requires no change, and serves as this decision's first layer immediately.
- **Layer 2 — Capability routing.** Frozen as the target but not yet activatable: it narrows further, within a task tier, to providers that satisfy hard capability requirements. It depends on [ADR-0006](0006-provider-registry-capabilities-descriptor-adapter-layer.md)'s Provider Registry and Capabilities Descriptor existing first — the same "GAP-01 → GAP-02" sequencing the Phase 2 Independent Review already identified.
- **Layer 3 — Policy routing.** Frozen as the eventual target but not authorized for design work until a second provider exists to make cost/latency policy meaningful, consistent with ADR-0003's own explicit "Out of Scope" classification for cost-/latency-aware routing. This ADR does not reopen or override that ADR-0003 scope decision.

Each layer is independently addable — a partial router (task-only, or task + capability with no policy layer yet) is an accepted intermediate state, provided it clearly signals which layers are live to callers, so that no caller assumes a routing guarantee (e.g., cost-awareness) that does not yet exist.

## Decision Drivers

- **Remain internally consistent.** A Chain-of-Responsibility layering lets each layer be added without touching the ones below it, matching the Gateway's own "pure addition" migration precedent already established by ADR-0003.
- **Support future extensibility** without forcing every layer to be designed at once.
- **Evidence-justified.** This is the only Routing candidate the Phase 3 Independent Review found to have zero standalone independence problem, precisely because it does not compete with the domain's other candidates — it subsumes them (Independent Review §4).
- **Resolve validated gaps at the grain each is actually ready to be designed.** Freezing only Task Routing would leave GAP-02's capability/policy/fallback/hybrid sub-types permanently unaddressed, contradicting "resolve validated gaps."

## Alternatives Considered

**Task Routing alone (extend `BrainTask` as-is, no further layers).** Zero new components; lowest possible migration risk. Rejected as the sole destination because it does not address capability, policy, or fallback routing at all — task tiers are a coarse, closed, compile-time-fixed set that cannot express "route to whichever provider currently supports tool-calling" without a breaking change to the union itself. Retained as this decision's first, already-active layer, not rejected outright.

**Capability Routing alone (registry-backed, no policy layer).** Directly closes the "capability routing has no precedent" gap and composes with the Provider Registry. Not selected as a standalone destination because, per the Layered composition, it is subsumed as Layer 2 rather than competing with Layer 1 or Layer 3.

**Policy Routing (cost/latency/compliance-driven).** Explicitly named "Out of Scope" by ADR-0003 itself and rated "Critical relative to the roadmap's stated destination; out of scope by design for the current phase" by Phase 2. This is the furthest candidate from anything the current single-provider system has evidence to design against — a policy engine without at least two providers with materially different cost/latency profiles has nothing real to optimize between. Rejected as a near-term standalone design target; retained as Layer 3, frozen-pending-ADR-0003-scope-revisit, not designed here.

## Consequences

**Positive:**

- Routing decisions can be added incrementally, at the grain each layer is actually ready to be designed, without re-architecting layers already active.
- Task routing needs no change to serve as the first layer — zero migration cost for the portion already in production.

**Negative / Accepted trade-offs:**

- Medium complexity, rising with each layer added.
- **The Layer-2/Layer-3 activation-ordering risk:** a partially-implemented layered router must clearly signal which layers are live, or callers may assume routing guarantees that do not yet exist. This is accepted and explicitly flagged for Technical Design, not resolved here.

**Accepted limitations:**

- Layer 2 (capability routing) inherits [ADR-0006](0006-provider-registry-capabilities-descriptor-adapter-layer.md)'s "n=1" evidentiary risk: it cannot itself be validated as _routing_ until a second provider exists — only as "not yet breaking anything."

**Deferred considerations:**

- **Layer 3 (Policy Routing)** is deferred until a second provider exists and ADR-0003's own "Out of Scope" classification for cost/latency routing is formally revisited in a future ADR — not proposed here.
- The layer-to-layer "no match, pass through" interface contract is deferred to Technical Design.

## Architectural Impact

**Affected domain:** Routing. **Affected components:** introduces a new Routing Engine component (no prior file); `BrainTask`-consuming call sites are unaffected by Layer 1 (already active). **Dependency implications:** Layer 2 depends on [ADR-0006](0006-provider-registry-capabilities-descriptor-adapter-layer.md)'s Registry/Descriptor; Layer 3 depends on a future ADR revisiting ADR-0003's Out-of-Scope classification. **Extensibility implications:** this is architecturally the Chain of Responsibility pattern applied to provider selection — each layer's contract should remain independent so a change to policy routing does not require touching capability routing.

## Traceability

```
GAP-02 (no routing/registry exists) ──► Phase 3.1 Freeze §2.2 ──► ADR-0007 ──► Technical Design (Phase 4):
                                                                                layer-to-layer interface contract
                                                                                Layer-2 activation precondition check
```

## References

- [Phase 3.1 Architecture Freeze](../phase3-1-brain-gateway-architecture-freeze.md), §2.2, §3, §4, §5 (item 2)
- [Phase 3 Architecture Discovery](../phase3-brain-gateway-architecture-discovery.md), §5
- [Phase 3 Independent Review](../phase3-independent-review.md), §4
- [Phase 2 Gap Analysis](../phase2-brain-gateway-gap-analysis.md), §7, §16 (GAP-02)
- [Phase 2 Independent Review](../phase2-independent-review.md), §2.1 (GAP-01 → GAP-02 prerequisite)
- [ADR-0003: Brain Gateway Architecture](ADR-0003-brain-gateway-architecture.md) (Out of Scope: policy routing)
- [ADR-0006: Provider Registry, Capabilities Descriptor, and Adapter Layer](0006-provider-registry-capabilities-descriptor-adapter-layer.md)
