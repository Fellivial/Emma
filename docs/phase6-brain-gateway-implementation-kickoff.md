# Emma Brain Gateway — Phase 6: Implementation Kickoff

## Document Status

- Roadmap: [Brain Gateway Roadmap v1.1](roadmaps/brain-gateway-roadmap-v1.md) (extends v1.0 Frozen)
- Phase: Phase 6 — Implementation Kickoff (preparation only, precedes Wave 6A)
- Type: **Preparation-only.** This document verifies that every prerequisite for Phase 6A is actually satisfied — prerequisite phases merged, repository baseline healthy, architecture baseline undrifted, Technical Design still implementable, every wave's dependency graph still valid, and implementation risks recorded — before any Phase 6 code is written. It does **not** write production code, does **not** modify any database schema, does **not** introduce any migration, does **not** change runtime behavior, does **not** modify any ADR, does **not** modify the Phase 4 Technical Design, and does **not** modify the Phase 3.1 Architecture Freeze. Every verification below either confirms an already-approved artifact still holds against the current repository, or records a fact — it makes no new architectural or planning decision.
- Branch: `feature/brain-gateway-phase6-kickoff`
- Baseline treated as approved and not re-derived: [Brain Gateway Roadmap v1.1](roadmaps/brain-gateway-roadmap-v1.md), [ADR-0003](adr/ADR-0003-brain-gateway-architecture.md), [ADR-0006](adr/0006-provider-registry-capabilities-descriptor-adapter-layer.md)–[ADR-0014](adr/0014-brain-gateway-extension-model.md), [Phase 4 Technical Design](phase4-brain-gateway-technical-design.md) (PR #156, merged), [Phase 4.1 Independent Technical Review](phase4-1-brain-gateway-independent-technical-review.md) (PR #157, merged), [Phase 5 Implementation Planning](phase5-brain-gateway-implementation-planning.md) (PR #159, merged), [Phase 5.1 Independent Implementation Planning Review](phase5-1-brain-gateway-independent-implementation-planning-review.md) (PR #160, merged).
- Required inputs re-read in full for this phase (not summarized, not recalled from a prior session): the Roadmap v1.1, Phase 5 Implementation Planning (all 17 sections), Phase 5.1 Independent Review (all 15 sections), ADR-0003, ADR-0006 through ADR-0014 (all nine, in full), Phase 4 Technical Design (all 24 sections), Phase 4.1 Independent Technical Review (all 15 sections).
- Repository state independently re-verified directly against the live working tree (not assumed from any prior phase's prose): `git log origin/main` (PR merge history), `npm run build`, `npm run lint`, `npm test`, file existence/absence checks on every file Phase 6 is planned to create, line counts on every file Phase 5.1 previously counted, `src/lib/errors.ts`'s retry list, `src/core/env-validation.ts`'s required-env list, `eslint.config.mjs`'s rule set, `supabase/schema.sql`'s `memories` table shape, `npx supabase migration list` against the linked project, and a direct re-count of every file importing the Brain Gateway or `embeddings.ts`.

This single document contains the required Phase 6 deliverables as numbered sections, consistent with the single-document precedent set by every phase from 3.1 onward:

1. Executive Summary
2. Preconditions — Merged-Phase Verification
3. Repository Baseline Report
4. Architecture Baseline Verification
5. Technical Design Verification
6. ADR Compliance Verification
7. Wave Readiness Assessment
8. Dependency Validation
9. Risk Baseline
10. Implementation Governance
11. Phase 6 Conclusion
12. Explicit Non-Goals Confirmation
13. Exit Criteria Checklist

---

## 1. Executive Summary

Every prerequisite phase (Phase 0 through Phase 5.1) is merged to `main` (§2). The repository baseline is healthy: the production build compiles cleanly, ESLint reports zero errors (ten pre-existing warnings, all in unrelated UI components, none touching the Brain Gateway), and the full test suite is green — 787 tests passing, 3 intentionally skipped, across 66 of 67 test files (§3). The architecture baseline shows **zero drift** from the state Phase 5.1 verified one day prior: every file Phase 6 is planned to create (`registry.ts`, `routing.ts`, `context-pipeline.ts`, `docs/brain-gateway-extension-model.md`) is still absent; every file Phase 6 is planned to modify (`gateway.ts`, `types.ts`, `openrouter.ts`, `errors.ts`, `env-validation.ts`, `eslint.config.mjs`, `supabase/schema.sql`, `personas.ts`, `context-manager.ts`, `route.ts`) is byte-for-byte unchanged in every load-bearing respect Phase 5/5.1 relied on (§4). Because no code has changed, the Phase 5 Implementation Planning's task list, the Phase 5.1 Independent Review's Wave Readiness Matrix, Wave Dependency Audit, and Implementation Drift Risk Assessment all remain valid as written — this phase's job is to confirm that directly against the live repository, not to re-derive them (§5–§8).

**One new, repository-verified fact not previously documented anywhere in this initiative:** `npx supabase migration list` against the linked Supabase project shows pre-existing local/remote migration drift — five local migrations (`20260713000001` through `20260720000001`, all from the unrelated account-deletion initiative) have not been applied to the remote project, and one remote migration (`20260713102147`) has no local file counterpart. This does not block Phase 6A–6D (none of which touch the database) but is a real, concrete risk for Wave 6E's additive schema migration and is recorded in the Risk Baseline (§9) as a migration risk requiring resolution before 6E begins, not before 6A.

No architectural, ADR, or Technical Design drift exists. No wave is rated Not Ready. No circular dependency exists. **Phase 6A (Core Infrastructure) is declared Ready.**

### 1.1 Scope of this phase

Per the Roadmap and this phase's own brief: verify prerequisites, verify repository/architecture/Technical-Design baselines, verify wave readiness and dependency validity, record a risk baseline, and produce this document. No implementation, no migration, no runtime behavior change, no architectural decision.

---

## 2. Preconditions — Merged-Phase Verification

Verified via `gh pr list --state all` and `git log origin/main` directly, not assumed from memory or prior-session summaries.

| Phase                                                  | PR   | Merged               | Verified |
| ------------------------------------------------------ | ---- | -------------------- | -------- |
| Phase 0 — Required Input Review                        | #145 | 2026-07-21T20:22:34Z | Yes      |
| Phase 0 — Independent Review                           | #146 | 2026-07-21T20:49:17Z | Yes      |
| Phase 1 — Architecture Review                          | #147 | 2026-07-21T21:10:08Z | Yes      |
| Phase 1 — Independent Review                           | #148 | 2026-07-21T21:43:48Z | Yes      |
| Phase 2 — Gap Analysis                                 | #149 | 2026-07-22T15:46:35Z | Yes      |
| Phase 2 — Independent Review                           | #150 | 2026-07-22T16:03:59Z | Yes      |
| Phase 3 — Architecture Discovery                       | #151 | 2026-07-22T16:26:48Z | Yes      |
| Phase 3 — Independent Review                           | #152 | 2026-07-22T16:43:38Z | Yes      |
| Phase 3.1 — Architecture Freeze                        | #153 | 2026-07-22T16:58:23Z | Yes      |
| Phase 3.2 — ADR Authoring                              | #154 | 2026-07-23T00:12:12Z | Yes      |
| Phase 3.3 — ADR Independent Review                     | #155 | 2026-07-23T00:25:09Z | Yes      |
| Phase 4 — Technical Design                             | #156 | 2026-07-23T00:45:53Z | Yes      |
| Phase 4.1 — Independent Technical Review               | #157 | 2026-07-23T01:02:57Z | Yes      |
| Roadmap v1.1 extension                                 | #158 | 2026-07-23T01:36:39Z | Yes      |
| Phase 5 — Implementation Planning                      | #159 | 2026-07-23T14:35:45Z | Yes      |
| Phase 5.1 — Independent Implementation Planning Review | #160 | 2026-07-23T15:01:25Z | Yes      |

`origin/main` HEAD (`af2e1f3`, "Merge pull request #160...") independently confirmed to include the Phase 5.1 merge commit via direct `git fetch origin main` + `git log origin/main --oneline`, not inferred from the PR list alone.

**Verdict: all sixteen prerequisite merges confirmed. No prerequisite is unmerged. This phase does not abort.**

This branch (`feature/brain-gateway-phase6-kickoff`) was created from `main` at this exact commit, after a `git pull`, with a clean working tree (`git status` confirmed nothing to commit both before and after branching).

---

## 3. Repository Baseline Report

| Check                          | Result                                                                                                                                                                                                                                                                         | Evidence                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Working tree clean             | Yes, on both `main` and this branch                                                                                                                                                                                                                                            | `git status`                                                             |
| Dependencies installed         | Yes, pre-existing `node_modules/`                                                                                                                                                                                                                                              | `ls node_modules`                                                        |
| TypeScript / production build  | **Passes** — full Next.js production build completes, all routes compile (App Router + API routes)                                                                                                                                                                             | `npm run build`                                                          |
| Lint                           | **Passes** — 0 errors, 10 warnings, all pre-existing and unrelated to the Brain Gateway (`react-hooks/purity`/`react-hooks/set-state-in-effect` in `settings/usage/page.tsx` and `InputBar.tsx`)                                                                               | `npm run lint`                                                           |
| Test suite                     | **Passes** — 787 tests passed, 3 skipped, 66 of 67 test files passed (1 file fully skipped)                                                                                                                                                                                    | `npm test` (Vitest)                                                      |
| Test file count                | 65 files under `tests/unit/`, 2 files under `tests/integration/` = 67 total, matching the 65-unit-file figure every prior phase cited (that figure always scoped to `tests/unit/` only — no discrepancy, only a scope clarification)                                           | `find tests -name "*.test.ts"` / `ls tests/unit`, `ls tests/integration` |
| Migrations status              | **Pre-existing drift found, unrelated to Brain Gateway** — 5 local migrations (`20260713000001`–`20260720000001`, account-deletion initiative) not applied to the linked remote project; 1 remote migration (`20260713102147`) has no local file. See §9.2 for risk treatment. | `npx supabase migration list`                                            |
| Current Brain Gateway behavior | Confirmed unchanged from the Phase 4/5/5.1 baseline: `gateway.ts` holds one module-level `const provider`, no Registry, no Routing Engine, `TASK_MODELS` is a static compile-time map                                                                                          | Direct read of `src/core/brain/gateway.ts`, `providers/openrouter.ts`    |

**Verdict: repository baseline is healthy. No blocking issue exists. The 10 lint warnings and the migration-ledger drift are both pre-existing, both outside this initiative's scope to fix in Phase 6A–6D, and are recorded, not remediated, per this phase's Explicit Non-Goals (§12).**

---

## 4. Architecture Baseline Verification

Every file/interface Phase 5 and Phase 5.1 verified against the repository is independently re-verified here, directly, against the current working tree — not copied from either document's prose.

| Item                                                                                                            | Phase 5.1's recorded state (2026-07-23) | This phase's re-verification (2026-07-24)                                                                          | Drift? |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------ |
| `src/core/brain/gateway.ts` line count                                                                          | 71                                      | 71                                                                                                                 | None   |
| `src/core/brain/types.ts` line count                                                                            | 169                                     | 169                                                                                                                | None   |
| `src/core/brain/providers/openrouter.ts` line count                                                             | 311                                     | 311                                                                                                                | None   |
| `src/core/brain/registry.ts` exists                                                                             | No                                      | No                                                                                                                 | None   |
| `src/core/brain/routing.ts` exists                                                                              | No                                      | No                                                                                                                 | None   |
| `src/core/context-pipeline.ts` exists                                                                           | No                                      | No                                                                                                                 | None   |
| `docs/brain-gateway-extension-model.md` exists                                                                  | No                                      | No                                                                                                                 | None   |
| `src/lib/errors.ts`'s `DEFAULT_RETRY.retryOn` contains `529`                                                    | Yes                                     | Yes (`[429, 500, 502, 503, 529]`)                                                                                  | None   |
| `src/core/env-validation.ts`'s `PRODUCTION_REQUIRED_ENV` contains `OPENROUTER_API_KEY` unconditionally          | Yes                                     | Yes                                                                                                                | None   |
| `eslint.config.mjs` contains a `no-restricted-imports` rule                                                     | No                                      | No                                                                                                                 | None   |
| `supabase/schema.sql`'s `memories` table has an `embedding` column                                              | No                                      | No                                                                                                                 | None   |
| `personas.ts`'s prompt construction is still a monolithic `stable` string (no `composePrompt`/`PromptFragment`) | Yes (implicit — pre-6D baseline)        | Yes — `buildSystemPromptBlocks`/`buildSystemPrompt` are the only exported prompt functions, no fragment API exists | None   |
| `route.ts`'s server-side history cap is still a flat 20-message `truncateHistory()`                             | Yes                                     | Yes (`MAX_HISTORY_MESSAGES = 20`)                                                                                  | None   |
| `context-manager.ts`'s client-side budget logic (`calculateBudget`) is still independent of `route.ts`'s cap    | Yes                                     | Yes                                                                                                                | None   |
| `CostGateDependencies` and `McpTransportDependencies` both exist as DI-shaped interfaces                        | Yes                                     | Yes                                                                                                                | None   |
| `agent-loop.ts` is the sole orchestration mechanism (no new workflow-layer file)                                | Yes                                     | Yes — no `workflow*.ts` file exists                                                                                | None   |
| `TASK_MODELS` static compile-time map (no runtime routing)                                                      | Yes                                     | Yes                                                                                                                | None   |
| Files importing `@/core/brain/gateway` or `@/lib/embeddings`                                                    | 16                                      | 16 (re-listed, identical set)                                                                                      | None   |

**Verdict: zero architectural drift across every one of the eight frozen domains (Provider, Routing, Context, Memory, Prompt, Operational, Configuration, Extension).** Every file Phase 6 is scoped to create is still absent; every file Phase 6 is scoped to modify is still in the exact state Phase 5/5.1 designed against. No commit since PR #160 merged touches any Brain-Gateway-relevant file (`git log --oneline -- src/core/brain/ src/core/personas.ts src/core/context-manager.ts src/core/memory-db.ts` all show their most recent commit predating this initiative's own Brain Gateway work, or in `personas.ts`'s case, predating even Phase 7B).

---

## 5. Technical Design Verification

Phase 5.1's Technical Design Compliance Matrix (its own §3) already independently verified every Phase 5 task against its Phase 4 Technical Design section, finding all fourteen Technical Design sections (§3–§12, §13, §17–§19) faithfully implemented in the plan with no invented interface and no skipped deferred item. Because §4 above confirms zero repository drift since that verification, **no fact underlying that matrix has changed** — this phase's contribution is confirming the matrix's precondition (an unchanged repository) still holds, not re-deriving the matrix itself.

| Technical Design section       | Phase 5 wave       | Phase 5.1 verdict               | Still valid? (this phase)                                                                                                                                                                                                                                                                                                                    |
| ------------------------------ | ------------------ | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §3 Provider Registry           | 6A                 | Faithful                        | Yes — `registry.ts` still absent, nothing to implement against has changed                                                                                                                                                                                                                                                                   |
| §4 Capability Descriptor       | 6A                 | Faithful                        | Yes                                                                                                                                                                                                                                                                                                                                          |
| §5 Routing Engine              | 6C                 | Faithful                        | Yes — `routing.ts` still absent                                                                                                                                                                                                                                                                                                              |
| §6 Context Pipeline            | 6D                 | Faithful                        | Yes — `context-manager.ts`/`route.ts` cap both unchanged                                                                                                                                                                                                                                                                                     |
| §7 Memory Ranking              | 6E                 | Faithful                        | Yes — `memories` table still has no `embedding` column                                                                                                                                                                                                                                                                                       |
| §8 Prompt Composition          | 6D                 | Faithful                        | Yes — `personas.ts` still monolithic                                                                                                                                                                                                                                                                                                         |
| §9 Operational Instrumentation | 6F                 | Faithful                        | Yes                                                                                                                                                                                                                                                                                                                                          |
| §10 Configuration              | 6F                 | Faithful                        | Yes — `PRODUCTION_REQUIRED_ENV` unchanged                                                                                                                                                                                                                                                                                                    |
| §11 Extension Model (lint)     | 6A (relocated), 6F | Faithful                        | Yes — no lint rule exists yet in either wave's target state                                                                                                                                                                                                                                                                                  |
| §12 Governance                 | 6F                 | Faithful                        | Yes — artifact still absent                                                                                                                                                                                                                                                                                                                  |
| §13 Public Interface Spec      | Cross-referenced   | Faithful                        | Yes — every interface in §13 still does not exist in the repository, so "implement, don't invent" still applies cleanly                                                                                                                                                                                                                      |
| §17 Error Handling             | 6B, 6C             | Faithful                        | Yes — `PROVIDER_UNAVAILABLE` absent from `types.ts`, `529` still in `errors.ts`'s shared list                                                                                                                                                                                                                                                |
| §18 Migration Strategy         | §9 of Phase 5      | Faithful                        | Yes, **with the new migration-ledger-drift fact folded into §9's risk treatment (§9.2 below), not into the Technical Design itself** — §18's per-step rollback guarantee is about Brain-Gateway-introduced migrations, not the repository's pre-existing, unrelated migration-ledger health, so this new fact does not require reopening §18 |
| §19 Testing Architecture       | §10 of Phase 5     | Faithful (1 gap, Finding Min-3) | Yes — the gap (no dedicated Migration Validation axis in Phase 5 §10's table) is unchanged and remains an open, recorded Minor item, not a blocker                                                                                                                                                                                           |

**Implementation readiness confirmation:** every Technical Design section Phase 6 will implement is still implementable exactly as specified, with no repository change in the intervening day that would require Phase 5's plan or Phase 4's design to be revisited. **Phase 6A can begin using only the Phase 5 Implementation Planning document and the Phase 4 Technical Design, without making any further architectural decision — the same conclusion Phase 5's own §15 and Phase 5.1's own §1.5 reached, re-confirmed against a repository re-verified one day later.**

---

## 6. ADR Compliance Verification

Phase 5.1's ADR Compliance Matrix (its own §2) already confirmed all nine ADRs (0006–0014) are faithfully preserved by their implementing wave(s), with the one correction (Finding M-1, the Provider-boundary lint rule's relocation to Wave 6A) already applied directly to the Phase 5 document. Re-verified here only for drift, not re-litigated:

- No ADR has been modified, superseded, or reinterpreted since Phase 5.1 (`docs/adr/*.md` — all nine still read `Status: Accepted`, unchanged bodies, confirmed by direct re-read in this document's own required-inputs pass).
- No Phase 5 task's ADR citation has become stale (§5 above re-confirms every cited file/interface is still in the exact pre-implementation state each ADR's Decision assumes).
- The Architecture Compliance Checklist Phase 5.1 added to Phase 5 (§6.1 of that document) is still present in `docs/phase5-brain-gateway-implementation-planning.md` and unaltered — confirmed by direct re-read during this phase's required-inputs pass.

**Verdict: all nine ADRs remain faithfully preserved, unmodified, and Accepted. No ADR compliance issue exists at Phase 6 kickoff.**

---

## 7. Wave Readiness Assessment

Phase 5.1's Wave Readiness Matrix (its own §11) is re-confirmed wave-by-wave against the repository state verified in §3–§4 above.

| Wave | Phase 5.1 verdict                                     | This phase's re-verification                                                                                                                                                                                                                                                    | Ready for Phase 6A to begin?                                   |
| ---- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 6A   | Ready                                                 | `registry.ts` absent, `providers/` directory exists today (lint rule has something to protect immediately), `gateway.ts` unchanged — nothing blocks starting                                                                                                                    | **Yes**                                                        |
| 6B   | Ready                                                 | `errors.ts`'s `529` still present in the shared list to relocate; no fake provider or conformance suite exists yet — nothing blocks it once 6A lands                                                                                                                            | Yes (sequenced after 6A)                                       |
| 6C   | Ready with Clarification (Layer 3 correctly deferred) | `routing.ts` absent; Layer 3 still has no ADR-0003-scope revisit — clarification still applies, not a blocker                                                                                                                                                                   | Yes (sequenced after 6A/6B)                                    |
| 6D   | Ready                                                 | `personas.ts` and `context-manager.ts`/`route.ts`'s cap both unchanged — the byte-identical-output gate (Phase 5 §6, DoD item 9) has something stable to snapshot against                                                                                                       | Yes (sequenced after 6C)                                       |
| 6E   | Ready with Clarification (backfill sizing verified)   | `memories` table still has no `embedding` column; **the new migration-ledger-drift fact (§3, §9.2) adds a pre-condition this wave's Implementation Report must confirm resolved before this wave's own migration runs** — not a Wave 6E design gap, an operational precondition | Yes (sequenced after 6D), **with the new pre-condition noted** |
| 6F   | Ready                                                 | `env-validation.ts`, `eslint.config.mjs` both unchanged; the one dependency-labeling imprecision (Finding Min-1, task-level not wave-level 6D dependency) remains informational only                                                                                            | Yes (sequenced after 6E)                                       |

**No wave is rated Not Ready.** The only change from Phase 5.1's assessment is the addition of one operational pre-condition to Wave 6E (migration-ledger health, §9.2) — this does not downgrade 6E's readiness rating (it remains "Ready with Clarification"), because the precondition is checkable and resolvable well before Wave 6E's own kickoff (four waves away in the mandated sequential order), not a blocker to Phase 6A starting today.

---

## 8. Dependency Validation

Phase 5.1's independently-reconstructed Wave Dependency Audit (its own §9) is re-confirmed structurally unchanged, because it was derived from the ADRs' own text (§6 above confirms all nine ADRs unmodified) and from the Phase 5 dependency graph (§5 above confirms no repository fact underlying that graph has changed).

- **6A → 6C (hard):** unchanged — ADR-0007's Decision text still states Layer 2 "depends on ADR-0006's Provider Registry and Capabilities Descriptor existing first."
- **6A → 6F (soft, conceptual only):** unchanged — `withInstrumentation()` still wraps whatever shape `gateway.ts`'s three functions have, regardless of Registry internals.
- **6D → 6F (hard, one task only):** unchanged — the DI-lint-rule-extension task and the Governance artifact's content both still require `context-pipeline.ts`/the Prompt Pipeline module to exist first, and neither exists yet.
- **6E → 6A–6D (none):** unchanged — `embeddings.ts` is still confirmed routed through `brainEmbed()` today (§4), so Memory Ranking's embedding-generation step remains independent of every other wave.
- **No circular dependency:** re-confirmed — every edge in the graph still points in one direction (6A→6C, 6A→6F-conceptually, 6D→6F-partially); no wave depends, directly or transitively, on a wave that depends on it.
- **Mandated linear execution order `6A → 6B → 6C → 6D → 6E → 6F`:** still valid and still satisfies every dependency above without reordering.

**Verdict: the dependency graph Phase 5.1 validated is unchanged and re-confirmed valid. No new dependency, hidden dependency, or reverse dependency was found by this phase's independent re-check.**

---

## 9. Risk Baseline

Recorded before any Phase 6 code changes, per this phase's brief. No mitigation is implemented here — only identification, categorization, and (where applicable) the checkpoint at which mitigation is expected to occur, consistent with Phase 5 §8 (Risk Assessment) and Phase 5.1 §12 (Implementation Drift Risk Assessment), which this section synthesizes and extends with one new, repository-verified item (§9.2, migration risk).

### 9.1 Architectural risks

Carried forward from Phase 5.1's Implementation Drift Risk Assessment (its own §12), unchanged because no code has been written yet to have drifted:

- Provider-specific logic leaking outside the Provider Layer during 6B/6C.
- A new call site bypassing the Provider Registry during the window before the boundary lint rule ships (mitigated by the rule now shipping in Wave 6A itself, per Finding M-1's relocation).
- Bypassing the Context Pipeline mid-6D-migration, recreating GAP-09 temporarily.
- Duplicated routing logic — `routing.ts` currently has no planned lint-rule protection (Finding Min-4, still open).
- Duplicated prompt composition during the five-adapter migration window.
- Gateway boundary violations from the Context/Prompt Pipelines.
- Telemetry established late (6F) leaving 6A–6E's own new call sites without a settled `correlationId` convention while being built (Finding Min-5, still open).
- Wave 6A's interim direct-registry-lookup state becoming de facto permanent if 6C were delayed indefinitely (mitigated structurally by the sequential-gating rule, §10 below).

**Checkpoint:** each wave's own Architecture Compliance Checklist (Phase 5 §6.1) is the enforcement mechanism for every item above.

### 9.2 Migration risks

- **Wave 6E's schema migration (`memories.embedding`, HNSW index, `match_memories` RPC) is the highest-cost, highest-infrastructure-risk step in the entire plan** — unchanged assessment from Phase 5 §8 and Phase 4 §18. Additive-only, models the already-shipped `document_chunks` precedent, dual-path-safe throughout the backfill window (§9.4 of Phase 5).
- **New finding, this phase:** the linked Supabase project's migration ledger currently has unresolved local/remote drift, unrelated to Brain Gateway (§3). If this drift is not resolved before Wave 6E's migration is applied, Wave 6E's `add column if not exists`/`create or replace function` DDL could be applied against a remote schema state that does not match what the local migration history assumes, risking a migration that appears to succeed locally but diverges from the actual remote table shape. **This is not a Brain Gateway architecture risk and is not fixed by this phase** (fixing pre-existing account-deletion-initiative migration drift is out of scope for a Brain Gateway kickoff phase) — it is recorded here as a **precondition Wave 6E's own kickoff must independently re-verify resolved** (via `npx supabase migration list` showing no drift) before that wave's schema migration is applied, not before Phase 6A.
- Backfill batch failures against a live embedding provider (rate limits, transient errors) — unchanged, absorbed by the dual-path safety net (Phase 5 §5.5).

### 9.3 Rollback risks

- **`gateway.ts` and `types.ts` are each modified by three separate waves (6A, 6C, 6F)** — Phase 5.1's Finding Min-2, still open, still undisclosed as a caveat in Phase 5 §9 itself (recorded here, not corrected in Phase 5's document, since this phase does not edit prior-phase deliverables). A defect discovered in 6A or 6C only after 6F has already merged may require manual conflict resolution on revert rather than a guaranteed single-command `git revert`.
- Wave 6E's rollback (additive column unused if reverted, RPC drop safe) remains sound and independently re-confirmed against the current, still-unmodified `supabase/schema.sql`.
- Wave 6D's per-adapter independent revertibility remains sound — the five channel adapters still touch five distinct, non-overlapping files.

### 9.4 Testing risks

- **Regression backstop:** all 67 test files (65 unit + 2 integration) are green today (§3) — this is the explicit, re-verified starting state every wave's Definition of Done (Phase 5 §6, item 4) must preserve.
- Phase 5.1's Finding Min-3 (no dedicated Migration Validation axis in Phase 5 §10's testing-strategy table) remains open — the underlying safeguards exist in Phase 5 §5.5, only the cross-reference is missing. Recorded, not fixed, per this phase's non-editing posture toward prior deliverables.
- A wave's regression suite breaking for a reason unrelated to that wave's own change remains a standing risk the DoD's "full suite green" gate is the explicit backstop for.

### 9.5 Deployment risks

- Sequential wave-gating (Phase 5 §11) means a stalled review on any one wave blocks every subsequent wave — an accepted, undersized-by-design scheduling risk (Phase 5 explicitly does not estimate calendar duration, §16 of that document).
- `hasConfiguredProvider()`'s hand-maintained provider list (Wave 6F) drifting from the Registry's actual entries over time — an accepted, documented (not tooling-enforced) governance responsibility per Technical Design §10.2, unchanged.
- Lint false-positives from the `no-restricted-imports` boundary/DI rules — low likelihood, low impact, unchanged assessment.

**Verdict: no new architectural risk was found. One new, concrete migration-ledger risk was found via direct repository verification and is scoped correctly — a Wave 6E precondition, not a Phase 6A blocker. Every other risk category is a re-confirmed carry-forward from Phase 5/5.1, unchanged because no implementation has yet occurred to change it.**

---

## 10. Implementation Governance

Reiterated from the Roadmap and Phase 5 §11, binding for every wave of Phase 6:

1. **No architectural redesign.** Phase 6 implements the frozen architecture; it does not reopen any ADR, the Architecture Freeze, or the Technical Design.
2. **No ADR modification.** All nine ADRs (0006–0014) remain `Status: Accepted`, unmodified, for the duration of Phase 6.
3. **No undocumented implementation decision.** Every implementation choice must trace to the Roadmap, the Architecture Freeze, an ADR, or the Technical Design — the same traceability standard Phase 5's Traceability Matrix (§12) and Phase 5.1's Implementation Scope Audit (§10) already established and this phase re-confirmed holds (§5–§6 above).
4. **Sequential execution, mandatory order:** `6A → 6B → 6C → 6D → 6E → 6F` — no wave begins before the previous wave has completed review, passed testing (unit, applicable integration, full regression), and merged to `main` (Phase 5 §11).
5. **Every implementation wave must finish with:**
   - Implementation Report (per-wave, named in Phase 5 §3)
   - Architecture Compliance Report (the wave's completed Architecture Compliance Checklist, Phase 5 §6.1)
   - Implementation Decision Log
   - Technical Debt Register
6. **Every implementation wave must satisfy the Architecture Compliance Checklist** established in Phase 5.1 (now Phase 5 §6.1) before completion — twelve items, reproduced by reference, not duplicated here.
7. **Merge gate:** no wave's PR(s) merge until its Definition of Done (Phase 5 §6) is fully checked, its regression gate is green, and its PR is reviewed and approved.
8. **Rollback gate:** no wave is considered complete until its rollback mechanism has been verified at least once in practice, not merely asserted (Phase 5 §6, DoD item 7).
9. **Wave 6E carries one additional precondition** (§9.2 above): the linked Supabase project's migration-ledger drift must be independently re-verified resolved before Wave 6E's schema migration is applied — checked at Wave 6E's own kickoff, not at Phase 6A's.

---

## 11. Phase 6 Conclusion

**Implementation kickoff verification is complete.** All sixteen prerequisite phase merges are confirmed (§2). The repository baseline is healthy — build, lint, and the full 67-file test suite all pass (§3). The architecture baseline shows zero drift across all eight frozen domains in the one day since Phase 5.1's own verification (§4). Every Technical Design section Phase 6 will implement remains faithfully mapped to its Phase 5 wave and its governing ADR, with no repository fact invalidating that mapping (§5–§6). Every wave in the Roadmap's 6A–6F decomposition is independently re-confirmed Ready (two with pre-existing, non-blocking clarifications — 6C's correctly-deferred Layer 3, and 6E's now-two-part clarification: backfill sizing, already verified by Phase 5.1, plus the new migration-ledger precondition this phase found) (§7). The wave dependency graph contains no circular dependency and no hidden dependency beyond what Phase 5.1 already documented (§8). A risk baseline is recorded across architectural, migration, rollback, testing, and deployment categories, with one new, concretely-scoped migration risk added (§9).

**Recommendation: Phase 6A (Core Infrastructure) is declared Ready.** The implementation team may begin Phase 6A immediately using the Phase 5 Implementation Planning document (§5.1, Wave 6A's task list) and the Phase 4 Technical Design (§3–§4), without making any further architectural decision, subject to the Implementation Governance rules in §10 above and the one Wave-6E-scoped precondition recorded in §9.2.

---

## 12. Explicit Non-Goals Confirmation

Per this phase's spec, this document does not implement any production code, does not modify any database schema, does not introduce or run any migration, does not change any runtime behavior, does not modify any ADR, does not modify the Phase 4 Technical Design, and does not modify the Phase 3.1 Architecture Freeze or the Architecture Discovery it produced. No interface, schema fragment, or file path named anywhere in this document is newly invented here — every one is drawn directly from the Roadmap, an ADR, the Technical Design, or the Phase 5/5.1 Implementation Planning documents, or is a directly-observed repository fact (a line count, a file's existence/absence, a test result, a migration-ledger entry). The one new fact this phase contributes (§9.2, migration-ledger drift) is a repository observation, not an architectural, ADR, or Technical Design decision — it is recorded as a precondition for a future wave's own kickoff, with no code, schema, or migration changed by this phase to address it. Confirmed: only `docs/phase6-brain-gateway-implementation-kickoff.md` is added by this branch — no file under `src/`, `supabase/`, or `eslint.config.mjs` is modified.

## 13. Exit Criteria Checklist

- [x] All prerequisite phases are merged (§2 — sixteen PRs, #145–#160, all confirmed merged to `main`)
- [x] Repository baseline is verified (§3 — build, lint, full test suite all green; migration-ledger drift found and correctly scoped as a Wave 6E precondition, not a Phase 6A blocker)
- [x] Architecture baseline is verified (§4 — zero drift across all eight frozen domains)
- [x] Technical Design is confirmed implementable (§5 — all fourteen Technical Design sections re-verified faithfully mapped, no repository fact invalidating any mapping)
- [x] Every implementation wave is validated (§7 — Wave Readiness Assessment, no wave rated Not Ready)
- [x] No architectural drift exists (§4, §6 — zero drift, all nine ADRs unmodified and Accepted)
- [x] **Phase 6A is declared Ready** (§11)
