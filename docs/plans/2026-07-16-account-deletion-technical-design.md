# Account Deletion — Technical Design Document

**Status:** Describes the implementation as it exists after Phase 1, Phase 2, and Phase 2.1.
**Written:** 2026-07-16, retroactively — Phases 1 and 2 shipped without this document (see [ADR 0004](../adr/0004-account-deletion-architecture.md) for why that gap mattered and how it was closed).
**Implementation:** `src/core/account-deletion/`, `src/app/api/emma/gdpr/route.ts`, `supabase/migrations/20260715000001_deletion_requests.sql`, `supabase/migrations/20260716000001_transactional_deletion.sql`.

---

## Goals

1. **One inventory, not several.** Every resource that may need to be deleted, verified, or reported on for a user is listed exactly once, in one file, so future phases (verification, reconciliation, metrics) read from that list instead of maintaining their own copy that can drift.
2. **Atomicity.** A GDPR deletion request either fully succeeds or leaves the database exactly as it was before the request — never half-deleted.
3. **A stable, reusable adapter contract** so that resources living outside the database (Storage today; OAuth tokens and background jobs later) can be deleted through the same lifecycle shape as everything else, without inventing a new pattern per resource type.
4. **A path to durable, resumable deletion** (the `deletion_requests` table) without building the orchestrator that consumes it before there is a proven, hardened synchronous foundation to build it on.
5. **Compliance-grade correctness**, validated against a real database, not just reasoned about from the code.

## Non-Goals (this document, this implementation)

- Workflow orchestration, a state machine, checkpoint execution, a grace period, or a retry scheduler. These consume `deletion_requests`; nothing does yet (see **Future Orchestration Boundary**).
- A verification engine that independently re-checks deletion completeness after the fact.
- Reconciliation, metrics pipelines, or an operator dashboard.
- OAuth or background-job deletion adapters — only Storage adapters exist today.

> **Superseded by Phase 3 for the items above marked "these consume `deletion_requests`."** Workflow orchestration, the state machine, checkpoint execution, and retry now exist — see `src/core/account-deletion/workflow.ts` and the **Future Orchestration Boundary** section below, which documents what actually shipped. This document's own scope (Phases 1/2/2.1) is otherwise still accurate for the Registry, transactional RPC, and adapter lifecycle it describes — those were not changed by Phase 3 or 3.1.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Deletion Resource Registry (registry.ts)                        │
│  — single source of truth: every resource, its ownership,        │
│    criticality, phase, and which adapter (if any) deletes it     │
└───────────────────────────┬───────────────────────────────────────┘
                             │ read by
                ┌────────────┴─────────────┐
                ▼                          ▼
┌───────────────────────────┐  ┌─────────────────────────────────┐
│ toUserOwnedDeleteOrder()   │  │ getStorageDeletionAdapters()     │
│ toGdprExportTables()       │  │ (adapters/registry-adapters.ts)  │
└──────────────┬─────────────┘  └────────────────┬──────────────────┘
               │                                  │
               ▼                                  ▼
┌───────────────────────────┐  ┌─────────────────────────────────┐
│ delete_user_owned_data_    │  │ DeletionAdapter (adapter.ts)     │
│ ordered() — one Postgres   │  │  prepare / delete / verify /     │
│ transaction, 32 tables     │  │  cleanup                         │
│ (supabase/migrations/      │  │  implemented by:                 │
│ 20260716000001_...sql)     │  │  StorageBucketAdapter            │
└──────────────┬─────────────┘  └────────────────┬──────────────────┘
               │                                  │
               └──────────────┬───────────────────┘
                               ▼
                POST /api/emma/gdpr { action: "delete" }
```

Both paths — the SQL transaction and the Storage adapters — are driven by the same Registry and invoked from the same, single, synchronous HTTP endpoint. There is no orchestrator between the endpoint and either path.

---

## The Registry (`src/core/account-deletion/registry.ts`)

37 entries, two shapes:

- **`DatabaseResourceEntry`** (32 of them) — a directly user-owned table: `table`, `column` (defaults `user_id`), `exportKey`/`exportSelect`/`exportLimit` for GDPR export, plus `deletionAdapter: "legacy-table-delete"` (a label for "the transactional function handles this," not a literal adapter object — see **Why database resources don't use the `DeletionAdapter` interface**).
- **`OtherResourceEntry`** (5 of them) — Storage (×2), OAuth, background jobs, and one explicitly out-of-scope table (`ingested_whatsapp`, which has no `user_id`-shaped ownership column).

Every entry carries `introducedInWorkflowVersion: 1` (see **workflowVersion rationale**) and `ownershipClassification` (`user-owned` | `tenant-owned` | `out-of-scope`).

Two pure derivation functions turn the Registry into what the two consumers actually need:

- `toUserOwnedDeleteOrder()` → `{table, column}[]`, in Registry order (children before parents).
- `toGdprExportTables()` → the same, plus `exportKey`/`select`/`limit`, for the export path.

Neither `USER_OWNED_DELETE_ORDER` nor `GDPR_EXPORT_TABLES` in `gdpr/route.ts` is maintained by hand anymore — both are `const X = toX()` at module load. This is Phase 1's actual fix, not incidental cleanup: before it, the two arrays were independently maintained and had already drifted (`document_chunks`, `personas`, `push_subscriptions`, `proactive_daily` were present in one and missing from the other before Phase 1).

### Why database resources don't use the `DeletionAdapter` interface

The 32 database resources are all deleted by one generic mechanism (a filtered `DELETE`), executed inside one transaction, for a reason Storage can't share: cross-table atomicity. If each table were its own `DeletionAdapter.delete()` call, either the adapter loop would need its own transaction-spanning logic (duplicating what Postgres already gives a single function call for free), or atomicity would be lost. `deletionAdapter: "legacy-table-delete"` on database entries is a **label**, read by nothing today — it exists so a future phase (verification, or a real per-table adapter if one is ever needed) has something to branch on, not because anything currently instantiates a `DeletionAdapter` object for a database table.

---

## Deletion Flow

`POST /api/emma/gdpr { action: "delete", confirmEmail }`:

1. Auth check (`getUser()`), email-confirmation check — unchanged since before Phase 1.
2. `audit()` — logs the deletion request itself (this row is then deleted along with the rest of the user's `audit_log` rows, by design: the audit trail for "this account was deleted" lives in `audit_log`'s own row until that row is itself deleted in step 3).
3. `deleteUserOwnedData(supabase, userId)` — one `supabase.rpc("delete_user_owned_data_ordered", ...)` call. All 32 tables, atomically. Returns a `string[]` summary (`"table: count"` per table).
4. For each adapter `getStorageDeletionAdapters()` returns (today: the two Storage buckets) — `prepare()` (no-op) → `delete()` → `cleanup()` (no-op), best-effort, errors logged and appended to the summary but never thrown. This is intentionally **not** transactional with step 3: the compliance-critical database erasure has already succeeded by the time Storage runs, and a Storage failure (network blip, bucket permission issue) should not roll back or fail a request that has already correctly erased the user's database footprint.
5. Response: `{success: true, deletedAt, summary, note}` — unchanged shape since before Phase 1.

`auth.users` is never deleted by this endpoint (unchanged, pre-existing behavior — a deliberate decision, not a Phase 1/2 change).

---

## Transactional Strategy

Before Phase 2, `deleteUserOwnedData()` looped over 32 tables issuing 32 independent `.from(table).delete().eq(column, userId)` calls, each auto-committing on its own. A failure partway through (table 15 of 32, say) left tables 1–14 deleted, 15–32 untouched, and the request returned a 500 — a real half-deletion bug, not a hypothetical one.

Phase 2 replaces this with `delete_user_owned_data_ordered(p_user_id uuid, p_tables jsonb)`, a single `plpgsql` function called once via `rpc()`. Because PostgREST executes an RPC call as one statement in one transaction, an unhandled `RAISE EXCEPTION` anywhere in the function's loop aborts the entire transaction — every delete performed so far in that call rolls back. This was proven, not just reasoned about: Phase 2.1's live-database validation (see **Phase 2.1: what live validation actually found**) forced a failure mid-loop and confirmed a table processed successfully earlier in the same call was rolled back along with everything after it.

Design choices inside the function:

- **Table/column list and order are a parameter (`p_tables jsonb`), not hardcoded SQL.** The function has no knowledge of which 32 tables exist — it receives whatever `toUserOwnedDeleteOrder()` produces, in that order. The Registry remains the only place "which tables, what order" is decided.
- **Identifier safety.** `v_table`/`v_column` are validated against `^[a-zA-Z_][a-zA-Z0-9_]*$` before being used in `format('...%I...')`, and values are always bound via `USING`, never concatenated. `p_tables` originates from server-side code (the Registry), not user input, but the validation is defense in depth, not a trust boundary substitute.
- **The affiliates → affiliate_referrals cascade** is the one non-generic case (see registry.ts's note on `db.affiliates`: child rows are cascade-deleted by `affiliate_id`, not a plain column filter). It's special-cased inline in the function, mirroring the pre-Phase-2 TypeScript exactly, emitting an extra `affiliate_referrals` result row immediately before `affiliates`.
- **Column type is not assumed to be `uuid`.** Most ownership columns are `uuid`, but four are not (`audit_log.user_id`, `usage_windows.user_id`, `user_files.user_id`, `user_mcp_servers.user_id` are all `text`, predating this codebase's `uuid` standardization). The function looks up each column's actual type from `information_schema.columns` and casts `p_user_id` to match — casting the parameter, not the column, so an index on the ownership column stays usable. This was a real bug caught only by live-database validation (see below), not something the original design anticipated.
- **`SECURITY DEFINER`, `SET search_path = ''`, fully schema-qualified references** (`public.%I`, `public.affiliates`) — the same defensive pattern already used by this codebase's other `SECURITY DEFINER` functions (`backfill_legacy_chat_message`, `increment_usage_window`). `REVOKE ALL ... FROM PUBLIC, anon, authenticated; GRANT EXECUTE ... TO service_role` — only the server, never a client, can call this function. Verified live: `anon` and an authenticated user's own session both receive `permission denied for function delete_user_owned_data_ordered`.
- **Idempotency is structural, not a special case.** Every operation is `DELETE WHERE column = value`; there is no `INSERT`/`UPSERT` anywhere in the function. A second call against an already-deleted user matches zero rows everywhere and errors nowhere. Verified live, twice: once via a full-user double-delete, once via a post-rollback cleanup call.

### Phase 2.1: what live validation actually found

Phase 2's implementation and its independent verification both passed with tests that mocked the database — reasonable for unit coverage, but neither exercised real Postgres type semantics. Phase 2.1 ran the actual function against a real (disposable, project-authorized) Supabase instance and found two defects unit tests could not have caught:

1. **`operator does not exist: text = uuid`** — the four `text`-typed ownership columns above, once actually compared against a `uuid`-typed function parameter, failed outright. Fixed by the per-column type lookup and cast described above.
2. **`column reference "table_name" is ambiguous"`** — the function's own `RETURNS TABLE(table_name text, ...)` makes `table_name` a `plpgsql` variable in scope for the entire function body. A later-added query against `information_schema.columns` (which also has a `table_name` column) collided with it. Fixed by qualifying the query with a table alias (`c.table_name`).

Both are now fixed in the migration and `schema.sql` (kept byte-identical, verified by diff), and the full validation suite — functional deletion across 28 of the Registry's 32 tables that exist on the disposable validation project, the affiliate cascade, forced-failure rollback, double-run idempotency, and the permission model — passed 44/44 against the live database. See the Phase 2.1 Production Readiness Report for the full evidence log and for why 4 of 32 tables (`document_chunks`, `personas`, `push_subscriptions`, `proactive_daily`) could not be exercised on that particular project (an environment gap on the disposable project, not a code defect — those tables' definitions exist only in `schema.sql`, never as standalone migrations, which is itself a documentation-consistency finding, not an application bug).

---

## Adapter Lifecycle (`src/core/account-deletion/adapter.ts`)

```ts
interface DeletionAdapter {
  resourceId: string;
  prepare(ctx): Promise<void>;
  delete(ctx): Promise<DeletionAdapterResult>;
  verify(ctx): Promise<DeletionAdapterResult>;
  cleanup(ctx): Promise<void>;
}
```

Four stages, deliberately generic enough that Storage, OAuth, and background-job adapters can all implement the same shape:

- **`prepare()`** — anything an adapter needs before deleting (nothing does yet; Storage's is a no-op).
- **`delete()`** — the actual removal, returning `{success, itemsProcessed, detail?, error?}`.
- **`verify()`** — exists in the interface now so adding real verification later (Phase 3, per the instruction that commissioned this document) doesn't require a breaking interface change. Every adapter that exists today implements it as a stub (`stubVerify(detail)`) returning `{success: true, itemsProcessed: 0, detail}` — no verification logic has been written; Phase 3 owns that.
- **`cleanup()`** — post-delete teardown (nothing does yet; Storage's is a no-op).

### Storage adapters (`adapters/storage-bucket-adapter.ts`)

`createStorageBucketAdapter(bucket, resourceId)` implements the lifecycle for one bucket. Both buckets this codebase has (`document-ingestion`, `task-documents`) key every object as `${userId}/...` (confirmed against the actual upload code: `ingest/document/presign/route.ts`, `integrations/docgen.ts`), so `delete()` is: list the user's folder, remove what's returned, and — critically — **re-list rather than list-once-and-loop**. Re-listing after each batch is what makes the adapter resumable (an interruption mid-delete just finds whatever's left the next time `delete()` runs) and idempotent (an already-empty folder lists empty, `itemsProcessed: 0`, `success: true`, no error). Verified live: uploaded real objects to both buckets, deleted them through the real adapter, confirmed a second `delete()` call returns zero items without error.

### Registry-to-adapter resolution (`adapters/registry-adapters.ts`)

`getStorageDeletionAdapters()` derives its adapter list from `DELETION_RESOURCE_REGISTRY.filter(entry => entry.deletionAdapter === "storage-bucket-delete")`, deriving each bucket name from the matching `resourceId` (`"storage.document-ingestion"` → bucket `"document-ingestion"`) rather than maintaining a second hardcoded resourceId → bucket mapping. The Registry stays the only place that says which resources have a real adapter — exactly the single-source-of-truth property that motivated the Registry's existence in Phase 1.

---

## `workflowVersion` Rationale

Every Registry entry, and the `deletion_requests` table's `workflow_version integer not null default 1` column, exist to answer one question a future orchestrator will need to ask: **"which version of the deletion workflow was this request executing against?"**

A durable, resumable deletion (the reason `deletion_requests` exists at all) can be in flight across a deploy. If the Registry changes shape between when a request started and when it resumes — a resource added, removed, or its adapter changed — the resuming workflow needs to know whether it's safe to continue against the _current_ Registry or whether it started against an older shape it should finish honoring instead. `introducedInWorkflowVersion` on each Registry entry and `workflow_version` on each `deletion_requests` row are the two halves of that answer. Today, with workflow version pinned at `1` everywhere and nothing reading `deletion_requests`, this is inert plumbing — it becomes load-bearing only once an orchestrator exists to read it (see below).

---

## Future Orchestration Boundary

`deletion_requests` (Phase 1, `supabase/migrations/20260715000001_deletion_requests.sql`) is a persistence table with a 14-state status column (`requested` → `validating` → `waiting_grace_period` → `locked` → `deleting_database` → `deleting_storage` → `deleting_oauth` → `deleting_background_jobs` → `verify_database` → `verify_storage` → `verify_external` → `completed` | `retry_pending` | `failed` | `cancelled`), a `checkpoint jsonb` array, and `workflow_version`. **Phase 3 built the orchestrator this section anticipated** (`src/core/account-deletion/workflow.ts`): it creates a `deletion_requests` row on a delete request, drives the adapter lifecycle per resource per phase, writes `checkpoint` after each step, and implements the grace-period check and retry logic this section named as the next phase's job. Phase 3.1 added optimistic concurrency control so two overlapping requests for the same user can't corrupt or duplicate that progress. What remains genuinely unbuilt, per Phase 3's own disclosed scope: grace-period _scheduling_ (the check is real, nothing sets the trigger or wakes a halted workflow), OAuth/background-job adapters, and real per-table verification (every `verificationAdapter` in the Registry is still `null`) — these stay Phase 4 scope, not something this document should claim exists.

The boundary this document draws, explicitly: everything above — the Registry, the transactional function, the adapter lifecycle, the synchronous `POST /api/emma/gdpr` endpoint — is the **execution foundation**. A future phase's orchestrator is expected to:

- Create a `deletion_requests` row on a delete request instead of (or in addition to) executing synchronously.
- Drive the adapter lifecycle (`prepare` → `delete` → `verify` → `cleanup`) per resource, per phase, writing `checkpoint` after each step so a crash mid-workflow can resume from the last completed step rather than restarting.
- Implement the grace period, retry scheduling, and the `verify_*`/reconciliation states the status enum already reserves space for.

None of that exists today, and Phase 2.1 does not build it — this document exists specifically to make that boundary legible before that work starts, per the instruction that commissioned it.

---

## Excluded Responsibilities (as of this document)

Explicitly not implemented, not designed beyond the status-enum placeholder, and not this document's job to design:

- Workflow orchestration / state machine execution
- Grace period scheduling
- Checkpoint read/write (the column exists; nothing populates it)
- A verification engine (the `verify()` lifecycle stage exists; every implementation is a stub)
- Reconciliation
- Retry scheduling (`retry_count`/`retry_pending` exist as schema; nothing drives them)
- OAuth deletion adapter (`oauth.client_integrations` Registry entry, `deletionAdapter: null` — deliberately unimplemented; the Registry's own note flags the underlying product/legal question — "deletion policy for a single member leaving a shared client" — as unresolved, not merely undone)
- Background-job deletion adapter (`background.document_process` Registry entry, `deletionAdapter: null` — in-flight Inngest runs are not cancelled on deletion today)
- Metrics pipeline, operator dashboard

---

## Implementation Decisions Log

| Decision                                                                                                | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One SQL function over per-table adapters for database resources                                         | Atomicity requires one transaction; a `DeletionAdapter`-per-table loop couldn't provide that without reimplementing what Postgres already gives one function call                                                                                                                                                                                                                                                                                       |
| `p_tables jsonb` parameter instead of hardcoded table list in SQL                                       | Keeps the Registry the single source of truth for table/column/order; the SQL function is generic execution machinery, not a second inventory                                                                                                                                                                                                                                                                                                           |
| Cast the parameter, not the column, for non-`uuid` ownership columns                                    | Preserves index usability on the ownership column; casting the column (`column::text = $1`) would prevent the planner from using a plain btree index on it                                                                                                                                                                                                                                                                                              |
| Storage adapters wired into the existing synchronous endpoint, not left unwired pending an orchestrator | The alternative left two real buckets with zero deletion coverage indefinitely, which is what Phase 0B/Phase 1 already flagged as a gap; wiring them was judged the minimal fix that closes a known compliance gap without building orchestration. Recorded as an explicit interpretation call in the Phase 2 implementation report, not a discovered scope expansion under later review — see [ADR 0004](../adr/0004-account-deletion-architecture.md) |
| `verify()` included in the adapter interface now, implemented as a stub                                 | Avoids a breaking interface change when Phase 3 adds real verification; every current implementation explicitly defers, rather than fakes, that logic                                                                                                                                                                                                                                                                                                   |
| Storage deletion is best-effort (never fails or rolls back the request)                                 | The database erasure — the compliance-critical part — has already succeeded by the time Storage runs; a storage hiccup shouldn't turn a successful GDPR erasure into a 500                                                                                                                                                                                                                                                                              |
| `deletion_requests` created in Phase 1 but left completely unused through Phase 2.1                     | Building the table's shape early, without building anything that reads it, keeps the orchestration boundary explicit rather than letting orchestration logic creep into the synchronous path piecemeal                                                                                                                                                                                                                                                  |

---

## Related

- [ADR 0004: Account Deletion Architecture](../adr/0004-account-deletion-architecture.md)
- `src/core/account-deletion/registry.ts`
- `src/app/api/emma/gdpr/route.ts`
- `supabase/migrations/20260715000001_deletion_requests.sql`
- `supabase/migrations/20260716000001_transactional_deletion.sql`
