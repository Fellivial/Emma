# Emma Brain Gateway — Phase 0: Independent Review

## Document Status

- Roadmap: [Brain Gateway Roadmap v1.0 (Frozen)](roadmaps/brain-gateway-roadmap-v1.md)
- Phase: Phase 0 — Independent Review (review-of-the-review)
- Reviews: [`docs/phase0-brain-gateway-required-input-review.md`](phase0-brain-gateway-required-input-review.md) (the Phase 0 deliverable)
- Type: Review-only. No architecture redesign, ADRs, implementation, or runtime-behavior changes were made in producing this report. This phase reviews the Phase 0 deliverables; it does not restart Phase 0 or perform Phase 1 work.
- Branch: `feature/brain-gateway-phase0-required-input-review` (same branch as Phase 0 — not a new branch, per this phase's finalization tasks)
- Performed by: an independent agent with no authorship stake in the Phase 0 document, instructed to verify claims against the repository rather than trust the document

This document contains the six required deliverables of this phase as sections:

1. Independent Review Report (§1)
2. Coverage Assessment (§2)
3. Boundary Assessment (§3)
4. Ownership Assessment (§4)
5. Review Findings, classified (§5)
6. Phase 0 Approval Recommendation (§6)

---

## 1. Independent Review Report

### 1.1 Executive Summary

The Phase 0 deliverable is a high-quality, technically accurate, and neutrality-compliant artifact. All six required deliverable sections are present and complete, both Mermaid diagrams are syntactically well-formed, and 14 of 15 independently spot-checked factual claims against the repository matched exactly. The one discrepancy is a minor miscount: the document's recurring "15 call sites / 15 files" figure conflates a test file with source files and undercounts actual invocation sites (verified ground truth: **14 non-test source files, 16 invocation sites** — see §1.6). An exhaustive scan for prescriptive language found zero neutrality violations. The document's central load-bearing claim — that the Brain Gateway cleanly isolates all provider-wire knowledge inside `src/core/brain/` — was independently re-verified by grep and holds.

The material weaknesses are gaps of artifact _structure_, not accuracy: there is no dedicated Boundary Inventory, no dedicated Component Ownership Map, and no explicit "Phase 0 Conclusion / ready to proceed" statement. The underlying understanding those artifacts would convey is present but scattered across §1.2/§1.3/§4 of the Phase 0 document. One AI-adjacent mechanism (`src/core/request-validation.ts`) is omitted entirely from the document, though the specific claim it relates to ("no runtime schema validation on the chat body") is itself accurate.

**No Critical or Major findings.** Recommendation: **Approved with Minor Revisions** (§6).

### 1.2 Review Scope

Reviewed: the frozen roadmap, the full Phase 0 deliverable document (all six sections), `ADR-0003-brain-gateway-architecture.md`, and `phase7b-brain-gateway-implementation-report.md` as cross-reference targets. Independently verified source files: `models.ts`, `brain/providers/openrouter.ts`, `response-validator.ts`, `route.ts`, `cost-gate.ts`, `memory-db.ts`, `tts/route.ts`, `agent-loop.ts`, `voice-engine.ts`, `landing.ts`, plus repo-wide existence/leak greps. This was a read-only review; no files were modified by the reviewing agent, and the corrective grep re-verification in this document (§1.6) was performed independently after the agent's report.

### 1.3 Validation Results — Deliverable Validation

All six required Phase 0 sections exist as distinct, complete sections (§1–§6 of the Phase 0 document), enumerated correctly in its own header. Internal cross-references resolve: §1.5→§4, §1.6→§5, §1.7/§1.8→§6, §3→§1.7 — all point to real sections. Both Mermaid diagrams are syntactically well-formed: the `graph TB` diagram has 6 balanced subgraphs, all edges reference defined nodes, all `classDef`/`class` targets are defined nodes; the `sequenceDiagram` declares all participants before use with balanced arrow types. **Pass.**

### 1.4 Validation Results — Coverage Review

All 14 areas required by the Phase 0 spec are addressed with file- or line-level citations (AI Request Flow, LLM Provider Integration, Prompt Construction, Context Management, Memory Integration, Behavior Pipeline, Emotion Pipeline, Response Processing, TTS Integration, Avatar Integration, Configuration, Existing Documentation, Dependency Analysis, Technical Debt). Independent cross-check of AI-pipeline-adjacent modules not explicitly named in the Phase 0 spec:

- **Covered:** `agent-loop.ts`, `companion-state.ts`, `greeting-engine.ts`, `proactive-speech.ts`, `multi-user-engine.ts`, `cost-gate.ts`, `rate-limiter.ts`/`ratelimit.ts`.
- **Covered only generically** (folded into the gateway-caller count, not individually discussed): `tool-registry.ts`, `task-summarizer.ts`, `pattern-detector.ts`, `cron/reflection/route.ts` — a defensible scoping choice, since Phase 0's flow-level detail focuses on the standard chat turn.
- **Omitted entirely:** `src/core/request-validation.ts` exists and is used by `history/route.ts` and `agent/route.ts` (confirmed), but is never mentioned. This does not invalidate the Phase 0 document's specific claim that the chat route (`route.ts`) has no schema validation on its body — that claim is accurate and independent of this omission — but the mechanism's existence elsewhere in the codebase goes unmentioned.

See §2 for the formal Coverage Assessment classification.

### 1.5 Validation Results — Boundary & Ownership

See §3 and §4 (dedicated sections, as required by this phase's deliverable list).

### 1.6 Technical Accuracy Findings

Fifteen concrete factual claims were independently checked against source. **14 matched exactly; 1 discrepancy found and independently re-confirmed by this document's author:**

| #   | Claim                                                                                                      | Verdict                                   |
| --- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 1   | `src/lib/openrouter.ts` no longer exists                                                                   | MATCH                                     |
| 2   | `ADR-0003-brain-gateway-architecture.md:6` reads "Implementation: None yet..."                             | MATCH (verbatim)                          |
| 3   | "15 call sites import from `@/core/brain/gateway`"                                                         | **DISCREPANCY** — see below               |
| 4   | `MAX_HISTORY_MESSAGES = 20`, last-20 hard cap, no token accounting                                         | MATCH                                     |
| 5   | `getRelevantMemoriesForUser` default `limit=15`, keyword-overlap × confidence scoring only above the limit | MATCH                                     |
| 6   | `validateResponseBehavior` checks 3 of 5 flags, log-only                                                   | MATCH                                     |
| 7   | TTS hardcoded ElevenLabs URL/model id; key from encrypted per-client Supabase storage                      | MATCH                                     |
| 8   | Model IDs in `models.ts` (`gpt-oss-120b:free` brain/utility, `gemini-2.5-flash` vision)                    | MATCH                                     |
| 9   | Embedding model hardcoded in provider file, not `models.ts`                                                | MATCH                                     |
| 10  | Provider normalizes 529→`OVERLOADED`                                                                       | MATCH                                     |
| 11  | Two stacked rate-limit checks (distributed limiter directly, then cost-gate under a different namespace)   | MATCH                                     |
| 12  | Marketing copy states "Claude models via OpenRouter," inconsistent with the actually-wired model           | MATCH (verbatim, `landing.ts:180`)        |
| 13  | Agent-loop hardcodes `personaId: "mommy"` in its notification path                                         | MATCH (`agent-loop.ts:910`)               |
| 14  | Client-side HTTP-501 kill-switch check for which the TTS route has no corresponding code path              | MATCH                                     |
| 15  | Zero provider-wire leaks outside `src/core/brain/` (central boundary claim)                                | MATCH (independently re-verified by grep) |

**Discrepancy detail (claim 3), independently re-confirmed:** `grep -l 'from "@/core/brain/gateway"'` returns exactly 15 files, but one of them is `tests/unit/brain-gateway.test.ts` — a test file, not a source call site. That leaves **14 non-test source files**. Separately, counting actual invocation expressions (`brainChat(`/`brainChatStream(`/`brainEmbed(`) across those 14 files yields 19 total occurrences, of which 3 are `gateway.ts`'s own internal delegations (the function definitions, not call sites) — leaving **16 genuine invocation sites** (`agent-loop.ts` calls twice, `history/route.ts` calls twice, all others once each). The Phase 0 document's "15" figure matches neither the file count (14) nor the site count (16). Additionally, the Phase 0 document's Dependency Map (§4) labels this group "API routes (15 files)," which miscategorizes 5 of the 14 as API routes when they are in fact core/lib modules (`embeddings.ts`, `agent-loop.ts`, `tool-registry.ts`, `task-summarizer.ts`, `pattern-detector.ts`).

### 1.7 Recommended Documentation Updates

(Recommendations are limited to _documentation precision_, not architecture — consistent with this phase's non-goals.)

1. Correct the "15 call sites/files" figure throughout the Phase 0 document to the verified "14 non-test source files, 16 invocation sites," and correct §4's "API routes (15 files)" mis-categorization.
2. Add a consolidated Boundary Inventory to the Phase 0 document (§3 of this review explains why).
3. Add a consolidated Component Ownership Map to the Phase 0 document (§4 of this review explains why).
4. Add an explicit "Phase 0 Conclusion" statement asserting the architecture is now sufficiently understood to proceed to Phase 1.
5. Add a mention of `src/core/request-validation.ts`'s existence to the Configuration/Request-Flow discussion.
6. (Editorial) Reconcile the "six deliverables" framing in the Phase 0 document against the frozen roadmap's own five-item Phase 0 deliverable list (roadmap lines 78–82) with a one-line note that the six-way split (diagram + flow diagram as two of the six) is a re-mapping, not a deviation.

### 1.8 Final Assessment

No Critical or Major defect was found in the Phase 0 deliverable. All required content exists, is neutral, and is (with one numeric exception) technically accurate. The revisions in §1.7 are mechanical precision/structure fixes, not substantive corrections — none of them alter any finding, observation, or conclusion already recorded in the Phase 0 document. See §6 for the formal approval recommendation.

---

## 2. Coverage Assessment

**Classification: Minor Gaps.**

Justification: all 14 mandated review areas and all six required Phase 0 deliverables are present, and the standard chat-turn request flow is cited to file/line throughout. The gaps are narrow and do not undermine "complete understanding of the current architecture": `request-validation.ts` is unmentioned (though the related, more specific claim about the chat route is accurate); five gateway-caller modules are counted in aggregate but not individually discussed (a defensible scoping choice for modules outside the standard chat flow); and the agentic-loop/cron paths receive generic rather than granular treatment. None of these gaps caused an incorrect conclusion elsewhere in the document.

---

## 3. Boundary Assessment

**Classification: Not adequately documented as a dedicated artifact.**

Justification: the Phase 0 document's authors clearly _understand_ the boundaries (this is evident from the neutrality-clean prose in §1.3 and the accurate dependency directions in §4), but there is no single place a reader can consult to answer "what does component X own, and what must it never do" for the finer-grained components this review was asked to validate (UI, API, Brain Gateway, Provider, Memory, Behavior, Emotion, Prompt Builder, Response Processing, TTS, Avatar). The only explicit "must never do" boundary language in the documentation set lives in the cross-referenced `ADR-0003-brain-gateway-architecture.md`, and it covers only the coarser three-tier Application/Gateway/Provider split — not the eleven-component granularity Phase 0 was scoped to review. Responsibility information is real but scattered across §1.2 (component → primary files), §1.3 (prose description of behavior), and §4 (dependency directions), requiring a reader to cross-reference three sections to reconstruct any one component's boundary.

**Missing boundary information, specifically:** an explicit statement, per component, of (a) what it is responsible for producing/deciding, and (b) what it must never do or know about (the ADR-0003 pattern, extended to all eleven components). Per the phase's own instructions, this review identifies the gap without proposing its content.

---

## 4. Ownership Assessment

**Classification: Adequately documented in substance; not consolidated into a dedicated artifact.**

Justification: for each of the six ownership questions posed by the Phase 0 review spec, a single owner is determinable from the Phase 0 document alone:

| Responsibility            | Owner (per Phase 0 document)                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Prompt construction       | `personas.ts` (`buildSystemPrompt`)                                                                         |
| Behavior derivation       | `behavior-flags.ts` (`deriveBehaviorFlags`)                                                                 |
| Memory retrieval          | `memory-db.ts` (`getRelevantMemoriesForUser`)                                                               |
| Routing / model-selection | No routing exists; model IDs live in `models.ts`, tier-to-fallback-array mapping lives in the provider file |
| Response validation       | `response-validator.ts` (`validateResponseBehavior`)                                                        |
| Provider communication    | `providers/openrouter.ts`                                                                                   |

Where ownership is genuinely split — prompt construction (5 competing hardcoded prompts exist outside `personas.ts`) and behavior derivation (invoked independently in 3 places) — the Phase 0 document explicitly surfaces this as a finding rather than silently omitting it, which is the correct treatment of a real split, not a documentation failure. What is missing is a single consolidated table mapping responsibility → owner → known exceptions in one place; currently a reader must assemble this from §1.2, §1.3, and §1.7 of the Phase 0 document.

---

## 5. Review Findings

### Critical

None.

### Major

None.

### Minor

1. **"15 call sites / 15 files" miscount.** Locations: Phase 0 document §1.1, §1.5, §4. Ground truth (independently verified twice — once by the reviewing agent, once directly in this review): 14 non-test source files import from `@/core/brain/gateway` (the 15th match is `tests/unit/brain-gateway.test.ts`); counting actual invocation expressions yields 16 genuine call sites (`agent-loop.ts` and `history/route.ts` each call twice). Evidence: `grep -l 'from "@/core/brain/gateway"'` → 15 results incl. 1 test file; `grep -c 'brainChat(|brainChatStream(|brainEmbed('` → 19 total occurrences, minus `gateway.ts`'s own 3 internal definitions → 16.
2. **§4's "API routes (15 files)" mis-categorization.** 5 of the 14 gateway-importing source files (`embeddings.ts`, `agent-loop.ts`, `tool-registry.ts`, `task-summarizer.ts`, `pattern-detector.ts`) are core/lib modules, not API routes, but are grouped under an "API routes" label.
3. **No dedicated Boundary Inventory artifact.** See §3. Boundary information exists but is scattered across three sections rather than consolidated.
4. **No dedicated Component Ownership Map artifact.** See §4. Ownership is reconstructable but not consolidated into one table.
5. **No explicit Phase 0 Conclusion / ready-to-proceed statement.** The Phase 0 document's "Success Criteria Checklist" and "Explicit Non-Goals Confirmation" partially serve this function, but neither is an explicit narrative assertion that the architecture is now sufficiently understood to proceed to Phase 1.
6. **`request-validation.ts` omitted.** A request-processing mechanism used by `history/route.ts` and `agent/route.ts` is not mentioned anywhere in the Phase 0 document, though the specific, narrower claim it relates to (no schema validation on the chat route's body) is itself accurate.

### Editorial

7. **Deliverable-count framing.** The Phase 0 document frames itself as containing "six deliverables"; the frozen roadmap's own Phase 0 deliverable list (roadmap lines 78–82) names five differently-titled items (Existing Architecture Inventory, Dependency Inventory, Current AI Flow, Documentation Review Report, Initial Findings). The six-way split is a reasonable superset re-mapping (architecture is split into a diagram and a flow diagram) and nothing required is actually missing, but a one-line reconciliation note would remove any appearance of scope drift.
8. **Five gateway-caller modules named only in aggregate.** Naming `tool-registry.ts`, `task-summarizer.ts`, `pattern-detector.ts`, `cron/reflection/route.ts`, and the embeddings caller individually (rather than folding them into a single "15" figure) would both improve completeness and, if done alongside finding 1's correction, resolve the miscount at its source.

---

## 6. Phase 0 Approval Recommendation

**Approved with Minor Revisions.**

**Justification:** The Phase 0 deliverable satisfies its own exit criteria — complete understanding of the current architecture, no architectural decisions made, no implementation performed — and does so with high technical fidelity (14 of 15 independently spot-checked claims exact, and the document's central boundary claim independently re-verified and confirmed) and full architectural-neutrality compliance (an exhaustive scan for prescriptive language found zero violations). No Critical or Major finding was identified.

The revisions required before this phase can close are minor and mechanical, not substantive:

- Correct the "15 call sites/files" figure to the verified 14 source files / 16 invocation sites, and fix the Dependency Map's route-vs-core-module mis-categorization (findings 1–2).
- Add a consolidated Boundary Inventory and Component Ownership Map to the Phase 0 document, consolidating information that already exists in scattered form rather than requiring new investigation (findings 3–4).
- Add an explicit Phase 0 Conclusion statement (finding 5).
- Mention `request-validation.ts`'s existence (finding 6).

None of these revisions alter any finding, observation, or conclusion already recorded in the Phase 0 document — they improve precision, structure, and traceability. **Note on the Phase 0 document's headline finding:** the reported inconsistency between `ADR-0003-brain-gateway-architecture.md`'s "Implementation: None yet" header and the actual shipped Brain Gateway code was independently re-verified and is accurate — it is a genuine inconsistency in the repository, correctly reported by Phase 0, and its remediation correctly belongs to a later roadmap phase rather than to this one.

Per the roadmap's finalization tasks, the revisions listed above have been applied directly to `docs/phase0-brain-gateway-required-input-review.md` on this same branch (see the accompanying commit), and the pull request has been updated to distinguish the original Phase 0 review, this Independent Review's findings, and the resulting documentation revisions.
