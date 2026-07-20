# Account Deletion — Phase 5A Independent Planning Review

**Status:** Complete. Verdict: **one MAJOR finding, resolved in the plan's own revision below; no unresolved CRITICAL or MAJOR finding remains.**
**Written:** 2026-07-20.
**Reviewed document:** [Phase 5A Implementation Plan](2026-07-20-account-deletion-phase5a-implementation-plan.md).
**Reviewer role:** Technical Delivery Lead who would be responsible for executing the implementation this plan describes — fresh context, no authorship stake in the plan document, instructed to verify every load-bearing claim against the actual repository rather than trust the plan's own citations, per this subsystem's established review methodology (the same one used across the Phase 4B TDD's four-round chain and the Phase 4C PRR/Audit pair).
**Method:** Read the plan in full; cross-checked its cited authorities (roadmap, ADR-0004, ADR-0005, the full Phase 4B TDD including all three Revisions and the original Independent Review, the Phase 4C PRR, the Phase 4C Independent Audit); read current source (`registry.ts`, `workflow.ts`, `workflow-types.ts`, `gdpr-data.ts`, `adapter.ts`, `storage-bucket-adapter.ts`, `registry-adapters.ts`, `route.ts`) line-by-line against every file:line citation the plan repeats; read `.github/workflows/ci.yml`, `package.json`, `vercel.json` directly; ran the account-deletion unit suite; checked git/GitHub PR history for the precedent claims the plan cited.

---

## Findings

### MAJOR (resolved in this revision)

**M1 — WP1's and the Testing Strategy's "Phase 2 → 2.1, Phase 3 → 3.1 shipped as separate PRs" precedent was factually false, checked against actual PR history**

- **Where:** WP1, "Why this is not ten separate PRs"; Testing Strategy's opening sentence.
- **What was wrong:** The plan asserted, as directly-verified supporting evidence for its PR1/PR2 split recommendation, that "Phase 2... shipped as one PR; Phase 2.1... shipped as a distinct, later PR" and that "Phase 3 → 3.1" followed the same pattern.
- **Evidence:** `gh pr list` shows PR #128 is titled "Account deletion: atomic transactional deletion + adapter lifecycle + Storage adapters (Phase 2 + 2.1)" — Phase 2 and Phase 2.1 shipped **together**, in one PR, on one branch. A full PR listing found **no PR with "3.1" in its title at all** — Phase 3.1's commits landed as direct commits to `main` with no accompanying PR.
- **Why it mattered:** The claim was used, verbatim, in three places to justify a specific process recommendation. The underlying recommendation (one implementation PR + a distinct live-validation follow-up) remains independently defensible on WP2–WP7's own component-coupling grounds — but asserting it as directly-matching precedent when it is not is exactly the class of unverified claim this repository's own review chain exists to catch.
- **Resolution:** WP1 and the Testing Strategy section were revised to state the PR-history facts accurately (Phase 2/2.1 shipped together; Phase 3.1 shipped as direct commits) and to justify the PR1/PR2 split purely on WP2–WP7's coupling argument, which stands on its own without needing a precedent that doesn't exist. Verified: the corrected text no longer claims a matching precedent and instead names what actually happened.

### MINOR (resolved in this revision, non-blocking)

**m1 — Traceability Matrix misattributed a finding to the wrong section of the original Independent Review**

The matrix's "Resume safety" row cited "Original Review §7" for the external-marker-precondition finding; §7 of that review is actually the CRITICAL unconditional-marker-status finding. The external-marker finding appears in that review's §6/§13. **Resolved:** citation corrected to "§6/§13."

**m2 — Traceability Matrix never explicitly cited ADR-0005 Chosen Architecture item 3**

Items 1, 2, 4, 5, 6, 7 were each named in a matrix row; item 3 ("`stepVerifyDatabase`/`stepVerifyExternal` get real bodies; no new `STATE_ORDER` states") was covered in substance by WP5 but never explicitly cited, despite the plan's closing claim that all seven items map to a Work Package. **Resolved:** a new matrix row added, citing ADR-0005 item 3 directly against WP5 (§4.1, §4.3) and a `STATE_ORDER`-unchanged assertion as its planned test.

**m3 — Dependency graph omitted an edge the text itself claims exists**

WP10's own "Dependencies" text requires all other WPs code-complete first, but the Mermaid graph had no edge from WP6 to WP10 (WP6 was a dead-end leaf). **Resolved:** `WP6 --> WP10` edge added.

### OBSERVATION (non-blocking, not corrected — low value relative to churn)

**o1 — The stale-doc-comment citation (`workflow.ts:338-341`) is off by one line, but this error originates in the TDD itself (§14.1), not the plan.** Not corrected here — correcting it in the plan alone would create a citation mismatch against its own source document; if worth fixing, it belongs in a future TDD erratum, not this plan.

**o2 — WP1's "established `feature/account-deletion-*` convention" phrasing slightly overstates historical uniformity** (Phase 1–3 used a shorter `feat/account-deletion-p*` prefix; only the immediately preceding branch used the `feature/account-deletion-phase4c` style this plan extends). The plan's own parenthetical already scopes the claim correctly ("confirmed via git log: ... was the immediately preceding phase's branch") — not corrected, since the surrounding sentence is accurate once read together with its own qualifier.

---

## What was independently confirmed to hold, not merely trusted

- **"Zero architectural, code, SQL, or migration change introduced"** — confirmed directly via `git status`; nothing under `src/` or `supabase/` was touched.
- **"Zero implementation artifacts created"** — confirmed via `git status`.
- **File:line citations the plan carries forward from the TDD/ADR/PRR/Audit** (`workflow.ts:48-63,172-180,219-238,223-227,243-250,289-298,300-322,324-333,342,471,473`; `registry.ts:86-494,502-527,528-553,554-566`; `storage-bucket-adapter.ts:40-57,42-44,46-48,52-56`; `route.ts:42,108-116,123-126`; `.github/workflows/ci.yml:79-93`; `package.json`'s scripts block; `vercel.json`'s 16 entries, none for `gdpr/route.ts`) — all independently re-verified accurate against current `HEAD`. No drift since the TDD/PRR/Audit were written; the 60-test account-deletion baseline still passes 60/60.
- **Testing completeness against TDD §14.2** — no silent drop found; WP8's test list maps 1:1 to every item in TDD §14.2, including both named regression tests with accurate scenario descriptions.
- **Dependency graph / critical path** — substantively correct; WP2–WP7's coupling reasoning is sound and the critical path (WP1→WP2→WP4→WP5→WP7→WP8→WP10) is defensible.
- **Risk Register R1–R3 mapping to PRR/Audit items** — verified accurate: R1 = PRR Risk 10/Audit MAJOR-1 (first hazard), R2 = PRR Risk 11/Audit MAJOR-1 (second hazard), R3 = PRR Risk 12/Audit MAJOR-2 — each checked against the actual PRR/Audit text, not just presence.
- **Scope discipline (WP6, WP9)** — confirmed appropriately thin against the roadmap's own Phase 4 "Out of Scope" boundary; neither hides a real gap behind "explicitly out of scope" framing that doesn't match the roadmap's actual text.

---

## Verdict

**No unresolved CRITICAL or MAJOR finding remains.** The single MAJOR finding (M1) and all three MINOR findings (m1–m3) are resolved in the plan document as it now stands. The two OBSERVATIONs are recorded as non-blocking and intentionally not corrected (o1 belongs to a different document; o2's surrounding text already scopes it correctly).

**The plan's central claims hold under independent verification:** zero architectural change, zero implementation artifacts, and (after m2's fix) a complete traceability mapping from every ADR-0005 Chosen Architecture item to a Work Package and a planned test. The WP1–WP10 decomposition, dependency graph, milestone plan, risk register, and testing strategy are sound, complete, and accurately grounded in the repository's actual current state — not merely in what prior documents claimed about it.

**This plan is ready to gate Phase 4C execution start.**

---

## Related

- [Phase 5A Implementation Plan](2026-07-20-account-deletion-phase5a-implementation-plan.md) (Accepted, this revision)
- [Phase 4C Production Readiness Review](2026-07-20-account-deletion-phase4c-production-readiness.md) (Decision: GO WITH MINOR FOLLOW-UPS)
- [Phase 4C Independent Production Audit](2026-07-20-account-deletion-phase4c-independent-audit.md) (Decision: GO WITH MINOR FOLLOW-UPS)
- [Phase 4B Technical Design Document](2026-07-18-account-deletion-phase4b-technical-design.md) (Accepted, Revision 3)
- [ADR-0004](../adr/0004-account-deletion-architecture.md), [ADR-0005](../adr/0005-account-deletion-verification-architecture.md)
- [Account Deletion Roadmap v1.0 (Frozen)](../roadmaps/account-deletion-roadmap-v1.md)
