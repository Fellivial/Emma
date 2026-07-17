# Account Deletion Phase 3.1 — Documentation Synchronization Report

**Status:** Complete.
**Written:** 2026-07-17.

---

## Why this was needed

Independent verification of Phase 3 found that ADR-0004 and its companion Technical Design Document had never been updated after Phase 3 shipped and merged to `main` — both still asserted, in the present tense, that `deletion_requests` was unused and that workflow orchestration was "explicitly deferred, not designed here." That was no longer true. ADR-0004 itself had already named this exact failure mode for this subsystem twice before (Phase 5, and account-deletion Phases 1/2) and called writing the next phase's design record _before_ implementation the fix — Phase 3 repeated the gap anyway. This task closes it.

## Files updated and why

### `docs/adr/0004-account-deletion-architecture.md`

- **`Phase:` header line** — extended to list Phase 3 ("Workflow Orchestrator & Durable Execution") and Phase 3.1 ("Hardening & Production Validation"), which weren't listed at all.
- **Decision, point 4** — previously stated `deletion_requests` "exists as a foundation... but nothing reads or writes it yet." Rewritten to state that the Phase 3 orchestrator now reads and writes it, and that Phase 3.1 added optimistic concurrency control to it.
- **"Future evolution constraints"** — the bullet describing "a future orchestrator... expected to consume `deletion_requests`" was rewritten to past tense, naming the actual module (`workflow.ts`) and confirming it does what this section predicted (coordinates, doesn't replace the transactional step or adapter contract).
- **Consequences → Trade-offs** — added one new bullet disclosing the concurrency race this phase found and fixed, so the ADR's own trade-offs section — which already discusses the accepted risk of `deletion_requests` sitting unused — also carries the risk that was found once it stopped being unused.

### `docs/plans/2026-07-16-account-deletion-technical-design.md`

- **Non-Goals section** — added a blockquote noting that the items marked "these consume `deletion_requests`; nothing does yet" (workflow orchestration, state machine, checkpoint execution, retry) are superseded by Phase 3, pointing to `workflow.ts` and the (now-updated) Future Orchestration Boundary section, while explicitly preserving the rest of the document's scope (Registry/RPC/adapter description) as still accurate.
- **"Future Orchestration Boundary"** — the sentence "**Nothing reads or writes this table**... remains, after Phase 2 and Phase 2.1, exactly that — a foundation, not yet a workflow" was replaced with a paragraph describing what Phase 3 actually built against this exact boundary, what Phase 3.1 added (concurrency control), and — importantly — what's still genuinely unbuilt per Phase 3's own disclosed scope (grace-period scheduling, OAuth/background-job adapters, real per-table verification), so this section doesn't overclaim readiness for things that remain Phase 4 work.

### `docs/plans/2026-07-16-account-deletion-phase3-production-readiness.md`

This report is Phase 3's own historical record and was intentionally _not_ rewritten — its body (Workflow design, File changes, Design rationale, Compliance with ADR-0004) remains an accurate account of what Phase 3 shipped at the time it was written. Instead, an **Addendum** section was appended at the end, disclosing three things the original report either got wrong by omission or couldn't have known:

1. Its own "Known limitation #6" (the client-side false-success gap in `privacy/page.tsx`) was actually fixed one commit later, in `c4292ea` — after this report was written, and the report was never updated to say so until now.
2. Its own "not yet fully production-ready" recommendation named two specific gaps (no live validation, untested concurrent-request path) — both closed by this phase, with a pointer to the Hardening and Live Production Validation reports for the details.
3. Live validation found the real `deleteUserOwnedData()` RPC cannot currently complete on the linked "Emma" project (missing `document_chunks.user_id`) — disclosed here with a corrected, precisely-scoped claim (only `document_chunks` was directly confirmed; the other three tables sharing the same _migration-tracking_ gap category is not the same claim as sharing the same _missing-column_ defect, and an earlier draft of this addendum conflated the two before being corrected during task review).

This "append an addendum, don't rewrite history" approach mirrors how this document itself already treats history — ADR-0004 explicitly records that documentation drift is a recurring problem for this subsystem specifically because past reports were edited or left silently stale; appending rather than editing keeps this report an honest artifact of what was known when it was written.

## What was deliberately not touched

- The Phase 3 implementation plan (`docs/superpowers/plans/2026-07-16-account-deletion-phase3-workflow-orchestrator.md`) — a step-by-step task plan, not an architecture description; it isn't meant to track post-implementation reality and wasn't in scope.
- `registry.ts`'s own header comments, `adapter.ts`'s comments — these describe code that didn't change this phase and remained accurate.
- Any code files — this task was documentation-only by design (see the plan's Global Constraints).
