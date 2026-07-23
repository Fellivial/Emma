# ADR 0008: Centralized Context Pipeline

- **Status:** Accepted
- **Date:** 2026-07-23
- **Phase:** 3.2 — "ADR Authoring" (documents a decision frozen in Phase 3.1, not a new one)
- **Domain:** Context
- **Implementation:** None yet. Supersedes the current two-owner (`context-manager.ts` / `route.ts`) arrangement; establishes a new component boundary and a reconciled summarization semantics. Technical Design (Roadmap Phase 4) resolves the token-budget reconciliation semantics.
- **Frozen by:** [Phase 3.1 — Architecture Freeze](../phase3-1-brain-gateway-architecture-freeze.md), §2.3, §3, §4 (GAP-05 Context instance, GAP-09), §5 (Decision Inventory item 3)

---

## Context

Emma's context management is split across two independent, uncoordinated pipelines with no shared owner: client-side `context-manager.ts` performs ratio-triggered summarization against a 100k-token budget using a 4-char-per-token approximation; server-side `route.ts` applies a flat 20-message hard cap with no token accounting at all (Phase 1 §1.4.6). Phase 2's Gap Analysis (GAP-09) found these are "not two implementations of one concept but two different concepts... that share a name," and that a single request can carry both a persisted "Previous Session Context" prompt block and an in-band synthetic `[SUMMARY]` message simultaneously — meaning no single component can currently answer "what does the model already know from earlier in this conversation" (Phase 2 §8). This is one instance of the ownership-fragmentation pattern (GAP-05) Phase 2 §15 identified as the single most recurring architectural finding in the codebase, recurring independently across five subsystems.

Composition ownership itself — what goes into a request, owned end-to-end by `route.ts` — is sound and preserved as-is; Phase 1 found this one of the few sub-areas of context architecture genuinely without a gap. What is missing is a single lifecycle for the summarization/budget-accounting concern specifically.

Phase 3's Architecture Discovery catalogued three candidates (Centralized Context Pipeline; Federated Context Pipeline; Context as a Gateway-Adjacent Service). The third was rejected outright by the Freeze for direct, unresolvable tension with ADR-0003's Separation of Concerns principle — teaching the Gateway a business-logic fact (what to summarize, when) that ADR-0003 reserves for the Application Layer. The Phase 3 Independent Review's Trade-off Consistency Assessment independently confirmed this candidate carries the highest coupling/boundary-violation risk in the entire Phase 3 document.

## Decision

**A single new Context Pipeline component owns context lifecycle end-to-end — token-budget accounting, summarization triggering, and persistence — superseding both `context-manager.ts` (client) and `route.ts`'s server-side 20-message cap, which become callers of this one component rather than independent implementations.**

## Decision Drivers

- **Resolve one or more validated gaps, fully rather than partially.** GAP-09 is closed by construction: one lifecycle, one budget model, one authoritative place to answer "what does the model already know from earlier in this conversation."
- **Improve long-term maintainability.** A single reconciled owner replaces two owners coordinated only by convention.

## Alternatives Considered

**Federated Context Pipeline (shared contract, existing owners retained).** Both existing mechanisms retained as-is, required to implement a shared, small interface so a caller can query either side through one contract without either side being rewritten. Lower migration risk — no existing summarization logic is replaced, only wrapped. Rejected as the frozen direction because it does not fully close GAP-09: "what does the model already know" still requires querying two owners and reconciling their answers at the call site. Phase 3 itself self-identified the risk of recreating the exact ownership-fragmentation pattern (GAP-05) that produced the two-pipeline problem in the first place — a third context mechanism could be added later without honoring the shared contract, exactly as `route.ts`'s server-side cap was added without coordinating with `context-manager.ts` originally. Reconsideration condition: if the reconciliation cost of the Centralized Pipeline (unifying token-budget and message-count semantics) proves substantially larger at Technical Design time than currently estimated, a lower-risk interim step may become preferable before full centralization.

**Context as a Gateway-Adjacent Service (delegated ownership, Gateway-informed token accounting).** The only candidate directly addressing the provider-diversity scalability concern (context sizing informed by the Gateway's own knowledge of which provider/model will consume the context). Rejected: direct, unresolvable tension with ADR-0003's Separation of Concerns principle, an already-approved architectural baseline this decision does not reopen — teaching the Gateway about context budgets risks the exact business-logic leak ADR-0003 rules out. Carries the highest coupling/boundary-violation risk of any Context candidate (Phase 3 Independent Review, Trade-off Consistency Assessment). Reconsideration condition: only if a future ADR explicitly revisits and narrows ADR-0003's Separation of Concerns boundary to permit provider-fact queries (tokenization) without business-logic leakage — not proposed here.

## Consequences

**Positive:**

- One lifecycle, one owner, one authoritative answer to "what does the model already know" — GAP-09 closed by construction, not merely mitigated.
- A single pipeline becomes the natural attachment point for future providers' differing tokenization, directly addressing the scalability gap Phase 2 §8 identified (an approximation calibrated against one provider's tokenizer, with no evidence it holds for others).

**Negative / Accepted trade-offs:**

- Medium-High complexity, concentrated in reconciling two _different concepts_ that currently share a name — client-side token-budget-aware summarization and server-side message-count-based summarization are not two implementations of one mechanism, and Phase 3 itself does not resolve their semantic reconciliation, only that it must happen.

**Accepted limitations:**

- **The reconciliation cost is accepted as a one-time investment, not deferred**, because deferring it (via the Federated alternative) was found to risk recreating the underlying problem rather than closing it.

**Deferred considerations:**

- The exact token-budget reconciliation semantics — whether the reconciled model converges on the client's token-budget model, the server's message-count model, or a new third model — is explicitly left to Technical Design (Freeze §7, clarification 2). This ADR selects centralization as the architecture; it does not resolve the reconciliation's concrete semantics.

## Architectural Impact

**Affected domain:** Context. **Affected components:** `src/core/context-manager.ts` (superseded as an independent implementation, becomes a caller), `src/app/api/emma/route.ts` (server-side 20-message cap logic superseded, becomes a caller). **Dependency implications:** none on other Provider/Routing decisions — this is a self-contained Application-Layer boundary change. **Extensibility implications:** a single pipeline is the natural home for future per-provider tokenization differences without duplicating provider-awareness into a context module, which per ADR-0003 Principle 2 should otherwise remain provider-agnostic.

## Traceability

```
GAP-05 (Context ownership fragmentation) ─┐
GAP-09 (two uncoordinated pipelines)      ─┴──► Phase 3.1 Freeze §2.3 ──► ADR-0008 ──► Technical Design (Phase 4):
                                                                                        token-budget reconciliation semantics
```

## References

- [Phase 3.1 Architecture Freeze](../phase3-1-brain-gateway-architecture-freeze.md), §2.3, §3, §4, §5 (item 3), §7
- [Phase 3 Architecture Discovery](../phase3-brain-gateway-architecture-discovery.md), §6
- [Phase 3 Independent Review](../phase3-independent-review.md), Trade-off Consistency Assessment
- [Phase 2 Gap Analysis](../phase2-brain-gateway-gap-analysis.md), §8, §16 (GAP-05, GAP-09)
- [ADR-0003: Brain Gateway Architecture](ADR-0003-brain-gateway-architecture.md) (Separation of Concerns)
