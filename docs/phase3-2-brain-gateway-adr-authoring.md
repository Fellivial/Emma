# Emma Brain Gateway — Phase 3.2: ADR Authoring

## Document Status

- Roadmap: [Brain Gateway Roadmap v1.0 (Frozen)](roadmaps/brain-gateway-roadmap-v1.md)
- Phase: Phase 3.2 — ADR Authoring
- Type: **Documentation-only.** This phase authors formal Architecture Decision Records for every architectural decision approved during Phase 3.1 — Architecture Freeze. It documents already-approved decisions; it does not revisit Architecture Discovery, does not modify the frozen architecture, does not perform Technical Design, and does not modify code or runtime behavior.
- Branch: `feature/brain-gateway-phase3-2-adr-authoring`
- Baseline treated as authoritative and not re-derived: [Brain Gateway Roadmap v1.0](roadmaps/brain-gateway-roadmap-v1.md), [Phase 3.1 Architecture Freeze](phase3-1-brain-gateway-architecture-freeze.md) (the frozen baseline this phase documents), [Phase 3 Architecture Discovery](phase3-brain-gateway-architecture-discovery.md) + [Independent Review](phase3-independent-review.md), [Phase 2 Gap Analysis](phase2-brain-gateway-gap-analysis.md) + [Independent Review](phase2-independent-review.md), [ADR-0001](adr/0001-behavior-flags.md), [ADR-0002](adr/0002-companion-state-persistence.md), [ADR-0003](adr/ADR-0003-brain-gateway-architecture.md).

This single document contains the required Phase 3.2 deliverables, beyond the nine ADR documents themselves (`docs/adr/0006`–`0014`):

1. ADR Inventory Verification (§1)
2. ADR Cross-Reference Matrix (§2)
3. ADR Traceability Matrix (§3)
4. ADR Consistency Report (§4)
5. ADR Authoring Summary (§5)

---

## 1. ADR Inventory Verification

The Phase 3.1 Architecture Freeze's Architectural Decision Inventory (§5) named nine ADRs plus one governance action item and one explicit "no ADR required" entry. Every inventory line is accounted for:

| #   | Freeze Decision Inventory item                                | ADR produced                                                                    | Status                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Provider Registry, Capabilities Descriptor, and Adapter Layer | [ADR-0006](adr/0006-provider-registry-capabilities-descriptor-adapter-layer.md) | Authored                                                                                                                                                                                                                                                                                                                                                                    |
| 2   | Layered Routing Engine (task → capability → policy)           | [ADR-0007](adr/0007-layered-routing-engine.md)                                  | Authored                                                                                                                                                                                                                                                                                                                                                                    |
| 3   | Centralized Context Pipeline                                  | [ADR-0008](adr/0008-centralized-context-pipeline.md)                            | Authored                                                                                                                                                                                                                                                                                                                                                                    |
| 4   | Memory Ranking Infrastructure (database-side)                 | [ADR-0009](adr/0009-memory-ranking-infrastructure.md)                           | Authored                                                                                                                                                                                                                                                                                                                                                                    |
| 5   | Prompt Pipeline (centralized composition, phased migration)   | [ADR-0010](adr/0010-prompt-pipeline-centralized-composition.md)                 | Authored                                                                                                                                                                                                                                                                                                                                                                    |
| 6   | Brain Gateway Operational Instrumentation                     | [ADR-0011](adr/0011-brain-gateway-operational-instrumentation.md)               | Authored                                                                                                                                                                                                                                                                                                                                                                    |
| 7   | Provider-Conditional Boot Validation                          | [ADR-0012](adr/0012-provider-conditional-boot-validation.md)                    | Authored                                                                                                                                                                                                                                                                                                                                                                    |
| 8   | Brain Gateway Boundary & Dependency-Inversion Enforcement     | [ADR-0013](adr/0013-brain-gateway-boundary-dependency-inversion-enforcement.md) | Authored                                                                                                                                                                                                                                                                                                                                                                    |
| 9   | Brain Gateway Extension Model                                 | [ADR-0014](adr/0014-brain-gateway-extension-model.md)                           | Authored                                                                                                                                                                                                                                                                                                                                                                    |
| —   | Extension — Workflow (§11.4A, no ADR required)                | N/A                                                                             | Correctly not authored — §11.4A preserves existing, already-ADR-adjacent behavior (the agent loop); folded into [ADR-0013](adr/0013-brain-gateway-boundary-dependency-inversion-enforcement.md)'s Extension decision as one of its three independent selections, per the Freeze's own framing of Extension as "three independent single-candidate selections" (Freeze §1.3) |
| —   | Governance action item — ADR-0003 header correction (GAP-14)  | N/A (action item, not a new ADR)                                                | Executed — ADR-0003's `Implementation:` header field corrected as part of [ADR-0006](adr/0006-provider-registry-capabilities-descriptor-adapter-layer.md)'s authoring pass, exactly as the Freeze specified ("as part of ADR #1's authoring pass, since ADR #1 extends the same document's Provider section")                                                               |

**No frozen architectural decision remains undocumented.** Nine ADRs correspond exactly to the nine numbered items in the Freeze's Decision Inventory; the one "no ADR required" line and the one governance action item are both accounted for exactly as the Freeze specified their disposition, with no substitution or reinterpretation.

Configuration's two deferred candidates (Runtime Configuration Store, Feature-Flag Layer) do not have their own ADRs, per the Freeze's own explicit statement (§5, footnote): "an ADR is triggered only if/when they are activated... they would likely amend ADR #1 or #2 rather than stand alone." [ADR-0012](adr/0012-provider-conditional-boot-validation.md) records this deferral in its own Deferred Considerations section rather than treating it as an omission.

---

## 2. ADR Cross-Reference Matrix

| Architecture Domain | Architecture Freeze (§2 selection)                                                          | ADR                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Provider            | §2.1 — Registry + Capabilities Descriptor + Adapter Layer                                   | [ADR-0006](adr/0006-provider-registry-capabilities-descriptor-adapter-layer.md) |
| Routing             | §2.2 — Layered Routing (task → capability → policy)                                         | [ADR-0007](adr/0007-layered-routing-engine.md)                                  |
| Context             | §2.3 — Centralized Context Pipeline                                                         | [ADR-0008](adr/0008-centralized-context-pipeline.md)                            |
| Memory              | §2.4 — Database-Side Ranking Infrastructure                                                 | [ADR-0009](adr/0009-memory-ranking-infrastructure.md)                           |
| Prompt              | §2.5 — Centralized Composition via Layered path                                             | [ADR-0010](adr/0010-prompt-pipeline-centralized-composition.md)                 |
| Operational         | §2.6 — Gateway-centralized instrumentation + correlation-ID contract                        | [ADR-0011](adr/0011-brain-gateway-operational-instrumentation.md)               |
| Configuration       | §2.7 — Provider-Conditional Boot Validation (now); Runtime Store + Feature Flags (deferred) | [ADR-0012](adr/0012-provider-conditional-boot-validation.md)                    |
| Extension           | §2.8 — Static boundary enforcement + Tooling-enforced DI + Agent-loop workflow extension    | [ADR-0013](adr/0013-brain-gateway-boundary-dependency-inversion-enforcement.md) |
| Governance          | §2.9 — Documented Extension Model + DI lint rule as forcing function                        | [ADR-0014](adr/0014-brain-gateway-extension-model.md)                           |

Every one of the nine domains the Freeze named (§1.3 overview table) maps to exactly one ADR. No domain produced zero ADRs; no domain produced more than one ADR; no ADR covers more than one domain. This 1:1 mapping matches the Freeze's own Decision Inventory (§5) exactly.

---

## 3. ADR Traceability Matrix

Every validated gap, traced from the Phase 2 Gap Analysis through the Phase 3.1 Architecture Freeze decision, through the ADR that now records it, to the Technical Design question it hands off to Phase 4. This table is a direct extension of the Freeze's own Architecture Traceability Matrix (§4) — no gap, decision, or benefit statement is altered; only the ADR column is added.

| Gap                                                      | Architecture Freeze Decision                                                              | ADR                                                                                                                                                                              | Future Technical Design                              |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| GAP-01 (provider-neutrality unproven)                    | §2.1 Provider Registry + Capabilities Descriptor                                          | [ADR-0006](adr/0006-provider-registry-capabilities-descriptor-adapter-layer.md)                                                                                                  | Capabilities Descriptor schema shape                 |
| GAP-02 (no basis to route on)                            | §2.2 Layered Routing                                                                      | [ADR-0007](adr/0007-layered-routing-engine.md)                                                                                                                                   | Layer-to-layer "no match, pass through" contract     |
| GAP-03 (boot-time single-provider lock-in)               | §2.7 Provider-Conditional Boot Validation                                                 | [ADR-0012](adr/0012-provider-conditional-boot-validation.md)                                                                                                                     | Concrete boot-validation logic                       |
| GAP-04 (no cross-cutting operational attachment point)   | §2.6 Gateway-centralized instrumentation + correlation-ID contract                        | [ADR-0011](adr/0011-brain-gateway-operational-instrumentation.md)                                                                                                                | Correlation-ID propagation mechanism                 |
| GAP-05 (Context instance)                                | §2.3 Centralized Context Pipeline                                                         | [ADR-0008](adr/0008-centralized-context-pipeline.md)                                                                                                                             | Token-budget reconciliation semantics                |
| GAP-05 (Prompt instance)                                 | §2.5 Centralized Prompt Composition via Layered path                                      | [ADR-0010](adr/0010-prompt-pipeline-centralized-composition.md)                                                                                                                  | Fragment boundary design, channel-adapter interfaces |
| GAP-06 (four disconnected error shapes)                  | §2.1 Provider Adapter Layer                                                               | [ADR-0006](adr/0006-provider-registry-capabilities-descriptor-adapter-layer.md)                                                                                                  | Adapter Layer interface shape                        |
| GAP-07 (per-site retry policy; provider vocabulary leak) | §2.1 Provider Adapter Layer; §2.2 Layered Routing (informs future retry-policy placement) | [ADR-0006](adr/0006-provider-registry-capabilities-descriptor-adapter-layer.md), [ADR-0007](adr/0007-layered-routing-engine.md)                                                  | Adapter Layer interface shape                        |
| GAP-08 (retrieval/ranking coupled to capacity cap)       | §2.4 Database-Side Ranking Infrastructure                                                 | [ADR-0009](adr/0009-memory-ranking-infrastructure.md)                                                                                                                            | Schema migration sizing/sequencing (Phase 4/5)       |
| GAP-09 (two uncoordinated context pipelines)             | §2.3 Centralized Context Pipeline                                                         | [ADR-0008](adr/0008-centralized-context-pipeline.md)                                                                                                                             | Token-budget reconciliation semantics                |
| GAP-10 (boundaries hold by convention only)              | §2.8 Static boundary enforcement                                                          | [ADR-0013](adr/0013-brain-gateway-boundary-dependency-inversion-enforcement.md)                                                                                                  | Concrete lint rule set                               |
| GAP-11 (DI applied in only 2 places)                     | §2.8 Tooling-enforced DI; §2.9 Extension Model documentation                              | [ADR-0013](adr/0013-brain-gateway-boundary-dependency-inversion-enforcement.md), [ADR-0014](adr/0014-brain-gateway-extension-model.md)                                           | Concrete lint rule set                               |
| GAP-12 (no governed Extension Model artifact)            | §2.9 Documented Extension Model                                                           | [ADR-0014](adr/0014-brain-gateway-extension-model.md)                                                                                                                            | Artifact location/format                             |
| GAP-13 (no feature-flag/runtime-override mechanism)      | §2.7 Runtime Configuration Store + Feature-Flag Layer, accepted-in-principle, deferred    | [ADR-0012](adr/0012-provider-conditional-boot-validation.md) (records the deferral)                                                                                              | Not yet — activation-contingent                      |
| GAP-14 (ADR-0003 header drift)                           | §2.9 No architectural decision; recorded as governance action item                        | Executed via [ADR-0006](adr/0006-provider-registry-capabilities-descriptor-adapter-layer.md)'s authoring pass; recorded in [ADR-0014](adr/0014-brain-gateway-extension-model.md) | N/A — governance, not runtime architecture           |
| GAP-15 (undetermined workflow concept)                   | §2.8 Agent-loop extension, no new abstraction                                             | [ADR-0013](adr/0013-brain-gateway-boundary-dependency-inversion-enforcement.md)                                                                                                  | N/A — no new architectural commitment made           |

**Traceability verdict:** every one of Phase 2's fifteen gaps (GAP-01 through GAP-15) traces through exactly one Freeze decision to at least one ADR (or, for GAP-14, to the specific action item that closes it). No gap is orphaned; no ADR exists without a named gap driving it. This matches the Freeze's own traceability verdict (§4) with the ADR layer added, not altered.

---

## 4. ADR Consistency Report

### Terminology consistency

Every ADR uses the same domain names, gap identifiers (GAP-01 through GAP-15), and candidate labels (§4A–D, §5A–D, §6A–C, §7A–C, §8A–C, §9A–C, §10A–C, §11.1–11.4 A/B/C) as the Freeze and Phase 3 documents — no ADR introduces a synonym or renames a gap, candidate, or domain. "Decision Drivers" in each ADR are drawn verbatim in substance from the Freeze's named Decision Principles (preserve validated strengths, resolve validated gaps, remain provider-agnostic, minimize coupling, improve long-term maintainability, support future extensibility, remain internally consistent, be evidence-justified) — no ADR invents a new principle.

### Reference consistency

Every ADR's References section cites the Phase 3.1 Freeze section it was drawn from, the relevant Phase 3 Discovery section(s), and Phase 2 Gap Analysis section(s) — the same three-document citation pattern used consistently across all nine ADRs. Cross-ADR references (e.g., [ADR-0007](adr/0007-layered-routing-engine.md) citing [ADR-0006](adr/0006-provider-registry-capabilities-descriptor-adapter-layer.md) as a sequencing dependency; [ADR-0013](adr/0013-brain-gateway-boundary-dependency-inversion-enforcement.md) and [ADR-0014](adr/0014-brain-gateway-extension-model.md) cross-referencing each other's DI-lint-rule/Extension-Model-document pairing) are bidirectional and consistent — each side names the same relationship.

### Dependency consistency

The sequencing dependencies recorded across the nine ADRs match the Freeze's own Architecture Consistency check (§1.4) exactly:

- [ADR-0007](adr/0007-layered-routing-engine.md) (Routing, Layer 2) depends on [ADR-0006](adr/0006-provider-registry-capabilities-descriptor-adapter-layer.md) (Provider Registry/Descriptor) — stated identically in both ADRs.
- [ADR-0012](adr/0012-provider-conditional-boot-validation.md) (Configuration) depends on [ADR-0006](adr/0006-provider-registry-capabilities-descriptor-adapter-layer.md) (Provider Registry) — stated identically in both ADRs.
- [ADR-0011](adr/0011-brain-gateway-operational-instrumentation.md) (Operational) does not repeat [ADR-0008](adr/0008-centralized-context-pipeline.md)'s rejected Context-Candidate-C coupling violation — the same distinction the Freeze drew (§1.4) is reproduced in ADR-0011's Architectural Impact section.
- [ADR-0010](adr/0010-prompt-pipeline-centralized-composition.md) (Prompt) and [ADR-0013](adr/0013-brain-gateway-boundary-dependency-inversion-enforcement.md) (Extension, DI) are recorded as mutually reinforcing in both directions — the same positive interaction the Freeze noted (§1.4) is reproduced in both ADRs' Architectural Impact sections.
- [ADR-0013](adr/0013-brain-gateway-boundary-dependency-inversion-enforcement.md) (Extension, DI lint rule) and [ADR-0014](adr/0014-brain-gateway-extension-model.md) (Governance, Extension Model document) cross-reference each other's role as forcing-function pairing, stated identically in both.

No dependency appears in one ADR without its counterpart appearing in the referenced ADR — every cross-reference found in this review is bidirectional.

### Architectural consistency

No two ADRs make contradictory decisions. The one surface-level tension the Freeze itself identified and resolved — Operational's Gateway-centralized instrumentation versus Context Candidate C's rejected Gateway coupling — is preserved as a resolved, not reopened, tension in [ADR-0011](adr/0011-brain-gateway-operational-instrumentation.md)'s Architectural Impact section, with the same resolution the Freeze reached (telemetry about a request the Gateway already owns is categorically different from a business decision the Gateway was never meant to make).

**No terminology inconsistency, reference gap, dependency contradiction, or architectural conflict was found across the nine ADRs.**

---

## 5. ADR Authoring Summary

**ADRs created:** nine (ADR-0006 through ADR-0014), plus one governance-metadata correction to ADR-0003's header (not a new ADR).

**Domains covered:** all nine domains named in the Phase 3.1 Freeze's scope — Provider, Routing, Context, Memory, Prompt, Operational, Configuration, Extension, Governance. Every domain produced exactly one ADR (§2 above).

**Architectural decisions documented:** every decision in the Freeze's Selected Architecture Catalog (§2.1–§2.9), verbatim in substance — no ADR modifies, refines, or redesigns a frozen decision. Every ADR's Alternatives Considered section reproduces the Freeze's Rejected Alternatives Report (§3) entries relevant to its domain, including every reconsideration condition the Freeze recorded. Every ADR's Consequences section reproduces the Freeze's Risk Acceptance Register (§6) classifications (Resolved / Accepted / Deferred) relevant to its domain.

**Relationship to Architecture Freeze:** this ADR set is a direct, decision-preserving transcription of the Freeze into permanent architectural records — every ADR's Status is "Accepted" (not "Proposed" or "Draft"), consistent with the Freeze itself having already been approved. No ADR introduces a new architectural decision; where this authoring pass identified content appropriately belonging to Technical Design rather than to the Freeze itself (the three clarifications the Freeze's own §7 already named: Capabilities Descriptor schema shape, Context Pipeline reconciliation semantics, correlation-ID propagation contract), each is recorded in the relevant ADR's Deferred Considerations, not resolved.

**ADR inventory completed:** 9 of 9 Decision Inventory items produced an ADR; the 1 "no ADR required" item and the 1 governance action item are both accounted for exactly as the Freeze specified (§1 above).

**Documentation completeness:** every ADR follows the same ten-section structure (Title/header metadata, Context, Decision, Decision Drivers, Alternatives Considered, Consequences, Architectural Impact, Traceability, References, plus a Governance action item section where applicable) and includes Positive/Negative/Accepted-limitations/Deferred-considerations subdivisions within Consequences, consistent across all nine documents.

**Outstanding items:** none block Phase 3.3. The three Technical-Design-deferred clarifications the Freeze itself named (§7) remain correctly deferred, not treated as gaps in this ADR set. The two Configuration candidates accepted-in-principle but not yet activated (Runtime Configuration Store, Feature-Flag Layer) remain correctly un-ADR'd, per the Freeze's own explicit instruction, with the deferral recorded in [ADR-0012](adr/0012-provider-conditional-boot-validation.md).

**Readiness for independent review:** this ADR set is ready for Phase 3.3 — ADR Independent Review. Every frozen decision has a corresponding ADR (§1); every ADR is cross-referenced consistently with its siblings and with the Freeze (§2–§4); no new architectural decision, redesign, or implementation detail was introduced.

---

## Explicit Non-Goals Confirmation

Per the Phase 3.2 spec, this phase does not perform Architecture Discovery, does not modify the frozen Phase 3.1 architecture, does not introduce new candidate architectures, does not change any architectural decision, does not perform Technical Design, does not create implementation plans, does not estimate implementation effort, and does not modify code or runtime behavior. Every ADR's Status is "Accepted" per the Freeze's own instruction that this reflects an already-approved decision, not a newly-proposed one. The single edit made to a file other than the nine new ADRs and this document — ADR-0003's header metadata correction — is the governance action item the Freeze itself (§2.9) explicitly assigned to this phase's authoring pass; it changes no architectural content, only a stale implementation-status field.

## Success Criteria Checklist

- [x] Every frozen architectural decision has an ADR (§1)
- [x] Every ADR reflects the approved Architecture Freeze exactly — no modification, no refinement, no redesign (§1, §5)
- [x] Every ADR documents rationale and consequences (Decision Drivers, Consequences sections in all nine ADRs)
- [x] Every ADR references validated gaps (Traceability sections in all nine ADRs; §3 above)
- [x] Rejected alternatives are documented, including preserved advantages and reconsideration conditions (Alternatives Considered sections in all nine ADRs)
- [x] ADR numbering is consistent — sequential 0006–0014, continuing from the existing 0001/0002/ADR-0003/0004/0005 sequence with no gaps or collisions
- [x] Cross-ADR consistency has been verified (§4)
- [x] Traceability from Gap → Freeze → ADR → Technical Design has been established (§3)
