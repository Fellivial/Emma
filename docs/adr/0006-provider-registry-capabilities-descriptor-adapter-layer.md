# ADR 0006: Provider Registry, Capabilities Descriptor, and Adapter Layer

- **Status:** Accepted
- **Date:** 2026-07-23
- **Phase:** 3.2 — "ADR Authoring" (documents a decision frozen in Phase 3.1, not a new one)
- **Domain:** Provider
- **Extends:** [ADR-0003](ADR-0003-brain-gateway-architecture.md) (Provider Layer section — previously silent on the provider-selection mechanism)
- **Implementation:** None yet. This ADR is a permanent architectural record of an already-approved decision; it does not itself change any code. Technical Design (Roadmap Phase 4) specifies the `CapabilitiesDescriptor` schema, the Registry's concrete interface, and the Adapter Layer's interface shape.
- **Frozen by:** [Phase 3.1 — Architecture Freeze](../phase3-1-brain-gateway-architecture-freeze.md), §2.1, §3, §4 (GAP-01, GAP-06, GAP-07), §5 (Decision Inventory item 1)

---

## Context

ADR-0003 established the Brain Gateway as Emma's single, provider-independent inference boundary and named a four-method `BrainProvider` interface (`isConfigured`, `chat`, `chatStream`, `embed`, `readonly name`) as the substitutability seam every provider implementation satisfies. ADR-0003's own "Future Providers" section anticipated that Ollama, vLLM, LM Studio, and a future Emma-owned model would eventually join OpenRouter behind that boundary, but it deliberately left the provider-_selection_ mechanism unspecified — "this ADR does not define how a provider is selected when more than one is available... that is explicitly future work."

Phase 0/1 established, and Phase 2's Gap Analysis (GAP-01) confirmed as the single most consequential finding in that document, that `BrainProvider` has exactly one implementation and has never been exercised by a second provider, mock, or test double — its provider-neutrality is a design intent verified by inspection, not a proven property. Phase 2 additionally found: `gateway.ts` holds exactly one module-level provider instance, chosen once at import time, not per-request, with no mechanism to hold more than one provider instance at all (§6 of the Gap Analysis); four disconnected error-representation shapes exist across the codebase, one of which (`errors.ts`'s shared retry-eligibility list) hardcodes a provider-specific HTTP status (`529`) at a layer meant to be provider-agnostic (GAP-06, GAP-07); and per-site retry policy is set independently at each of sixteen invocation sites with no shared per-task-tier default (GAP-07).

Phase 3's Architecture Discovery catalogued four candidate architectures for the Provider domain (Direct Provider Mapping; Provider Registry; Provider Capabilities Descriptor; Provider Adapter Layer), each evaluated for strengths, weaknesses, complexity, and gap coverage without a recommendation. Phase 3's own text disclosed that the Capabilities Descriptor candidate "composes naturally with [the Registry]... rather than competing with it," and that the Adapter Layer addresses an orthogonal question ("how a provider's wire format is normalized") distinct from provider selection — both relationships the Phase 3 Independent Review confirmed as transparently disclosed compositions, not hidden duplication (Independent Review §4).

**Existing strengths this decision preserves, per Phase 3's Current Architecture Preservation Report (§2) and the Freeze's own consistency check (§1.4):** the `BrainProvider` four-method interface itself is untouched — the Registry, Descriptor, and Adapter Layer all sit around it, not through it; the Application ↔ Brain Gateway ↔ Provider three-tier boundary (ADR-0003) is preserved as fixed context, not reopened; dependency direction remains strictly downward with no new upward-flowing knowledge.

## Decision

**The Brain Gateway's Provider domain adopts three composable mechanisms, selected together as a single architectural direction:**

1. **A Provider Registry** — a per-request-queryable structure holding all configured provider instances, replacing the Gateway's single module-level provider reference with a lookup (by name or by capability). The Registry is the queryable "which provider(s) are configured" surface that Configuration's boot validation ([ADR-0012](0012-provider-conditional-boot-validation.md)) and Routing's capability layer ([ADR-0007](0007-layered-routing-engine.md)) both depend on.
2. **A Capabilities Descriptor** attached to each Registry entry — a declared, queryable set of provider capabilities (e.g., supports-streaming, supports-vision, supports-tool-calling, context-window-size, supports-embeddings) that makes provider differences explicit rather than assumed away, replacing the current implicit assumption that every provider looks like OpenRouter.
3. **A distinct Provider Adapter Layer** — an explicit sub-layer between `gateway.ts` and each provider implementation, giving every provider one place to translate its own wire-specific error vocabulary into the Gateway's normalized error taxonomy, and one place to normalize request/response shape, rather than each provider file re-implementing normalization inline.

These three mechanisms are selected as a documented synthesis, exactly as Phase 3 disclosed their relationship: the Registry answers "how is a provider selected," the Descriptor answers "what can a selected provider do," and the Adapter Layer answers "how is a provider's wire format normalized" — three distinct questions, not three competing answers to one question.

**Governance correction (GAP-14):** as part of this ADR's authoring pass, ADR-0003's header field `Implementation: None yet` is corrected to reflect Phase 7B's completed, shipped state. This is a documentation-accuracy correction to an existing ADR's metadata, made because this ADR extends that same document's Provider Layer section — it is not a reopening of ADR-0003's architectural content.

## Decision Drivers

- **Resolve one or more validated gaps.** GAP-01 (unverified provider-neutrality), GAP-03 (boot-time single-provider lock-in — addressed jointly with [ADR-0012](0012-provider-conditional-boot-validation.md)), and GAP-06/GAP-07 (fragmented error representation, provider-specific vocabulary in shared code) are four distinct problems the status-quo-extended candidate (Direct Provider Mapping) cannot resolve simultaneously — it leaves provider selection static and does nothing for error/retry normalization. The selected synthesis addresses all four: the Registry supplies the queryable selection surface GAP-03 needs; the Descriptor makes provider differences explicit, directly targeting GAP-01's core problem (a contract "proven" only by inspection); the Adapter Layer gives every future provider one place to translate its own error vocabulary into the Gateway's normalized taxonomy, closing GAP-06 and removing the hardcoded `529` from `errors.ts`'s shared, provider-agnostic-by-design retry list (GAP-07).
- **Support future extensibility.** ADR-0003's own "Future Providers" section anticipates a registry-shaped mechanism without naming one; this decision names it.
- **Preserve validated strengths.** The `BrainProvider` interface itself is untouched by any of the three mechanisms.

## Alternatives Considered

**Direct Provider Mapping (status quo, extended).** One `BrainProvider` implementation per backend, selected once at module-load time as today, extended by widening `gateway.ts`'s single selection point to a static `if`/`switch`. Rejected as the frozen direction because selection remains static (chosen once at boot, not per-request) and does not address GAP-03 or GAP-06/GAP-07 at all — only GAP-01 partially, by virtue of a second implementation finally existing. Every additional provider adds another branch to the same `if`/`switch`, which does not scale gracefully past two or three providers. Advantage preserved in the record: zero new abstractions, fastest to ship a single second provider. Reconsideration condition: only viable indefinitely if no routing or runtime-configuration need ever materializes — judged unlikely given the roadmap's own stated destination.

No standalone alternative was considered for the Capabilities Descriptor or Adapter Layer individually being rejected — Phase 3 itself disclosed both as compositions with the Registry rather than competing designs, and the Freeze adopted that composition directly (Freeze §2.1, citing Phase 3 Independent Review §4's confirmation that this is a transparently disclosed relationship, not hidden duplication).

## Consequences

**Positive:**

- A second provider implementation has an explicit, queryable slot (the Registry) and an explicit contract to satisfy (the Descriptor), rather than an interface exercised by inspection alone.
- Every future provider has one place (the Adapter Layer) to translate its own wire-specific error vocabulary into the Gateway's normalized taxonomy, collapsing four disconnected error shapes toward one.
- The hardcoded `529` status and similar provider-specific vocabulary move into the Adapter Layer, out of the shared, supposedly provider-agnostic retry list.
- Configuration's boot validation ([ADR-0012](0012-provider-conditional-boot-validation.md)) and Routing's capability layer ([ADR-0007](0007-layered-routing-engine.md)) both gain the queryable precondition they depend on.

**Negative / Accepted trade-offs:**

- Medium complexity for the Registry; Medium-High for the Descriptor, carrying real schema-design risk (too coarse a capability model, e.g. a boolean per capability, versus too fine a negotiation protocol). Accepted because the alternative (Direct Provider Mapping) does not close GAP-03 or GAP-06/GAP-07 at all.
- The Descriptor schema, with one provider, has every field definitionally true and untested against a provider that would return false for any of them.

**Accepted limitations:**

- **The "n=1" evidentiary risk is not resolved by this decision and cannot be.** None of the Registry, Descriptor, or Adapter Layer can be proven correct until a second provider actually exists to validate against — this is a property of the current single-provider system, explicitly accepted (Freeze §6), not a defect in this decision.

**Deferred considerations:**

- The Capabilities Descriptor's exact schema shape (field granularity) is explicitly left to Technical Design (Freeze §7, Technical Design Readiness clarification 1) — this ADR selects that a descriptor exists and what it composes with, not its concrete fields.

## Architectural Impact

**Affected domain:** Provider. **Affected components:** `src/core/brain/gateway.ts` (provider selection becomes a Registry query rather than a static module-level reference), `src/core/brain/types.ts` (a new `CapabilitiesDescriptor` type composes with, but does not replace, `BrainProvider`), `src/core/brain/providers/*` (each provider implementation gains an Adapter sub-layer responsibility). **Dependency implications:** Configuration ([ADR-0012](0012-provider-conditional-boot-validation.md)) and Routing ([ADR-0007](0007-layered-routing-engine.md)) both depend on this ADR's Registry existing first — a sequencing relationship, not a conflict (Freeze §1.4). **Extensibility implications:** new providers become additive work behind the Registry/Adapter boundary; the Application Layer is unaffected by a provider addition, preserving ADR-0003 Principle 5 (Extensibility).

## Traceability

```
GAP-01 (provider-neutrality unproven) ─┐
GAP-03 (boot-time lock-in)             ├──► Phase 3.1 Freeze §2.1 ──► ADR-0006 ──► Technical Design (Phase 4):
GAP-06 (four error shapes)             │                                           Capabilities Descriptor schema
GAP-07 (provider vocabulary leak)      ─┘                                          Registry interface signature
                                                                                    Adapter Layer interface shape
```

## References

- [Phase 3.1 Architecture Freeze](../phase3-1-brain-gateway-architecture-freeze.md), §2.1, §3, §4, §5 (item 1), §6
- [Phase 3 Architecture Discovery](../phase3-brain-gateway-architecture-discovery.md), §4
- [Phase 3 Independent Review](../phase3-independent-review.md), §4
- [Phase 2 Gap Analysis](../phase2-brain-gateway-gap-analysis.md), §6, §16 (GAP-01, GAP-06, GAP-07)
- [ADR-0003: Brain Gateway Architecture](ADR-0003-brain-gateway-architecture.md)
- [ADR-0012: Provider-Conditional Boot Validation](0012-provider-conditional-boot-validation.md)
- [ADR-0007: Layered Routing Engine](0007-layered-routing-engine.md)
