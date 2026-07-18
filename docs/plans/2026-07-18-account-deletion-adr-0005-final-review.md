# Account Deletion — ADR-0005 Final Independent Re-review (Acceptance Gate, Phase 4A.3)

**Status:** Complete. **Verdict: APPROVED WITH MINOR EDITORIAL CHANGES.** ADR-0005 status is now **Accepted**. Phase 4B (Technical Design) may begin.
**Written:** 2026-07-18.
**Reviewer independence:** Performed by a fresh review agent with no prior context on this initiative and no authorship stake in ADR-0005 or any of its three prior revision passes. Its central finding was independently re-verified a second time, directly, by the orchestrating session.
**Subject:** [ADR-0005](../adr/0005-account-deletion-verification-architecture.md), after two completed revision cycles (Phase 4A.1 architectural gap closure, Phase 4A.2 documentation finalization).
**Baseline reviewed:** the frozen roadmap, ADR-0001 through ADR-0004, the Phase 1-3 TDD, the Phase 3.1 Production Readiness Report, all three prior ADR-0005 review/revision reports, and current implementation under `src/core/account-deletion/*`, `src/app/api/emma/gdpr/route.ts`, `src/app/settings/privacy/page.tsx`, both migrations, and `vercel.json`.

---

## 1. Repository Validation Report

Every claim in the current (pre-fix) ADR-0005 was independently re-verified against current `HEAD`, including all three items added in the Phase 4A.1 revision and re-audited during Phase 4A.2's documentation trim:

- `CRITICAL_STEPS` contains only `"deleting_database"` (`workflow.ts:342`) — confirmed, unchanged.
- Verify-step failures fall through to the log-only branch (`workflow.ts:473-491`) — confirmed.
- `success: result.status === "completed"` (`route.ts:111`) — confirmed.
- Client branches on `success` (`privacy/page.tsx:59-64`) — confirmed.
- `isPhaseCompleted()` guards exist only on `stepDeletingDatabase`/`stepDeletingStorage` (`workflow.ts:223`, `:243`), absent from all three verify steps — confirmed by reading each verify-step body in full, not just trusting the citation.
- No `maxDuration` entry for the GDPR route in `vercel.json`, while 16 other route entries exist — confirmed.
- No implementation drift: `83a6014` remains the most recent commit touching any relevant file; working tree confirmed clean.
- Account-deletion test suite: 60/60 passing, reproduced independently.
- Registry: 37 entries (32 database + 5 other), `verificationAdapter: null` on every entry — confirmed by direct enumeration.

**One inaccuracy found, independently re-confirmed by this session:** ADR-0005 (Chosen Architecture item 5) and the Acceptance Readiness Report both cited a "Roadmap's Architecture Authority model/table" as an existing repository artifact. `grep -rn "Architecture Authority" docs/` and a case-insensitive search of the roadmap file itself both return **zero matches** anywhere except in ADR-0005 and its own Acceptance Readiness Report. The phrase originated from this session's own task-instruction text (a governance table given directly in conversation during Phase 4A's brief) and was never actually written into `docs/roadmaps/account-deletion-roadmap-v1.md` — a real citation error, now fixed (see §16).

## 2. Roadmap Compliance Report

All eight Phase 4 deliverables remain covered. Every "Out of Scope" item was re-checked against the full current ADR text, including the Governance/Production Impact/Assumption Summary sections added in Phase 4A.2 — no Phase 5-7 scope found anywhere. The Production Impact Summary's own "Operational" row correctly self-attests no scheduler/dashboard/operator surface was introduced.

## 3. Requirements Traceability Review

The discovery report's RTM (§14) still maps cleanly to every current Decision Log row and Chosen Architecture item. No orphans, no gaps. The Revision Report's traceability table correctly identifies which RTM rows became more tightly bound without breaking any link.

## 4. Architecture Evidence Review

Five additional specific claims (beyond what the two prior reviews already checked) were verified directly: the 37-entry Registry count, `stepVerifyStorage`'s missing resume guard, the `deletion_requests` FK to `auth.users`, the Phase 3.1 PRR quote, and the "Architecture Authority" citation. Four held exactly; the fifth is the finding in §1.

## 5. Chosen Architecture Review

Alternative A remains correct. Every extension point (Registry field, adapter `verify()` contract, reserved workflow states, checkpoint evidence store) is confirmed real and reserved for exactly this purpose. Nothing across three revision passes weakened this — the reviewer stated explicitly it would not choose differently today.

## 6. Alternative Analysis Review

Unchanged and still non-strawman. B remains disqualified by the roadmap's own anti-duplication constraint and declared `deletion_requests` dependency; C's principle (independent re-verification) remains correctly folded into A while its structural proposal (decoupled triggering) remains correctly deferred to Phase 5.

## 7. Reuse Validation Review

Registry, adapter, `STATE_ORDER`, and checkpoint reuse all confirmed appropriate against current code. The one new component (read-only SQL function) remains justified — no existing read-only, multi-table, Registry-parameterized query mechanism exists, and conflating it with the mutating delete function was correctly rejected.

## 8. Separation of Concerns Review

Registry inventory-only, workflow orchestration-only, the new SQL function read-only and structurally separate from the delete function, `checkpoint jsonb` as the single evidence store — all confirmed unchanged and correctly divided in the current ADR text.

## 9. Production Impact Review

Complete at ADR altitude. All six dimensions (runtime, database, API contract, backward compatibility, deployment, operational) covered; the operational row's `vercel.json` evidence independently re-confirmed. Exact timeout values and batching implementation correctly left to Phase 4B.

## 10. Architectural Assumptions Review

All six condensed assumptions checked against the discovery report's full Assumption Register and against code. Each retains its correct nuance (e.g., "validated for technical correctness, unresolved for compliance sufficiency" is not overclaimed as fully validated). Nothing important was lost in the Phase 4A.2 condensation.

## 11. Decision Log Review

Eight rows, each traceable, each severity cross-checked against the original Independent Review's own Risk Assessment (High/Medium-High/Medium for the three revision-added rows — all match). No hidden or undocumented decision found.

## 12. Open Questions Review

All four questions genuinely belong at ADR altitude (product/legal, roadmap-owner, ops, and Phase 4B-TDD-level respectively). The prior review's "missing 5th question" remains correctly resolved by promotion to a binding Chosen Architecture item rather than left open.

## 13. Governance Review

The header, the Governance & Approval State table, and the Decision Log's Current State column were all found internally consistent with each other and with the documented history of all three prior passes — with the one exception being the citation gap in §1, which touches this section's own evidence claim specifically and is now fixed.

## 14. Complexity Assessment

Appropriately scoped — not over- or under-engineered. Extension footprint remains small: one field population, one narrow new SQL function, real bodies for two already-declared functions, entries into an already-existing array. No speculative abstraction found.

## 15. Risk Assessment

| Risk                                                                                          | Severity                                      | Status                                                                                                                    |
| --------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Verification failures don't propagate to final status without correct Phase 4B implementation | Medium (down from the original review's High) | Mitigated at ADR level — now a binding requirement (item 5); residual risk is Phase 4B execution quality, not an ADR gap  |
| No `maxDuration` override for the GDPR route                                                  | Medium                                        | Mitigated at ADR level — binding requirement (item 6)                                                                     |
| `stepVerifyStorage`'s pre-existing, already-shipped code lacks a resume-skip guard            | Medium                                        | Correctly scoped into item 7's binding text, which explicitly covers retrofitting already-shipped code, not only new code |
| New SQL function inherits Phase 2.1's type/casting risk class                                 | Medium                                        | Disclosed, correctly not "fixed" at ADR level — blocked on a pre-existing, unrelated environment/schema-drift question    |
| OAuth/background-job resources permanently unverifiable, no owner phase                       | Low                                           | Correctly disclosed as inherited, not introduced                                                                          |
| "Architecture Authority" citation didn't resolve to a real artifact                           | Low                                           | Fixed in this revision (§16)                                                                                              |
| Stale `OTHER_RESOURCES` comment / `ADR-000X` placeholder remain in `registry.ts`              | Low                                           | Correctly disclosed each pass as out of scope; will compound minor confusion for Phase 4B, not blocking                   |

## 16. Resolution Applied

The one finding (§1, §4, §13) — an unsupported citation to a "Roadmap Architecture Authority model/table" — has been fixed directly in ADR-0005's Chosen Architecture item 5, replacing the invented citation with an accurate one to the roadmap's actual Governance section text ("technical details must reside in the ADR and TDD"). This is a wording-only fix; it does not change item 5's binding requirement, its evidence (`workflow.ts:342`), or any other section. Per this project's established convention of appending rather than rewriting prior historical reports, the parallel citation in the Acceptance Readiness Report (a snapshot of what was believed true at the time it was written) is left unedited — this report serves as the correction record instead.

## Independent Summary

ADR-0005 held up under adversarial, from-scratch, third-pass verification. Every binding requirement added in Phase 4A.1 — workflow outcome authority, runtime duration/batching, resume safety — was independently re-verified against current code and holds exactly as written; Phase 4A.2's documentation trim did not weaken any of them. The alternatives analysis, reuse validation, separation of concerns, and requirements traceability all pass without qualification. Exactly one issue was found across the entire document, and it is a citation-accuracy nit inside a pass whose specific purpose was tightening citations — not a defect in the architecture itself.

## Strengths

- Every "must" requirement cites exact, independently-reproducible file:line evidence.
- Zero implementation drift across three review passes — same commit (`83a6014`), same line numbers, every time.
- Non-strawman alternatives analysis, unchanged and re-confirmed sound.
- Test suite (60/60) reproduced independently at every pass, not merely trusted.
- Assumption Summary is honest about partial validation rather than overclaiming.

## Weaknesses

- The now-fixed citation gap (§1) — a real, if minor, traceability lapse in a governance-focused document.
- Two pieces of pre-existing documentation drift (`OTHER_RESOURCES` stale comment, `ADR-000X` placeholder) remain unfixed in a file Phase 4B will directly edit — correctly out of scope for every prior stage, worth a one-line heads-up for whoever starts Phase 4B.

## Unsupported Claims

One, now resolved: the "Architecture Authority model/table" citation (§1, §16).

## Missing Evidence

None found beyond the item above.

## Required Revisions

One, minor, editorial: fix the unsupported citation. Applied in this revision (§16). No other revision required — nothing here reopens any architectural decision, alternative, or Decision Log content.

## ADR Approval Recommendation

**Accept ADR-0005.**

## Phase Gate Recommendation

**Phase 4B (Technical Design) may begin**, bound by Chosen Architecture items 1-7 and the four Open Questions' Phase 4B-scoped sub-decisions.

## Final Verdict

**APPROVED WITH MINOR EDITORIAL CHANGES.**

All architecturally load-bearing claims — independently re-verified a third time, across three separate review passes, against current repository state — hold exactly as written. The single finding is a documentation-quality citation error, not a defect in the chosen architecture, and has been corrected directly in this revision. No further Architecture Discovery, alternative re-evaluation, or revision cycle is required.
