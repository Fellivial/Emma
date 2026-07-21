# Account Deletion — Phase 5F Production Readiness Remediation

**Date:** 2026-07-21
**Branch:** `feature/account-deletion-phase5e` (continued — no new branch, per this phase's own finalization instructions)
**Scope:** resolve every blocking condition (R-1, R-14, R-15, R-18) and the strongly-recommended R-17 fix from the [Final Production Readiness Review](2026-07-21-account-deletion-final-production-readiness-review.md), without changing the accepted architecture (ADR-0004, ADR-0005, workflow state machine, Registry, checkpoint model, verification model, API contract, SQL verification functions — all frozen this phase).

This is a remediation phase, not an architecture, redesign, or feature-expansion phase. Nothing below changes what the system does; it changes what users are told, what operators know to do, what's automatically checked, and what's been directly re-confirmed against a live database.

---

## Summary of changes

| Blocking condition                                                            | Resolution                                                                                                                                                                                                                                | Files touched                                                                         |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **R-15** — misleading "will retry automatically" copy                         | Replaced with accurate copy instructing the user to click Delete again                                                                                                                                                                    | `src/app/settings/privacy/page.tsx`, `tests/unit/privacy-settings-copy.test.ts` (new) |
| **R-14** — retry mechanism doesn't remediate, only re-checks                  | Documented as an explicit Product/engineering decision (Option A: manual remediation) with operator responsibilities, expected user workflow, and the reasoning for rejecting Option B (would require a state-machine/ADR change)         | `docs/runbooks/account-deletion-deployment.md` §2.3                                   |
| **R-18** — no alerting on terminal failures                                   | Documented manual monitoring process: detection query, weekly review cadence, named ownership (Ops), escalation path                                                                                                                      | `docs/runbooks/account-deletion-deployment.md` §8                                     |
| **R-1** — production schema state unconfirmed                                 | Re-ran `information_schema.tables` directly against the linked project; same 4 tables still missing, documented as an open, undecided discrepancy — not fixed (would require a live production database write, out of this phase's scope) | `docs/runbooks/account-deletion-deployment.md` §4.1                                   |
| **R-17** (non-blocking, recommended) — no automated Registry/schema.sql check | New static test diffing `registry.ts`'s table list against `supabase/schema.sql`; found and fixed two previously-unknown documentation gaps (`chat_messages`, `message_feedback` missing from `schema.sql`'s text) as a side effect       | `tests/unit/registry-schema-drift.test.ts` (new), `supabase/schema.sql`               |
| Documentation alignment (WP6)                                                 | Runbook and API reference updated to reflect all of the above                                                                                                                                                                             | `docs/runbooks/account-deletion-deployment.md`, `docs/reference-api.md`               |

**Nothing in `src/core/account-deletion/{registry,workflow,workflow-types,adapter,gdpr-data}.ts`, the three account-deletion SQL migrations, `src/app/api/emma/gdpr/route.ts`, either ADR, or `.github/workflows/ci.yml` changed this phase** — confirmed via `git diff` against the Phase 5E commit by both the primary work and the independent remediation review (below), not merely asserted.

---

## WP1 — Correct User Communication

`src/app/settings/privacy/page.tsx:65-70` previously read: _"Deletion is in progress and will retry automatically. Please check back shortly."_ This was false — no cron, queue, or scheduler advances a `retry_pending` `deletion_requests` row; only an identical follow-up `POST /api/emma/gdpr` request does (confirmed against `workflow.ts`'s `resumeStartStatus()`/`STATE_ORDER`, both unchanged this phase).

**New copy:** _"Deletion hit an issue while confirming some data was removed. Please click Delete again to continue — this does not restart the process from the beginning."_

This is accurate to the actual mechanism: a fresh click re-invokes the same endpoint, which resumes the workflow at the failed phase (re-running only that phase's verification check, not the whole pipeline) rather than restarting from `validating`. Automatic retry was **not** implemented — per this phase's explicit instruction not to build it without separate architectural approval. A locking regression test (`tests/unit/privacy-settings-copy.test.ts`) asserts the false claim can't be reintroduced and the corrected instruction is present.

---

## WP2 — Retry Strategy Decision

**Decision: Option A — verification failure remains manual remediation.** Recorded in `docs/runbooks/account-deletion-deployment.md` §2.3.

Option B (automated remediation — having a retry actually re-run the delete/adapter step when a verify phase confirms a real defect) was evaluated and explicitly rejected for this phase, not silently ignored: implementing it would require `resumeStartStatus()` to revisit an earlier, already-`completed`-marked phase in `STATE_ORDER` — a change to the workflow state machine, which ADR-0005 and this phase's own constraints hold frozen. This is exactly the "STOP, do not implement, produce an architecture proposal instead" case the task's own WP2 instructions describe for Option B — and the correct response is that no such proposal was warranted this phase, because Option A (the status quo, now explicitly decided rather than implicit) is sufficient to close R-14 as a documentation/decision gap rather than a code defect.

The runbook now documents, per WP2's own requirements:

- **Operator responsibilities** — a 5-step numbered procedure for identifying, confirming, manually remediating, and recording a terminal `failed` row's defect.
- **Expected workflow** — what the requesting user experiences (corrected copy on retry, existing "contact support" copy on permanent failure) and what actually resolves a confirmed defect (support-driven manual remediation, not further clicking).
- **User-facing behavior** — tied directly to WP1's corrected copy, so the two are consistent rather than documented independently and left to drift apart.

---

## WP3 — Operational Monitoring

`docs/runbooks/account-deletion-deployment.md` §8 (new) defines:

- **Detection procedure / monitoring query** — a copy-pasteable SQL query against `deletion_requests` surfacing `failed` rows and stale `retry_pending` rows, with guidance on distinguishing a confirmed defect (`last_resource_status: "failed"`) from a transient one (`"inconclusive"`).
- **Review cadence** — weekly, minimum, until real automated alerting exists (explicitly named as an interim commitment, not a permanent posture).
- **Ownership** — Ops, the same owner ADR-0005's own Risk Register already assigns for schema-state confirmation.
- **Escalation path** — back to §2.3's manual remediation procedure, with the specific fields an escalation needs to carry.

Automation (a dashboard, paging integration) was deliberately not built — it requires infrastructure this repo doesn't have today and is explicitly Phase 7 (Production Operations) roadmap territory, consistent with this phase's remediation-only, non-architectural scope.

---

## WP4 — Production Schema Confirmation

Re-ran the exact check Phase 5E performed, this time covering the Registry's complete, current 32-table list (including `chat_messages`/`message_feedback`, see WP5), directly against `information_schema.tables` on the linked Supabase project (`frwabkgvzjwfcmbpikir`) — not the migration ledger, per the runbook's own standing warning that the ledger cannot be trusted for this project.

**Result: identical to Phase 5E.** `document_chunks`, `personas`, `push_subscriptions`, and `proactive_daily` still do not exist on this project; all other 28 tables (now including `chat_messages` and `message_feedback`, both confirmed present live) do.

```
document_chunks       — exists_in_information_schema: false
personas               — exists_in_information_schema: false
proactive_daily        — exists_in_information_schema: false
push_subscriptions     — exists_in_information_schema: false
(28 other tables)      — exists_in_information_schema: true
```

**This discrepancy is documented, not resolved**, per this phase's own explicit instruction ("if discrepancies remain, document them, do not modify architecture"). Creating tables on a live external database is a production-database write — a hard-to-reverse, shared-state action requiring explicit authorization from whoever owns that environment, not something this remediation phase performed unilaterally. This is also consistent with ADR-0005's own Risk Register, which already names Ops (not engineering) as the owner of this specific confirmation.

**A note this phase surfaces explicitly, because it changes what "resolved" would even mean here:** whether the linked project (`frwabkgvzjwfcmbpikir`) is _production_ or a _validation environment_ has never been formally decided by anyone with the authority to decide it, across the entire history of this feature's live-validation phases (2.1, 3.1, 5E, and now 5F). Until that's decided, "confirm production schema state" cannot be fully closed — this phase confirmed the _only_ live project this repo has access to, and found the same gap Phase 5E found, but cannot itself resolve the underlying ambiguity about what that project represents.

---

## WP5 — Registry/Schema Drift Prevention

New test: `tests/unit/registry-schema-drift.test.ts`. Statically parses `supabase/schema.sql` for every `create table if not exists [public.]<name>` statement and asserts every one of the Registry's 32 database resources (`registry.ts`'s `getDatabaseResources()`) has a matching entry. Requires no live database access or credentials; runs as part of the existing `npm test` suite (already merge-blocking via CI — no CI configuration change was needed).

**Building this test immediately found two previously-unknown, real documentation gaps:** `chat_messages` and `message_feedback` both exist live (confirmed via WP4's query above) via their own standalone migrations, but neither table's `create table` statement was ever folded into the consolidated `schema.sql` snapshot — the exact same class of gap `user_files`/`user_mcp_servers` had before Phase 2.1 backfilled them, and the exact class of bug this test exists to prevent recurring. Both were fixed in `schema.sql` this phase, copied from their source migrations with matching columns, constraints, and RLS policy semantics.

This closes the automated half of R-17. The live-validation half (does the _actual deployed database_ match `schema.sql`) remains manual — that's what WP4's `information_schema.tables` check does, and what §8's monitoring process exists to keep someone watching for going forward.

---

## WP6 — Documentation Alignment

- **Runbook** (`docs/runbooks/account-deletion-deployment.md`): §2.3 rewritten (WP2), new §8 (WP3), §4.1 updated with the WP4 re-confirmation, new §4.4 and §9 documenting the schema.sql gap and its prevention (WP5), Related section updated with links to the Final PRR and this report.
- **API reference** (`docs/reference-api.md`, GDPR section): added a clarifying paragraph on what actually triggers `retry_pending` progression, matching the runbook's §2.3 for API consumers who read this doc instead of the runbook.
- **User-facing documentation**: the privacy settings page itself (WP1) — there is no separate user-facing help/FAQ document for account deletion in this repo; the settings page's own copy is the only user-facing surface.
- **Troubleshooting guide**: this repo's troubleshooting content lives inside the same runbook (§7/§8), not a separate file — both updated together.

No obsolete assumption was found and left uncorrected; every document touched this phase now reflects the same, verified-current behavior.

---

## Testing Requirements — results

```
npx vitest run
 Test Files  66 passed | 1 skipped (67)
      Tests  787 passed | 3 skipped (790)
```

(783 → 787: exactly the 4 new tests added this phase — 2 in `privacy-settings-copy.test.ts`, 2 in `registry-schema-drift.test.ts`. Zero regressions.)

**Mandatory regressions, all still passing, unchanged this phase:**

- Marker Defect — `tests/unit/verification-workflow.test.ts:460`
- Storage Undercount — `tests/unit/verification-workflow.test.ts:503`
- Resume — `tests/unit/verification-workflow.test.ts:572`
- API Verification — `tests/unit/gdpr-workflow-integration.test.ts:268`

```
npx tsc --noEmit -p tsconfig.json
(no output — 0 errors)

npm run lint
✖ 10 problems (0 errors, 10 warnings)
```

The 10 lint warnings are pre-existing `react-hooks/purity`/`react-hooks/set-state-in-effect` warnings in files this phase did not touch (`src/app/settings/usage/page.tsx`, `src/components/InputBar.tsx`, etc.) — 0 errors, and 0 new warnings introduced.

---

## Independent Remediation Review

A fresh-context subagent, uninvolved in any prior design/implementation/hardening/review work on this feature, independently verified this remediation. Full findings: [`2026-07-21-account-deletion-phase5f-independent-review.md`](2026-07-21-account-deletion-phase5f-independent-review.md).

**Its verification method is worth calling out specifically:** rather than reading the current code in isolation, it ran `git diff` between the Phase 5E commit and this phase's changes across every architecturally-frozen path (`workflow.ts`, `registry.ts`, `workflow-types.ts`, all three SQL migrations, both ADRs, the GDPR route, CI config) and confirmed the diff was **empty** for every one of them — the strongest available evidence that no architectural drift occurred, stronger than a read-through of the current file alone since it also rules out reintroducing equivalent-but-different logic. It independently re-ran the full test suite, `tsc`, and lint itself rather than trusting the numbers reported above, and got identical results.

**Verdict: no unresolved CRITICAL or MAJOR findings.** Two MINOR findings were identified and fixed in this same session before finalizing this report:

1. The runbook referenced this remediation report by filename before it existed — fixed by writing this document.
2. The runbook attributed the Option A decision's "WP2" label to the Final Production Readiness Review, which doesn't use WP numbering — fixed to correctly attribute it as Phase 5F's own internal work-package label, scoped to closing the FPRR's R-14.

Per each of the five numbered conditions in the review brief: R-15 RESOLVED, R-14 RESOLVED (via documented decision, not architectural change), R-18 RESOLVED, R-1 correctly and honestly NOT RESOLVED (documented as an open discrepancy, as instructed), R-17 RESOLVED (including independent verification of the two newly-discovered schema.sql gaps and confirmation the test's parsing logic isn't vacuously passing).

---

## Exit Criteria — status

- [x] User-facing messaging accurately reflects implemented behavior (WP1)
- [x] The Product decision regarding verification failures is documented and implemented within the approved scope (WP2 — Option A, no architecture touched)
- [x] An operational monitoring process for terminal failures is documented (WP3)
- [x] Production schema validation confirms Registry compatibility **or documents any remaining discrepancies** (WP4 — discrepancy confirmed and documented, not silently left unconfirmed)
- [x] Registry/schema.sql drift prevention is implemented and passing (WP5)
- [x] Documentation is internally consistent (WP6, cross-checked by the independent review)
- [x] All tests pass (787/787 non-skipped, 0 failed; typecheck and lint both clean)
- [x] Independent Remediation Review reports no unresolved CRITICAL or MAJOR findings

**Phase 5F is complete.**

---

## Recommendation

The blocking conditions identified by the Final Production Readiness Review have been resolved without introducing architectural drift, confirmed independently via direct code diffing rather than assertion. The one item that remains genuinely open — R-1, whether the actual intended production database has all 32 Registry tables — is not something this phase could close on its own (it requires either applying migrations to a live database or a decision about that database's role, both Ops-owned actions outside a remediation phase's scope), but it is now honestly and currently documented, with a monitoring process (§8) in place as an interim backstop.

**Recommendation: this feature is ready for a final Production Approval Decision**, conditioned only on R-1's live confirmation/resolution being completed by whoever owns that database before real, uncontrolled user traffic relies on it — exactly the condition the Final Production Readiness Review already named, now current, re-verified, and with no other blocking condition left outstanding.

---

## Related

- [Final Production Readiness Review](2026-07-21-account-deletion-final-production-readiness-review.md) — source of all blocking conditions this phase resolves
- [Final Independent Production Review](2026-07-21-account-deletion-final-independent-review.md)
- [Phase 5F Independent Remediation Review](2026-07-21-account-deletion-phase5f-independent-review.md) (companion document)
- [Deployment/Rollback/Troubleshooting Runbook](../runbooks/account-deletion-deployment.md) — §2.3, §4.1, §4.4, §8, §9 are new/updated this phase
- [API Reference — GDPR section](../reference-api.md#gdpr)
- `src/app/settings/privacy/page.tsx`, `supabase/schema.sql`, `tests/unit/{privacy-settings-copy,registry-schema-drift}.test.ts`
