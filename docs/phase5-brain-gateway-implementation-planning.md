# Emma Brain Gateway — Phase 5: Implementation Planning

## Document Status

- Roadmap: [Brain Gateway Roadmap v1.1](roadmaps/brain-gateway-roadmap-v1.md) (extends v1.0 Frozen)
- Phase: Phase 5 — Implementation Planning
- Type: **Planning-only.** This document transforms the approved Phase 4 Technical Design (validated by Phase 4.1's Independent Technical Review) into an executable implementation-execution plan: work decomposition, sequencing, dependency planning, testing planning, rollback planning, milestone planning, and implementation governance. It does **not** write production code, does **not** perform migrations, does **not** change any database, does **not** introduce or modify any interface, does **not** modify any ADR, and does **not** redesign any architecture or Technical Design decision. Every planned activity below traces to the Architecture Freeze (Phase 3.1), an Accepted ADR (0006–0014), or the Phase 4 Technical Design — no additional work is introduced.
- Branch: `feature/brain-gateway-phase5-implementation-planning`
- Baseline treated as approved and not re-derived: [Brain Gateway Roadmap v1.1](roadmaps/brain-gateway-roadmap-v1.md) (Phase 0 – Phase 4.1 frozen, Phase 5–8.1 scope-expansion §Revision Note), [Phase 0 Required Input Review](phase0-brain-gateway-required-input-review.md) + [Independent Review](phase0-independent-review.md), [Phase 1 Architecture Review](phase1-brain-gateway-architecture-review.md) + [Independent Review](phase1-independent-review.md), [Phase 2 Gap Analysis](phase2-brain-gateway-gap-analysis.md) (§16 Strategic Gap Register, GAP-01–GAP-15) + [Independent Review](phase2-independent-review.md), [Phase 3 Architecture Discovery](phase3-brain-gateway-architecture-discovery.md) + [Independent Review](phase3-independent-review.md), [Phase 3.1 Architecture Freeze](phase3-1-brain-gateway-architecture-freeze.md), [Phase 3.2 ADR Authoring](phase3-2-brain-gateway-adr-authoring.md), [Phase 3.3 ADR Independent Review](phase3-3-adr-independent-review.md), [ADR-0003](adr/ADR-0003-brain-gateway-architecture.md), [ADR-0006](adr/0006-provider-registry-capabilities-descriptor-adapter-layer.md)–[ADR-0014](adr/0014-brain-gateway-extension-model.md), [Phase 4 Technical Design](phase4-brain-gateway-technical-design.md) (PR #156, merged) and its [Independent Technical Review](phase4-1-brain-gateway-independent-technical-review.md) (PR #157, merged, "Approved with Minor Revisions... Ready for Implementation Planning").
- Repository state confirmed directly before planning began: `git log origin/main` shows PR #145–#158 merged (Phase 0 through the Roadmap v1.1 extension); no Phase 6–8.1 implementation work exists anywhere in the repository; only architecture, ADR, and technical-design documentation has been produced under this initiative to date (Roadmap "Current Status" table).

This single document contains the required Phase 5 deliverables as numbered sections, consistent with the single-document precedent set by Phase 3.1 onward:

1. Executive Summary
2. Scope Verification
3. Implementation Wave Overview
4. Implementation Dependency Graph
5. Wave Planning
6. Definition of Done
7. Dependency Validation
8. Risk Assessment
9. Rollback Strategy
10. Testing Strategy
11. Implementation Governance
12. Traceability Matrix
13. Milestone Checklist
14. Planning Validation
15. Phase 5 Conclusion
16. Explicit Non-Goals Confirmation
17. Success Criteria Checklist

### Reconciliation note — Roadmap deliverable list vs. this document's section list

The Roadmap's own "Current Status" table names Phase 5's deliverable as a single "Implementation Plan (WBS, dependency graph, PR/branch strategy, migration/rollback/test-gate strategy, risk register, sprint breakdown, completion report)" — a shorter list than the seventeen sections above. This is the same reconciliation every phase document in this initiative has performed for its own deliverable-list/document-structure mismatch (see e.g. [Phase 3.1](phase3-1-brain-gateway-architecture-freeze.md) Document Status). The mapping: WBS → §3/§5 (per-wave task decomposition); Dependency graph → §4; Module Implementation Order → §4 (execution order) and §5 (per-wave scope); PR Strategy / Branch Strategy → §11 and each wave's own PR/branch line in §5; Migration Plan → §5 (6E's backfill plan) and §9; Rollback Strategy → §9; Test Gate Strategy → §10 and §11; Risk Register → §8; Sprint Breakdown → reframed as the wave-level task breakdown in §3/§5 (see note below); Phase 5 Completion Report → §15.

**"Sprint Breakdown" reframing.** This initiative does not run calendar-boxed sprints, and this phase's own Explicit Non-Goals (§16) forbid estimating implementation duration without evidence — no historical velocity data exists for this codebase's Brain Gateway work to estimate from. "Sprint Breakdown" is therefore satisfied as a **wave-level task breakdown** (§5, each wave decomposed into discrete, independently-completable tasks in dependency order) rather than a time-boxed schedule. This is a naming reconciliation, not an omission: every element a sprint breakdown would need to schedule (task list, order, completion criteria) is present in §5 and §6; only calendar duration is absent, and its absence is intentional per this phase's own constraints.

---

## 1. Executive Summary

### 1.1 Implementation objectives

Transform the nine Accepted ADRs (0006–0014) and their Phase 4 Technical Design specifications into a concrete, low-risk, independently reviewable execution plan that the implementation team can begin acting on immediately, without making any further architectural decision. Every Technical Design section (§3–§12 of `phase4-brain-gateway-technical-design.md`) is assigned to exactly one of the Roadmap's six implementation waves (6A–6F, already named and scoped in the Roadmap v1.1 extension); every wave is decomposed into discrete tasks, ordered by dependency; every wave has a Definition of Done, a rollback strategy, and a testing plan.

### 1.2 Implementation philosophy

Additive-first, independently revertible, sequentially gated. Every Technical Design interface change is additive (new optional field, new union member, new module) — no existing signature is narrowed, retyped, or removed (Technical Design §13, independently confirmed by Phase 4.1 §1.4 claim 17). This property is what makes every wave below revertible by a single PR revert, with no cross-wave data cleanup required. Consistent with the Roadmap's own Governance Rules and this phase's own Implementation Governance requirement (§11), waves execute **sequentially** — 6A through 6F, in that order — even where a wave has no hard technical dependency on its predecessor, because the Roadmap's governance model gates each wave's start on the previous wave's completed review, passed tests, and merge to `main`.

### 1.3 Planning assumptions

- The repository state Phase 4/4.1 reviewed (§1 of the Technical Design; independently re-verified by Phase 4.1) is unchanged as of this phase's planning (confirmed: `git log origin/main` shows no commits since PR #157/#158 touch `src/core/brain/`, `src/core/context-manager.ts`, `src/core/memory-db.ts`, `src/core/personas.ts`, `src/core/env-validation.ts`, `eslint.config.mjs`, or `supabase/schema.sql`).
- No second LLM provider exists yet ("n=1" — every ADR's own accepted, unresolved risk). Every wave below is planned to be implementable and independently testable under this constraint, using the provider-conformance suite's test-only fake provider (§5, Wave 6B) rather than a real second backend, exactly as Technical Design §19.3 specifies.
- No calendar-time duration is estimated for any wave or task, per this phase's own Explicit Non-Goals (§16) and per the roadmap's own instruction not to estimate effort without evidence.

### 1.4 Implementation constraints

- No production code is written by this phase (§16). No ADR, Architecture Freeze content, or Technical Design decision is modified, narrowed, or reinterpreted by this phase.
- Architecture Freeze Rule 7 ("No implementation PRs may be created before Architecture Freeze approval") is already satisfied — Architecture Freeze (Phase 3.1) is approved and merged. This phase itself creates no implementation PR; it plans the PRs Phase 6 will create.
- Routing Layer 3 (Policy Routing) and Configuration's Runtime Configuration Store / Feature-Flag Layer remain out of scope for every wave planned below, per ADR-0007 §5.4 and ADR-0012 §10.3 (Technical Design) — no wave plans work for either.

---

## 2. Scope Verification

Every planned activity in §3–§13 below is verified to originate from one of three sources only: the Phase 3.1 Architecture Freeze, an Accepted ADR (0006–0014), or the Phase 4 Technical Design. No additional work appears.

| Planned activity (this document)                                                                             | Origin                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wave 6A — Provider Registry, Capabilities Descriptor construction                                            | ADR-0006 Decision; Technical Design §3–§4; Roadmap Phase 6A scope line                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Wave 6B — Adapter Layer refinement (529 relocation), provider-conformance suite                              | ADR-0006 Decision; Technical Design §17.3, §19.3; Roadmap Phase 6B scope line                                                                                                                                                                                                                                                                                                                                                                                                           |
| Wave 6C — Routing Engine (`routing.ts`, `PROVIDER_UNAVAILABLE`)                                              | ADR-0007 Decision; Technical Design §5, §17.1–17.2; Roadmap Phase 6C scope line                                                                                                                                                                                                                                                                                                                                                                                                         |
| Wave 6D — Context Pipeline, Prompt Pipeline (Phase 1 + Phase 2)                                              | ADR-0008, ADR-0010 Decisions; Technical Design §6, §8; Roadmap Phase 6D scope line                                                                                                                                                                                                                                                                                                                                                                                                      |
| Wave 6E — Memory Ranking Infrastructure (schema, RPC, dual-path, backfill)                                   | ADR-0009 Decision; Technical Design §7; Roadmap Phase 6E scope line                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Wave 6F — Operational Instrumentation, Configuration, Extension lint rules, Governance artifact              | ADR-0011, ADR-0012, ADR-0013, ADR-0014 Decisions; Technical Design §9–§12; Roadmap Phase 6F scope line                                                                                                                                                                                                                                                                                                                                                                                  |
| Memory backfill sizing/sequencing plan (§5, Wave 6E)                                                         | Explicitly assigned to Phase 5 by ADR-0009 ("Sizing and sequencing that cost is Technical Design's and Implementation Planning's job") and by Phase 4.1's Implementation Readiness Matrix ("Phase 5 must not skip sizing this before Phase 6.9 begins")                                                                                                                                                                                                                                 |
| Routing Engine construction scheduled as its own wave-6C deliverable rather than riding a future provider PR | Technical Design §18 explicitly left this unscheduled ("Routing Layer 2 activation has no dedicated step... it is not itself a migration risk because it is inert until then"); the Roadmap's later v1.1 wave decomposition names 6C as a mandatory, independently-reviewable wave regardless. This document resolves that reconciliation (§3, Wave 6C footnote) as a sequencing decision, not an architectural one — no interface or behavior named in Technical Design §5 is changed. |
| Sequential (not parallel) wave execution, gated on review + test + merge                                     | Roadmap Phase 6 description ("passes its own validation gates... before the next wave begins") and this phase's own Implementation Governance requirement                                                                                                                                                                                                                                                                                                                               |
| No Layer 3 / Runtime Config Store / Feature-Flag Layer planning                                              | ADR-0007 §5.4, ADR-0012 §10.3 — explicitly out of scope, not planned here                                                                                                                                                                                                                                                                                                                                                                                                               |

**Verification verdict:** no planned activity above lacks a named architectural source. No activity plans work an ADR or the Technical Design left undesigned (Routing Layer 3, Configuration's deferred candidates, Extension's runtime-assertion defense-in-depth) — those remain correctly unplanned, matching their governing ADR's own deferral.

---

## 3. Implementation Wave Overview

Six waves, matching the Roadmap's own Phase 6A–6F decomposition exactly (no wave renamed, resequenced, split, or merged beyond what the Roadmap itself already specifies).

### Phase 6A — Core Infrastructure

- **Objective:** Give the Brain Gateway a queryable, boot-populated Provider Registry with an attached Capabilities Descriptor per provider, replacing today's single module-level provider reference — the foundational seam every later wave (6B, 6C, 6F) depends on or references.
- **Scope:** `ProviderRegistry`/`RegisteredProvider`/`createProviderRegistry()` (Technical Design §3); `CapabilitiesDescriptor` type (§4); OpenRouter registered into the Registry at `gateway.ts` module load, replacing the current `const provider` (§3.2); the Provider-boundary `no-restricted-imports` lint rule (Technical Design §11.1) — **relocated here from Wave 6F per Phase 5.1 Independent Review Finding M-1**, since it targets `src/core/brain/providers/*`, which exists independently of every other wave, and ADR-0013's own rationale for this rule (closing GAP-10 before "a violation introduced by this very roadmap's own later implementation phases") is defeated if the rule itself is deferred until after those later phases have already shipped.
- **Expected outputs:** `src/core/brain/registry.ts` (new); `src/core/brain/types.ts` extended; `src/core/brain/gateway.ts` updated; `eslint.config.mjs` updated (Provider-boundary rule); `registry.test.ts` (new); Phase 6A Implementation Report.
- **Dependencies:** None (first wave).
- **Risks:** Descriptor schema-design risk (accepted by ADR-0006 as Medium-High, "n=1... every field definitionally true"); see §8.
- **Rollback boundary:** Revert PR — no data touched, zero behavior change (Technical Design §18, step 6.1).

### Phase 6B — Provider Layer

- **Objective:** Complete the Adapter Layer's error/retry-vocabulary normalization and stand up the provider-conformance test infrastructure that lets ADR-0006's "n=1" risk be closed by construction rather than left permanently accepted.
- **Scope:** Relocate the provider-specific `529` status out of `src/lib/errors.ts`'s shared `DEFAULT_RETRY.retryOn` default into an OpenRouter-supplied override (Technical Design §17.3); build `runProviderConformanceSuite()` (§19.3); author a test-only fake second `BrainProvider` used solely to exercise the suite (never shipped).
- **Expected outputs:** `src/core/brain/providers/openrouter.ts` updated; `src/lib/errors.ts` updated; new shared conformance-suite test factory; a fake test-only provider fixture; Phase 6B Implementation Report.
- **Dependencies:** 6A (soft — the conformance suite exercises `RegisteredProvider`/`CapabilitiesDescriptor` shapes 6A introduces; OpenRouter's own descriptor values, illustrated in Technical Design §4.3, are populated as part of 6A but re-verified here through the suite).
- **Risks:** Retry-list change could alter existing retry behavior for callers implicitly relying on the shared `529` entry; see §8.
- **Rollback boundary:** Revert PR (Technical Design §18, step 6.2).

### Phase 6C — Routing Engine

- **Objective:** Introduce the Routing Engine as a structurally-present, independently-testable component — Layer 1 (task routing) active with zero behavior change, Layer 2 (capability routing) present but inert until a second provider exists — per ADR-0007's layered composition.
- **Scope:** `src/core/brain/routing.ts` (`RoutingRequest`, `RoutingResult`, `routeRequest()`, Technical Design §5); `PROVIDER_UNAVAILABLE` error code (§17.1); `gateway.ts` rewired from 6A's direct `registry.getConfigured()[0]` lookup to `routeRequest()` (§5.2–5.3, §17.2). Layer 3 (Policy Routing) is explicitly not designed and not planned (ADR-0007 §5.4).
- **Expected outputs:** `src/core/brain/routing.ts` (new); `src/core/brain/types.ts` extended (`PROVIDER_UNAVAILABLE`); `src/core/brain/gateway.ts` updated; `routing.test.ts` (new); Phase 6C Implementation Report.
- **Dependencies:** 6A (hard — Layer 2 depends on the Registry/Descriptor existing, per ADR-0007 and Technical Design §5.3); 6B (soft — Layer 2's match-found path is exercised in tests using 6B's fake provider, not production traffic).
- **Risks:** Activation-ordering risk — a partially-implemented router must clearly signal which layers are live (`resolvedBy` field, §5.5); see §8.
- **Rollback boundary:** Revert PR; `gateway.ts` reverts to 6A's direct registry lookup, which remains valid and unaffected (Technical Design §18's "no forward dependency" guarantee, independently confirmed by Phase 4.1 §1.4 claim 22).

**Footnote (Routing Engine sequencing, see §2):** Technical Design §18 did not give Routing Engine construction its own migration step, on the assumption it would ship alongside a future second provider's PR. The Roadmap's later v1.1 wave decomposition requires 6C to ship as its own independently reviewable wave regardless of when a second provider arrives. This document resolves that gap by scheduling 6C immediately after 6A/6B, with Layer 2 shipped present-but-structurally-inert exactly as Technical Design §5.3 already describes for the "n=1" state — no interface, behavior, or activation condition named in ADR-0007 or Technical Design §5 is changed by scheduling it this way.

### Phase 6D — Context & Prompt

- **Objective:** Supersede the two-owner Context arrangement and the six-owner Prompt arrangement with single, centralized owners, per ADR-0008 and ADR-0010.
- **Scope:** `src/core/context-pipeline.ts` (Technical Design §6); Prompt Phase 1 — internal `personas.ts` persona/protocol fragment separation (§8.2); Prompt Phase 2 — five channel adapters, migrated one at a time in the order Technical Design specifies (§8.3): `summarize/route.ts` → `ingest/whatsapp/route.ts` → `history/route.ts` (both owners) → `vision/route.ts`.
- **Expected outputs:** `src/core/context-pipeline.ts` (new); `src/core/context-manager.ts` reduced to a thin wrapper; `src/app/api/emma/route.ts` updated (server cap superseded); `src/core/personas.ts` restructured into fragments + `composePrompt()`; five channel-adapter PRs (one per adapter, per Technical Design's migration order); `context-pipeline.test.ts` (new); a snapshot-equality test for Prompt Phase 1; Phase 6D Implementation Report.
- **Dependencies:** None on 6A/6B/6C (ADR-0008 and ADR-0010 both state "no dependency on other Provider/Routing decisions" in their Architectural Impact sections). Sequenced after 6C only because of this document's mandated sequential wave order (§11), not a technical dependency.
- **Risks:** Prompt's byte-identical-output requirement for Phase 1 (regression risk if fragment decomposition subtly changes output); Context's client/server dual-owner reconciliation; see §8.
- **Rollback boundary:** Revert PR for Context (no schema change); revert **one adapter's PR independently of the others** for Prompt Phase 2 (Technical Design §18, step 6.8) — the specific property that makes a five-call-site migration safe to do incrementally.

### Phase 6E — Memory

- **Objective:** Remove the architectural coupling between the memory-row cap and ranking quality by introducing database-side vector ranking, modeled directly on the already-shipped `document_chunks` precedent.
- **Scope:** Additive schema migration (`memories.embedding vector(1536)`, HNSW index, `match_memories` RPC, Technical Design §7.1); `getRelevantMemoriesForUser()` internals rewritten to call the RPC, signature unchanged (§7.2); dual-path merge for the backfill window (§7.3); **backfill sizing/sequencing plan** (this document's own required deliverable, §5).
- **Expected outputs:** `supabase/schema.sql` additive migration; `memory-db.ts` internals updated; backfill runner (a script or Supabase-side job, sized in §5); Phase 6E Implementation Report; Migration Report.
- **Dependencies:** None on 6A–6D (ADR-0009's embedding-generation step is already Brain-Gateway-mediated via the existing `brainEmbed()`/`embeddings.ts` path, which Technical Design §1.2 confirms is already migrated). Sequenced after 6D per the mandated wave order; also deliberately placed later in the sequence to isolate this wave's highest infrastructure risk after the lower-risk waves have already validated the sequential-gate process.
- **Risks:** Highest-cost wave in the entire plan — new infrastructure dependency, schema migration, backfill correctness; see §8 and the dedicated backfill plan in §5.
- **Rollback boundary:** Additive column stays unused if reverted; RPC drop is safe (no other reader), per Technical Design §18, step 6.9. The dual-path design means an incomplete or reverted backfill never forces a cutover — un-embedded rows simply continue on the keyword-overlap path indefinitely, so a stalled backfill is a "cutover not yet reached" state, not a rollback scenario.

### Phase 6F — Operational & Governance

- **Objective:** Close the total absence of tracing/metrics/structured logging (ADR-0011), the boot-time single-provider lock-in (ADR-0012), the convention-only boundary/DI enforcement (ADR-0013), and the absence of a governed Extension Model artifact (ADR-0014) — the four ADRs the Roadmap groups into this one wave.
- **Scope:** `correlationId?` on `BrainChatRequest`/`BrainEmbedRequest` + `withInstrumentation()` Sentry-span wrapper (Technical Design §9); conditional boot validation (`hasConfiguredProvider()`, `no_provider_configured`, §10); the `no-restricted-imports` template (§11.1, Provider-boundary rule already shipped in Wave 6A per Finding M-1) extended with Context/Prompt-Pipeline DI rules once 6D has shipped; `docs/brain-gateway-extension-model.md` content, authored from the lived experience of 6A–6E (§12.2).
- **Expected outputs:** `src/core/brain/gateway.ts` instrumentation wrapper; `src/core/brain/types.ts` `correlationId?` fields; `src/core/env-validation.ts` updated; `eslint.config.mjs` updated (Context/Prompt-Pipeline DI rule addition, see §7); `docs/brain-gateway-extension-model.md` (new); Phase 6F Implementation Report.
- **Dependencies:** 6A (soft, organizational grouping only — Operational Instrumentation wraps whatever shape the Gateway's three exported functions have by this point, per §7's Dependency Validation; this is not a technical blocking dependency, only a sequencing convenience); 6D (hard — the DI lint rule's Context/Prompt-Pipeline entries and the Extension Model artifact's own content cannot describe a module that does not yet exist, per Technical Design §11.1's own "not retroactively invented now" constraint).
- **Risks:** Boot-validation drift if `hasConfiguredProvider()`'s hand-maintained list falls out of sync with the Registry's actual entries (an accepted, documented — not tooling-enforced — governance responsibility per Technical Design §10.2); lint false-positives; see §8.
- **Rollback boundary:** Revert PR per sub-area (Sentry dependency already present, Technical Design §18 step 6.3; lint rules are CI-time only with no runtime effect, step 6.5); Governance artifact rollback is a documentation-only revert (step 6.10, "None (docs only)").

---

## 4. Implementation Dependency Graph

```
6A (Provider Registry + Capabilities Descriptor)
 │
 ├──requires-first──► 6C (Routing Engine)           [hard: ADR-0007 / Technical Design §5.3 —
 │                                                     Layer 2 needs the Registry/Descriptor to query]
 │
 └──precedes (soft)──► 6B (Adapter Layer + Conformance Suite)
                                                       [soft: descriptor population/re-verification;
                                                        no interface in 6B requires 6A to compile]

6D (Context Pipeline + Prompt Pipeline)
   [independent of 6A/6B/6C — ADR-0008 and ADR-0010 both state
    "no dependency on other Provider/Routing decisions" in their own
    Architectural Impact sections]

6E (Memory Ranking Infrastructure)
   [independent of 6A–6D — ADR-0009's embedding step is already
    Brain-Gateway-mediated via the pre-existing brainEmbed() path]

6F (Operational & Governance)
 ├──informs (soft, grouping only)──► 6A  [Operational Instrumentation wraps whatever shape the
 │                                         Gateway's exported functions have; not a blocking dependency]
 └──requires (hard)──► 6D  [DI lint rule's Context/Prompt-Pipeline entries and the Extension Model
                            artifact's content cannot reference a module that does not exist yet]
```

**Correction (Phase 5.1 Independent Review, Finding M-1):** the Provider-boundary `no-restricted-imports` rule (Technical Design §11.1) is relocated to Wave 6A (§5.1), not 6F — it has no dependency on any other wave (the `providers/` directory it protects already exists today), and ADR-0013's own rationale for this exact rule is to catch "a violation introduced by this very roadmap's own later implementation phases" (GAP-10). Deferring it to the last wave would leave that protection absent for the four intervening waves (6B–6E) it exists specifically to guard.

**Mandated linear execution order:** `6A → 6B → 6C → 6D → 6E → 6F`.

**Why this order is valid and adopted:** the Roadmap's own already-published enumeration of the six waves (6A, 6B, 6C, 6D, 6E, 6F) happens to satisfy every hard dependency identified above without reordering — 6A precedes 6C (hard dependency satisfied); 6A precedes 6F (hard dependency satisfied); 6D precedes 6F (hard dependency satisfied). This document's contribution is confirming that validity explicitly, not inventing a new order. 6D and 6E have no hard dependency on any earlier wave and could, in principle, run in parallel with 6A–6C; they are nonetheless placed in this sequence (not executed in parallel) because the Roadmap's Governance Rules and this phase's own Implementation Governance (§11) mandate that no wave begins before the previous wave has completed review, passed testing, and merged — a project-management gate, not a technical one. 6E is deliberately the highest-numbered wave before Governance despite having no technical dependency on 6A–6D, so that its higher infrastructure risk (§8) is taken on only after the lower-risk waves have already exercised and validated the sequential-gate process itself.

**No circular dependency exists:** every arrow above points in one direction (6A→6C, 6A→6F, 6D→6F); no wave depends, directly or transitively, on a wave that depends on it.

---

## 5. Wave Planning

Each wave below is broken into discrete, independently-completable tasks in dependency order (this document's "Work Breakdown Structure" — see Reconciliation note, Document Status).

### 5.1 Wave 6A — Core Infrastructure

**Scope (exact Technical Design sections):** §3 (Provider Registry Technical Design), §4 (Capability Descriptor Technical Design).

**Tasks:**

1. Add `CapabilitiesDescriptor` to `src/core/brain/types.ts` (§4.1).
2. Create `src/core/brain/registry.ts`: `ProviderRegistry`, `RegisteredProvider`, `createProviderRegistry()` (§3.1), with registration validation — duplicate-name rejection, required-field presence, `contextWindowTokens > 0` (§3.3).
3. Populate OpenRouter's concrete `CapabilitiesDescriptor` values (§4.3) and register it at `gateway.ts` module load (§3.2), replacing today's `const provider: BrainProvider = createOpenRouterProvider()`.
4. Rewire `gateway.ts`'s three exported functions (`brainChat`, `brainChatStream`, `brainEmbed`) to look up the provider via `registry.getConfigured()[0]` — a direct, zero-behavior-change interim state, deliberately _not_ yet routed through a Routing Engine (that rewiring is 6C's task, §5.3, kept separate so each wave's diff stays minimal and independently revertible).
5. `registry.test.ts`: register/get/getConfigured/duplicate-name-rejection/descriptor-validation (§19.1).
6. **(Relocated from Wave 6F per Phase 5.1 Independent Review Finding M-1)** Add the first `no-restricted-imports` block: Provider boundary (`src/core/brain/providers/*` unreachable from outside `src/core/brain/`) (Technical Design §11.1). This task has no dependency on this or any other wave's own code — the `providers/` directory it protects already exists in the repository today — so it ships in the same wave that introduces the Registry it is conceptually paired with, rather than waiting four further waves.

**Files expected to change:** `src/core/brain/types.ts`, `src/core/brain/registry.ts` (new), `src/core/brain/gateway.ts`, `eslint.config.mjs`, `tests/unit/registry.test.ts` (new).

**Interfaces affected:** `CapabilitiesDescriptor` (new), `ProviderRegistry`/`RegisteredProvider`/`createProviderRegistry` (new). Both additive/new — no existing exported type is changed.

**Risks:** Descriptor schema-design risk (Medium-High, ADR-0006) — every field is definitionally true with one provider, untested against a provider that would return `false`. Mitigated in 6B via the conformance suite's fake provider.

**Rollback strategy:** Revert the PR. No data touched; `gateway.ts`'s public functions (`brainChat`/`brainChatStream`/`brainEmbed`/`isBrainConfigured`) keep the same signatures throughout, so no caller anywhere in the 16 Application-Layer call sites needs to change for this wave to land or revert.

### 5.2 Wave 6B — Provider Layer

**Scope:** §17.3 (Retry, within Error Handling Specification), §19.3 (Contract / provider-conformance testing).

**Tasks:**

1. Remove `529` from `src/lib/errors.ts`'s shared `DEFAULT_RETRY.retryOn` default (`[429, 500, 502, 503, 529]` → `[429, 500, 502, 503]`).
2. Add a provider-supplied `retryOn` override, passed by `openrouter.ts` when it calls `fetchWithRetry`, preserving `529`-retry behavior for OpenRouter specifically (§17.3).
3. Build `runProviderConformanceSuite(provider: BrainProvider, capabilities: CapabilitiesDescriptor)` — a shared test factory exercising `chat`/`chatStream`/`embed`/`isConfigured` against a mocked transport, covering every `BrainChatResult`/`BrainStreamResult`/`BrainEmbedResult` shape (§19.3).
4. Author a fake, test-only second `BrainProvider` implementation, used solely to exercise this suite and (in 6C) Routing Layer 2 — never shipped to production.
5. Run `openrouter.ts` through the same conformance suite to re-verify its existing behavior is unchanged by the `529` relocation.
6. Update `errors.test.ts`/`openrouter.test.ts` for the retry-list change (§19.4 regression gate).

**Files expected to change:** `src/lib/errors.ts`, `src/core/brain/providers/openrouter.ts`, new shared conformance-suite test factory (e.g., `tests/unit/provider-conformance.ts`), new fake-provider test fixture, `tests/unit/errors.test.ts`, `tests/unit/openrouter.test.ts`.

**Interfaces affected:** None new at the production-code level (the conformance suite and fake provider are test-only artifacts). `fetchWithRetry`'s call signature gains an optional `retryOn` override — additive.

**Risks:** A caller implicitly relying on the shared list's `529` entry (rather than a provider-supplied one) could see a behavior change. Mitigated: only `openrouter.ts` currently calls `fetchWithRetry` with retry-eligibility needs tied to `529` (Technical Design §17.3, confirmed directly against `providers/openrouter.ts:107-129` by Phase 4.1's independent review), so the override closes the gap at its only real call site.

**Rollback strategy:** Revert the PR (Technical Design §18, step 6.2). The conformance suite and fake provider are additive test-only artifacts with no production dependency — reverting them affects nothing outside `tests/`.

### 5.3 Wave 6C — Routing Engine

**Scope:** §5 (Routing Engine Technical Design), §17.1–17.2 (Error hierarchy, Propagation).

**Tasks:**

1. Create `src/core/brain/routing.ts`: `RoutingRequest`, `RoutingResult`, `routeRequest()` (§5.1).
2. Implement Layer 1 (task routing): when `requiredCapabilities` is omitted/empty, return `registry.getConfigured()[0]` tagged `resolvedBy: "task"` — byte-for-byte identical to 6A's interim direct-lookup behavior (§5.2).
3. Implement Layer 2 (capability routing): when `requiredCapabilities` is non-empty, call `registry.findByCapability(...)`, restricted to configured providers; return the first match tagged `resolvedBy: "capability"`, or `null` if none match — hard-fail, not silent widening (§5.3).
4. Add `PROVIDER_UNAVAILABLE` to `BrainRequestError.code`, `retryable: false` (§17.1).
5. Rewire `gateway.ts`'s three exported functions from 6A's direct registry lookup to `routeRequest(registry, {task, requiredCapabilities?})`, translating a `null` result to `{ok:false, error:{code:"PROVIDER_UNAVAILABLE"}}` (§17.2).
6. `routing.test.ts`: Layer 1 passthrough (`resolvedBy: "task"`, identical to today's single-provider selection); Layer 2 no-match returns `null`; Layer 2 match using 6B's fake second provider (§19.1).
7. Regression: confirm `resolvedBy === "task"` holds for all existing (single-provider) production traffic (§5.5).

**Files expected to change:** `src/core/brain/routing.ts` (new), `src/core/brain/types.ts` (`PROVIDER_UNAVAILABLE` union member), `src/core/brain/gateway.ts`, `tests/unit/routing.test.ts` (new).

**Interfaces affected:** `RoutingRequest`/`RoutingResult`/`routeRequest` (new); `BrainRequestError.code` gains one union member (additive).

**Risks:** Activation-ordering risk (ADR-0007's own accepted trade-off) — a caller must not assume Layer 2 guarantees that do not yet exist. Mitigated by `resolvedBy` being the explicit, test-asserted signal of which layer produced a given selection (§5.5).

**Rollback strategy:** Revert the PR; `gateway.ts` reverts to 6A's direct `registry.getConfigured()[0]` lookup, which remains valid and requires no further change to revert into (Technical Design §18's "no forward dependency" guarantee).

### 5.4 Wave 6D — Context & Prompt

**Scope:** §6 (Context Pipeline Technical Design), §8 (Prompt Composition Technical Design).

**Context tasks:**

1. Create `src/core/context-pipeline.ts`: `ContextPipeline`, `ContextPipelineOptions`, `ContextPipelineResult`, `createContextPipeline()`, five-stage `prepare()` (Estimate → Budget → Decide → Summarize → Return) (§6.2–6.3).
2. Migrate `route.ts`'s server-side `truncateHistory()` (flat 20-cap) to call `contextPipeline.prepare()` (§6.4).
3. Refactor the client `useContextManager` hook into a thin wrapper calling the same shared `ContextPipeline.prepare()` (§6.4).
4. `context-pipeline.test.ts` (largely ported from `context-manager.test.ts`'s existing budget/trim/summarize cases), asserting the server path and the client hook produce **identical `managed` output for identical input** — the actual regression test that closes GAP-09's "two owners could disagree" risk (§19.1).

**Prompt tasks (Phase 1 — internal restructuring, must complete and pass its own gate before Phase 2 begins):** 5. Decompose `personas.ts`'s monolithic `stable` string into named fragment functions (`personaBaseFragment`, `protocolTagsFragment`, `routineListFragment`, `memoriesFragment`, `activeUserFragment`, `customPersonaFragment`) plus `composePrompt()` (§8.1–8.2). 6. Snapshot-equality test: `composePrompt(CHAT_STABLE_FRAGMENTS ∪ CHAT_DYNAMIC_FRAGMENTS, ctx)` output **byte-identical** to today's `buildSystemPromptBlocks(ctx)` output for a fixed set of representative contexts — run and passing **before** Phase 1 is considered complete (§8.2, §19.1).

**Prompt tasks (Phase 2 — five channel adapters, migrated one at a time, least-coupled first):** 7. `summarize/route.ts` adapter. 8. `ingest/whatsapp/route.ts` adapter. 9. `history/route.ts` adapter (both of its independent owners). 10. `vision/route.ts` adapter (most fragment-dependent, migrated last) (§8.3). 11. Each adapter reuses the shared `[EXTERNAL DATA]` injection-guard fragment verbatim rather than reimplementing it (§8.3) — the specific reuse ADR-0010 targets.

**Files expected to change:** `src/core/context-pipeline.ts` (new), `src/core/context-manager.ts`, `src/app/api/emma/route.ts`, `src/core/personas.ts`, `src/app/api/emma/vision/route.ts`, `src/app/api/emma/summarize/route.ts`, `src/app/api/emma/ingest/whatsapp/route.ts`, `src/app/api/emma/history/route.ts`, `tests/unit/context-pipeline.test.ts` (new), a new or extended snapshot test file for prompt composition.

**Interfaces affected:** `ContextPipeline`/`ContextPipelineOptions`/`ContextPipelineResult`/`createContextPipeline` (new); `PromptFragment`/`composePrompt`/`ChannelAdapter` (new); `buildSystemPrompt()`/`buildSystemPromptBlocks()` (unchanged signature and output, per §8.2's byte-identical requirement).

**Risks:** Prompt Phase 1's byte-identical-output requirement is a hard regression gate — any snapshot mismatch blocks Phase 2 from starting, by design. Context's client/server reconciliation is Medium-High complexity per ADR-0008's own accepted trade-off. See §8.

**Rollback strategy:** Context — revert PR, no schema change (Technical Design §18, step 6.6). Prompt Phase 1 — revert PR (step 6.7). Prompt Phase 2 — **revert one adapter's PR independently of the others** (step 6.8); each of the five adapter migrations is its own PR specifically so a regression in, say, the `vision/route.ts` adapter never requires reverting the four adapters that already shipped cleanly.

### 5.5 Wave 6E — Memory

**Scope:** §7 (Memory Ranking Technical Design).

**Tasks:**

1. Additive schema migration: `memories.embedding vector(1536)`, `idx_memories_embedding` HNSW index, `match_memories` RPC (§7.1), mirroring the already-shipped `document_chunks` precedent exactly (Technical Design §1.4, independently re-verified by Phase 4.1 §1.4 claim 6).
2. Rewrite `getRelevantMemoriesForUser()`'s internals to call `embedText()` (already Brain-Gateway-mediated) then `supabase.rpc('match_memories', ...)`, signature unchanged (§7.2).
3. Implement the dual-path merge: the vector RPC for embedded rows, plus the existing in-process keyword-overlap pass for `embedding is null` rows, merged and re-sorted by score before applying `limit` (§7.3).
4. **Backfill sizing/sequencing plan** — see below.
5. `tests/unit/memory-relevance.test.ts` (extended): mock the Supabase RPC call; assert dual-path merge/sort behavior for a mixed embedded/un-embedded row set (§19.1).
6. Cutover: once the backfill-completion criteria below are met, delete the keyword-overlap path, making the function vector-only (§7.3).

**Backfill sizing/sequencing plan (resolves ADR-0009's and Technical Design's explicit deferral to Phase 5):**

- **Batching.** Backfill runs in fixed-size batches (recommend 500 active `memories` rows per batch — small enough to bound a single `brainEmbed()` burst's cost/latency impact, large enough to make measurable progress per run) rather than a single unbounded pass, so a mid-run failure loses at most one batch's progress, not the whole backfill.
- **Rate limiting.** Each batch's embedding calls run through the existing Brain-Gateway-mediated `embedText()` path (no new provider coupling, per ADR-0009's Architectural Impact) with the same retry/backoff behavior every other Gateway call already has (Technical Design §17.3) — no new rate-limiting mechanism is introduced; the existing one is reused.
- **Scheduling mechanism.** The backfill runs as a batch job triggered the same way this codebase's other scheduled maintenance work runs (the existing cron-route pattern documented in `CLAUDE.md`'s API Routes table, e.g. `emma/cron/reflection/route.ts`'s precedent) rather than a new ad hoc script, keeping the backfill mechanism consistent with an already-established repository convention.
- **Dual-path safety net.** Because `match_memories` excludes `embedding is null` rows (§7.3) and `getRelevantMemoriesForUser()` runs the dual-path merge throughout the entire backfill window, **no user-facing regression is possible while backfill is incomplete or paused** — un-embedded rows simply continue to be served by the pre-existing keyword-overlap path. This is the property that makes the batch size and schedule above tunable operational parameters, not correctness-critical ones.
- **Cutover criteria (when the keyword-overlap path is deleted, §7.3's final step):** cutover is authorized once **(a)** the backfill job reports zero remaining `embedding is null` rows among `status = 'active'` memories for two consecutive scheduled runs (guarding against rows created between the last backfill batch and the cutover check), **and** **(b)** the dual-path regression test (task 5 above) and the full existing `memory-relevance.test.ts` suite are green against the vector-only code path in a trial branch. Cutover is a separate, small PR from the backfill job itself, gated the same way every other wave-internal task is (§11) — it does not ship in the same PR as the schema migration.
- **Failure handling.** If a batch's embedding calls fail (upstream error, rate limit), the batch is retried on the next scheduled run without special-casing — rows remain `embedding is null` and continue being served by the keyword-overlap path in the interim, per the dual-path safety net above. No batch failure blocks any other Application-Layer functionality.

**Files expected to change:** `supabase/schema.sql` (additive migration), `src/core/memory-db.ts`, a new backfill batch-job route/script (naming/location decided at Phase 6E kickoff, following the existing cron-route convention), `tests/unit/memory-relevance.test.ts` (extended).

**Interfaces affected:** `getRelevantMemoriesForUser()` — signature unchanged, internals replaced (the specific compatibility guarantee ADR-0009 requires). A new `match_memories` SQL RPC (additive, no existing RPC changed).

**Risks:** Highest-cost wave in the plan — new infrastructure dependency (vector-capable column/index), schema migration, backfill correctness under real production data volume. See §8 for full mitigation detail.

**Rollback strategy:** Additive column stays unused if reverted; RPC drop is safe (no other reader), per Technical Design §18 step 6.9. An incomplete or paused backfill is never a rollback trigger (dual-path safety net above) — only a genuinely incorrect `match_memories` RPC or a `getRelevantMemoriesForUser()` regression would trigger a revert, and both are caught by task 5's test before merge.

### 5.6 Wave 6F — Operational & Governance

**Scope:** §9 (Operational Instrumentation), §10 (Configuration System Design), §11 (Extension Model — lint rules), §12 (Governance Technical Design).

**Tasks:**

1. Add `correlationId?: string` to `BrainChatRequest` and `BrainEmbedRequest` (§9.1).
2. Implement `withInstrumentation()` wrapping the Gateway's three exported functions with `Sentry.startSpan` + `logBrainRequest` (console.warn-based, failure-only structured log, matching `errors.ts`'s existing precedent) (§9.2).
3. Extend `env-validation.ts`: `EnvironmentIssueReason` gains `"no_provider_configured"`; `hasConfiguredProvider()` (an explicit, small OR-chain, not a Registry import, per §10.2's non-circular-import constraint); remove `OPENROUTER_API_KEY` from the unconditional `PRODUCTION_REQUIRED_ENV` list (§10.1).
4. Extend the `no-restricted-imports` template (the Provider-boundary rule itself already shipped in Wave 6A, §5.1 task 6, per Finding M-1) with Context-Pipeline and Prompt-Pipeline boundary/DI entries — only after 6D has shipped, per §11.1's "not retroactively invented now for modules that do not exist yet."
5. Author `docs/brain-gateway-extension-model.md` content: (1) how to add a provider, (2) how to add a capability, (3) how to add a Gateway-adjacent boundary — location/format/required sections already fixed by Technical Design §12.1; content written from the lived experience of 6A/6B/6C (§12.2). This task depends on 6A/6B/6C having shipped, not on 6D/6E (the three required sections name Provider/Routing/boundary concerns only).
6. Extend `env-validation.test.ts`'s matrix with the new `no_provider_configured` case (present/absent/placeholder) (§19.1).
7. Correlation-ID threading test: assert a caller-supplied `correlationId` reaches the Sentry span attributes; assert a fallback UUID is synthesized when omitted (§19.1).

**Files expected to change:** `src/core/brain/types.ts`, `src/core/brain/gateway.ts`, `src/core/env-validation.ts`, `eslint.config.mjs`, `docs/brain-gateway-extension-model.md` (new), `tests/unit/env-validation.test.ts`.

**Interfaces affected:** `BrainChatRequest.correlationId?` / `BrainEmbedRequest.correlationId?` (additive); `EnvironmentIssueReason` gains one union member (additive); no runtime interface change from the lint-rule or documentation tasks.

**Risks:** Boot-validation drift if `hasConfiguredProvider()`'s hand-maintained list falls out of sync with the Registry's actual provider list — an accepted, documented (not tooling-enforced) governance responsibility (§10.2). Lint false-positives from an over-broad `no-restricted-imports` pattern. See §8.

**Rollback strategy:** Revert the relevant sub-area's PR independently — instrumentation (Sentry dependency already present, step 6.3), boot validation (step 6.4), lint rules (CI-time only, zero runtime effect, step 6.5), and the Governance artifact (documentation-only, step 6.10) are each their own PR and each independently revertible.

---

## 6. Definition of Done

A common template applies to every wave, with wave-specific additions noted.

| #   | Item                                                                                                                                                                                                  | 6A  | 6B  | 6C                            | 6D                                                          | 6E                                           | 6F  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | --- | ----------------------------- | ----------------------------------------------------------- | -------------------------------------------- | --- |
| 1   | Implementation completed per §5's task list                                                                                                                                                           | Yes | Yes | Yes                           | Yes                                                         | Yes                                          | Yes |
| 2   | Unit tests passing (§10)                                                                                                                                                                              | Yes | Yes | Yes                           | Yes                                                         | Yes                                          | Yes |
| 3   | Integration tests passing, where applicable (§10)                                                                                                                                                     | —   | —   | Yes (route.ts streaming path) | Yes (route.ts streaming path)                               | —                                            | —   |
| 4   | Regression tests passing — every existing test file in `tests/unit/` remains green (§10, §19.4)                                                                                                       | Yes | Yes | Yes                           | Yes                                                         | Yes                                          | Yes |
| 5   | Documentation updated (this document's own file list, `CLAUDE.md`'s Core Engines table where a listed module is touched)                                                                              | Yes | Yes | Yes                           | Yes                                                         | Yes                                          | Yes |
| 6   | Implementation Report completed (per-wave, named in §3)                                                                                                                                               | Yes | Yes | Yes                           | Yes                                                         | Yes                                          | Yes |
| 7   | Rollback verified (the specific mechanism named in §5/§9 is confirmed to work — a real revert is tested, not merely asserted)                                                                         | Yes | Yes | Yes                           | Yes (per-adapter revert confirmed for at least one adapter) | Yes (additive-column-unused state confirmed) | Yes |
| 8   | PR approved (§11 Governance)                                                                                                                                                                          | Yes | Yes | Yes                           | Yes (one PR per adapter, §5.4)                              | Yes                                          | Yes |
| 9   | _(6D only)_ Prompt Phase 1's snapshot-equality test passes **before** any Phase 2 adapter PR opens                                                                                                    | —   | —   | —                             | Yes                                                         | —                                            | —   |
| 10  | _(6E only)_ Backfill cutover criteria (§5.5) either met, or explicitly deferred with the deferral and its reason recorded in the wave's Implementation Report                                         | —   | —   | —                             | —                                                           | Yes                                          | —   |
| 11  | _(6F only)_ `docs/brain-gateway-extension-model.md`'s three required sections (§12.1) are all present and each references the actual shipped Registry/Adapter/lint-rule shape, not aspirational prose | —   | —   | —                             | —                                                           | —                                            | Yes |

No wave is considered done, and no subsequent wave may begin, until every applicable row above is checked for that wave (§11).

### 6.1 Architecture Compliance Checklist (Mandatory — added by Phase 5.1 Independent Review)

Starting with Phase 6A and continuing through Phase 6F, every implementation wave must end with the following checklist, in addition to (not instead of) the Definition of Done table above. This is a new governance requirement introduced by the Phase 5.1 Independent Review, not a Phase 5 or Technical Design deliverable — it is recorded here, appended to Phase 5's own Definition of Done, so that every wave's own Implementation Report has a single place to complete it.

- [ ] Implementation follows all governing ADRs
- [ ] Technical Design remains unchanged
- [ ] No architectural shortcuts introduced
- [ ] No permanent TODO/FIXME left behind
- [ ] No temporary implementation committed as final behavior
- [ ] No provider-specific logic leaked outside the Provider Layer
- [ ] No Gateway boundary violations
- [ ] No undocumented design changes introduced
- [ ] All public interfaces conform to the approved Technical Design
- [ ] All new components preserve dependency direction
- [ ] Rollback remains possible without affecting previous waves
- [ ] Wave Definition of Done satisfied

If any checklist item fails, the implementation wave must not be marked complete until the issue is resolved. This checklist is the wave-local instance of the Implementation Drift Risk Assessment categories identified in the Phase 5.1 Independent Review (see that document's §11) — several items above (provider-specific-logic leakage, Gateway boundary violations, temporary-implementation permanence) map directly to specific risks that review identified as live exposures during Phase 6 execution, not hypothetical categories.

---

## 7. Dependency Validation

Every dependency asserted in §4 is verified here individually, with its evidentiary source and its "why."

| Dependency                                                                         | Verified? | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registry (6A) before Routing Layer 2 activation (6C)                               | Yes       | ADR-0007 Decision text: Layer 2 "depends on ADR-0006's Provider Registry and Capabilities Descriptor existing first." `routeRequest()`'s `findByCapability` call (Technical Design §5.3) is a direct call into the Registry — the code cannot exist before the Registry's interface does.                                                                                                                                                                                                                                    |
| Registry (6A) before Operational Instrumentation being meaningful (6F)             | Yes       | `withInstrumentation()` (Technical Design §9.2) wraps `gateway.ts`'s three exported functions regardless of their internal implementation — it does not require the Registry's or Routing Engine's interface directly. **Corrected (Phase 5.1 Independent Review, Finding Min-1):** this row's "Verified? Yes" originally implied a hard dependency; §3/§4 have been corrected to label this soft (organizational grouping, sequenced after 6A for coherence only, not a technical blocker).                                 |
| Registry (6A) before Configuration's conditional boot check being satisfiable (6F) | Yes       | ADR-0012 Decision text: "which provider(s) are configured" must be a queryable fact — supplied by the Registry (ADR-0006). Technical Design §10.2 deliberately avoids a runtime import of the Registry from `env-validation.ts` (to prevent a circular-import class of bug), so this is a conceptual/documentation dependency (keeping `hasConfiguredProvider()`'s hand-maintained list in sync with the Registry's actual entries), not a code-level import — confirmed directly against Technical Design §10.2's own text. |
| Context/Prompt Pipeline (6D) before their DI lint-rule entries (6F)                | Yes       | Technical Design §11.1: "a concrete `patterns` entry is added when each new substitutable component... actually ships in Phase 6 — not retroactively invented now for modules that do not exist yet." A lint rule cannot reference an import path (`@/core/context-pipeline`, the future Prompt Pipeline module) that does not exist in the repository yet.                                                                                                                                                                  |
| Memory Ranking Infrastructure (6E) has **no** dependency on 6A–6D                  | Yes       | ADR-0009's Architectural Impact section states the embedding-generation step is "Brain-Gateway-mediated, consistent with ADR-0003's existing embedding abstraction — no new provider-coupling is introduced," and Technical Design §1.2 independently confirms `embeddings.ts` already routes through `brainEmbed()` today, before any wave in this plan begins. 6E's schema migration and dual-path logic reference no type or module 6A–6D introduce.                                                                      |
| Governance artifact content (6F, task 5) depends on 6A/6B/6C, **not** on 6D/6E     | Yes       | Technical Design §12.1's three required sections (how to add a provider; how to add a capability; how to add a Gateway-adjacent boundary) describe only Provider/Routing/boundary concerns — none reference Context, Prompt, or Memory. Confirmed by direct re-read of §12.1's exact section list.                                                                                                                                                                                                                           |
| No dependency runs in the direction Provider → Context, or Provider → Memory       | Yes       | ADR-0008 and ADR-0009 both explicitly state "no dependency on other Provider/Routing decisions" / "no new provider-coupling" in their own Architectural Impact sections — independently confirmed, not merely asserted by this document.                                                                                                                                                                                                                                                                                     |

**Verdict:** every dependency named in §4's graph is independently traceable to an ADR's or the Technical Design's own text, not asserted without evidence. No dependency was found missing, and no claimed dependency was found unsupported.

---

## 8. Risk Assessment

| Risk                                                                                                                                                           | Category                 | Likelihood/Impact                                                                                                                                                                                                                                      | Mitigation                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Capabilities Descriptor schema proves too coarse or too fine once a real second provider exists ("n=1" evidentiary risk, ADR-0006)                             | Technical                | Medium / Medium — cannot be resolved until n≥2, an accepted limitation of every prior phase in this initiative                                                                                                                                         | 6B's conformance suite + fake test-only provider exercises the schema's boolean-per-capability shape against a provider that can return `false`, closing the risk **by construction in tests** even though a real second provider still does not exist (Technical Design §19.3)       |
| Routing Layer 2's activation-ordering risk — a caller assumes a routing guarantee (e.g., capability match) that isn't live yet                                 | Technical                | Low / Medium                                                                                                                                                                                                                                           | `resolvedBy` field is the explicit, test-asserted signal (§5.5); 6C's regression task confirms `resolvedBy === "task"` holds for 100% of production traffic while n=1                                                                                                                 |
| `errors.ts`'s shared retry-list change (removing `529`) alters behavior for a caller not yet identified                                                        | Implementation           | Low / Medium                                                                                                                                                                                                                                           | Direct repository confirmation (Phase 4.1 independently verified) that `openrouter.ts` is the only caller whose retry-eligibility needs `529`; the provider-supplied override preserves that exact behavior. Regression tests (6B, task 6) re-verify before merge                     |
| Prompt Phase 1's fragment decomposition subtly changes `buildSystemPromptBlocks()`'s output                                                                    | Implementation           | Low / High (would silently alter Emma's persona voice in production)                                                                                                                                                                                   | Byte-identical snapshot-equality test is a **hard gate** — Phase 2 (channel adapters) cannot begin until it passes (§6, DoD item 9)                                                                                                                                                   |
| Context Pipeline's client/server reconciliation produces different `managed` output for the same input under some edge case                                    | Implementation           | Medium / Medium (ADR-0008's own accepted "Medium-High complexity" trade-off)                                                                                                                                                                           | `context-pipeline.test.ts` explicitly asserts output equality between the two callers for shared test cases (§5.4, task 4) — the first real regression test this exact risk has ever had                                                                                              |
| Memory schema migration or backfill degrades production query latency or correctness                                                                           | Technical / Operational  | Low likelihood (models an already-shipped, already-validated `document_chunks` precedent) / High impact if it occurred                                                                                                                                 | Additive-only column (existing queries unaffected until `match_memories` is called); dual-path merge means no row is ever unqueryable during backfill; batched backfill (§5.5) bounds any single run's blast radius; cutover is a separate, gated PR from the schema migration itself |
| Backfill job encounters partial failures against a live embedding provider (rate limits, transient errors)                                                     | Operational              | Medium / Low (dual-path safety net absorbs it)                                                                                                                                                                                                         | Failed batches simply retry on the next scheduled run; affected rows continue being served by the keyword-overlap path in the interim (§5.5) — no user-facing failure mode exists                                                                                                     |
| `hasConfiguredProvider()`'s hand-maintained provider list drifts from the Registry's actual entries over time                                                  | Operational / Regression | Medium (a real governance responsibility, not tooling-enforced, per Technical Design §10.2) / Medium (a future provider silently fails boot validation, or boot validation silently accepts a provider whose credentials were never actually required) | Recorded explicitly as an ongoing Governance responsibility in `docs/brain-gateway-extension-model.md` (6F, task 6) — the same "coverage only as complete as the rules/lists authored" limitation ADR-0013 already accepts for lint rules generally                                   |
| `no-restricted-imports` boundary/DI rules produce false positives blocking an unrelated, legitimate PR                                                         | Implementation           | Low / Low                                                                                                                                                                                                                                              | Rules are scoped narrowly (`files`/`ignores` blocks per Technical Design §11.1's exact snippet) and added only for modules that already exist (§7) — never speculative                                                                                                                |
| Sequential wave-gating (§11) stalls if a wave's review takes materially longer than expected                                                                   | Schedule                 | Not estimated — this document does not assign calendar duration to any wave, per its own Explicit Non-Goals (§16)                                                                                                                                      | Not a scheduling risk this document sizes; a project-management concern for whoever executes Phase 6, out of this document's scope by design                                                                                                                                          |
| A wave's regression suite (65 existing test files, per Technical Design §19.4) breaks partway through Phase 6 for a reason unrelated to that wave's own change | Regression               | Low / High (would block every subsequent wave under the sequential-gate model)                                                                                                                                                                         | DoD item 4 (§6) requires every existing test file green before a wave is considered done — this is the explicit backstop; a break is caught at the wave boundary it occurred in, not discovered later                                                                                 |

---

## 9. Rollback Strategy

### 9.1 Per-wave rollback (see also each wave's own entry in §3/§5)

Every wave's changes are additive-only at the interface level (Technical Design §13, independently confirmed by Phase 4.1) — no existing signature is narrowed, retyped, or removed until every one of its callers has already migrated, and even then the old shape is deleted, never replaced with an incompatible one. This is what makes a single `git revert` of a wave's PR(s) sufficient for every wave below, with no follow-up data cleanup:

- **6A:** Revert PR. No data touched.
- **6B:** Revert PR. Test-only artifacts have no production dependency.
- **6C:** Revert PR. `gateway.ts` reverts cleanly to 6A's direct registry lookup.
- **6D:** Context — revert PR, no schema change. Prompt — revert **one adapter's PR** independently of the other four; Phase 1's internal restructuring reverts independently of any Phase 2 adapter.
- **6E:** Additive column stays unused if reverted; RPC drop is safe (no other reader). An incomplete backfill is never itself a rollback trigger (§5.5).
- **6F:** Revert the relevant sub-area's PR (instrumentation / boot validation / lint rules / Governance artifact are each independently revertible).

### 9.2 Partial implementation

If a wave is only partially merged when a defect is found (e.g., 3 of 5 Prompt Phase 2 adapters have shipped), only the defective adapter's PR is reverted — the other already-shipped adapters are unaffected, per Technical Design §18's explicit per-adapter independence guarantee. No wave's partial state requires reverting an earlier, already-validated wave.

### 9.3 Failed deployment

Because every wave is additive-first, a failed deployment of any wave's PR is resolved by a standard revert-and-redeploy of that PR alone — no wave's deployment depends on a database migration having already run except 6E, whose own migration is itself additive (§9.4).

### 9.4 Failed migration (6E specifically)

The `memories.embedding` column addition and `match_memories` RPC creation are both additive DDL (`add column if not exists`, `create or replace function`) — a failed or partially-applied migration leaves existing `memories` queries (which do not reference the new column or RPC) completely unaffected. If the migration itself needs to be undone, dropping the RPC is safe (Technical Design §18 confirms no other reader exists), and dropping the additive column is a standard reversible DDL operation with no dependent objects created by any other wave.

### 9.5 Failed integration (Phase 7 concern, rollback boundary confirmed here)

Per the Roadmap's own requirement ("may be rolled back independently of every other wave, per the Technical Design's per-step rollback guarantee"), a Phase 7 integration failure attributable to one specific wave's component can be resolved by reverting that wave alone — the rollback boundaries defined in §9.1 hold at integration time exactly as they hold at unit/wave-review time, because no wave's implementation created a runtime dependency on another wave's continued presence beyond what §4's dependency graph already documents (and every dependency in that graph is itself one-directional and additive, not a coupling that would make one wave's revert require another's).

---

## 10. Testing Strategy

Per wave, per Technical Design §19 (Testing Architecture / Strategy):

| Wave | Unit Tests                                                             | Integration Tests                                                                                                                               | Regression Tests                                                                                                              | Provider Conformance                                                                        | Performance                                                                    | Lint Validation                                                                                                                                                                                                                   | Type Validation                     |
| ---- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 6A   | `registry.test.ts` (new)                                               | —                                                                                                                                               | Full existing suite green                                                                                                     | — (conformance suite ships in 6B)                                                           | —                                                                              | `npm run lint` clean, including the new Provider-boundary `no-restricted-imports` rule verified to not false-positive against the current tree (relocated here per Finding M-1)                                                   | `npm run build` (type-checks) clean |
| 6B   | `errors.test.ts`, `openrouter.test.ts` extended                        | —                                                                                                                                               | Full existing suite green                                                                                                     | `runProviderConformanceSuite()` run against `openrouter.ts` and the fake test-only provider | —                                                                              | Clean                                                                                                                                                                                                                             | Clean                               |
| 6C   | `routing.test.ts` (new)                                                | `route.ts` streaming path re-run end-to-end (existing `brain-gateway.test.ts`/`openrouter.test.ts` mocked-fetch harness, extended not replaced) | Full existing suite green                                                                                                     | Fake provider exercises Layer 2's match-found path                                          | —                                                                              | Clean                                                                                                                                                                                                                             | Clean                               |
| 6D   | `context-pipeline.test.ts` (new/ported), Prompt snapshot-equality test | `route.ts` streaming path re-run end-to-end after the Context Pipeline swap                                                                     | Full existing suite green, `context-manager.test.ts`/`personas-custom-routines.test.ts` called out for extra scrutiny (§19.4) | —                                                                                           | —                                                                              | Clean                                                                                                                                                                                                                             | Clean                               |
| 6E   | `memory-relevance.test.ts` extended (mocked RPC, dual-path merge/sort) | —                                                                                                                                               | Full existing suite green, `memory-relevance.test.ts` called out for extra scrutiny (§19.4)                                   | —                                                                                           | Backfill batch latency observed against real data volume before cutover (§5.5) | Clean                                                                                                                                                                                                                             | Clean                               |
| 6F   | `env-validation.test.ts` extended, correlation-ID threading test       | —                                                                                                                                               | Full existing suite green, `env-validation.test.ts` called out for extra scrutiny (§19.4)                                     | —                                                                                           | —                                                                              | Clean, including the newly-added Context/Prompt-Pipeline `no-restricted-imports` entries (the Provider-boundary rule itself was already validated in 6A, per Finding M-1) verified to not false-positive against the current tree | Clean                               |

**Regression gate (applies to every wave, Technical Design §19.4):** all 65 existing files in `tests/unit/` must remain green through every wave's merge — this is the explicit, non-negotiable backstop named in Definition of Done item 4 (§6).

**Performance testing note:** per this phase's own Explicit Non-Goals and the Roadmap's own phase boundaries, systematic load/latency benchmarking is Phase 8's responsibility (Production Hardening & Live Validation), not Phase 6's. The one exception planned here is 6E's backfill-batch latency observation (§5.5), which is a migration-safety check, not a Phase-8-style performance benchmark.

---

## 11. Implementation Governance

- **Implementation Report required after every wave.** Each wave (6A–6F) produces its own named Implementation Report (§3), documenting what was built, which tests passed, and confirming the Definition of Done (§6) checklist for that wave.
- **Independent Review required after every wave.** Consistent with this initiative's established precedent (every prior phase — Architecture Freeze, ADR Authoring, Technical Design — was followed by an independent review phase before the next phase began), each implementation wave is followed by review before the next wave's work starts. The Roadmap already names Phase 6.1 (Independent Implementation Review) as the review gate for the whole of Phase 6; nothing in this plan requires a review beyond what the Roadmap already schedules, but each wave's own PR review (§ Merge gate, below) is the wave-local instance of that same discipline.
- **Merge gate.** No wave's PR(s) merge to `main` until: the wave's Definition of Done (§6) is fully checked, its regression gate (§10) is green, and its PR has been reviewed and approved (DoD item 8).
- **Rollback gate.** No wave is considered complete until its rollback mechanism (§9) has been verified at least once in practice — not merely asserted in this document — before the next wave begins (DoD item 7).
- **No subsequent implementation wave may begin before the previous wave has:** completed review; passed testing (unit, applicable integration, and full regression); merged into `main`. This is the explicit sequential-gating rule this document adopts for the mandated `6A → 6B → 6C → 6D → 6E → 6F` order (§4), consistent with the Roadmap's own Phase 6 description.
- **PR strategy.** One PR per wave for 6A, 6B, 6C, 6E, and 6F's sub-areas (instrumentation / boot validation / lint / governance may each be their own PR within the 6F wave, per §5.6); Prompt Phase 2 within 6D is explicitly **one PR per channel adapter** (five PRs), per Technical Design §18's independent-revertibility requirement for that specific step.
- **Branch strategy.** Following this initiative's own established convention (every phase to date has used `feature/brain-gateway-<phase-or-wave-name>`), each wave's implementation branch is named `feature/brain-gateway-phase6<wave-letter>-<short-description>` (e.g. `feature/brain-gateway-phase6a-provider-registry`), with Prompt Phase 2's five adapter PRs branching as `feature/brain-gateway-phase6d-prompt-adapter-<channel-name>`.

---

## 12. Traceability Matrix

Gap → Architecture Freeze → ADR → Technical Design → Implementation Wave. Extends the Technical Design's own §20 matrix (itself independently reconstructed and confirmed identical in substance by Phase 4.1 §4) with a Wave column — no cell in the Gap/Freeze/ADR/Technical-Design columns is altered.

| Gap                                                      | Freeze     | ADR                                      | Technical Design                 | Implementation Wave                                                              |
| -------------------------------------------------------- | ---------- | ---------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------- |
| GAP-01 (unverified provider-neutrality)                  | §2.1       | ADR-0006                                 | §3, §4, §19.3                    | 6A (Registry/Descriptor), 6B (conformance suite closes it by construction)       |
| GAP-02 (no routing/registry exists)                      | §2.2       | ADR-0007                                 | §5                               | 6C                                                                               |
| GAP-03 (boot-time single-provider lock-in)               | §2.7       | ADR-0012                                 | §10                              | 6F                                                                               |
| GAP-04 (no tracing/metrics/logging)                      | §2.6       | ADR-0011                                 | §9                               | 6F                                                                               |
| GAP-05 (Context instance)                                | §2.3       | ADR-0008                                 | §6                               | 6D                                                                               |
| GAP-05 (Prompt instance)                                 | §2.5       | ADR-0010                                 | §8                               | 6D                                                                               |
| GAP-06 (four error shapes)                               | §2.1       | ADR-0006                                 | §3, §17.1                        | 6A, 6C (`PROVIDER_UNAVAILABLE`)                                                  |
| GAP-07 (per-site retry policy, provider vocabulary leak) | §2.1, §2.2 | ADR-0006 (primary), ADR-0007 (secondary) | §17.3                            | 6B (primary closure); 6C informs future retry-policy placement, no separate task |
| GAP-08 (cap/ranking coupling)                            | §2.4       | ADR-0009                                 | §7                               | 6E                                                                               |
| GAP-09 (two uncoordinated pipelines)                     | §2.3       | ADR-0008                                 | §6                               | 6D                                                                               |
| GAP-10 (boundaries hold by convention)                   | §2.8       | ADR-0013                                 | §11.1                            | **6A** (Provider-boundary rule relocated from 6F per Finding M-1)                |
| GAP-11 (DI applied in only 2 places)                     | §2.8, §2.9 | ADR-0013, ADR-0014                       | §11.1, §12                       | 6F                                                                               |
| GAP-12 (no governed Extension Model artifact)            | §2.9       | ADR-0014                                 | §12                              | 6F                                                                               |
| GAP-13 (no feature-flag/runtime-override mechanism)      | §2.7       | ADR-0012                                 | §10.3 (not designed, correctly)  | Not scheduled — activation-contingent, no wave plans it                          |
| GAP-14 (ADR-0003 header drift)                           | §2.9       | Already executed in Phase 3.2            | N/A                              | N/A — already resolved outside this initiative's implementation phases           |
| GAP-15 (undetermined workflow concept)                   | §2.8       | ADR-0013                                 | §11.2 (no new design, correctly) | Not scheduled — no new component authorized                                      |

**Coverage verdict:** all fifteen gaps (GAP-01 through GAP-15) trace through exactly one Freeze decision, at least one ADR, and (where applicable) a Technical Design section, to exactly one implementation wave or an explicit "not scheduled, activation-contingent/already-resolved" disposition. No gap is orphaned. No wave plans work for a gap that traces to no ADR. No orphaned implementation task exists anywhere in §5 that does not appear in this matrix's Wave column.

---

## 13. Milestone Checklist

### Phase 6A — Core Infrastructure

- [ ] `registry.ts` created, `CapabilitiesDescriptor` added to `types.ts`
- [ ] OpenRouter registered via the Registry at `gateway.ts` module load
- [ ] `registry.test.ts` passing
- [ ] Provider-boundary `no-restricted-imports` lint rule added (relocated here from 6F per Finding M-1)
- [ ] Full regression suite green
- [ ] Implementation Report completed; rollback verified; PR approved and merged

### Phase 6B — Provider Layer

- [ ] `529` relocated out of `errors.ts`'s shared retry list; OpenRouter-supplied override in place
- [ ] `runProviderConformanceSuite()` built; fake test-only provider authored
- [ ] `openrouter.ts` re-verified against the conformance suite
- [ ] Full regression suite green
- [ ] Implementation Report completed; rollback verified; PR approved and merged

### Phase 6C — Routing Engine

- [ ] `routing.ts` created; Layer 1/Layer 2 implemented per §5.2–5.3
- [ ] `PROVIDER_UNAVAILABLE` added; `gateway.ts` rewired to `routeRequest()`
- [ ] `routing.test.ts` passing; `resolvedBy === "task"` confirmed for all production traffic
- [ ] Full regression suite green
- [ ] Implementation Report completed; rollback verified; PR approved and merged

### Phase 6D — Context & Prompt

- [ ] `context-pipeline.ts` created; `route.ts` and `useContextManager` both migrated
- [ ] `context-pipeline.test.ts` passing (server/client output equality confirmed)
- [ ] Prompt Phase 1 complete; snapshot-equality test passing
- [ ] All five Prompt Phase 2 channel adapters migrated, in specified order, each its own PR
- [ ] Full regression suite green
- [ ] Implementation Report completed; rollback verified (Context + at least one adapter); PR(s) approved and merged

### Phase 6E — Memory

- [ ] Additive schema migration applied (`memories.embedding`, index, `match_memories` RPC)
- [ ] `getRelevantMemoriesForUser()` internals rewritten; dual-path merge implemented
- [ ] Backfill batch job running per the sizing/sequencing plan (§5.5)
- [ ] Cutover criteria met (or explicitly deferred with recorded reason)
- [ ] Full regression suite green
- [ ] Implementation Report completed; rollback verified; PR approved and merged

### Phase 6F — Operational & Governance

- [ ] `correlationId?` added; `withInstrumentation()` wrapping the Gateway's three functions
- [ ] `env-validation.ts` conditional boot check implemented
- [ ] Context/Prompt-Pipeline DI rules added to the `no-restricted-imports` template (post-6D; Provider-boundary rule itself already shipped in 6A per Finding M-1)
- [ ] `docs/brain-gateway-extension-model.md` authored, all three required sections present
- [ ] Full regression suite green
- [ ] Implementation Report completed; rollback verified; PR(s) approved and merged

### Phase 6.1 — Independent Implementation Review

- [ ] Implementation fidelity checked against Technical Design, ADRs, and Architecture Freeze for all six waves
- [ ] Interface correctness, architectural compliance, coding standards, and regression risk reviewed
- [ ] Implementation Review Report, Architecture Compliance Report, Code Quality Report, Regression Assessment produced

### Phase 7 — Integration Verification

- [ ] Every interaction point in the Roadmap's subsystem chain verified (API → Brain Gateway → Provider Registry → Routing Engine → Provider Adapter → Context Pipeline → Memory Pipeline → Prompt Composition → Response Validation → Cost Gate → Telemetry → Logging → Sentry → Avatar/TTS)
- [ ] Integration Report, Compatibility Matrix, Regression Report, Performance Baseline, Integration Summary produced
- [ ] No blocking integration issues

### Phase 8 — Production Hardening & Live Validation

- [ ] Live Traffic, Multi-Provider, Load, Soak, Chaos, Observability, Memory, Prompt, Context, Cost, Performance, Security, Real User Validation all completed
- [ ] Recovery Validation and Compatibility Validation completed
- [ ] Operational Success Metrics achieved or approved deviations documented
- [ ] Production Hardening Report and all named sub-reports produced

### Phase 8.1 — Independent Production Readiness Review

- [ ] Implementation quality, operational readiness, performance, reliability, observability, maintainability, operational risk, documentation, deployment readiness, and rollback readiness reviewed
- [ ] Go/No-Go Report produced with an explicit GO / GO WITH CONDITIONS / NO GO verdict

---

## 14. Planning Validation

- **No implementation work missing.** Every Technical Design section (§3–§12 of the Technical Design) is assigned to exactly one wave in §12's Traceability Matrix; every ADR (0006–0014) has at least one implementation task in §5; no ADR's Decision text names a component absent from §3/§5.
- **No duplicated implementation.** Each interface named in Technical Design §13 appears as a task in exactly one wave in §5 (cross-checked against §12's Wave column, one wave per Gap/ADR pairing except where an ADR is explicitly shared across two waves — GAP-06/GAP-07's Provider/Routing split, which mirrors the Technical Design's own dual-ADR citation, not a duplication).
- **No undocumented dependency.** Every dependency in §4's graph is individually verified with its evidentiary source in §7; no dependency is asserted without a citation to an ADR's or the Technical Design's own text.
- **No circular dependency.** Confirmed explicitly in §4 — every arrow points in one direction, and no wave depends, directly or transitively, on a wave that depends on it.
- **No architecture drift.** No task in §5 introduces an interface, component, or behavior beyond what Technical Design §3–§12 already specifies. Where this document made a sequencing decision the Technical Design itself left open (Routing Engine's wave placement, §2/§3 footnote; the Memory backfill's concrete sizing, §5.5), the decision is scoped to _when/how_ implementation proceeds, never to _what_ is built — no ADR's Decision, Alternatives Considered, or Consequences text is contradicted, narrowed, or expanded by any choice in this document.
- **No ADR drift.** No ADR is modified, reinterpreted, or superseded by this document — all nine remain `Status: Accepted`, unmodified.
- **No Technical Design drift.** No Technical Design section's design decision is altered; this document only sequences, decomposes, and tests-plans decisions Technical Design already made.

---

## 15. Phase 5 Conclusion

**Implementation planning is complete.** Every Technical Design section has an assigned implementation wave (§12); every wave has a decomposed task list in dependency order (§5), a Definition of Done (§6), a verified rollback strategy (§9), and a testing plan (§10); the implementation dependency graph is internally consistent with no circular dependency (§4, §14); every dependency is independently validated against its ADR or Technical Design source (§7); risks are identified with named mitigations for technical, implementation, operational, and regression categories (§8); implementation governance establishes a strict sequential-gating rule with a Merge gate and a Rollback gate (§11); the traceability matrix contains no orphaned gap, ADR, Technical Design section, or implementation task (§12); the one deliverable Technical Design and its governing ADR (ADR-0009) explicitly deferred to this phase — the Memory backfill's sizing and sequencing — has been produced (§5.5).

**Recommendation: Ready for Phase 6.** The implementation team can begin Phase 6A (Core Infrastructure) immediately using only this document, in conjunction with the Technical Design it plans against, without making any further architectural decision. This document, per the Roadmap's own governance rule, must not be treated as authorizing Phase 6 to begin until it has itself been reviewed and approved — the next phase per the Roadmap is **Phase 5.1 — Independent Implementation Planning Review**, which this document's own finalization tasks route to.

---

## 16. Explicit Non-Goals Confirmation

Per the Phase 5 spec, this document does not implement anything, does not write production code, does not modify any architecture, does not modify any ADR, does not modify the Technical Design, does not estimate implementation duration without evidence, and does not introduce any new technology or interface. Every interface, schema fragment, and file path named in §3–§13 is drawn directly from the Technical Design (§3–§12) or an ADR's own text — none is invented by this document. Where this document names a concrete parameter this phase is explicitly responsible for sizing (the Memory backfill's batch size and cutover criteria, §5.5), that sizing is an operational/sequencing parameter, not an architectural or interface decision — no schema, RPC signature, or function signature named in Technical Design §7 is altered by it. No calendar-time duration is assigned to any wave or task anywhere in this document. Confirmed: only `docs/phase5-brain-gateway-implementation-planning.md` is added by this branch — no file under `src/`, `supabase/`, or `eslint.config.mjs` is modified.

## 17. Success Criteria Checklist

- [x] Every planned activity originates from the Architecture Freeze, an Accepted ADR, or the Technical Design (§2)
- [x] Every implementation wave (6A–6F) has complete planning: scope, expected outputs, dependencies, risks, rollback boundary (§3, §5)
- [x] An implementation dependency graph exists, is internally consistent, and every dependency is independently validated (§4, §7)
- [x] Every wave has a Definition of Done (§6)
- [x] A complete risk register exists across technical, implementation, schedule, operational, and regression categories, each with a mitigation (§8)
- [x] A rollback strategy exists for every wave, partial implementation, failed deployment, failed migration, and failed integration, with independent rollback boundaries (§9)
- [x] A testing strategy exists per wave covering unit, integration, regression, provider-conformance, performance (where applicable), lint, and type validation (§10)
- [x] Implementation governance defines Implementation Report, Independent Review, Merge gate, and Rollback gate requirements, with a sequential no-overlap rule (§11)
- [x] A traceability matrix exists from Gap → ADR → Technical Design → Implementation Wave with no orphaned item (§12)
- [x] A milestone checklist exists for every wave and every subsequent Roadmap phase through 8.1 (§13)
- [x] Planning validation confirms no missing work, no duplication, no undocumented dependency, no circular dependency, no architecture/ADR/Technical Design drift (§14)
- [x] A final Phase 5 conclusion and Phase 6 readiness recommendation has been issued (§15)
