# Account Deletion — ADR-0005 Revision Report (Phase 4A.1)

**Status:** Complete. ADR-0005 revised; submitted for Independent Re-review. Phase 4B remains blocked pending acceptance.
**Written:** 2026-07-18.
**Scope:** Governance revision only — resolves the three blocking findings from the [Independent ADR-0005 Review Report](2026-07-18-account-deletion-adr-0005-independent-review.md) (verdict: MAJOR REVISIONS REQUIRED). No Architecture Discovery was redone, no alternative was reopened, no Technical Design or implementation was produced.
**Revises:** [ADR-0005](../adr/0005-account-deletion-verification-architecture.md).

---

## 1. Revision Summary

The Independent Review confirmed the chosen architecture (extend the Registry's `verificationAdapter` field, add one read-only SQL function, populate the already-reserved workflow verify steps, write evidence into `checkpoint`) and found no flaw in Alternative A's selection over B or C. It found ADR-0005's _scope statement_ incomplete in three places, all inside the already-chosen architecture:

1. ADR-0005 claimed `workflow.ts` needed "no architectural change" beyond real verify-step bodies. Independent, repository-evidence-based verification showed this is false: `CRITICAL_STEPS` (`workflow.ts:342`) contains only `"deleting_database"`, so a verification failure would not change the workflow's final status or the client-facing `success` field.
2. ADR-0005 acknowledged added latency from real verification round-trips but treated batching as a discovery-report "recommendation" rather than a binding requirement, and never checked whether `vercel.json` has a timeout override for the affected route (it does not, unlike every comparable route).
3. ADR-0005 said nothing about resume safety for the new verify steps, which — unlike the existing deletion steps — have no guard against re-running already-completed work on a resumed workflow.

This revision adds three new, binding items to ADR-0005's "Chosen Architecture" section (items 5, 6, 7), adds three corresponding Decision Log rows explicitly marked "New (revision)," tightens one Design Goal and one Trade-off bullet to match, and leaves everything else — Context, Problem Statement, Constraints, Alternatives Considered, items 1-4 of Chosen Architecture, Consequences, and all four original Open Questions — unchanged. No accepted decision (Registry extension, adapter reuse, checkpoint reuse, rejection of a separate verification table) was reopened.

## 2. Review Findings Resolution Matrix

| #   | Finding (Independent Review)                                                                                                                              | Severity          | Resolution                                                                                                                                                                                                                      | Where in revised ADR-0005                                                                                               |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | Verification failures don't propagate to final `status`/`success` — `CRITICAL_STEPS` only contains `"deleting_database"`                                  | High              | Added binding requirement: verification failure must be load-bearing for final status; exact status-transition mechanism deferred to Phase 4B (a HOW-altitude, TDD-level decision, not reopening the WHY-altitude architecture) | Chosen Architecture item 5; Decision Log row "Workflow outcome authority"; Design Goal 4 (tightened)                    |
| 2   | No `vercel.json` `maxDuration` override for the GDPR route while comparable routes have one; ADR didn't connect added latency to this concrete constraint | Medium-High       | Added binding requirement: database verification must be one batched call (not per-table); Phase 4B must evaluate/set the route's timeout headroom                                                                              | Chosen Architecture item 6; Decision Log row "Runtime duration / batching requirement"; Trade-offs bullet 3 (tightened) |
| 3   | New verify steps (and `stepVerifyStorage`'s existing implementation) lack the `isPhaseCompleted()` resume-skip guard the deletion steps have              | Medium            | Added binding requirement: all three verify steps must use the existing skip-guard pattern before re-executing on resume                                                                                                        | Chosen Architecture item 7; Decision Log row "Resume safety for verification steps"                                     |
| —   | (Secondary, from Risk Assessment) Missing 5th Open Question for the status-derivation gap                                                                 | Low (bookkeeping) | Not added as an Open Question — it is no longer open; it is now Chosen Architecture item 5, a binding requirement. Confirmed consistent with how the other four Open Questions are scoped.                                      | Open Questions section (amended note)                                                                                   |

All four items the Independent Review flagged as blocking or near-blocking are resolved. No finding from the review's §§1-12 (Roadmap Compliance, Baseline Consistency, Requirements Traceability, Evidence Validation for the other 5 of 6 checked claims, Reuse Validation, Alternatives Analysis, Complexity, Separation of Concerns, remaining Production Impact dimensions, remaining Open Questions, remaining Decision Log rows) required a change — the review's own verdict was explicit that these passed independent verification without qualification.

## 3. Repository Audit (pre-revision)

Before making any change, the three findings' cited evidence was re-verified against current HEAD (not trusted from the review's own citations):

- `workflow.ts:342` — `const CRITICAL_STEPS: DeletionWorkflowStatus[] = ["deleting_database"];` — confirmed unchanged.
- `workflow.ts:473` — `if (failed.length > 0 && CRITICAL_STEPS.includes(status))` — confirmed unchanged.
- `route.ts:111` — `success: result.status === "completed"` — confirmed unchanged.
- `settings/privacy/page.tsx:59-64` — confirmed still branches on `success`.
- `workflow.ts:223`, `:243` — `isPhaseCompleted()` guards on `stepDeletingDatabase`/`stepDeletingStorage` — confirmed present; confirmed still absent from `stepVerifyDatabase`/`stepVerifyStorage`/`stepVerifyExternal`.
- `vercel.json`'s `functions` block — confirmed still has no entry for `src/app/api/emma/gdpr/route.ts`, while `emma/route.ts` (60s), `agent/route.ts` (120s), `vision/route.ts` (30s), and eight other routes have explicit overrides.
- `git log --oneline -- src/core/account-deletion/ src/app/api/emma/gdpr/route.ts src/app/settings/privacy/page.tsx vercel.json` — most recent touching commit is `83a6014` (Phase 3.1's concurrency fix), predating every documentation commit made today. **No implementation drift occurred between the review and this revision.**

## 4. Requirements Traceability Validation

The discovery report's Requirements Traceability Matrix (§14) is unaffected by this revision at the component level — every "Existing Component" and "Proposed Extension" cell still holds, since no new component was introduced and no existing one was reused differently. Three RTM rows are now more precisely bound by the revised ADR, without their traceability links breaking:

| Roadmap Deliverable       | RTM row (discovery report §14)                                         | Effect of this revision                                                                                                                        |
| ------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Verification result model | "Extend `CheckpointEntry` shape to carry verification-specific detail" | Now explicitly includes: the result must be capable of influencing final workflow status (Chosen Architecture item 5), not just being recorded |
| Verification reporting    | "Additive structured rollup in the route response"                     | Now explicitly bound to reflect a `success` value that accounts for verification outcome, not just deletion outcome                            |
| Resource verification     | "Add database-resource verification via the new SQL function"          | Now explicitly bound to be a single batched call (Chosen Architecture item 6), not per-table                                                   |

No roadmap deliverable lost its mapping. No orphan component was introduced — items 5, 6, 7 are requirements on the already-mapped "Workflow (`workflow.ts`)" and "New SQL function" components, not new components themselves. The RTM document itself (`2026-07-18-account-deletion-phase4a-architecture-discovery.md`) was **not** edited, consistent with this project's established convention of appending clarifying addenda rather than rewriting prior reports (the same approach the Phase 3.1 Documentation Synchronization Report used for the Phase 3 PRR) — this revision report serves that role for the discovery report's RTM.

## 5. Self Verification Report

| Check                                                        | Result                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every Independent Review finding addressed                   | Yes — all 3 blocking findings (§2 above) resolved; the 4th (missing Open Question) resolved by obsoleting it rather than adding it                                                                                                                         |
| No new architectural scope introduced                        | Confirmed — Alternative A remains the chosen architecture; no new persistence model, registry, or adapter contract was added; items 5-7 are requirements on already-chosen components, not new components                                                  |
| Roadmap compliance intact                                    | Confirmed — no Phase 5-7 scope entered the ADR; all "Out of Scope" items re-checked against the revised text, none violated                                                                                                                                |
| Accepted architectural decisions unchanged where appropriate | Confirmed — Registry extension, adapter reuse, checkpoint reuse, and the rejection of a separate `verification_results` table are all marked "Unchanged" in the revised Decision Log and their text is untouched                                           |
| Every architectural claim references repository evidence     | Confirmed — items 5-7 cite exact file:line locations (`workflow.ts:342`, `:473`, `:223`, `:243`; `route.ts:111`; `vercel.json`'s `functions` block), all re-verified against current HEAD in §3 above, not merely carried over from the review's citations |
| ADR-0005 ready for Independent Re-review                     | Yes                                                                                                                                                                                                                                                        |
| Phase 4B remains blocked                                     | Yes — explicitly restated in ADR-0005's Status line and this report's header; nothing in this revision authorizes proceeding without a passing re-review                                                                                                   |

No TDD, implementation, SQL, migration, API design, or folder structure was produced at any point in this revision, consistent with this task's constraints.
