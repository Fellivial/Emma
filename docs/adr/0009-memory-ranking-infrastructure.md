# ADR 0009: Memory Ranking Infrastructure (Database-Side)

- **Status:** Accepted
- **Date:** 2026-07-23
- **Phase:** 3.2 — "ADR Authoring" (documents a decision frozen in Phase 3.1, not a new one)
- **Domain:** Memory
- **Implementation:** None yet. Requires a schema change (an embedding column or equivalent) with a new infrastructure dependency — exactly the class of decision ADRs exist to record. Technical Design (Roadmap Phase 4) and Implementation Planning (Roadmap Phase 5) size and sequence the migration.
- **Frozen by:** [Phase 3.1 — Architecture Freeze](../phase3-1-brain-gateway-architecture-freeze.md), §2.4, §3, §4 (GAP-08), §5 (Decision Inventory item 4)

---

## Context

`getRelevantMemoriesForUser()` fetches all active memory rows for a user (no database-side `LIMIT`), scoring only if the row count exceeds the requested limit, using keyword-overlap × confidence — not embedding similarity (Phase 1 §1.4.7). Persistence, lifecycle, and injection-point centralization are all sound and owned by a single module, `memory-db.ts` — the one responsibility Phase 0 found with zero ownership fragmentation, and this decision does not relocate any of it.

Phase 2's Gap Analysis (GAP-08) identified the core problem precisely: raising the current 200-active-memory-per-user cap and improving ranking quality are **architecturally coupled changes, not independent ones**, because full in-process scoring is only viable below that cap. This is not an ownership-fragmentation gap (Root Cause B) — Phase 2 Independent Review's Root Cause Grouping (§4) places GAP-08 in its own, single-gap root cause (Root Cause F): "a capacity ceiling accidentally bound to a retrieval mechanism," structurally distinct from every other Memory-adjacent finding.

Phase 3's Architecture Discovery catalogued three candidates (Retrieval Ranking Extension, in-place; Database-Side Ranking Infrastructure; Tiered Retrieval, hybrid). All three were evaluated without a recommendation; the Freeze selected among them by applying the roadmap's own Objective language directly: an architecture that scales "without requiring major application refactoring."

## Decision

**Memory adopts Database-Side Ranking Infrastructure: an embedding column (or equivalent database-native ranking mechanism) added to the memory schema, with retrieval performed via a database-side `ORDER BY`/similarity query with a `LIMIT`, replacing the current "fetch all active rows, score only if the row count exceeds the requested limit" pattern.**

The query interface (`getRelevantMemoriesForUser()`) keeps its existing signature; only its implementation changes underneath.

## Decision Drivers

- **Resolve the validated gap fully and structurally, not partially.** A coupled cap-and-ranking change is exactly the kind of "major refactoring" the roadmap's Objective disclaims; resolving the coupling now, architecturally, is more consistent with that Objective than deferring it behind a cheaper interim measure.
- **Support future extensibility.** This is the only candidate that removes, rather than loosens, the coupling that would otherwise force a joint decision later.
- **Evidence-justified.** Phase 2 §9 and Phase 3 §7 both independently identify this candidate as the only one that removes rather than loosens the coupling.

## Alternatives Considered

**Retrieval Ranking Extension (in-place, same owner).** `memory-db.ts` retains sole ownership; ranking sophistication (e.g., an embedding-similarity score alongside the existing keyword-overlap × confidence score) is added within the same module and query path, no new component. Lowest migration risk of the three candidates, and directly consistent with Phase 2's finding that memory has zero ownership fragmentation. Rejected as the frozen direction because it does not decouple the capacity cap from retrieval sophistication — adding a better in-process score does not change the fact that it is still in-process, still bounded by what can be scored without a database-side mechanism. Reconsideration condition: if Technical Design or Implementation Planning finds Database-Side Ranking's infrastructure cost prohibitive on the current timeline, this candidate could serve as a stopgap, not a substitute destination.

**Tiered Retrieval (hybrid in-process + database-assisted).** A middle path: a cheap, coarse database pre-filter narrows the candidate set, and existing in-process scoring runs only over that reduced set. Requires no new schema or infrastructure dependency while still bounding in-process work — a genuinely incremental step. Rejected as the frozen destination because it does not fully decouple cap from ranking quality — a coarse pre-filter without genuine relevance ranking risks discarding relevant-but-not-recent memories before the in-process scorer ever sees them, trading one coupling for a subtler, unevaluated one (pre-filter-recall-vs-ranking-quality). Not rejected as a sequencing step: recorded as a viable interim deployment step Technical Design may choose to sequence before the Database-Side destination, without that sequencing choice constituting a different frozen architecture.

## Consequences

**Positive:**

- Raising the memory cap and improving ranking sophistication become independent decisions, not a forced joint one.
- The query interface's existing signature is preserved — callers of `getRelevantMemoriesForUser()` are unaffected by the underlying mechanism change.

**Negative / Accepted trade-offs:**

- High complexity and a new infrastructure dependency (a vector-capable column/index) — the highest-cost candidate in the Memory domain by a wide margin.
- An embedding-generation step becomes a new operation with its own latency/cost profile — itself a Brain Gateway-mediated call per ADR-0003's embedding-abstraction principle.

**Accepted limitations:**

- **The schema-migration and new infrastructure-dependency cost is accepted as the price of structurally resolving GAP-08, not merely loosening it.** Sizing and sequencing that cost is Technical Design's and Implementation Planning's job (Roadmap Phase 4/5), not this ADR's.

**Deferred considerations:**

- The migration question — backfilling embeddings for existing memory rows — is not sized here, per this ADR's non-goals (no migration plans, no effort estimates).

## Architectural Impact

**Affected domain:** Memory. **Affected components:** the memory schema (new embedding column or equivalent), `memory-db.ts`'s `getRelevantMemoriesForUser()` implementation (signature preserved, internals replaced). **Dependency implications:** the embedding-generation step is Brain-Gateway-mediated, consistent with ADR-0003's existing embedding abstraction — no new provider-coupling is introduced. **Extensibility implications:** this is the only Memory candidate that removes the cap-ranking coupling structurally, rather than deferring or loosening it, directly serving the roadmap's Objective of scaling "without requiring major application refactoring."

## Traceability

```
GAP-08 (retrieval/ranking coupled to capacity cap) ──► Phase 3.1 Freeze §2.4 ──► ADR-0009 ──► Technical Design (Phase 4)
                                                                                  + Implementation Planning (Phase 5):
                                                                                  schema migration sizing/sequencing
```

## References

- [Phase 3.1 Architecture Freeze](../phase3-1-brain-gateway-architecture-freeze.md), §2.4, §3, §4, §5 (item 4), §6
- [Phase 3 Architecture Discovery](../phase3-brain-gateway-architecture-discovery.md), §7
- [Phase 2 Gap Analysis](../phase2-brain-gateway-gap-analysis.md), §9, §16 (GAP-08)
- [Phase 2 Independent Review](../phase2-independent-review.md), §4 (Root Cause F)
- [ADR-0003: Brain Gateway Architecture](ADR-0003-brain-gateway-architecture.md) (Embedding abstraction)
