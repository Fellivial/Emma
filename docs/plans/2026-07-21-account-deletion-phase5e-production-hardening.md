# Account Deletion — Phase 5E Production Hardening Report

**Status:** Complete.
**Written:** 2026-07-21.
**Roadmap:** [Account Deletion Roadmap v1.0 (Frozen)](../roadmaps/account-deletion-roadmap-v1.md) — Phase 4 (Verification), hardening/validation pass ahead of the roadmap's own Production Readiness Review step.
**Scope:** No new functionality. Validates, hardens, and operationally verifies the implementation completed in Phases 5B–5D. Full operational detail (deployment order, rollback procedure, live-DB findings, troubleshooting) lives in the companion runbook — [`docs/runbooks/account-deletion-deployment.md`](../runbooks/account-deletion-deployment.md) — this report summarizes what was done and the resulting decision; it does not duplicate that document's detail.
**Authority reviewed:** Roadmap v1.0, [ADR-0004](../adr/0004-account-deletion-architecture.md), [ADR-0005](../adr/0005-account-deletion-verification-architecture.md), [Phase 4B TDD](2026-07-18-account-deletion-phase4b-technical-design.md) (Accepted), [Phase 4C Production Readiness Review](2026-07-20-account-deletion-phase4c-production-readiness.md) (the primary source of this phase's open risks — items 1, 2, 9, 12 of its Risk Register), [Phase 5A Implementation Plan](2026-07-20-account-deletion-phase5a-implementation-plan.md), [Phase 5B](2026-07-20-account-deletion-phase5b-implementation-report.md)/[5C](2026-07-21-account-deletion-phase5c-workflow-integration-report.md)/[5D](2026-07-21-account-deletion-phase5d-api-surface-report.md) implementation reports.

---

## Feature freeze — confirmed honored

No workflow phase, API field, registry field, retry semantic, or checkpoint format was added or changed. Diff against `main` touches: `vercel.json` (config, +1 route entry), `.github/workflows/ci.yml` (CI, +1 non-blocking step), two doc comments in `registry.ts`/`gdpr-data.ts` (accuracy fixes, zero code/behavior change), one new migration application (`20260720000001` applied to the linked project — the migration file itself is unchanged, pre-existing since Phase 5B), and new documentation (this report, the runbook). `git diff main...HEAD -- src/core/account-deletion/workflow.ts src/core/account-deletion/workflow-types.ts src/app/api/emma/gdpr/route.ts` is empty except for the two comment edits — confirmed directly.

---

## 1. Live Database Validation — done

Full detail: runbook §4. Summary:

- **Row counting, empty tables, populated tables:** all confirmed correct via a real insert/verify/delete/re-verify cycle against `usage_windows` on the linked "Emma" Supabase project, using a synthetic test UUID that maps to no real account.
- **Unknown columns:** confirmed gracefully degraded (`checked: false`, per-table, no whole-call abort) for the 4 Registry tables that don't exist on this project.
- **Malformed identifiers:** confirmed rejected (whole-call `RAISE EXCEPTION`) before any dynamic SQL executes.
- **Batching:** confirmed single RPC call for all 32 database resources.
- **Execution time:** measured **30.841ms** server-side for the full batch (`EXPLAIN ANALYZE`).
- **The headline finding:** the verify function's migration (`20260720000001`) had never been applied to the linked project before this phase — applied this phase, and its absence would have made the whole verify step silently `inconclusive` in production had this gone unnoticed. Separately, and more seriously: 4 of the 32 Registry tables (`document_chunks`, `personas`, `push_subscriptions`, `proactive_daily`) do not exist on this project at all, which was confirmed this phase to make `delete_user_owned_data_ordered` abort the entire deletion transaction for any real user — not a hypothetical, an empirically reproduced result this session. See runbook §4.1 for the full finding and its required follow-up (Ops decision, not a Phase 5E one).

## 2. Migration Validation — done, with one residual gap disclosed

Full detail: runbook §4.3. Ordering confirmed clean; all three account-deletion migrations confirmed idempotent (`CREATE OR REPLACE`/`IF NOT EXISTS` throughout — safe to re-run). A previously-undocumented operational hazard was found and documented: the remote migration ledger (`schema_migrations`) has drifted from actual schema state since `companion_state` (applied under a mismatched ID) — every migration since was applied via ad-hoc `db query -f`, not `db push`, so `supabase migration list --linked` cannot be trusted as a source of truth for this subsystem. Documented in runbook §1.2 with the correct verification procedure (query `information_schema`/`pg_proc` directly).

**Disclosed gap:** clean deployment on a fresh database was not independently tested (would require provisioning a throwaway Supabase project — out of this pass's access/time budget). Reasoned, not confirmed, to succeed given the migrations' idempotent construction. Not blocking — flagged in the runbook as a residual item.

## 3. Deployment Pipeline Review — reviewed; risk explicitly accepted with a bounded mitigation added

Full detail: runbook §3. Confirmed Phase 4C's Risk Register item #12 is still open: `deploy-production` runs on every push to `main` with no migration-apply step and no gate. Two options were on the table per this phase's own brief — build enforcement, or document and accept. **Chose to document and accept**, because building real enforcement would require Supabase deploy secrets this repo's CI was confirmed not to reference, and an untested pipeline change against the actual deploy target is a worse risk than a documented manual discipline. Added one bounded, non-blocking mitigation: a CI step that warns (GitHub Actions annotation, not a build failure) whenever a PR touches `supabase/migrations/`, pointing at the runbook. This does not alter runtime behavior (constraint honored) and does not gate merges.

## 4. End-to-End Validation — done via the existing test suite; live workflow run not performed against real data

The full account-deletion test suite (including all workflow/retry/resume/interruption/storage scenarios enumerated in the Phase 4B TDD's §9, 17 scenarios) passes: **783 passed, 3 skipped (pre-existing, unrelated), 0 failed**, run this session. This is the same suite the Independent API Review re-ran during Phase 5D and found accurate. A live, real end-to-end deletion request was **not** run against the linked project's actual `POST /api/emma/gdpr` route this phase — doing so would require a real (or realistically-seeded) test account and was judged higher-risk than the targeted, synthetic-user SQL-level validation performed in §1, which exercises the identical RPCs the route calls. External verification (OAuth/background-job) remains correctly skipped, unchanged — no adapter exists for either resource type (out of roadmap scope, unassigned to any phase).

## 5. Performance Validation — done for the new component; unmeasured for one pre-existing one

Full detail: runbook §5. The verify RPC (the only genuinely new runtime cost this design added, per ADR-0005) measured ~31ms for the full batch — negligible against the newly-set `maxDuration: 60`. The pre-existing delete RPC was not independently re-timed this phase because it cannot currently complete successfully on the linked project (§1's finding) — timing a guaranteed-abort call would not produce a representative number. Retry overhead and checkpoint growth were reasoned from existing code/prior analysis, not re-measured — no code changed that would alter either.

## 6. Observability Validation — reviewed, not modified

Full detail: runbook §7. Confirmed the existing `console.warn`-based structured logging (`[DeletionWorkflow] <event>`) is sufficient to reconstruct any single user's workflow execution from logs plus the persisted `checkpoint` array, by tracing every `log()` call site against the state machine. Confirmed, and explicitly restated (not a gap this phase introduces), that fleet-wide aggregation and alerting remain Phase 7 scope. A troubleshooting procedure was written into the runbook (§7) — this is the one net-new observability _artifact_ this phase produced; no logging code changed.

## 7. Documentation Hardening — done

- **New:** `docs/runbooks/account-deletion-deployment.md` — deployment guide, rollback guide, troubleshooting guide, and this phase's full live-validation/performance findings in one operational document.
- **Fixed:** two stale doc comments in `registry.ts` and `gdpr-data.ts` that still said "nothing calls this yet" for functions Phase 5C wired up two phases ago — a documentation-accuracy defect, not a behavior change.
- **Reviewed, found current, left unchanged:** `docs/reference-api.md`'s GDPR/`verification` section (Phase 5D already updated it correctly — confirmed by direct comparison against the live response shape).

## 8. Regression Audit — done, all four confirmed present and already merge-blocking

Full detail: runbook §6. Marker Defect, Storage Undercount, Resume, and API Verification regressions all located, confirmed present, and confirmed passing in this session's full suite run. All four were already part of `npm test`, which `.github/workflows/ci.yml`'s `test` job already runs on every PR and merge to `main`/`dev` — no CI change was needed to make them merge-blocking; they already were.

---

## Validation checklist (per this phase's own brief)

| Item                                                   | Status                                                                                                    |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Live database validation completed                     | ✅ (§1; runbook §4)                                                                                       |
| SQL behavior documented                                | ✅ (runbook §4.2)                                                                                         |
| Migration validated                                    | ✅, one residual gap disclosed (§2; runbook §4.3)                                                         |
| Deployment sequencing validated or explicitly accepted | ✅ explicitly accepted, bounded mitigation added (§3; runbook §3)                                         |
| End-to-end validation completed                        | ✅ via existing suite; live-route run not performed (§4)                                                  |
| Performance acceptable                                 | ✅ for the new component; pre-existing component unmeasured this phase, reasoned not to have changed (§5) |
| Observability validated                                | ✅, reviewed not modified (§6; runbook §7)                                                                |
| Documentation updated                                  | ✅ (§7)                                                                                                   |
| Mandatory regression tests passing                     | ✅, all 4 (§8; runbook §6)                                                                                |
| Full account deletion test suite passing               | ✅ 783/786 (3 pre-existing skips)                                                                         |
| Typecheck passing                                      | ✅ `npx tsc --noEmit`, clean                                                                              |
| Lint passing                                           | ✅ 0 errors, 10 pre-existing unrelated warnings                                                           |

---

## Operational Readiness Review

| Dimension                   | Assessment                                                                                                                                                                                                                                                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Deployment readiness**    | Ready, with a known, disclosed manual-discipline dependency (migration-before-code) — not automated, explicitly accepted (§3)                                                                                                                                                                                              |
| **Rollback readiness**      | Documented and reasoned correct (runbook §2) for all three migrations and the code path; not independently drill-tested against a real rollback                                                                                                                                                                            |
| **Observability**           | Sufficient for single-user incident investigation; insufficient for fleet-wide monitoring — by design, Phase 7 scope                                                                                                                                                                                                       |
| **Operational diagnostics** | A concrete troubleshooting procedure now exists (runbook §7) where none did before                                                                                                                                                                                                                                         |
| **Production monitoring**   | None exists; none is claimed to exist. Correctly scoped as out of Phase 4/5's roadmap boundary                                                                                                                                                                                                                             |
| **Maintenance burden**      | Low — no new abstractions, no new persistence model, one new doc to keep current                                                                                                                                                                                                                                           |
| **Documentation quality**   | Substantially improved this phase — deployment/rollback/troubleshooting previously existed only scattered across ADRs and review reports; now consolidated                                                                                                                                                                 |
| **Operational risks**       | Two real, load-bearing risks confirmed still open, both pre-existing and both now documented with maximum specificity: (1) the linked project's 4 missing tables would fail every real deletion request on this environment (runbook §4.1); (2) migration-before-code sequencing has no automated enforcement (runbook §3) |

---

## Independent Production Hardening Review

A separate, fresh-context adversarial review — commissioned specifically to validate this phase's work as an _operational system_, not as source code, per this phase's own required methodology — is recorded in [`2026-07-21-account-deletion-phase5e-independent-review.md`](2026-07-21-account-deletion-phase5e-independent-review.md). Its verdict is summarized in the Decision section below.

---

## Decision

### ACCEPT WITH MINOR FOLLOW-UPS

The [Independent Production Hardening Review](2026-07-21-account-deletion-phase5e-independent-review.md) found zero CRITICAL findings and independently reproduced every quantitative claim in this report and the runbook (typecheck, lint, full test suite, the four regression-test locations, the SQL-behavior claims cross-checked against the actual migration files, and the feature-freeze diff scope). One MAJOR finding — the new CI reminder step could fail its job under a `git`-command error, contradicting its "non-blocking" framing — was fixed same-session (`continue-on-error: true` added to `.github/workflows/ci.yml`). One MINOR finding (a stale in-database `COMMENT ON FUNCTION` string in a historical migration file) was consciously left as-is, consistent with this repo's append-only migration convention.

**Phase 5E is complete.** All eleven items in this phase's own Validation Checklist are satisfied, all four mandatory regression tests are confirmed present and merge-blocking, and the Independent Production Hardening Review has no unresolved CRITICAL or MAJOR finding — the phase's own stated exit criteria.

**Carried forward, explicitly not resolved by this phase (Ops/future-phase ownership, not Phase 5E gaps):**

1. **The linked "Emma" Supabase project is missing 4 of 32 Registry tables** (`document_chunks`, `personas`, `push_subscriptions`, `proactive_daily`), confirmed this phase to make every real GDPR deletion request against that project's current schema fail deterministically. This is the single highest-impact finding of this phase — not a Phase 5E-introduced defect, but a pre-existing condition (Phase 4C Risk Register item #1) now confirmed with maximum specificity. **Before this feature is relied on for real user deletions on this project, Ops must create these 4 tables or explicitly document this project as a reduced-schema validation environment rather than a production proxy.**
2. **Migration-before-code sequencing has no automated pipeline enforcement**, only a non-blocking CI reminder and this runbook's documented manual discipline — an explicitly accepted residual risk, not a resolved one, because building real enforcement would require Supabase deploy secrets this repo's CI does not currently have.
3. Clean-database migration deployment was reasoned, not independently tested (residual gap, non-blocking).
4. The pre-existing delete RPC's live timing was not re-measured this phase (it cannot currently complete on the linked project per finding #1 above) — no code changed that would alter its performance, so this is not a regression, just an unmeasured pre-existing quantity.

None of these four items block Phase 5E's own completion — they are the exact kind of "outstanding accepted operational risk" this phase's brief anticipated recording, not resolving. The feature is ready to enter the roadmap's final Production Readiness Review, with finding #1 above as that review's most important open input.

---

## Related

- [Account Deletion Roadmap v1.0 (Frozen)](../roadmaps/account-deletion-roadmap-v1.md)
- [ADR-0004](../adr/0004-account-deletion-architecture.md), [ADR-0005](../adr/0005-account-deletion-verification-architecture.md)
- [Phase 4C Production Readiness Review](2026-07-20-account-deletion-phase4c-production-readiness.md) — source of this phase's Risk Register follow-ups
- [Phase 5B](2026-07-20-account-deletion-phase5b-implementation-report.md), [5C](2026-07-21-account-deletion-phase5c-workflow-integration-report.md), [5D](2026-07-21-account-deletion-phase5d-api-surface-report.md) implementation reports
- [Deployment, Rollback & Troubleshooting Runbook](../runbooks/account-deletion-deployment.md) — full operational detail
- `vercel.json`, `.github/workflows/ci.yml`
- `src/core/account-deletion/{registry,gdpr-data}.ts`
