# ADR 0004: Account Deletion Architecture — a registry-driven, transactional execution foundation

- **Status:** Accepted
- **Date:** 2026-07-16
- **Phase:** 1 ("Foundation") → 2 ("Execution Foundation") → 2.1 ("Hardening & Production Validation")
- **Implementation:** `src/core/account-deletion/`, `src/app/api/emma/gdpr/route.ts`, `supabase/migrations/20260715000001_deletion_requests.sql`, `supabase/migrations/20260716000001_transactional_deletion.sql`
- **Companion:** [Account Deletion Technical Design Document](../plans/2026-07-16-account-deletion-technical-design.md) — the implementation-level detail this ADR does not repeat.

---

## Context

Before Phase 1, `src/app/api/emma/gdpr/route.ts` maintained two independent, hand-written arrays — `USER_OWNED_DELETE_ORDER` (~32 lines) and `GDPR_EXPORT_TABLES` (~200 lines) — that were supposed to describe the same set of user-owned resources for two different purposes (deletion, export). They had already drifted: `document_chunks`, `personas`, `push_subscriptions`, and `proactive_daily` were present in one array and missing from the other, undetected, before Phase 1 (Phase 0's deployment audit). Deletion itself was a loop of 32 independent, auto-committing `.delete()` calls with no transactional guarantee — a failure partway through left a user's data half-deleted with no rollback. Storage objects in two real buckets (`document-ingestion`, `task-documents`) had no deletion code anywhere in the repository. This ADR records the architecture that replaced that state, across three phases, and why.

**A note on how this ADR came to be written:** Phase 1 and Phase 2 were both implemented and independently verified — twice each — under instructions that described "the approved Technical Design Document and ADR" as canonical, pre-existing authority. Neither document existed anywhere in the repository, on any branch, in any stash, or in git history, at any of those points. This was verified exhaustively, not assumed, each time (see the Technical Design Document's header and Phase 2.1's own investigation). Every architectural decision recorded below was therefore made against this instruction's own stated objectives and the shipped Phase 1/2 code, not against a pre-existing design this ADR merely transcribes. This ADR is retroactive **by necessity**, not by choice, and it documents the implementation that actually exists rather than inventing behavior to make the history look more planned than it was.

---

## Decision

Account deletion is built as a **registry-driven, transactional execution foundation**, deliberately stopping short of workflow orchestration:

1. A single **Deletion Resource Registry** (`registry.ts`) is the only inventory of what may need deleting, verifying, or reporting on for a user.
2. Database deletion for all 32 directly user-owned tables executes as **one atomic Postgres transaction**, not a sequence of independent auto-committing statements.
3. Non-database resources (Storage today) are deleted through a **shared four-stage adapter lifecycle** (`prepare`/`delete`/`verify`/`cleanup`), so future resource types (OAuth, background jobs) extend the same shape instead of inventing their own.
4. A **persistence table** (`deletion_requests`) exists as a foundation for future durable, resumable deletion, but nothing reads or writes it yet — workflow orchestration is explicitly deferred, not designed here.

---

## Why registry-driven deletion was adopted

The alternative — what existed before Phase 1 — was proven to drift: two independently maintained lists of "user-owned resources" silently diverged, and the divergence went undetected until an audit found it. A registry doesn't prevent someone from forgetting to add a new table; it prevents the _second_ list from existing at all. `USER_OWNED_DELETE_ORDER` and `GDPR_EXPORT_TABLES` are now `const X = toX()` — pure derivations from one array, computed at module load, not maintained by hand. There is structurally nowhere for them to drift apart, because there is only one place the underlying data lives.

The Registry also does more than deletion needs today (`criticality`, `verificationAdapter`, `introducedInWorkflowVersion`, `enumerable`) — this is deliberate over-provisioning for the one property that matters most for a registry: it should not need a shape change every time a future phase (verification, metrics, reconciliation) needs one more fact about a resource. Phase 1 populated fields those phases will need, even though only two (`table`/`column` for deletion, `exportKey`/`exportSelect` for export) are read by anything today.

## Why transactional RPC replaced sequential deletes

The pre-Phase-2 loop's failure mode was not hypothetical: any single table's delete failing after N others had already succeeded left the database in a state no one had designed for — N tables erased, 32-N untouched, and a 500 response that gave the caller no way to know which. This is precisely the kind of defect a compliance-critical deletion path cannot carry.

A single `plpgsql` function invoked once via `rpc()` gets atomicity from Postgres's own transaction semantics — PostgREST executes one RPC call as one statement in one transaction, so an unhandled exception anywhere in the function aborts everything the function did in that call. This was chosen over alternatives (see **Alternatives Considered**) because it requires no new infrastructure, no distributed transaction coordinator, and no application-level compensation logic — it uses a guarantee the database already provides for free, for exactly the shape of problem ("many statements, one atomic outcome") a database transaction exists to solve.

The function receives its table/column list and order as a parameter (`p_tables jsonb`) rather than hardcoding a table list in SQL, specifically so the Registry — not the SQL function — remains the single source of truth for _which_ tables and in _what order_. The SQL function's job is narrowly "execute this list atomically," not "know what the list is."

## Why adapters use a lifecycle

Storage deletion cannot share the database transaction — Supabase Storage operations are not part of the Postgres transaction the RPC call runs in, and pretending otherwise would be a false guarantee. But Storage deletion still needs a _predictable_ shape, because it won't stay the only non-database resource: OAuth tokens and background jobs are already in the Registry (`oauth.client_integrations`, `background.document_process`) with `deletionAdapter: null`, waiting for their own adapters.

The four-stage lifecycle (`prepare`/`delete`/`verify`/`cleanup`) is the smallest contract that anticipates what those future adapters will need without designing them now: `prepare` for any setup a future adapter might require (a real database adapter doesn't need one; an OAuth adapter revoking a token before deleting its record plausibly would), `delete` for the actual removal, `verify` reserved for Phase 3's verification engine so adding it later doesn't force a breaking interface change, `cleanup` for teardown. Every implementation that exists today (`StorageBucketAdapter`) implements `verify()` as an explicit stub — a promise of future behavior, not a fake implementation of it.

## Why Storage adapters are wired into the existing endpoint

This is the one decision in this architecture made without either an instruction that stated it explicitly or a canonical document to check it against, and it is recorded here for exactly that reason — not because it was hidden, but because the absence of authority to point to is itself worth being honest about.

Two real Storage buckets had zero deletion code before Phase 2 — confirmed by Phase 0B's audit and recorded verbatim in the Registry's own notes ("no delete code exists anywhere in the repo for this bucket"). Building real adapters and _not_ wiring them into the one path that actually executes a user's deletion today would have left that gap exactly as open as before, with working code sitting unreached. The Phase 2 instruction's own text — "integrate with existing Emma patterns including... existing deletion endpoint" — was read as permitting, not mandating, this; wiring was chosen as the interpretation that actually closes a documented compliance gap rather than leaving new code inert pending an orchestrator that doesn't exist yet.

This was disclosed as an explicit interpretation call in the Phase 2 implementation report at the time the decision was made, and re-examined (not re-litigated) in Phase 2's independent verification, which classified it the same way: a bounded, disclosed inference, not an undiscovered scope expansion. Storage deletion is wired in as **best-effort**: it runs after the atomic database transaction has already succeeded, and a Storage failure is logged and reported in the response summary but never fails the request or rolls back the (already-correct) database erasure. The compliance-critical guarantee — the user's database footprint is gone — does not depend on Storage's success.

## Future evolution constraints

This architecture is built to be extended, not replaced, by whatever implements orchestration next:

- **New resource types** (OAuth, background jobs) add a Registry entry and, if they need real deletion, an adapter implementing the existing `DeletionAdapter` interface — not a new pattern.
- **A future orchestrator** is expected to consume `deletion_requests` (already shaped: 14-state status enum, `checkpoint jsonb`, `workflow_version`) and drive the adapter lifecycle per resource, per phase, rather than replace the transactional database step or the adapter contract. The status enum's `deleting_storage`/`deleting_oauth`/`deleting_background_jobs`/`verify_*` states already reserve the shape orchestration will need.
- **`workflowVersion`** exists so a resumed, in-flight deletion can tell whether the Registry it started against still matches the Registry it's resuming into — see the Technical Design Document for the full rationale. It is inert today (pinned at `1` everywhere) and becomes load-bearing only once something reads `deletion_requests`.
- **Real verification** (Phase 3, per the instruction that commissioned this ADR) is expected to implement the `verify()` stage each adapter already declares but stubs — not add a parallel verification mechanism outside the lifecycle.

What this architecture does _not_ anticipate, and would require a new ADR to change: multi-database or cross-region deletion coordination, a compensating-transaction (saga) pattern for non-database resources, or moving database deletion off the single-transaction model (e.g., if the resource count grows large enough that one transaction becomes a lock-contention or timeout risk — not observed at 32 tables, but worth naming as the condition that would force a rethink).

---

## Consequences

**Positive:**

- A single half-deletion class of bug (auto-committing sequential deletes) is closed structurally, not by convention.
- Two real Storage buckets gain deletion coverage that did not exist before Phase 2.
- Future resource types have a contract to implement against instead of inventing per-resource deletion logic.
- The Registry's existing consumers (deletion, export) and future ones (verification, metrics) all read one inventory, so a resource added once is visible everywhere it needs to be, by construction.
- Phase 2.1's live-database validation demonstrates the atomicity and idempotency claims are not just design intent — they were forced to fail and confirmed to roll back correctly, and confirmed idempotent across two real double-execution tests.

**Trade-offs:**

- The transactional function's use of dynamic SQL (`EXECUTE format(...)`) is a pattern with no precedent elsewhere in this codebase's migrations; its safety rests on identifier validation and parameter binding that must be maintained carefully if the function is ever extended.
- Storage deletion's best-effort posture means a Storage failure is _reported_, not _guaranteed resolved_ — an orchestrator with real retry logic (not built yet) is what eventually closes that gap completely.
- The `deletion_requests` table has now existed, unused, across three phases. This is an accepted, deliberate trade-off (see **Future Orchestration Boundary** in the Technical Design Document) — building its shape early keeps the orchestration boundary explicit — but it is worth naming as a trade-off, not a free foundation: schema that exists before its consumer is schema that can drift out of sync with what that consumer eventually needs.

**Process consequence, worth recording plainly:** this account-deletion effort shipped two full phases of implementation and two rounds of independent verification before a TDD or ADR existed for it to be checked against. That gap was not a one-time lapse — the same failure mode ("no audit report/design doc was ever persisted") was already on record for an earlier, unrelated phase of this project (Phase 5) before account deletion repeated it twice. This ADR and its companion TDD exist as the fix, and their existence is itself the strongest argument for writing the next phase's design record _before_, not after, implementation begins.

---

## Alternatives Considered

**Keep independently-maintained arrays, add a lint/test check to catch drift.** Rejected. A test can catch drift after it happens; it cannot prevent the underlying design (two places that are supposed to agree) from existing. The Registry removes the _possibility_ of drift for the fields it owns, which is a stronger guarantee than a check that could itself be forgotten or bypassed.

**Application-level (TypeScript) transaction emulation — collect results, roll back manually on failure by re-inserting.** Rejected. Re-inserting deleted rows to simulate rollback is not actually atomic (a crash between delete and re-insert leaves real, unrecoverable damage), is far more code than the problem warrants, and reimplements — worse — a guarantee Postgres already provides natively via a single transaction.

**A distributed saga / compensating-transaction pattern spanning database and Storage together.** Rejected for this phase. No second phase of work (orchestration) exists yet to coordinate; introducing saga complexity before there is a real multi-step workflow to coordinate would be solving a problem this codebase doesn't have yet, at the cost of correctness and review complexity for the problem it does have (32 tables, one transaction).

**Leave Storage adapters implemented but unwired, waiting for an orchestrator.** Rejected — see **Why Storage adapters are wired into the existing endpoint**. This would have left a known, previously-documented gap (zero Storage deletion coverage) open for an unknown number of future phases, with working code sitting unreached the entire time.

**Build the orchestrator now, since `deletion_requests` already exists.** Rejected — explicitly out of scope for Phase 2 and Phase 2.1 by instruction, and independently a reasonable sequencing choice: orchestration built on top of an unproven, unvalidated transactional foundation risks compounding defects (as Phase 2.1's live-database findings demonstrate the foundation itself needed) rather than isolating them.

---

## Related

- [Account Deletion Technical Design Document](../plans/2026-07-16-account-deletion-technical-design.md)
- [ADR 0001: Behavior Flags](0001-behavior-flags.md)
- [ADR 0002: Companion State Persistence](0002-companion-state-persistence.md)
- [ADR 0003: Brain Gateway Architecture](ADR-0003-brain-gateway-architecture.md)
- `src/core/account-deletion/registry.ts`
- `src/app/api/emma/gdpr/route.ts`
