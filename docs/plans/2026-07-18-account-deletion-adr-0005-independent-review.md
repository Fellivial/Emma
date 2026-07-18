# Account Deletion — Independent Review of ADR-0005

**Status:** Complete. **Verdict: MAJOR REVISIONS REQUIRED.** ADR-0005 is **not approved**. Phase 4B (Technical Design) **must not begin** until the revisions below are made and this ADR is re-reviewed.
**Written:** 2026-07-18.
**Reviewer independence:** Performed by a fresh review agent with no prior context on this initiative and no authorship stake in ADR-0005 — dispatched specifically so this review would not be the same reasoning trace that wrote the ADR grading itself. Its two most load-bearing findings were independently re-verified a second time, directly, by the orchestrating session (see §5).
**Subject:** [ADR-0005](../adr/0005-account-deletion-verification-architecture.md) (Proposed) and its companion [Phase 4A Architecture Discovery Report](2026-07-18-account-deletion-phase4a-architecture-discovery.md).
**Baseline reviewed:** `docs/roadmaps/account-deletion-roadmap-v1.md`, ADR-0001 through ADR-0004, the Phase 1-3 Technical Design Document, the Phase 3.1 Hardening/Live-Validation/Production-Readiness reports, and current implementation under `src/core/account-deletion/*`, `src/app/api/emma/gdpr/route.ts`, both migrations, and `vercel.json`.

---

## 1. Repository Validation Report

Every component ADR-0005 and its discovery report cite was checked against the actual file:

| Claim                                                                                                                                                           | Verified against                                                                            | Result                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Registry: 37 entries (32 `DatabaseResourceEntry` + 5 `OtherResourceEntry`), `verificationAdapter: string \| null` on `ResourceEntryBase`, `null` on every entry | `registry.ts:35-60` (interface), full enumeration of `DATABASE_RESOURCES`/`OTHER_RESOURCES` | Confirmed                                                    |
| `STATE_ORDER` includes `verify_database`/`verify_storage`/`verify_external` positioned after all deletion phases, before `completed`                            | `workflow.ts:344-356`                                                                       | Confirmed                                                    |
| `stepVerifyDatabase`/`stepVerifyExternal` are pure pass-throughs emitting `"skipped"` entries                                                                   | `workflow.ts:289-298`, `:324-333`                                                           | Confirmed                                                    |
| `stepVerifyStorage` calls real `adapter.verify()`                                                                                                               | `workflow.ts:300-322`, `storage-bucket-adapter.ts:40-57`                                    | Confirmed — re-lists, does not trust `delete()`'s own report |
| `deletion_requests` schema matches `workflow-types.ts` 1:1                                                                                                      | `20260715000001_deletion_requests.sql:15-35` vs `workflow-types.ts`                         | Confirmed                                                    |
| `deletion_requests` is not one of the 32 `DATABASE_RESOURCES` deletion targets                                                                                  | Full enumeration of `registry.ts:86-494`                                                    | Confirmed                                                    |
| `auth.users` is never deleted by the GDPR flow                                                                                                                  | Repo-wide grep for `deleteUser`, `admin.deleteUser`, any `auth.users` DELETE outside DDL    | Zero matches — confirmed                                     |
| Test suite baseline (60/60 for the account-deletion files)                                                                                                      | Re-ran `npx vitest run` against all six account-deletion test files                         | Confirmed, independently, a second time                      |

No undocumented dependency was found. No referenced component turned out to be missing or misdescribed. The documentation-drift items the discovery report itself already disclosed (stale `OTHER_RESOURCES` comment, placeholder `ADR-000X` in the migration header) were re-confirmed present and still un-fixed — correctly disclosed, not newly discovered.

## 2. Roadmap Compliance Report

All eight roadmap-listed Phase 4 deliverables (verification framework, lifecycle, status model, result model, evidence, resource verification, registry integration, reporting) are addressed in ADR-0005's Chosen Architecture and traced in the discovery report's RTM. No scope from Phase 5 (grace period, scheduling), Phase 6 (reconciliation automation), or Phase 7 (dashboards, operational tooling) has entered the ADR — checked explicitly against each "Out of Scope" item in the roadmap's Phase 4 section, and none is quietly implemented.

**One compliance gap in substance, not bookkeeping:** the roadmap's Phase 4 Success Criteria include _"generate the final status based on verification results."_ The ADR's Chosen Architecture claims this is satisfiable with "no architectural change" to `workflow.ts` beyond real step bodies. That claim does not hold under direct code inspection — see §5.

## 3. Requirements Traceability Review

Every row in the discovery report's RTM (§14) was checked. All eight "Existing Component" citations verified. No orphan components (nothing proposed lacks a roadmap-deliverable justification). No roadmap deliverable is missing a row. The RTM is accurate as a mapping exercise — its weakness is one level up, in the discovery report's own Architecture Validation (§10), which asserts the _composed result_ of these mapped pieces already satisfies the "final status" success criterion. That assertion is the specific claim that fails verification (§5).

## 4. Architecture Evidence Review

Six specific factual/technical claims were checked directly against their cited sources:

1. `document_chunks.user_id` schema.sql citation — exact match.
2. No standalone migration exists for the four schema-drift tables — confirmed via glob, zero matches.
3. Zero grep matches for verification-specific type/function names anywhere in the repo pre-Phase-4A — true of the code; the discovery report's own prose is now a trivial self-match, not a real inconsistency.
4. `settings/privacy/page.tsx` already reads `status`/`success`, not just `res.ok` — confirmed (`page.tsx:59,65`).
5. Phase 3.1 PRR's "should not need to revisit this phase's fix" quote — an accurate, non-distorting paraphrase of the source.
6. **Unsupported:** discovery report §10's claim that "generate final status from verification results" is "achievable within Alternative A without new infrastructure beyond one additive SQL function." Traced the actual mechanism (`CRITICAL_STEPS`, `persist()`, `route.ts`'s `success` derivation, `privacy/page.tsx`'s branch on it) and found this claim false as currently coded. This is the review's central finding — see §5.

## 5. The Central Finding — Status Propagation Gap

Independently verified twice: once by the dispatched reviewer, once directly by this session against the same three files.

- `workflow.ts:342` — `const CRITICAL_STEPS: DeletionWorkflowStatus[] = ["deleting_database"];` — the **only** step whose failure escalates the workflow to `retry_pending`/`failed`. Confirmed by direct `Grep`, not paraphrase.
- `workflow.ts:473` — `if (failed.length > 0 && CRITICAL_STEPS.includes(status))` — any `verify_database`/`verify_storage`/`verify_external` failure does **not** satisfy this condition, so it falls through to the `best_effort_step_failed` log-only branch (`workflow.ts:486-491`) and the loop continues on to `completed`.
- `route.ts:111` — `success: result.status === "completed"` — the client-facing success flag is derived solely from final `status`.
- `settings/privacy/page.tsx:59-64` — `if (data.success) { ... "success" message ... }` — confirmed by direct `Grep`.

**Consequence:** as ADR-0005 currently scopes Phase 4B's changes to `workflow.ts` ("no architectural change" beyond real `stepVerifyDatabase`/`stepVerifyExternal` bodies), a Phase 4B implementation could detect real leftover data during verification, log it faithfully as a `"failed"` checkpoint entry, and the user would still see "Your Emma data was deleted" — because nothing in the currently-scoped architecture routes a verification failure into the status the client actually reads. This is not a hypothetical edge case; it is the literal, direct consequence of `CRITICAL_STEPS`' current contents combined with ADR-0005's stated scope, and it defeats the roadmap's own stated Phase 4 objective: _"The completion workflow must not be considered proof of successful deletion without a verification process."_

This is an evidence failure in the discovery report (an unverified claim presented as verified), not a flaw in Alternative A itself — the fix stays entirely inside the chosen architecture (see §12).

## 6. Reuse Validation Review

The one "Create New" decision (a read-only, Registry-parameterized SQL function for database-resource verification) remains justified on independent review: no existing read-only, multi-table, Registry-driven query mechanism exists, and both alternatives to it (a dry-run flag on the existing mutating delete function; ad hoc per-table application-code queries) are correctly identified as worse — the former conflates two different risk/blast-radius profiles under one function, the latter loses the centralized identifier-safety validation the existing pattern provides. No other component in ADR-0005 should have reused/extended something it instead proposed as new — there is no other "new" component to challenge.

## 7. Alternative Analysis Review

The three alternatives are not a strawman comparison. Alternative B (new separate `verification_results` table) is disqualified by the roadmap's own text — its explicit anti-duplication constraint and its declared dependency on `deletion_requests` — not by an invented downside. Alternative C's rejection is precise, not dismissive: it explicitly separates C's _principle_ (independently re-verify, don't trust the deletion step's self-report) — which is preserved and adopted into the chosen architecture — from C's _structural_ proposal (a fully decoupled, separately-triggered execution path) — which is correctly rejected because triggering/scheduling is Phase 5 scope, not Phase 4. No plausible fourth alternative was found that isn't already implicitly covered by the rejected "ad hoc per-table queries" option in the Reuse Validation table.

## 8. Complexity Assessment

The proposed extension footprint is genuinely small: one new field-value population, one new narrowly-scoped SQL function, real bodies for two already-declared functions, entries into an already-existing evidence array. This does not overload `checkpoint jsonb` or the Registry beyond what they were already designed to hold — the `verify_*` states were reserved in the same status enum as the deletion states since Phase 1, so this is filling a designed slot, not repurposing one. No speculative abstraction was introduced (no new interface, no new registry, no premature generalization for OAuth/background-job resources that don't have deletion adapters yet).

The one place complexity is _understated_ rather than _overloaded_ is precisely the status-propagation gap in §5 — the ADR treats the workflow-side change as zero-complexity when it is, in fact, the one piece of real design work Phase 4 exists to accomplish and Phase 4B is not currently told to do it.

## 9. Separation of Concerns Review

- **Registry:** stays inventory-only. `verificationAdapter` values proposed as labels (mirroring the existing `deletionAdapter: "legacy-table-delete"` pattern), not literal adapter objects — consistent with the precedent ADR-0004 already set and justified for the same reason (cross-table atomicity for the delete side; equivalent read-batching logic for the verify side).
- **Workflow:** stays orchestration-only. The new SQL function stays read-only and structurally separate from the mutating delete function, correctly avoiding "two risk profiles, one function."
- **Verification:** isolated to the two named step functions and the new SQL function — no smearing of verification logic into the Registry or into unrelated route handlers found.
- **Persistence boundaries:** consistent — `checkpoint jsonb` remains the single evidence store; no second implicit persistence path introduced.

No separation-of-concerns violation found. The §5 gap is a _completeness_ problem, not a boundary problem — the missing logic belongs exactly where `CRITICAL_STEPS` already lives.

## 10. Production Impact Review

Two impacts ADR-0005 did not name, both independently confirmed this session:

- **No `vercel.json` `maxDuration` override exists for `src/app/api/emma/gdpr/route.ts`.** Confirmed directly: `vercel.json`'s `functions` block sets explicit overrides for `emma/route.ts` (60s), `agent/route.ts` (120s), `vision/route.ts` (30s), and eight other routes — but contains no entry at all for the GDPR route. This route already runs a synchronous 32-table atomic delete plus two best-effort Storage deletes in one HTTP request; ADR-0005 adds a 32-table verification read and a Storage re-list to the same synchronous request (Alternative C, which would have moved this out of the request path, was explicitly rejected). The ADR's own Trade-offs section acknowledges added latency and defers batching to Phase 4B as a recommendation, not a requirement, without connecting it to this specific, checkable platform constraint.
- **The placeholder `stepVerifyDatabase`/`stepVerifyExternal` lack the `isPhaseCompleted()`-style resume-skip guard** that `stepDeletingDatabase`/`stepDeletingStorage` already have (`workflow.ts:223`, `:243`). Combined with the timeout risk above, a request interrupted mid-verification and re-invoked would re-run the entire verify step and append a duplicate batch of checkpoint entries — compounding the already-disclosed Phase 3.1 technical debt item ("checkpoint entries accumulate... on every resume"). Not mentioned as a Phase 4B consideration anywhere in ADR-0005.

All other production-impact dimensions ADR-0005 did name (persistence: additive-only; API contract: additive; backward compatibility: preserved; deployment: same risk class as the existing migration) were checked and hold.

## 11. Open Questions Review

The four listed open questions (evidentiary standard for "auditable evidence"; OAuth/background-job adapter ownership; production schema-drift parity; `CheckpointResourceStatus` vocabulary fork) are genuinely unresolvable at ADR altitude, and each is assigned to a sensible owner (product/legal, the roadmap owner, ops, and the Phase 4B TDD author, respectively) — none is a disguised engineering decision the ADR should have just made.

**One open question is missing that should exist:** whether/how `workflow.ts`'s status-derivation mechanism needs to change so verification failures affect `deletion_requests.status` and therefore the client-facing `success` field. This is not listed as resolved, deferred, or open — it is simply absent, while the discovery report's §10 asserts (incorrectly) that it is already handled.

## 12. Decision Log Review

Every decision row in ADR-0005's Decision Log was checked for rationale completeness, reasonableness of rejected alternatives, and documented consequences:

- "Overall Phase 4 verification architecture" (Alternative A) — rationale complete, rejected alternatives reasonable, consequences documented. **Holds.**
- "Database resource verification mechanism" (new SQL function) — rationale complete and independently confirmed justified (§6). **Holds.**
- "Verification independence principle" — rationale complete, correctly scoped. **Holds.**
- "Verification status/result vocabulary" (deferred to Phase 4B) — reasonable deferral of a type-shape decision. **Holds.**
- "OAuth/background-job verification scope" (deferred) — reasonable, correctly scoped as a roadmap-owner question. **Holds.**

**Missing row:** there is no Decision Log entry for "how does a verification failure affect the workflow's final status" — because the ADR's text asserts no decision is needed here ("no architectural change"), which §5 shows is incorrect. This should be a sixth row, not an implicit non-decision.

## 13. Risk Assessment

| Risk                                                                                                                                                                                                                               | Category                    | Severity        | Justification                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verification failures don't propagate to final `status`/`success`, so a user can be told deletion succeeded when verification found leftover data                                                                                  | Architectural / Correctness | **High**        | Directly undermines the roadmap's Phase 4 objective and ADR-0005's own Design Goal 4 ("deletion success and verification success must become distinguishable"). A TDD written in literal compliance with the ADR's current text would not close this gap. Independently verified, §5. |
| `src/app/api/emma/gdpr/route.ts` has no `maxDuration` override while every comparable route does; Phase 4 adds synchronous round-trips to an already-synchronous multi-step request                                                | Production / Operational    | **Medium-High** | Confirmed via direct `vercel.json` inspection, §10. Not hypothetical — the long-synchronous-chain pattern already exists pre-Phase-4.                                                                                                                                                 |
| New verify steps lack resume-skip guards; combined with the timeout risk, repeated interruption could append unbounded checkpoint entries                                                                                          | Maintenance / Operational   | **Medium**      | Compounds already-disclosed Phase 3.1 tech debt; unaddressed in ADR-0005.                                                                                                                                                                                                             |
| The new SQL function inherits the same type/casting risk class Phase 2.1 found real bugs in, and can only be fully live-validated once the pre-existing `document_chunks.user_id` schema-drift gap is resolved on some environment | Production                  | **Medium**      | Disclosed by the ADR itself as requiring "the same discipline" as the delete function; genuinely blocks full live validation independent of implementation quality.                                                                                                                   |
| OAuth/background-job resources remain permanently unverifiable with no roadmap-assigned owner phase                                                                                                                                | Architectural / Governance  | **Low**         | Correctly disclosed as inherited, not introduced, by this ADR.                                                                                                                                                                                                                        |
| Stale `OTHER_RESOURCES` comment and placeholder `ADR-000X` migration header remain unfixed in files Phase 4B will directly edit                                                                                                    | Maintenance                 | **Low**         | Cosmetic; already disclosed as out of scope for a discovery stage, but risks compounding confusion once Phase 4B populates `verificationAdapter` values in the same file.                                                                                                             |
| No guard exists against a future, unrelated code path deleting `auth.users`, which would silently invalidate the durability claim this ADR's entire evidence model rests on                                                        | Architectural               | **Low**         | Currently true and re-verified this session (§1); the risk is about future drift, already named in the ADR's own Assumption 2, just unmitigated.                                                                                                                                      |

---

## Independent ADR Review Report — Summary

**Strengths:** the core architectural decision (extend the Registry/adapter/checkpoint substrate rather than build new persistence or a decoupled system) is well-reasoned, evidence-backed under direct re-verification, and correctly rejects the two weaker alternatives for sourced, non-strawman reasons. Every claim about the _current_ implementation's shape checked out exactly against the code. The Requirements Traceability Matrix has no orphans and no gaps. The reuse decision for the one new component is genuinely justified, not just asserted.

**Weaknesses:** one specific, load-bearing claim in the discovery report's Architecture Validation — that the roadmap's "generate final status from verification results" success criterion is already achievable with no workflow-side architectural change — is false under direct code inspection. This is not a flaw in the chosen architecture; it is a gap in what the ADR currently obligates Phase 4B to build. Two production-impact considerations (serverless timeout exposure, resume-skip guards for the new verify steps) were independently found and are absent from both documents.

**Inconsistencies:** the discovery report's RTM correctly maps every deliverable's _components_, while its own Architecture Validation section overclaims what those components, as scoped, actually accomplish together — an internal inconsistency between two sections of the same document.

**Unsupported assumptions:** the implicit assumption that populating `verificationAdapter` and giving `stepVerifyDatabase`/`stepVerifyExternal` real bodies is sufficient, on its own, to satisfy the roadmap's status-differentiation success criterion. It is not, absent an explicit change to `CRITICAL_STEPS` or an equivalent status-derivation mechanism.

**Missing evidence:** no trace-through of `CRITICAL_STEPS` → `persist()` → `route.ts`'s `success` field → `privacy/page.tsx`'s client display exists anywhere in either document, despite this being the exact mechanism the roadmap's success criterion depends on.

**Recommended revisions** (see §14 for the binding recommendation):

1. Add explicit, binding scope to ADR-0005's "Chosen Architecture" (a fifth numbered item, or an amendment to item 3) requiring `workflow.ts`'s status-derivation logic to be extended so that a verification failure is reflected in the request's final `status` and therefore in the client-facing `success` field — closing the gap in §5 without reopening the alternatives analysis or the chosen architecture's overall shape.
2. Add a sixth Decision Log row documenting this decision explicitly, rather than leaving it as an implicit non-decision.
3. Add the two production-impact findings from §10 (serverless timeout exposure; missing resume-skip guards on the new verify steps) to the Trade-offs and/or Production Impact framing, so Phase 4B inherits them as named constraints rather than discovering them independently.
4. Add a fifth Open Question (or fold into the revised Chosen Architecture) naming who decides the exact status-derivation mechanism (whether verify steps join `CRITICAL_STEPS` outright, or need a distinct, less-drastic status transition than `retry_pending`/`failed` — since verification failure and deletion failure may warrant different workflow semantics) as a Phase 4B TDD-level decision, now that the _requirement_ to make one is explicit at the ADR level.

None of these revisions require reopening the choice of Alternative A, redesigning any component, or expanding scope into Phase 5-7 — they close a real gap inside the architecture already chosen.

## 14. ADR Approval Recommendation

**Return ADR-0005 for revision.** Do not accept as currently written. The core architectural direction is sound and does not need to change; the ADR is incomplete in a way that would let Phase 4B ship a technically-compliant implementation that fails the roadmap's actual Phase 4 objective.

## 15. Phase Gate Recommendation

**Phase 4B (Technical Design) may not begin yet.** Roadmap compliance, repository evidence, and requirements traceability are otherwise verified and complete, but one critical architectural issue remains open (§5, §13) — this alone is sufficient, per this review's own success criteria, to withhold a proceed recommendation. Once ADR-0005 is revised per §13's numbered items and re-reviewed, Phase 4B can proceed on the same chosen architecture without further delay — this is not a request to restart Architecture Discovery.

---

## Verdict

**MAJOR REVISIONS REQUIRED.**

Scoped narrowly: the alternatives analysis, reuse validation, baseline consistency, and requirements traceability all pass independent verification without qualification. The single critical issue is that ADR-0005, as currently worded, does not obligate Phase 4B to build the one piece of logic that makes verification actually change what a user is told about their deletion's outcome — which is the entire reason the roadmap commissioned Phase 4. This is fixable within the chosen architecture and does not require re-litigating Alternative A vs. B vs. C.
