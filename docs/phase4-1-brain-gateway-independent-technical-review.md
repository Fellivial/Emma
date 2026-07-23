# Emma Brain Gateway — Phase 4.1: Independent Technical Review

## Document Status

- Roadmap: [Brain Gateway Roadmap v1.0 (Frozen)](roadmaps/brain-gateway-roadmap-v1.md)
- Phase: Phase 4.1 — Independent Technical Review (review-of-the-review)
- Type: **Review-only.** This document validates that the Phase 4 Technical Design is technically complete, architecturally faithful, internally consistent, implementation-ready, and fully traceable to the approved ADR set (0006–0014). It does not redesign the system, does not modify any ADR, does not modify the Phase 3.1 Architecture Freeze, and does not re-perform Technical Design. Four narrow, mechanical documentation-fidelity corrections were applied directly to the Phase 4 document during this review (§11, Corrections Applied), consistent with the precedent set by every prior independent review in this initiative (Phase 0, 1, 2, 3, and 3.3 all applied mechanical corrections to their own subject documents rather than merely recording the finding).
- Reviews: [`docs/phase4-brain-gateway-technical-design.md`](phase4-brain-gateway-technical-design.md) (the Phase 4 deliverable, merged to `main` via PR #156 prior to this review beginning).
- Branch: `feature/brain-gateway-phase4-1-independent-technical-review`
- Performed by: an independent pass instructed to verify every technical claim in Phase 4 against the ADRs, the Architecture Freeze, and the repository directly — not to trust Phase 4's own citations or word counts at face value. Every factual claim below was re-derived from the repository with `Grep`/`Read`/`Bash`, not copied from Phase 4's prose.

This document contains the review's required deliverables as numbered sections:

1. Independent Technical Review Report
2. ADR Compliance Matrix (Artifact A) / ADR Compliance Report
3. Deferred Resolution Matrix (Artifact B) / Deferred Resolution Report
4. Technical Traceability Matrix (Artifact C) — independently reconstructed
5. Architecture Drift Assessment (Artifact D)
6. Interface Coverage Matrix (Artifact E) / Interface Consistency Report
7. Implementation Readiness Matrix (Artifact F) / Implementation Readiness Assessment
8. Documentation Integrity Report
9. Repository Consistency Report
10. Sequence Diagram Validation
11. Corrections Applied Log
12. Review Summary
13. Review Limitations (Artifact G)
14. Explicit Non-Goals Confirmation
15. Success Criteria Checklist

---

## 1. Independent Technical Review Report

### 1.1 Executive Summary

The Phase 4 Technical Design is a substantively faithful, complete, and implementation-ready translation of the nine Accepted ADRs (0006–0014). Every ADR has at least one corresponding Technical Design section (§2 below); every section's decisions were checked against its governing ADR's own "Deferred considerations" and "Consequences" text and found to resolve exactly the questions those ADRs assigned to Technical Design, without silently reinterpreting, narrowing, or expanding any approved decision (§5, Architecture Drift Assessment). Every deferred item across all nine ADRs is either correctly resolved or correctly re-deferred with justification (§3, Deferred Resolution Matrix) — no deferred item was left silently unresolved, and no new deferred item appears without a stated reason. An independently reconstructed Gap→Freeze→ADR→Technical-Design matrix (§4), built directly from Phase 2's own Gap Register rather than copied from Phase 4's matrix, contains no orphaned gap, ADR, or Technical Design section.

**Four Minor findings were identified, all documentation-fidelity gaps in Phase 4's baseline-review section (§1) — none touched an architectural decision, an interface, or a design choice.** All four have been corrected directly in this review (§11): (1) the dependency-graph file count in §1.2 undercounted actual Brain-Gateway-reachable call sites (claimed 15, only 14 listed, 16 confirmed by direct repository grep); (2) §1.4's dependency-inversion precedent claim overstated `CostGateDependencies` as "the only other place" using DI, when `McpTransportDependencies` (`src/core/integrations/mcp-client.ts`) is a second, independently-verified instance of the same pattern; (3) §1.6's test-file count undercounted by 2 (claimed 63, actual 65); (4) §5.3's resolution of ADR-0007's "no match, pass through" deferred item did not explicitly engage the phrase's alternate (graceful-degradation) reading before selecting hard-failure — a design-rationale completeness gap, not a wrong decision.

**No Critical or Major finding was identified. No architectural drift was detected anywhere in the Technical Design (§5). Recommendation: Approved with Minor Revisions — the Technical Design, as corrected, is Ready for Implementation Planning (Phase 5), pending the user's review and approval of this Pull Request.**

### 1.2 Review Scope

Reviewed in full: the frozen roadmap (Phase 4/4.1 sections re-read as authoritative), the complete [Phase 3.1 Architecture Freeze](phase3-1-brain-gateway-architecture-freeze.md), the complete [Phase 3.2 ADR Authoring](phase3-2-brain-gateway-adr-authoring.md) summary, the complete [Phase 3.3 ADR Independent Review](phase3-3-adr-independent-review.md), ADR-0003 and all nine ADRs (0006–0014) in full, and the complete Phase 4 Technical Design document (24 sections). Independently re-run against the repository: a direct count of files importing `@/core/brain/gateway` or `@/lib/embeddings` (`Grep` across `src/`); a direct count of `tests/unit/*.test.ts` files; a direct search for `interface *Dependencies` patterns across `src/` (dependency-inversion precedent audit); a direct read of `match_document_chunks`'s full SQL body (pgvector precedent fidelity check); a direct search for `AsyncLocalStorage` usage; a direct check of `node_modules` for `eslint-plugin-import`/`eslint-plugin-boundaries` and of `eslint-config-next/core-web-vitals` for a bundled import-boundary rule; a direct read of `PRODUCTION_REQUIRED_ENV`'s exact entry count; a direct read of `SystemBlock`'s type definition; an existence check on every ADR/doc file the Technical Design links to; a direct read of Phase 2's own Gap Register (§16, `phase2-brain-gateway-gap-analysis.md`) to independently reconstruct the traceability matrix rather than reuse Phase 4's.

### 1.3 Validation Methodology

For every Technical Design claim carrying a specific repository citation, file count, or "the only place" assertion, the underlying repository state was read directly — not assumed correct because Phase 4 stated it with confidence, the same standard every prior independent review in this initiative applied to its own subject. Design decisions were evaluated for fidelity to their governing ADR's Decision, Alternatives Considered, and Deferred Considerations text, **not** re-graded or replaced with this review's own architectural preferences — this review does not select or redesign an architecture, does not introduce a new interface, and does not change any Technical Design decision beyond the four mechanical/clarifying corrections detailed in §11.

### 1.4 Evidence Summary

Twenty-two concrete claims were independently checked against the repository or against the governing ADRs' exact wording. **18 MATCH exactly; 4 required the corrections detailed in §11.**

| #   | Claim checked                                                                                                                                                               | Verdict                                                                                                                                                                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Every one of the 9 ADRs has at least one corresponding Technical Design section                                                                                             | MATCH (§2 below)                                                                                                                                                                                                                                                               |
| 2   | Every Technical Design section's concrete decision resolves a question its governing ADR explicitly deferred, without contradicting that ADR's Decision text                | MATCH (§3 below)                                                                                                                                                                                                                                                               |
| 3   | `gateway.ts` exports exactly `brainChat`, `brainChatStream`, `brainEmbed`, `isBrainConfigured` plus re-exported types, with one module-level `provider` const               | MATCH (direct read of `src/core/brain/gateway.ts`)                                                                                                                                                                                                                             |
| 4   | `BrainProvider` is a four-method interface (`name`, `isConfigured`, `chat`, `chatStream`, `embed`)                                                                          | MATCH (direct read of `src/core/brain/types.ts`)                                                                                                                                                                                                                               |
| 5   | `embeddings.ts` already routes through `brainEmbed`, not a forked integration                                                                                               | MATCH (direct read of `src/lib/embeddings.ts:2,13`)                                                                                                                                                                                                                            |
| 6   | `document_chunks`'s `match_document_chunks` RPC uses `1 - (embedding <=> query_embedding) as similarity` and `order by embedding <=> query_embedding`                       | MATCH (full SQL body read, `supabase/schema.sql:1168-1193`) — Phase 4's `match_memories` design mirrors this exactly                                                                                                                                                           |
| 7   | `PRODUCTION_REQUIRED_ENV` contains exactly 13 entries including `OPENROUTER_API_KEY` unconditionally                                                                        | MATCH (direct read of `src/core/env-validation.ts:15-29`)                                                                                                                                                                                                                      |
| 8   | No `AsyncLocalStorage`/`async_hooks` usage exists anywhere in `src/`                                                                                                        | MATCH (repository-wide grep, zero matches)                                                                                                                                                                                                                                     |
| 9   | No `eslint-plugin-boundaries` or `eslint-plugin-import` is present, even transitively via `eslint-config-next`                                                              | MATCH (`node_modules` existence check both absent)                                                                                                                                                                                                                             |
| 10  | `SystemBlock` is `{ type: "text"; text: string }`, matching Phase 4 §8's usage                                                                                              | MATCH (direct read of `src/core/personas.ts:148-151`)                                                                                                                                                                                                                          |
| 11  | Every ADR/roadmap/phase-doc file Phase 4 links to exists at the stated path                                                                                                 | MATCH (14 files checked, all present)                                                                                                                                                                                                                                          |
| 12  | `openrouter.ts`'s `normalizeHttpError` already maps `529` locally; `errors.ts`'s shared `DEFAULT_RETRY.retryOn` still contains `529`                                        | MATCH — confirms Phase 4 §17.3's GAP-07 fix (relocating `529` out of the shared retry list) targets a real, currently-still-present instance of provider vocabulary in nominally-shared code                                                                                   |
| 13  | 15 files import from `@/core/brain/gateway` or `@/lib/embeddings`, as listed in Phase 4 §1.2                                                                                | **DISCREPANCY** — only 14 files were listed by name against a claimed count of 15, and a direct repository grep found 16 real files, omitting `ingest/document/route.ts` and `src/inngest/functions.ts` (Finding Min-1; corrected in this review, §11)                         |
| 14  | `CostGateDependencies` is "the only other place in the Application Layer using dependency inversion" (Phase 4 §1.4)                                                         | **DISCREPANCY** — `McpTransportDependencies` (`src/core/integrations/mcp-client.ts:46-49`) is a second, real DI-shaped interface (Finding Min-2; corrected in this review, §11)                                                                                                |
| 15  | "63 existing test files in `tests/unit/`" (Phase 4 §1.6)                                                                                                                    | **DISCREPANCY** — direct count is 65 (Finding Min-3; corrected in this review, §11)                                                                                                                                                                                            |
| 16  | ADR-0007's "no match, pass through" deferred item is resolved without ambiguity in Phase 4 §5.3                                                                             | **DISCREPANCY** — the phrase admits two readings (absent-layer passthrough vs. active-layer-no-match behavior); Phase 4's original text selected hard-failure for the second reading without naming the alternative it rejected (Finding Min-4; corrected in this review, §11) |
| 17  | Every "Changed" interface row in Phase 4 §13 is additive only (no removed/retyped/required field)                                                                           | MATCH (verified against `brain/types.ts` and `env-validation.ts`'s current shapes)                                                                                                                                                                                             |
| 18  | The Provider Registry (§3) is not a Runtime Configuration Store in disguise (i.e., does not contradict ADR-0012's deferral of that candidate)                               | MATCH — Registry is boot-populated and immutable after boot; no runtime add/remove is specified anywhere in §3                                                                                                                                                                 |
| 19  | `no-restricted-imports`'s `patterns`-with-`group`/`message` object form is valid ESLint flat-config syntax                                                                  | MATCH (core rule, documented option shape, requires no plugin)                                                                                                                                                                                                                 |
| 20  | The `ignores: ["src/core/brain/**"]` block in Phase 4 §11.1 only exempts that one config object's rule, not the base `eslint-config-next` rules, for files under `brain/**` | MATCH (flat-config semantics: `ignores` scopes only the object it appears in)                                                                                                                                                                                                  |
| 21  | Sequence diagrams (§15) are consistent with the interfaces they depict (`correlationId` on request types, `resolvedBy` on routing results, Sentry span wrapping)            | MATCH (§10 below)                                                                                                                                                                                                                                                              |
| 22  | Migration steps (§18) contain no step that depends on a later step (no forward dependency violation)                                                                        | MATCH (§ Migration Strategy Review, folded into §9 below — no step requires a component introduced by a later-numbered step)                                                                                                                                                   |

### 1.5 Final Recommendation

See §12.4. **Approved with Minor Revisions.**

---

## 2. ADR Compliance Matrix (Artifact A) / ADR Compliance Report

| Technical Design section         | Referenced ADR | Decision alignment                                                                                                                          | Terminology consistency                                                                                        | Design fidelity                                                                                                                                                                                |
| -------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §3 Provider Registry             | ADR-0006       | Aligned — Registry as a per-request-queryable, boot-populated lookup, not a runtime store                                                   | Uses "Registry," "lookup," "queryable" exactly as ADR-0006                                                     | Faithful — `BrainProvider` interface untouched, Registry sits around it per ADR-0006's own framing                                                                                             |
| §4 Capability Descriptor         | ADR-0006       | Aligned — resolves the deferred schema-shape question without altering "that a descriptor exists"                                           | Uses "Capabilities Descriptor," "field granularity" exactly as ADR-0006                                        | Faithful — boolean-per-capability choice explicitly justified against ADR-0006's own named risk ("too coarse... too fine")                                                                     |
| §5 Routing Engine                | ADR-0007       | Aligned — Layer 1 unchanged, Layer 2 present-but-inert, Layer 3 explicitly not designed                                                     | Uses "Layered Routing," "task→capability→policy," "no match, pass through" verbatim from ADR-0007              | Faithful, with one rationale-completeness gap corrected in this review (§11, Finding Min-4)                                                                                                    |
| §6 Context Pipeline              | ADR-0008       | Aligned — single new owner supersedes both `context-manager.ts` and `route.ts`'s cap, per ADR-0008's Decision                               | Uses "Centralized Context Pipeline," "GAP-09 closed by construction" exactly as ADR-0008                       | Faithful — reconciliation choice (token-budget as primary, message-count as floor) does not reopen ADR-0008's own selection of centralization over the Federated/Gateway-Adjacent alternatives |
| §7 Memory Ranking                | ADR-0009       | Aligned — database-side ranking via schema addition, signature of `getRelevantMemoriesForUser()` preserved                                  | Uses "Database-Side Ranking Infrastructure" exactly as ADR-0009                                                | Faithful — models the _already-shipped_ `document_chunks` precedent (verified §1.4 claim 6), not a novel mechanism; correctly does not size/sequence the backfill (ADR-0009's own non-goal)    |
| §8 Prompt Composition            | ADR-0010       | Aligned — Centralized end-state via the Layered migration path, composable-fragment technique for adapters                                  | Uses "Centralized Prompt Composition," "Layered migration path," "composable fragments" exactly as ADR-0010    | Faithful — Phase 1 (`personas.ts` internal split) precedes Phase 2 (5 channel adapters), matching ADR-0010's own sequencing                                                                    |
| §9 Operational Instrumentation   | ADR-0011       | Aligned — Gateway-boundary instrumentation + narrow correlation-ID contract, built on existing Sentry dependency                            | Uses "correlation-ID contract," "narrowed... not full per-layer structured-event emission" exactly as ADR-0011 | Faithful — no new observability platform introduced, matching ADR-0011's explicit rejection of the OpenTelemetry-in-full alternative                                                           |
| §10 Configuration                | ADR-0012       | Aligned — conditional boot validation; Runtime Store/Feature Flags correctly left undesigned                                                | Uses "Provider-Conditional Boot Validation" exactly as ADR-0012                                                | Faithful — §10.3 explicitly declines to design the two deferred candidates, matching ADR-0012's own instruction that they activate only when contingent conditions are met                     |
| §11 Extension Model (lint rules) | ADR-0013       | Aligned — static boundary enforcement + tooling-enforced DI, same mechanism for both (satisfies ADR-0013's own internal-consistency driver) | Uses "static enforcement," "tooling-enforced DI" exactly as ADR-0013                                           | Faithful — §11.1C (runtime assertion) and workflow-orchestration-layer alternatives correctly left undesigned                                                                                  |
| §12 Governance                   | ADR-0014       | Aligned — documented artifact, `no-restricted-imports` DI rule as its forcing function                                                      | Uses "documented, versioned Extension Model artifact," "forcing function" exactly as ADR-0014                  | Faithful — artifact content deliberately deferred to Phase 6 authoring, matching ADR-0014's own framing that a governance document should describe lived experience, not precede it            |

**No Technical Design section lacks a governing ADR reference. No section's decision contradicts its governing ADR's Decision, Alternatives Considered, or Consequences text.**

---

## 3. Deferred Resolution Matrix (Artifact B) / Deferred Resolution Report

| ADR Deferred Item                                                    | Technical Resolution                                                                                             | Status                                                                               | Evidence           |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------ |
| ADR-0006: Capabilities Descriptor schema shape (field granularity)   | Boolean-per-capability + one numeric field (`contextWindowTokens`), provider-level                               | **Resolved**                                                                         | Phase 4 §4.1       |
| ADR-0007: layer-to-layer "no match, pass through" interface contract | `routeRequest` returns `null` on Layer-2 no-match; caller raises `PROVIDER_UNAVAILABLE`                          | **Resolved** (rationale clarified in this review, §11 Finding Min-4)                 | Phase 4 §5.3       |
| ADR-0007: Layer 3 (Policy Routing)                                   | Not designed — no interface, no placeholder field                                                                | **Correctly re-deferred** (ADR-0003's Out-of-Scope classification not yet revisited) | Phase 4 §5.4       |
| ADR-0008: exact token-budget reconciliation semantics                | Converges on the token-budget model; message-count demoted to a floor, not a competing cap                       | **Resolved**                                                                         | Phase 4 §6.1       |
| ADR-0009: migration sizing/sequencing (backfill)                     | Not sized — only the dual-path query _behavior_ during an unspecified backfill window is specified               | **Correctly re-deferred** to Phase 5, per ADR-0009's own non-goal                    | Phase 4 §7.3       |
| ADR-0010: base/adapter fragment boundary                             | Named fragment functions (Phase 1) + `ChannelAdapter` interface + explicit per-channel migration order (Phase 2) | **Resolved**                                                                         | Phase 4 §8.2–8.3   |
| ADR-0011: correlation-ID's precise propagation contract              | Explicit optional string parameter on `BrainChatRequest`/`BrainEmbedRequest`, not ambient context                | **Resolved**                                                                         | Phase 4 §9.1       |
| ADR-0012: Runtime Configuration Store, Feature-Flag Layer            | Not designed — no interface                                                                                      | **Correctly re-deferred**, activation-contingent per ADR-0012                        | Phase 4 §10.3      |
| ADR-0013: concrete lint rule set                                     | `no-restricted-imports` core rule, applied first to the Provider boundary, as a template for future boundaries   | **Resolved**                                                                         | Phase 4 §11.1      |
| ADR-0013: §11.1C runtime-assertion defense-in-depth                  | Not designed                                                                                                     | **Correctly re-deferred**, optional per ADR-0013                                     | Phase 4 §11.3      |
| ADR-0014: artifact's concrete file location and format               | `docs/brain-gateway-extension-model.md`, plain markdown, three required sections                                 | **Resolved** (location/format only; content authoring correctly deferred to Phase 6) | Phase 4 §12.1–12.2 |

**Verdict:** every deferred item across all nine ADRs is accounted for as either Resolved or Correctly re-deferred with a stated activation condition. No deferred item was silently dropped. No new deferred item appears without justification — every re-deferral cites the same condition its governing ADR already named (a second provider, Routing Layer 2/3 activation, a revisited ADR-0003 scope decision), not a newly invented one.

---

## 4. Technical Traceability Matrix (Artifact C) — Independently Reconstructed

Reconstructed directly from Phase 2's own Gap Register (`docs/phase2-brain-gateway-gap-analysis.md` §16, read in full for this review — not copied from Phase 4's own §20 matrix), cross-checked against it only after independent construction.

| Gap (Phase 2 Register, verbatim ID)                      | Architecture Freeze decision                           | ADR                    | Technical Design section                   | Orphan?                                  |
| -------------------------------------------------------- | ------------------------------------------------------ | ---------------------- | ------------------------------------------ | ---------------------------------------- |
| GAP-01 (unverified provider-neutrality)                  | §2.1 Registry + Descriptor                             | ADR-0006               | §3, §4, §19.3 (conformance suite)          | No                                       |
| GAP-02 (no routing exists)                               | §2.2 Layered Routing                                   | ADR-0007               | §5                                         | No                                       |
| GAP-03 (boot-time lock-in)                               | §2.7 Conditional Boot Validation                       | ADR-0012               | §10                                        | No                                       |
| GAP-04 (no tracing/metrics/logging)                      | §2.6 Gateway-centralized instrumentation               | ADR-0011               | §9                                         | No                                       |
| GAP-05 (Context instance)                                | §2.3 Centralized Context Pipeline                      | ADR-0008               | §6                                         | No                                       |
| GAP-05 (Prompt instance)                                 | §2.5 Centralized Prompt Composition                    | ADR-0010               | §8                                         | No                                       |
| GAP-06 (four error shapes)                               | §2.1 Adapter Layer                                     | ADR-0006               | §3, §17.1                                  | No                                       |
| GAP-07 (per-site retry policy, provider vocabulary leak) | §2.1 Adapter Layer (primary), §2.2 Routing (secondary) | ADR-0006, ADR-0007     | §17.3                                      | No                                       |
| GAP-08 (cap/ranking coupling)                            | §2.4 Database-Side Ranking                             | ADR-0009               | §7                                         | No                                       |
| GAP-09 (two uncoordinated pipelines)                     | §2.3 Centralized Context Pipeline                      | ADR-0008               | §6                                         | No                                       |
| GAP-10 (boundaries hold by convention)                   | §2.8 Static boundary enforcement                       | ADR-0013               | §11.1                                      | No                                       |
| GAP-11 (DI applied in only 2 places)                     | §2.8 Tooling-enforced DI, §2.9 Extension Model         | ADR-0013, ADR-0014     | §11.1, §12                                 | No                                       |
| GAP-12 (no governed Extension Model artifact)            | §2.9 Documented artifact                               | ADR-0014               | §12                                        | No                                       |
| GAP-13 (no feature-flag/runtime-override mechanism)      | §2.7 accepted-in-principle, deferred                   | ADR-0012               | §10.3 (explicitly not designed, correctly) | No — deferred, not orphaned              |
| GAP-14 (ADR-0003 header drift)                           | Governance action item, closed in Phase 3.2            | N/A (already executed) | N/A                                        | No — already resolved outside this phase |
| GAP-15 (undetermined workflow concept)                   | §2.8 Agent-loop extension, no new component            | ADR-0013               | §11.2 (no new design, correctly)           | No                                       |

**Coverage verdict:** all fifteen gap IDs (GAP-01 through GAP-15) trace through exactly one Freeze decision to at least one ADR and, where applicable, to a Technical Design section. No orphaned Gap, ADR, or Technical Design section exists. This independently-reconstructed matrix is identical in substance to Phase 4's own §20 — the reconstruction found no cell the two matrices disagree on, which is itself a positive fidelity finding (unlike Phase 3.3's independent reconstruction, which did surface one disagreement before correction).

**Scope note (see also §13, Review Limitations):** Phase 2's own Gap Register describes GAP-05 as recurring across _five_ subsystems — prompt construction, behavior derivation, context management, rate/usage limiting, and error representation — but only two of those five (Context, Prompt) were ever carried into Phase 3 Discovery, the Freeze, and an ADR. This is a Phase 3/3.1 domain-scoping decision, already several phases settled (the Freeze's own §4 explicitly states "GAP-05 appears twice... matching how Phase 3 itself split it"), and is out of bounds for a review of Phase 4 Technical Design specifically — it is not a Phase 4 omission, and not re-litigated here.

---

## 5. Architecture Drift Assessment (Artifact D)

Explicit check, per Technical Design section, for refinement, redesign, expansion, narrowing, or terminology drift relative to the governing ADR's exact Decision text.

| Section                        | Classification        | Explanation                                                                                                                                                                                                                                                              |
| ------------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| §3 Provider Registry           | None                  | Elaborates _how_ the Registry is structured/initialized; does not change _that_ a Registry exists or what it composes with                                                                                                                                               |
| §4 Capability Descriptor       | None                  | Resolves an explicitly-named open question (field granularity); does not add a capability concept ADR-0006 did not already name                                                                                                                                          |
| §5 Routing Engine              | Editorial (corrected) | The hard-fail resolution of "no match" is a legitimate Technical Design choice within ADR-0007's scope, but the original text did not name the alternate reading it rejected — a rationale-completeness gap, not an architectural change. Corrected in this review (§11) |
| §6 Context Pipeline            | None                  | Reconciliation decision resolves an explicitly-deferred question; does not reopen ADR-0008's own rejection of the Federated/Gateway-Adjacent candidates                                                                                                                  |
| §7 Memory Ranking              | None                  | Schema/RPC design mirrors an _already-shipped_ repository precedent (`document_chunks`); introduces no new architectural pattern beyond what ADR-0009 already named (database-side ranking)                                                                              |
| §8 Prompt Composition          | None                  | Fragment model and channel-adapter interface implement ADR-0010's own named technique (composable fragments) and sequencing (Layered migration path) without adding a channel or fragment concept ADR-0010 did not name                                                  |
| §9 Operational Instrumentation | None                  | Correlation-ID-as-explicit-parameter is a concrete resolution of an explicitly-deferred propagation-mechanism question; introduces no new observability platform (Sentry only, per ADR-0011)                                                                             |
| §10 Configuration              | None                  | Conditional boot-validation logic is the concrete form of ADR-0012's own Decision text; the module-ordering constraint (§10.2) is an implementation-detail safeguard, not a new architectural boundary                                                                   |
| §11 Extension Model (lint)     | None                  | `no-restricted-imports` is a mechanism choice for an explicitly-deferred "concrete lint rule set" question; does not expand enforcement beyond the Provider boundary ADR-0013 already scoped as the domain example                                                       |
| §12 Governance                 | None                  | Location/format/required-sections resolve an explicitly-deferred question; content authoring is correctly left to Phase 6, not performed here                                                                                                                            |

**No new architecture, architectural pattern, architectural responsibility, or architectural boundary was introduced anywhere in the Technical Design.** The one Editorial-classified item (§5's rationale-completeness gap) has been corrected additively (§11) and does not represent drift in the technical decision itself — the decision (hard-fail on unsatisfied hard capability requirements) was already consistent with ADR-0007's own "hard capability requirements" language before this review's clarification; only the stated rationale was incomplete.

---

## 6. Interface Coverage Matrix (Artifact E) / Interface Consistency Report

| Interface                                                                                        | Specified (§13)?          | Referenced elsewhere in the doc?                                      | Used consistently?                                                                                                             |
| ------------------------------------------------------------------------------------------------ | ------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `CapabilitiesDescriptor`                                                                         | Yes                       | §3.3 (validation), §4.1–4.4, §5.3 (`Partial<CapabilitiesDescriptor>`) | Yes — same six-field shape throughout                                                                                          |
| `BrainChatRequest.correlationId?` / `BrainEmbedRequest.correlationId?`                           | Yes                       | §9.1–9.2, §15.1 sequence diagram                                      | Yes — additive optional field, never treated as required                                                                       |
| `BrainRequestError.code: "PROVIDER_UNAVAILABLE"`                                                 | Yes                       | §5.3, §15.2, §17.1–17.2                                               | Yes — `retryable: false` stated once (§17.1), not contradicted elsewhere                                                       |
| `ProviderRegistry` / `RegisteredProvider` / `createProviderRegistry`                             | Yes                       | §3.1–3.5, §5.2–5.3, §14.1, §15.3                                      | Yes — same method set (`register`, `get`, `getConfigured`, `findByCapability`, `list`) used identically in every reference     |
| `RoutingRequest` / `RoutingResult` / `routeRequest`                                              | Yes                       | §5.1–5.5, §15.2, §17.2                                                | Yes — `resolvedBy` field used consistently as the "which layer is live" signal ADR-0007 requires                               |
| `ContextPipeline` / `ContextPipelineOptions` / `ContextPipelineResult` / `createContextPipeline` | Yes                       | §6.2–6.5, §14.1, §15.4, §19.1                                         | Yes                                                                                                                            |
| `getRelevantMemoriesForUser()`                                                                   | Yes (unchanged signature) | §7.2, §13, §18.1                                                      | Yes — every reference confirms signature preservation, none proposes a signature change                                        |
| `PromptFragment` / `composePrompt` / `ChannelAdapter`                                            | Yes                       | §8.1–8.4, §14.1, §15.5, §19.1                                         | Yes                                                                                                                            |
| `EnvironmentIssueReason` (+`"no_provider_configured"`)                                           | Yes                       | §10.1, §13                                                            | Yes                                                                                                                            |
| `no-restricted-imports` rule block                                                               | Yes                       | §11.1, §14.1                                                          | Yes — the exact same rule mechanism named as the template for both boundary and DI enforcement, no second mechanism introduced |

**No interface is referenced without being specified in §13. No interface is specified without being used at least once elsewhere in the document. No two references to the same interface conflict in naming, field shape, or ownership.** Dependency direction is stated once per interface (§14.2) and not contradicted by any per-domain section. Version compatibility: every new field is optional or a new union member (verified directly against current `types.ts`/`env-validation.ts` shapes, §1.4 claim 17) — no lifecycle or breaking-change concern was found.

---

## 7. Implementation Readiness Matrix (Artifact F) / Implementation Readiness Assessment

| Subsystem                                   | Readiness                           | Justification                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Provider Registry (ADR-0006)                | **Ready**                           | Structure, lifecycle, registration validation, and lookup are fully specified (§3); no open question remains                                                                                                                                                                                                                                     |
| Capabilities Descriptor (ADR-0006)          | **Ready**                           | Schema shape resolved with explicit rationale (§4); OpenRouter's own descriptor values are illustrated (§4.3) without requiring further design                                                                                                                                                                                                   |
| Routing Engine (ADR-0007)                   | **Ready**                           | Layer 1/2 fully specified including the no-match contract (§5, clarified §11); Layer 3 correctly left undesigned, not blocking Phase 6 (its absence is itself the specified state)                                                                                                                                                               |
| Context Pipeline (ADR-0008)                 | **Ready**                           | Reconciliation semantics resolved (§6.1); stages, callers, and extensibility point fully specified                                                                                                                                                                                                                                               |
| Memory Ranking (ADR-0009)                   | **Ready with Minor Clarifications** | Schema/RPC/interface fully specified (§7.1–7.2); the dual-path migration _behavior_ is specified but its _sizing/sequencing_ (backfill batch size, timeline) is correctly left to Phase 5 (Implementation Planning) per ADR-0009's own scope — this is not a Technical Design gap, but Phase 5 must not skip sizing this before Phase 6.9 begins |
| Prompt Composition (ADR-0010)               | **Ready**                           | Fragment model, phased migration order, and channel-adapter interface fully specified (§8)                                                                                                                                                                                                                                                       |
| Operational Instrumentation (ADR-0011)      | **Ready**                           | Correlation-ID mechanism, tracing/logging implementation sketch, and observability boundary fully specified (§9)                                                                                                                                                                                                                                 |
| Configuration (ADR-0012)                    | **Ready**                           | Concrete validation logic and the module-ordering constraint fully specified (§10); deferred candidates correctly left undesigned                                                                                                                                                                                                                |
| Extension / Governance (ADR-0013, ADR-0014) | **Ready**                           | Concrete lint mechanism and artifact location/format fully specified (§11–12); artifact _content_ is correctly deferred to Phase 6, not a Phase 4 gap                                                                                                                                                                                            |

**Overall: Ready for Implementation Planning (Phase 5), with one Minor Clarification** (Memory Ranking's backfill sizing, explicitly Phase 5's job per ADR-0009, not omitted by Phase 4). No subsystem is Not Ready. No subsystem requires an additional ADR or a return to Technical Design before Phase 5 can begin.

---

## 8. Documentation Integrity Report

**Terminology consistency:** every Technical Design section uses the same domain names, gap identifiers, and ADR-drawn phrases (e.g., "hard capability requirements," "no forcing function," "pure addition") as their governing ADRs — no section invents a synonym. **Duplicated specifications:** none found — each interface is specified exactly once in §13 and referenced, not re-specified, elsewhere. **Contradictory sections:** none found. **Stale references:** none found — every internal section cross-reference (e.g., "§4.1," "per §3") points to a section that exists and contains the claimed content. **Broken ADR references:** none found (§1.4 claim 11) — all 14 linked files exist at their stated paths.

**Corrected in this review (§11):** two file/count discrepancies (§1.2, §1.6) and one overstated "only place" claim (§1.4), all confined to the baseline-review section and none affecting any architectural or interface specification elsewhere in the document.

---

## 9. Repository Consistency Report

- **Existing implementation patterns:** the Provider Registry's boot-time-populated, immutable-after-boot lifecycle (§3.2) matches the existing module-level `const provider` pattern's timing exactly — verified by direct comparison with `gateway.ts`'s current code, not merely asserted.
- **Existing dependency injection:** Technical Design's DI-shaped interfaces (`ContextPipeline`'s injectable `summarize`, the deps-object pattern generally) are modeled on `CostGateDependencies` — and, as corrected in this review, on `McpTransportDependencies` as well, a second real precedent Phase 4 initially missed. Both precedents use the same shape (an interface of injectable functions with a production default), and Technical Design's new interfaces follow that shape without deviation.
- **Existing coding conventions:** the correlation-ID-as-explicit-parameter design (§9.1) was checked against the repository's one existing similar concept (`DeletionWorkflowResult.requestId`) and found consistent (explicit field, not ambient context) — independently confirmed via direct grep, not assumed.
- **Existing repository organization:** new files (`registry.ts`, `routing.ts`, `context-pipeline.ts`) follow the existing flat, one-concern-per-file layout under `src/core/` and `src/core/brain/` — no new subdirectory nesting pattern is introduced beyond what `src/core/brain/providers/` already establishes.
- **Lint tooling choice:** independently verified that `eslint-plugin-import`/`eslint-plugin-boundaries` are absent even transitively (§1.4 claim 9) — Phase 4's "zero new dependency" justification for `no-restricted-imports` over a new plugin holds up under direct verification, not just assertion.

**No Repository Consistency finding beyond the four corrections already logged in §11.**

---

## 10. Sequence Diagram Validation

Each sequence diagram in Phase 4 §15 was checked against the interface specifications it depicts:

- **§15.1 (Request lifecycle):** `brainChatStream(req+correlationId)` matches §9.1's `BrainChatRequest.correlationId?` field; the "Sentry.startSpan wraps call" annotation matches §9.2's `withInstrumentation` sketch; `route(task)` inside the Registry/Routing lane matches §5's `routeRequest` signature. **Consistent.**
- **§15.2 (Routing):** the `{resolvedBy:"task"}` / `{resolvedBy:"capability"}` / `null`→`PROVIDER_UNAVAILABLE` branches match §5.2–5.3 and §17.1 exactly, including the "no match" case translating to a value return, not a throw (§17.2). **Consistent.**
- **§15.3 (Provider selection):** matches §3.1's `register`/`getConfigured`/`findByCapability` method set exactly. **Consistent.**
- **§15.4 (Context assembly):** the three branches (under budget / summarize / trim-fallback) match §6.3's five-stage description collapsed to their observable outcomes. **Consistent.**
- **§15.5 (Prompt composition):** `composePrompt(CHAT_STABLE_FRAGMENTS, ctx)` / `composePrompt(CHAT_DYNAMIC_FRAGMENTS, ctx)` matches §8.1–8.2's fragment-array composition model and the existing stable/dynamic two-block split. **Consistent.**
- **§15.6 (Response pipeline):** matches the existing, unchanged `parseEmmaResponse`/`validateResponseBehavior` flow described in §1.3's baseline review. **Consistent.**

**No sequence diagram depicts a call, field, or component absent from its corresponding interface specification.**

---

## 11. Corrections Applied Log

All four corrections are documentation-only, additive or clarifying, and applied directly to `docs/phase4-brain-gateway-technical-design.md` during this review, reproduced here for the historical record:

1. **§1.2 (Dependency graph):** corrected the file count from "15 files" (only 14 named) to the independently-verified 16, adding the two omitted call sites (`ingest/document/route.ts`, `src/inngest/functions.ts`) to the named list, with a note attributing the correction to this review. No change to any architectural or interface content.
2. **§1.4 (Extension points):** corrected the `CostGateDependencies` "only other place" claim to acknowledge `McpTransportDependencies` as a second, real dependency-inversion precedent, with a note attributing the correction to this review. No change to any Technical Design decision — if anything, this strengthens (does not weaken) Phase 4's own rationale for treating DI as an established repository convention.
3. **§1.6 (Testing infrastructure):** corrected the test-file count from 63 to the independently-verified 65, with a note attributing the correction to this review. No change to any testing-strategy content.
4. **§5.3 (Routing Layer 2):** added a clarifying sentence naming both readings of ADR-0007's "no match, pass through" phrase and explicitly stating why the hard-failure reading was selected over the graceful-degradation reading, grounded in ADR-0007's own "hard capability requirements" language. No change to the underlying design decision (`null` → `PROVIDER_UNAVAILABLE` is unchanged) — only its stated rationale is now complete.

**None of the four corrections alters any architectural decision, interface signature, migration step, or testing strategy** — all four are confined to factual precision (counts, an overstated superlative) or rationale completeness (naming a rejected reading explicitly), consistent with this phase's Historical Preservation / Non-Goals constraints.

---

## 12. Review Summary

### 12.1 Findings

**Critical:** None found.

**Major:** None found.

**Minor:**

- **Min-1.** Phase 4 §1.2's dependency-graph file count (evidence: real repository grep found 16 files, Phase 4 named only 14 against a claimed count of 15; impact: a reader relying on this list to scope Phase 6 migration work would miss two real call sites; recommendation: corrected in this review, §11 item 1).
- **Min-2.** Phase 4 §1.4's "only other place" DI claim (evidence: `McpTransportDependencies` at `src/core/integrations/mcp-client.ts:46-49`; impact: understates the repository's existing DI convention, though it does not change any design decision; recommendation: corrected in this review, §11 item 2).
- **Min-3.** Phase 4 §1.6's test-file count (evidence: direct count is 65, not 63; impact: negligible — a stale count, not a testing-strategy gap; recommendation: corrected in this review, §11 item 3).
- **Min-4.** Phase 4 §5.3's "no match, pass through" resolution did not name the alternate (graceful-degradation) reading it implicitly rejected (evidence: ADR-0007's own phrase is genuinely ambiguous between an absent-layer and an active-layer-no-match reading; impact: the decision itself is defensible and consistent with ADR-0007's "hard capability requirements" language, but the original rationale was incomplete; recommendation: corrected in this review, §11 item 4).

**Editorial:** None beyond what is already captured as Min-1 through Min-4 above (all four findings are documentation-fidelity/rationale-completeness issues, not separate editorial-only items).

### 12.2 Corrections applied

See §11 for full text. All four are additive, documentation-only, and change no architectural decision, interface, migration step, or testing strategy in any Technical Design section.

### 12.3 Review Neutrality Audit (of this review itself)

This document introduces no redesign, no new architecture, no new interface, and no new Technical Design content beyond the four corrections named above. Every finding is a documentation-accuracy or rationale-completeness observation checked against the repository or the governing ADRs' own text, not a preference of this reviewer's. A scan of this document's own text for prescriptive language ("should implement," "recommend adopting," "the better choice") found no matches beyond the required "Approved with Minor Revisions" process-level verdict — structurally identical to the recommendation language used by every prior independent review in this initiative.

### 12.4 Approval Recommendation

**Approved with Minor Revisions.**

**Justification:** The Phase 4 Technical Design satisfies its own exit criterion — every ADR has a corresponding specification, every specification traces to its governing ADR and a Phase 2 gap, no architectural drift was found, interfaces are internally consistent, and implementation readiness is independently confirmed for all nine subsystems (one with a named, correctly-scoped-to-Phase-5 clarification). No Critical or Major finding was identified. The four Minor findings are documentation-fidelity gaps in the baseline-review section and one rationale-completeness gap in the Routing design — none altered an architectural decision, an interface, a migration step, or a testing strategy. All four have been corrected directly in this review's finalization, consistent with the mechanical-correction precedent set by every prior phase in this initiative.

**The Technical Design — as corrected — is declared ready for Phase 5 (Implementation Planning), pending the user's review and approval of this Pull Request.** This review concurs with Phase 4's own "Ready for Implementation Planning" self-assessment (§22 of that document) and finds no ADR, gap, interface, or migration step whose fidelity to the Architecture Freeze or the ADR set would call that readiness into question.

---

## 13. Review Limitations (Artifact G)

**What this review validates:** technical completeness, ADR compliance, deferred-question resolution, architectural drift, interface consistency, component/module consistency, sequence-diagram fidelity, error-model consistency, configuration correctness, migration/testing strategy adequacy, and independent traceability — all checked directly against the repository and the nine ADRs, not assumed from Phase 4's own prose.

**What remains explicitly outside this review's scope:**

- **Phase 3/3.1's domain-scoping decision** (why only 2 of Phase 2's 5 named GAP-05 instances — Context and Prompt — were carried into an ADR, while behavior-derivation and rate/usage-limiting fragmentation were not) is not re-examined here. That scoping was fixed by the Freeze several phases ago and is out of bounds for a review of Phase 4 Technical Design specifically (§4, Scope note).
- **Effort or timeline estimation** for any Phase 6 migration step — explicitly a non-goal of both Phase 4 and this review.
- **Live validation** of the proposed schema migration (`memories.embedding`, `match_memories` RPC) against an actual Supabase instance — this review confirms the design mirrors an already-shipped, already-validated precedent (`document_chunks`) but does not itself run the proposed migration against any database.
- **A live ESLint run** of the proposed `no-restricted-imports` configuration — this review confirms the rule and option shape are valid ESLint core-rule syntax and that no plugin is required, but does not execute `npm run lint` against a working-tree change that doesn't exist yet (Technical Design specifies no code).
- **Whether the Phase 6 migration order (§18) is optimal** — only whether it is internally consistent (no step depends on a not-yet-introduced component) and independently revertible, both confirmed.

---

## 14. Explicit Non-Goals Confirmation

Per this review's brief, this document does not reconsider any architectural decision, does not modify any ADR, does not modify the Phase 3.1 Architecture Freeze, does not perform Technical Design again, does not introduce any new architecture, does not write production code, and does not modify runtime behavior. The four corrections applied (§11) are strictly documentation-fidelity and rationale-completeness additions to the one artifact (`docs/phase4-brain-gateway-technical-design.md`) Phase 4 already committed to producing — no new interface, component, domain, gap, or architectural decision is introduced, and no existing Technical Design decision, migration step, or testing-strategy element is altered. Both the file/count corrections and the rationale clarification were evaluated against this review's own Architecture Drift Assessment criteria (§5) before being applied, and all four were confirmed to be additive/clarifying, not architectural, prior to correction. This review does not estimate implementation effort for Phase 6.

## 15. Success Criteria Checklist

- [x] Every Technical Design section is validated against its governing ADR(s) (§2)
- [x] Every deferred architectural question is verified as correctly resolved (§3)
- [x] No architectural drift exists (§5)
- [x] All interfaces are internally consistent (§6)
- [x] Implementation readiness is independently confirmed (§7)
- [x] No undocumented technical decisions remain (§8, §9)
- [x] The independent traceability reconstruction contains no orphaned Gap, ADR, or Technical Design section (§4)
