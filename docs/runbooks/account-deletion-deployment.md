# Account Deletion — Deployment, Rollback & Troubleshooting Runbook

**Written:** Phase 5E (Production Hardening), 2026-07-21.
**Scope:** `src/core/account-deletion/*`, `src/app/api/emma/gdpr/route.ts`, `supabase/migrations/{20260715000001,20260716000001,20260720000001}*.sql`.
**Audience:** whoever deploys this subsystem, or is paged when a GDPR deletion request misbehaves in production.

This is the single operational document for the account-deletion/verification subsystem. It does not restate the architecture (see [ADR-0004](../adr/0004-account-deletion-architecture.md), [ADR-0005](../adr/0005-account-deletion-verification-architecture.md)) or the API contract (see [reference-api.md](../reference-api.md#gdpr)) — it exists so an operator under time pressure doesn't have to reconstruct deployment/rollback/troubleshooting procedure from either of those.

---

## 1. Deployment guide

### 1.1 Migration-before-code is binding, and this pipeline does not enforce it

`.github/workflows/ci.yml`'s `deploy-production` job runs on every push to `main` with **no migration-apply step and no manual gate**. This was flagged in Phase 4C's Risk Register (item #12) and remains true after Phase 5E — see §3 (Deployment Pipeline) for why an automated gate was not built this phase, and what was added instead (a non-blocking CI reminder).

**Before merging any PR that adds or changes a file under `supabase/migrations/`, apply that migration to the target database first, then merge/deploy the code.** The failure mode if this order is inverted is silent, not loud: the verify RPC/table simply won't exist yet, so verification returns `inconclusive` (see §4.2) rather than throwing an error a monitoring system would catch. Nothing today alerts on `inconclusive` counts — an operator has to know to look.

### 1.2 How migrations actually get applied to the linked Supabase project (important gotcha)

`npx supabase migration list --linked` is **not a reliable source of truth** for this subsystem. Confirmed directly this phase: the remote `supabase_migrations.schema_migrations` ledger stops recording at `companion_state` (applied under a mismatched timestamp, `20260713102147` vs. the local file's `20260713000001` — a pre-existing, previously-documented gotcha). Every migration since — `fix_increment_usage_window_signature`, `deletion_requests`, `transactional_deletion`, and (until this phase) `verify_user_owned_data_deleted` — was applied via `npx supabase db query --linked -f <file>` (surgical SQL), not `npx supabase db push`, because `db push` is blocked by the accumulated history drift.

**Practical consequence:** `migration list --linked` will show these migrations as `remote: ""` (seemingly unapplied) even when the underlying table/function genuinely exists. **Do not trust the ledger. Confirm directly against the database schema** (`information_schema.tables`, `pg_proc`) before concluding a migration is or isn't applied. See §4.1 for the exact queries used to do this.

**To apply a new account-deletion migration to the linked project:**

```bash
npx supabase db query --linked -f supabase/migrations/<file>.sql
```

This was the exact mechanism used to apply `20260720000001_verify_user_owned_data_deleted.sql` during Phase 5E (it had never been applied before this phase — see §4.1's findings).

### 1.3 `vercel.json` — `maxDuration`

`src/app/api/emma/gdpr/route.ts` now has an explicit `maxDuration: 60` entry (added Phase 5E — previously absent, meaning the route ran under Vercel's platform default with an unconfirmed timeout margin, per Phase 4C Risk Register item #2). This value matches the other most substantive routes (`emma/route.ts`, `webhook/route.ts`) and has generous headroom: the new verify RPC measured **~31ms server-side** for the full 32-table batch (§5), and the pre-existing delete RPC is reasoned (not yet independently re-measured) to be comparably cheap per Phase 2.1's prior live-timing work.

### 1.4 Deployment order for a change to this subsystem

1. Merge and apply any new migration to the target database first (§1.1, §1.2).
2. Confirm the migration applied by querying the schema directly (§1.2, §4.1) — not by trusting `migration list`.
3. Deploy the code (push to `main` triggers `deploy-production` in `ci.yml`).
4. Run the mandatory regression suite against the deployed environment if this was a workflow/verification change (§6).

---

## 2. Rollback guide

### 2.1 Code rollback

Standard Vercel rollback (redeploy the previous production deployment, or revert the merge commit and push to `main`). The workflow's behavior is entirely derived from `deletion_requests.checkpoint` plus the Registry/workflow code — there is no separate state store to roll back in lockstep, **except**: if the rolled-back code no longer knows about `verify_database`/`verify_storage`/`verify_external` states (i.e., rolling back past Phase 5C), any `deletion_requests` row currently sitting in one of those states will not resume correctly under the older code, which doesn't have a `case` for it in `runStep()`'s switch (falls through to `return []`, which is not the same as the pre-Phase-5C pass-through and is untested). **Practical guidance:** don't roll back past Phase 5C while any deletion request is in-flight (`status` not `completed`/`cancelled`/`failed`) — check `SELECT count(*) FROM deletion_requests WHERE status NOT IN ('completed','cancelled','failed')` before rolling back.

### 2.2 Migration rollback

No `down` migrations exist for this subsystem (consistent with the rest of this repo's migration style — forward-only). Rollback procedure per migration:

- **`20260715000001_deletion_requests.sql`** — `DROP TABLE public.deletion_requests;` (cascades the RLS policy and indexes). Only safe if no code path reads/writes it — i.e., only meaningful if you're also rolling back Phase 3+ code that depends on this table.
- **`20260716000001_transactional_deletion.sql`** — `DROP FUNCTION public.delete_user_owned_data_ordered(uuid, jsonb);`. Rolling this back without also rolling back `gdpr-data.ts`'s `deleteUserOwnedData()` (which calls it by name) breaks every GDPR deletion request outright — do not do this alone.
- **`20260720000001_verify_user_owned_data_deleted.sql`** — `DROP FUNCTION public.verify_user_owned_data_deleted(uuid, jsonb);`. Safe in isolation only if the code is also rolled back to before Phase 5C (older code never calls it); if current code is still deployed, dropping this function turns every verify_database step into a whole-call RPC failure — which the code already handles gracefully as `inconclusive` (§4.2), not a hard failure, so this is a **survivable** rollback ordering mistake, unlike the delete function's.

Every migration in this subsystem uses `CREATE OR REPLACE FUNCTION` / `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` — confirmed idempotent by direct reading. Re-running any of them against a database that already has the object is a safe no-op, which also makes **re-applying after a bad rollback** low-risk.

### 2.3 No retry/cancel endpoint exists — and what "retry" actually means (Phase 5F decision)

A `deletion_requests` row that reaches `status = 'failed'` (permanent failure after `MAX_RETRY_COUNT = 3`) has no product-facing recovery path today — this was named as an open item in Phase 4C's Risk Register (item #12) and remains true. The only recovery today is a direct database operation: either manually resolve the underlying condition and reset `status`/`retry_count`/relevant `checkpoint` entries, or leave the row `failed` (it still blocks a new deletion request for that user, per `deletion_requests_one_active_per_user`'s deliberate inclusion of `failed`).

**Phase 5F's Product/engineering decision (Option A, per Phase 5F's own WP2, scoped to close the Final Production Readiness Review's R-14): verification failure remains manual remediation.** This is a decision recorded here, not a new behavior — the code was already built this way; what changed in Phase 5F is that this is now an explicit, named decision rather than an implicit consequence nobody signed off on. The alternative (Option B — automated remediation, i.e. having a retry actually re-run the delete/adapter step when a verify phase confirms a real defect) was evaluated and explicitly rejected for this phase: implementing it would mean `resumeStartStatus()` (`workflow.ts:594-600`) revisiting an earlier, already-`completed`-marked phase in `STATE_ORDER` — a change to the workflow state machine, which is frozen architecture per ADR-0005 and out of scope for a remediation phase. Building it would require an ADR-0005 amendment and a new architecture proposal, not a bug fix.

**What "retry_pending" actually means, precisely, now that this is a recorded decision:** when a `verify_database`/`verify_storage`/`verify_external` step confirms a real leftover resource, every subsequent call to `POST /api/emma/gdpr {action:"delete"}` re-runs **only the verification check for that phase**, never the delete/adapter step that already ran once. If the underlying data was already gone by the time of the re-check (e.g. a transient replica-lag false positive, or the leftover was independently cleaned up), the re-check will find it clean and the workflow proceeds. If the leftover is real and persistent (e.g. the disclosed in-flight-background-job race, `registry.ts:556-568`), it will never resolve itself — the workflow will exhaust `MAX_RETRY_COUNT` and reach permanent `status:"failed"` with the leftover data never targeted for deletion again.

**Operator responsibilities when a row reaches permanent `failed` status following a confirmed (not `inconclusive`) verification defect:**

1. Identify the specific resource(s) that failed via the row's `checkpoint` array (`resourceStatus:"failed"` entries, not `"inconclusive"`).
2. Manually confirm via a direct query whether the data genuinely still exists (don't trust the checkpoint alone if significant time has passed — the underlying condition may have resolved).
3. If data still exists, manually delete it for that specific resource/user (a scoped, targeted `DELETE`/Storage removal — not a re-run of the whole workflow).
4. Once manually confirmed clean, either reset the row (`status`, `retry_count`, and append a manual-remediation `checkpoint` entry noting what was done and by whom) so a future resume can reach `completed`, or mark it resolved out-of-band and communicate completion to the user directly.
5. Record the remediation (who, when, what was found, what was done) — there is no product-facing audit trail for manual remediation today; this is a process discipline, not a system guarantee.

**Expected workflow for the requesting user:** the corrected UI copy (`src/app/settings/privacy/page.tsx`, Phase 5F WP1) now tells the user to click "Delete" again themselves rather than claiming the system will retry on its own — this is accurate to how the mechanism works (a fresh identical request is exactly what advances a `retry_pending` row), but it does not by itself resolve a _confirmed_ defect, only a transient one. A user whose request reaches permanent `failed` status sees "Deletion could not be completed. Please contact support." (`page.tsx`'s existing fallback branch, unchanged) — support intervention, following the operator procedure above, is the actual recovery path.

**This remains an accepted, disclosed gap, not a defect requiring urgent code change** — building a retry/cancel endpoint or automated remediation would be new product/architecture surface, explicitly out of scope for Phase 5F (a remediation-only phase). See §8 for the monitoring process that makes sure this gap doesn't mean requests are silently forgotten.

---

## 3. Deployment pipeline — the migration-before-code gap, and what Phase 5E did and didn't do about it

**Finding, re-confirmed this phase:** `.github/workflows/ci.yml` has no job that applies Supabase migrations, and `deploy-production` triggers on every push to `main` unconditionally (`if: github.ref == 'refs/heads/main'`). There is no manual approval gate and no feature-flag infrastructure anywhere in this repo to disable a code path post-deploy if sequencing is inverted.

**What Phase 5E added:** a non-blocking CI step (`Migration-before-code sequencing reminder` in `ci.yml`'s `test` job) that emits a GitHub Actions warning annotation whenever a pull request touches `supabase/migrations/`, pointing back to this document. It does **not** block merge, does **not** apply migrations, and does **not** change any runtime behavior — a deliberately bounded choice.

**What Phase 5E did not build, and why:** a real enforcement mechanism (an automated `migrate` job gating `deploy-production`) would need Supabase deploy credentials (`SUPABASE_ACCESS_TOKEN`, project ref) as GitHub Actions secrets. This repo's `ci.yml` was confirmed this phase to reference no such secrets, and building an untested migration-apply pipeline step against this project's actual production target — without the ability to verify it end-to-end — is exactly the kind of pipeline change that's riskier to get wrong silently than to leave manual. **This residual risk is explicitly accepted, not resolved**, consistent with the Phase 5E spec's own stated option ("document and explicitly accept the residual operational risk"). If/when Supabase deploy secrets are wired into CI for another reason, revisit this and build the real gate.

---

## 4. Live database validation (Phase 5E findings, linked "Emma" Supabase project)

All queries below were run against the linked Supabase project (`frwabkgvzjwfcmbpikir`, the same project used for every prior live-validation phase — 2.1, 3.1) using a synthetic test UUID (`11111111-2222-4333-8444-555555555555`) that does not correspond to any real account. One synthetic row was inserted into `usage_windows` and deleted again within the same validation pass; no other data was touched.

### 4.1 Schema-drift finding: 4 of 32 Registry tables do not exist on this project

Direct query against `information_schema.tables` confirmed: **`document_chunks`, `personas`, `push_subscriptions`, `proactive_daily` do not exist at all** on the linked project. This is the same set of 4 tables named in ADR-0004's original Phase 0 audit and tracked as Phase 4C Risk Register item #1 ("Production schema-drift... confirmed affected on the linked validation project") — this phase converts that from "confirmed at the column level for one table" to **"confirmed at the table level for all four, empirically, this session."**

**Concrete, empirically-confirmed consequence:** `delete_user_owned_data_ordered`, called for a synthetic user against the real 32-table Registry list, raises `unknown column: document_chunks.user_id` and aborts the **entire atomic transaction** (0 rows deleted, everything rolled back) — confirmed by direct RPC call this session. Since `document_chunks` is 8th in delete order, this means **any real GDPR deletion request against this project's current schema fails completely, deterministically, every time**, until these 4 tables exist. The workflow retries 3× (per `MAX_RETRY_COUNT`) and then reaches permanent `status: "failed"` with no recovery path (§2.3).

`verify_user_owned_data_deleted` behaves better by design (per-table catch, ADR-0005's explicit divergence from the delete function): the same 4 tables return `checked: false, error_detail: "unknown column: <table>.user_id"` without affecting the other 28 tables' results — confirmed directly this session.

**Action needed before this feature is relied on for real users on this project:** create the 4 missing tables (their migrations exist elsewhere in `supabase/migrations/` for the main schema — this is a matter of applying them, not designing them) or, if this project is deliberately a reduced-schema validation environment rather than a production proxy, document that explicitly so this finding isn't mistaken for a code defect. This is Ops' call (per ADR-0005's Risk Register item #1 owner), not a Phase 5E decision — Phase 5E's job was to make the gap concrete and current, which it now is.

**Re-confirmed, unchanged, Phase 5F (2026-07-21):** the Final Production Readiness Review's WP4 re-ran this exact `information_schema.tables` check against the same linked project, this time against the Registry's complete, current 32-table list (including `chat_messages`/`message_feedback`, which Phase 5F discovered were missing from `schema.sql`'s own text — see §4.4 — but _do_ exist on this live project). Result: **the same 4 tables are still missing** (`document_chunks`, `personas`, `push_subscriptions`, `proactive_daily`) — `exists_in_information_schema: false` for all four, `true` for the other 28, confirmed via a direct query, not the migration ledger. This discrepancy is documented, not resolved, per Phase 5F's explicit scope boundary (WP4: "if discrepancies remain, document them, do not modify architecture") — creating tables on a live project is a production-database write, not a documentation or code change, and remains Ops' call. **Whether this linked project is "production" or a validation environment has still never been formally decided by anyone with the authority to decide it** — this ambiguity, not just the missing tables themselves, is the actual open item blocking a clean answer to WP4.

### 4.4 Additional schema.sql/Registry drift found by Phase 5F's static check (WP5)

Independently of the live-database check above, Phase 5F's new static Registry-vs-`schema.sql` test (`tests/unit/registry-schema-drift.test.ts`) found that **`schema.sql`'s own text was missing `create table` statements for `chat_messages` and `message_feedback`** — both tables exist live (confirmed in §4.1's re-run above) via their own standalone migrations (`20260523000002_chat_messages.sql`, `20260523000001_message_feedback.sql`), but neither definition was ever folded into the consolidated `schema.sql` snapshot, the same class of gap `user_files`/`user_mcp_servers` had before Phase 2.1 backfilled them. Both were fixed in `schema.sql` this phase (see §9). This is a distinct finding from the 4-table live-schema gap above: that one is "the live database is missing tables the Registry expects," this one was "`schema.sql`'s documentation was incomplete even though the live tables existed." Both classes of drift are now covered going forward — see §9.

### 4.2 Verify-function behavior matrix (all confirmed this session)

| Scenario                                                               | Confirmed behavior                                                                                                                                                                                 |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty table (no rows for user)                                         | `checked: true, remaining_count: 0` — 28/32 tables                                                                                                                                                 |
| Populated table (synthetic row inserted)                               | `checked: true, remaining_count: 1` — confirmed via a real insert/verify/delete/re-verify cycle against `usage_windows`                                                                            |
| Unknown column (table doesn't exist)                                   | `checked: false, error_detail: "unknown column: <table>.<column>"`, per-table only — does not abort the batch                                                                                      |
| Malformed table identifier (e.g. `"profiles; DROP TABLE profiles;--"`) | Whole-call abort: `RAISE EXCEPTION 'invalid table identifier: ...'`, confirmed via direct RPC call — the regex guard (`^[a-zA-Z_][a-zA-Z0-9_]*$`) rejects it before any `EXECUTE format(...)` runs |
| Batching                                                               | Single RPC call for all 32 database resources, confirmed — matches ADR-0005 item 6's binding requirement                                                                                           |
| Execution time                                                         | **~31ms server-side** (`EXPLAIN ANALYZE`, full 32-table batch) — see §5                                                                                                                            |

### 4.3 Migration validation

- **Ordering:** all four account-deletion migrations (`20260715000001`, `20260716000001`, `20260720000001`, plus the unrelated `20260714000001` usage-window fix) apply cleanly in timestamp order against the linked project; no ordering conflict found.
- **Idempotency / repeatable deployment:** every migration in this subsystem uses `CREATE OR REPLACE FUNCTION`, `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and `DROP POLICY IF EXISTS` before `CREATE POLICY` — confirmed by direct reading of all three files. Re-running any of them is a safe no-op.
- **Rollback:** see §2.2.
- **Clean deployment on a fresh database:** not independently tested this phase (would require provisioning a throwaway Supabase project, out of the time/access budget for this pass) — the migrations' use of `IF NOT EXISTS`/`CREATE OR REPLACE` gives reasonable confidence this would succeed, but this is a reasoned inference, not a confirmed test. Flagged as a residual gap, not blocking.
- **Upgrade from existing production schema:** this is exactly what §4.1's finding demonstrates the linked project needs and currently lacks — the "upgrade" path from this project's current schema requires the 4 missing tables first.
- **Migration ledger drift:** see §1.2 — a distinct, real operational finding: the remote ledger cannot be trusted to reflect actual schema state for this subsystem.

---

## 5. Performance validation

| Measurement                                           | Result                                                                                                                                                        | Method                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `verify_user_owned_data_deleted`, full 32-table batch | **30.841ms execution time** (`actual time=30.772..30.775`, `rows=32`)                                                                                         | `EXPLAIN ANALYZE`, linked project, synthetic user |
| `delete_user_owned_data_ordered`                      | Not independently re-measured this phase (aborts immediately on this project per §4.1, so a real timing run isn't representative until the schema gap closes) | —                                                 |
| Storage `verify()`/`delete()` (2 buckets)             | Not re-measured this phase — unchanged since Phase 3/4C, `list(..., {limit:1})` calls, reasoned cheap                                                         | —                                                 |
| Retry overhead                                        | Bounded by `MAX_RETRY_COUNT = 3`, unchanged, reused from Phase 3.1                                                                                            | Code inspection                                   |
| Checkpoint growth                                     | Bounded per Phase 4C's own analysis (~136 entries worst case at `MAX_RETRY_COUNT = 3`)                                                                        | Code inspection, not re-derived                   |

**Conclusion:** the verify RPC's measured cost (~31ms) is negligible relative to the `maxDuration: 60` (60,000ms) budget now set in `vercel.json` (§1.3) — no timeout risk from the verification step itself under normal conditions. The dominant risk to request duration on this project today is not performance — it's the deterministic transaction abort described in §4.1, which fails fast (well under any timeout) rather than slow.

---

## 6. Regression audit — mandatory tests

All four confirmed present and passing as of this phase's full suite run (`npx vitest run` → 783 passed, 3 skipped, 0 failed):

| Regression             | Location                                                                                                                                                                                                        | What it guards against                                                                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Marker Defect**      | `tests/unit/verification-workflow.test.ts:460` (`MANDATORY REGRESSION — Marker Defect`)                                                                                                                         | The original CRITICAL finding: a confirmed defect being masked by an unconditionally-`"completed"` marker, letting a retry falsely skip re-verification                |
| **Storage Undercount** | `tests/unit/verification-workflow.test.ts:503` (`MANDATORY REGRESSION — Storage Undercount`)                                                                                                                    | The Revision-3 Major finding: a placeholder `"skipped"` entry outranking real `"completed"` evidence under the retry-dedup rule                                        |
| **Resume**             | `tests/unit/verification-workflow.test.ts:572` (`MANDATORY REGRESSION — Resume`)                                                                                                                                | Pre-Phase-5C rows with stale placeholder checkpoints re-running real verification correctly on first post-deploy resume; repeated resumes converging deterministically |
| **API Verification**   | `tests/unit/gdpr-workflow-integration.test.ts:268` (`does not report success when the database verification confirms leftover data`, under `POST /api/emma/gdpr delete — Phase 5D verification response field`) | The API layer cannot report `success: true` when the workflow's own verification found a confirmed defect                                                              |

These four are already merge-blocking via `.github/workflows/ci.yml`'s existing `npm test` step (no CI change needed — they were already part of the suite `npm test` runs on every PR).

---

## 7. Observability

**Current state (unchanged by Phase 5E — reviewed, not modified, per the feature-freeze):** `workflow.ts`'s `log()` function emits structured `console.warn` lines (`[DeletionWorkflow] <event>`) with `requestId`/`userId`/`status` plus event-specific fields (e.g. `verification_started`, `verification_failed`, `aggregate_marker_created`). This is sufficient for **reconstructing a single user's deletion workflow after the fact** from log lines plus the persisted `checkpoint` array — confirmed by direct trace of every `log()` call site against the state machine.

**What it cannot do, by design (Phase 4 roadmap scope, unchanged):** fleet-wide aggregation ("how many deletions are `retry_pending` right now"), alerting on `inconclusive` counts, or any cross-user query. This is Phase 7 (Production Operations) scope, not a Phase 5E gap — restated here so it isn't mistaken for an oversight.

**Troubleshooting a specific user's deletion:**

1. `SELECT * FROM deletion_requests WHERE user_id = '<uuid>' ORDER BY requested_at DESC LIMIT 1;`
2. Read `status` and `checkpoint` directly — `checkpoint` is the full, append-only history of every phase this request has gone through, including all retry generations.
3. Cross-reference `console.warn` logs for `requestId` (the row's `id`) in your log aggregator, filtered to `[DeletionWorkflow]`.
4. If `verification.database.inconclusive > 0` in the API response (or `resourceStatus: "inconclusive"` entries in `checkpoint` for `verify_database`), check whether `verify_user_owned_data_deleted` exists on the target database (§1.2/§4.1) before assuming a transient error.

---

## 8. Operational monitoring for terminal failures (Phase 5F, WP3)

This closes the gap the Final Production Readiness Review's R-18 named: §7 above gives an operator the ability to diagnose a _specific_ stuck request, but nothing previously defined how an operator finds out one exists in the first place. Real, automated alerting (a dashboard, a paging integration) is out of scope for Phase 5F — it's Phase 7 (Production Operations) roadmap territory, requiring infrastructure this repo doesn't have today. What Phase 5F adds is a documented, ownable manual process to serve as an interim backstop, consistent with the Final PRR's condition 4.

### 8.1 Detection procedure and monitoring query

Run this query manually against the target database (or wire it into any ad-hoc dashboard tool already in use — it requires no new infrastructure):

```sql
select
  id, user_id, status, retry_count, requested_at, updated_at,
  checkpoint -> -1 ->> 'phase' as last_phase,
  checkpoint -> -1 ->> 'resourceStatus' as last_resource_status
from deletion_requests
where status in ('failed', 'retry_pending')
order by requested_at asc;
```

- Rows with `status = 'failed'` are permanent — per §2.3, these need operator remediation now, not later.
- Rows with `status = 'retry_pending'` where `updated_at` is more than a few minutes old (adjust the threshold to your own traffic patterns) likely mean the user never returned to click "Delete" again (per the corrected UI copy, §2.3) — these aren't broken, but a very old `retry_pending` row combined with a `last_resource_status` of `failed` (not `inconclusive`) is the same underlying condition as a `failed` row for GDPR-timeliness purposes and should be reviewed the same way.
- `last_resource_status = 'inconclusive'` rows are lower priority — they represent a transient check that hasn't resolved yet, not a confirmed defect (see §2.3's distinction).

### 8.2 Review cadence

**Weekly, minimum, until real alerting exists** (per the Final PRR's explicit condition — this is an interim commitment, not a permanent posture). Given GDPR erasure requests carry statutory time expectations, a longer cadence than weekly is not recommended without real automated alerting to compensate.

### 8.3 Ownership

Ops (same owner named in ADR-0005's Risk Register for schema-state confirmation, §4.1/§4.3) is responsible for running this query on the stated cadence until Phase 7 builds automated alerting. This is a named, accepted interim responsibility, not an unowned gap.

### 8.4 Escalation path

Any row found with `status = 'failed'`, or `status = 'retry_pending'` with a confirmed (non-`inconclusive`) `last_resource_status = 'failed'` older than one review cycle, should be escalated to whoever owns the manual remediation procedure in §2.3 for that specific user, with the query's output (row `id`, `user_id`, `last_phase`, `last_resource_status`) attached. There is no automated ticket creation for this today — escalation is a manual handoff.

---

## 9. Registry/schema.sql drift prevention (Phase 5F, WP5)

`tests/unit/registry-schema-drift.test.ts` (new this phase) statically parses `supabase/schema.sql` for every `create table if not exists [public.]<name>` statement and asserts every one of the Registry's 32 database resources (`registry.ts`'s `getDatabaseResources()`) has a matching entry. It requires no live database access or credentials and runs as part of the existing `npm test` suite — already merge-blocking via `.github/workflows/ci.yml`'s `npm test` step, no CI configuration change needed.

**What this check does and does not prove:** it proves `schema.sql`'s _text_ claims to define every table the Registry expects (this phase's own §4.4 finding — `chat_messages`/`message_feedback` were missing from that text and have been fixed). It does **not** prove any particular deployed database actually has those tables — that's what §4.1's live `information_schema.tables` check is for, and is a distinct, ongoing gap (still true for 4 tables on the linked project, per §4.1's Phase 5F re-confirmation). Both checks are necessary; neither is sufficient alone. This is the automated regression-prevention half of R-17 from the Final PRR; the live-validation half remains manual and is covered by §8's monitoring process plus whatever future live-validation phase re-runs §4.1's query.

---

## Related

- [ADR-0004: Account Deletion Architecture](../adr/0004-account-deletion-architecture.md)
- [ADR-0005: Account Deletion Verification Architecture](../adr/0005-account-deletion-verification-architecture.md)
- [Phase 4C Production Readiness Review](../plans/2026-07-20-account-deletion-phase4c-production-readiness.md) (Risk Register items 1, 2, 12 — this document's primary source of open risks)
- [Phase 5E Production Hardening Report](../plans/2026-07-21-account-deletion-phase5e-production-hardening.md)
- [Final Production Readiness Review](../plans/2026-07-21-account-deletion-final-production-readiness-review.md) — source of R-14 through R-18, the blocking conditions this document's §2.3/§8/§9 close out
- [Phase 5F Production Readiness Remediation Report](../plans/2026-07-21-account-deletion-phase5f-production-readiness-remediation.md)
- [reference-api.md](../reference-api.md#gdpr) — API contract
- `src/core/account-deletion/{registry,workflow,workflow-types,gdpr-data}.ts`
- `vercel.json`, `.github/workflows/ci.yml`
- `tests/unit/registry-schema-drift.test.ts`, `tests/unit/privacy-settings-copy.test.ts`
