# Account Deletion Phase 3.1 — Production Readiness Report

**Status:** Complete.
**Written:** 2026-07-17.
**Scope:** Hardening & Production Validation of the Phase 3 workflow orchestrator (`src/core/account-deletion/workflow.ts`). No new capability was added — see the Hardening Report for the one bug fixed and the Documentation Synchronization Report for what was brought current.

---

## Is the workflow orchestrator production-ready?

**Implementation: Yes.** **Deployment to the linked "Emma" project as it stands today: No — one specific, disclosed environment gap blocks it.** **Production (a different environment): Unknown — needs separate confirmation.**

These three questions have different answers and should not be collapsed into one. Below, each is answered on its own terms.

### Implementation readiness — Yes

- The one proven implementation defect this phase set out to find (a concurrent-execution race allowing two overlapping requests to duplicate work against the same `deletion_requests` row) is fixed with the smallest change that closes it — optimistic concurrency control on the existing `updated_at` column — and independently confirmed twice: once via a jittered mock proving the bug, once via the fixed code against real Postgres over the real network (Live Production Validation Report, scenario 5).
- Full regression suite: 726 passed / 3 pre-existing skipped (up from Phase 3's 725/3 baseline by exactly this phase's one new test). `tsc --noEmit`: clean. `npm run lint`: 0 errors, 10 pre-existing unrelated warnings.
- Task-level reviews (Task 1: Approved, zero Critical/Important. Task 3: one Important finding, fixed, confirmed Resolved on re-review) and a final whole-branch review (opus, covering the full 9-file, 8-commit diff plus both new reports) both returned **zero Critical or Important findings** and a **Yes** verdict on phase completeness. Three Minor findings from the whole-branch review: one (a stale ADR bullet contradicting the already-updated TDD) was fixed directly after the review; the other two (no in-script project-ref guard on the live-validation runbook; a cosmetic ledger self-reference) were assessed as acceptable as-is and not blocking.
- Every constraint the plan set was honored: the Registry, the transactional SQL RPC, and the `DeletionAdapter` interface are all untouched. No Phase 4 capability was implemented under cover of "hardening" (confirmed explicitly by the final review).

### Deployment blockers (this environment)

**One, real, disclosed, and not fixed by this phase's own decision:** the linked "Emma" Supabase project (`frwabkgvzjwfcmbpikir`) is missing `document_chunks.user_id`. The real `deleteUserOwnedData()` RPC — called exactly as `POST /api/emma/gdpr {action:"delete"}` invokes it — cannot currently complete a deletion on this environment. Every real request against it retries 3 times and then permanently fails.

This is not new: the Technical Design Document's own "Phase 2.1" section already disclosed that `document_chunks`, `personas`, `push_subscriptions`, and `proactive_daily` exist only in `schema.sql`, never as tracked migrations, and "could not be exercised on that particular project." What Phase 2.1 sidestepped by testing the RPC with an adjusted table list, Phase 3.1 tested for real by calling the actual production code path — and found it genuinely broken on this environment, not just untestable.

**Why this wasn't fixed here:** the user was asked directly whether to fix the live schema, document only, or stop validation — and explicitly chose to document only. Touching a live, linked project's schema is exactly the kind of hard-to-reverse infrastructure change this phase's scope (`Do not implement... schema redesign`) was never authorized to make, and doing so without first confirming why the gap exists risks masking the real open question below.

### Operational blockers

**Whether production has the same gap is unknown**, and this phase has no way to check it — it only has access to the linked validation project, not production. This is the single most important open question before this workflow can be relied on anywhere real users' deletion requests would hit it. If production has the same migration-tracking gap, every real GDPR deletion request in production would currently retry 3 times and permanently fail at `deleting_database` — a genuine compliance-path failure, not a cosmetic one.

**Recommendation:** before this workflow is relied on in production, someone with access to production's actual schema must confirm `document_chunks`, `personas`, `push_subscriptions`, and `proactive_daily` exist there with the columns the Registry expects. If they don't, provisioning them (via a proper tracked migration, not another manual `schema.sql` run) is a real, separate piece of work — outside this phase's scope, but blocking before compliance-critical reliance.

### Implementation blockers

None. Every implementation-level concern raised by Phase 3's independent verification was either fixed (the concurrency race) or was never an implementation concern to begin with (the schema gap is an environment/provisioning issue, not a code defect — the RPC's own defensive column-type lookup correctly detected and reported the missing column rather than silently misbehaving).

---

## Residual risks

- **Environment/production schema gap** (above) — the dominant risk. Everything else in this list is secondary to it.
- **The narrow double-invocation window** the Hardening Report's Trade-offs section names: two executions that both reach `deleting_database` in the exact same tick, before either's first `persist()` call resolves, could theoretically both invoke the RPC once each. The RPC is idempotent, so this is not a correctness risk to the database state, only a (very rare, bounded-by-one-round-trip) wasted-transaction risk. Not fixed further — fixing it would require touching the SQL RPC, out of scope, and the live-validated concurrent-request scenario did not reproduce it in practice.
- **No live validation of a truly full end-to-end run** (create → complete, with the database step actually succeeding) exists yet, on any environment, because the only environment available for this phase has the schema gap above. Once that gap is resolved somewhere (staging, or a corrected validation project), re-running `scripts/validate-deletion-workflow-live.ts` would close this gap immediately — the script and the harness for this are already built and committed.

## Technical debt

Carried forward from Phase 3, not introduced by 3.1 (already disclosed in Phase 3's own Production Readiness Report and not revisited here since fixing them was out of this phase's scope):

- `retry_count` is never reset to 0 after `deleting_database` eventually succeeds following a prior retry — cosmetic audit-trail staleness only.
- Checkpoint entries accumulate a fresh `"skipped: already completed"` entry per already-finished resource on every resume at the same step — harmless log growth.
- A failed workflow has no recovery path (no retry/cancel endpoint) — unchanged, disclosed Phase 3 scope decision.

Introduced by this phase, both assessed as acceptable rather than requiring further work:

- `scripts/validate-deletion-workflow-live.ts` has no in-script assertion of the expected project ref — safety currently rests on the operator following the plan's "confirm the linked project before running" step. Cannot run in CI or by accident (manual invocation only, requires a service-role key, not wired into `npm test`), and touches no real user data even if run against the wrong project by mistake (it only ever creates/deletes its own disposable synthetic users). A one-line guard would make this intrinsic rather than procedural — noted, not blocking.
- The stale ADR-0004 bullet the final review caught was fixed same-day; no outstanding doc debt from this phase.

---

## What Phase 4 inherits

A workflow orchestrator that is implementation-complete, concurrency-safe (proven against real Postgres), and honestly documented — plus one clearly-scoped, disclosed environment question that must be answered (production schema state for 4 specific tables) before compliance-critical reliance, independent of any Phase 4 feature work. Phase 4 should not need to touch `workflow.ts`'s persistence layer again; it should be able to build grace-period scheduling, OAuth/background-job adapters, and real per-table verification on top of what exists here without revisiting this phase's fix.
