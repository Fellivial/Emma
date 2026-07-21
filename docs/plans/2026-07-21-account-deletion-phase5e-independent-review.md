# Account Deletion — Phase 5E Independent Production Hardening Review

**Status:** Complete. Verdict: **ACCEPT WITH MINOR FOLLOW-UPS.**
**Written:** 2026-07-21.
**Reviewer:** fresh-context subagent (`everything-claude-code:code-reviewer`), briefed to review this phase as an operational system rather than as source code — deployment workflow, SQL migrations, rollback procedure, production assumptions, logging, observability, documentation, and test evidence — not just the diff.
**Scope reviewed:** commit `416c414` on `feature/account-deletion-phase5e` vs. `origin/main` (clean fast-forward, single commit at review time).

---

## Findings

**[MAJOR] "Non-blocking" CI reminder step could actually fail the job and block merges**
`.github/workflows/ci.yml` (pre-fix). The new migration-sequencing reminder step ran `git fetch`/`git diff` under GitHub Actions' default `bash -eo pipefail`, with no `continue-on-error`. A `git fetch` failure (network hiccup, shallow-history edge case) would fail the step, which fails the `test` job that `build`/`deploy-*` depend on via `needs: test` — contradicting the phase report's and runbook's unconditional "does not block merge" framing. Also noted: `actions/checkout@v4`'s default `fetch-depth: 1` means the step's own `--depth=50` fetch is the only thing establishing enough history for the triple-dot diff; a PR diverged by more than 50 commits could silently compute against too-shallow a merge-base rather than fail loudly.
**Resolution:** `continue-on-error: true` added to the step. Any future git-command failure now degrades to a skipped check, never a blocked merge — the property the report claimed. Not re-tested against a live GitHub Actions run (no access to trigger one from this environment); the fix is a standard, low-risk GitHub Actions idiom.

**[MINOR] Migration file's own in-DB `COMMENT ON FUNCTION` text is the one remaining stale claim**
`supabase/migrations/20260720000001_verify_user_owned_data_deleted.sql:6-11,113` still says "Nothing in the application calls it yet" — stale since Phase 5C, same class of staleness as the two comments fixed in `registry.ts`/`gdpr-data.ts` this phase, but left untouched because migration files are treated as append-only historical record in this repo's convention (the runbook itself frames them that way). Not fixed — accepted as intentional, since the reviewer confirmed this is a live, queryable DB artifact (`\df+`) worth a future one-line follow-up migration, not a Phase 5E blocker.

**[OBSERVATION, now resolved] Phase report linked to this review before it existed**
The phase report's "Independent Production Hardening Review" section referenced this file by name before it was written. Resolved by this file's creation and the phase report's Decision section being updated to point to it.

**[OBSERVATION] All quantitative/structural claims in the phase report and runbook verified accurate**, independently, by the reviewer:

- Feature freeze confirmed: `git diff origin/main..HEAD -- workflow.ts workflow-types.ts route.ts` empty.
- `vercel.json` valid JSON; `maxDuration: 60` present for the GDPR route, consistent with sibling routes.
- CI step's `if: github.event_name == 'pull_request'` guard correct (`base_ref` is meaningless on `push` events; the step is correctly excluded there).
- The claimed SQL behavior (delete function whole-call-aborts on unknown column; verify function per-table-catches the same condition; both whole-call-abort on malformed identifiers) verified by direct reading of both migration files — logically consistent with the runbook's §4.1/§4.2 claims, not merely asserted.
- All four regression-test locations cited in the runbook (§6) verified to exist at the cited line numbers with matching describe/it text.
- `npx tsc --noEmit`, `npm run lint`, `npm test` independently re-run by the reviewer — results matched the report exactly (clean typecheck; 0 lint errors, 10 pre-existing unrelated warnings; 783 passed/3 skipped/0 failed).
- No secrets, credentials, or leftover test artifacts found in the diff or in `git status`; the synthetic test UUID appears only in prose documentation, never as committed code or a leftover fixture.

**[OBSERVATION] Both accepted-risk decisions assessed as reasonable on their stated merits**

- Choosing a warning-only CI reminder over real migration-apply enforcement, given no Supabase deploy secrets exist in this repo's CI: sound. The reviewer suggested a cheaper interim alternative worth considering later — a required CODEOWNERS review / PR-template checkbox for `supabase/migrations/**` changes, enforceable via branch protection without needing secrets. Not implemented this phase (would be a repo-governance change beyond this phase's scope); noted for a future phase.
- Not creating the 4 missing tables on the linked validation project directly: reasonable — this project is a shared, multi-phase validation environment, and unilaterally creating tables outside the documented Registry-authoring migrations would itself be the kind of out-of-band schema change the ledger-drift finding (§1.2 of the runbook) already warns against. Correctly escalated as an Ops decision.

---

## Verdict

**ACCEPT WITH MINOR FOLLOW-UPS.** Zero CRITICAL findings. One MAJOR finding, resolved same-session (`continue-on-error: true`). One MINOR finding, consciously accepted (migration file historical-comment staleness). No finding challenges the correctness of the live-database findings, the regression audit, or the verification commands' results — all independently reproduced by the reviewer, not merely trusted from the phase report's own summary.

---

## Related

- [Phase 5E Production Hardening Report](2026-07-21-account-deletion-phase5e-production-hardening.md)
- [Deployment, Rollback & Troubleshooting Runbook](../runbooks/account-deletion-deployment.md)
- `.github/workflows/ci.yml`
