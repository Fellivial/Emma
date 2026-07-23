# ADR 0011: Brain Gateway Operational Instrumentation

- **Status:** Accepted
- **Date:** 2026-07-23
- **Phase:** 3.2 — "ADR Authoring" (documents a decision frozen in Phase 3.1, not a new one)
- **Domain:** Operational
- **Implementation:** None yet. Establishes the Gateway as the compensating owner of a cross-cutting concern its own header currently declines — a decision ADR-0003 explicitly left open. Technical Design (Roadmap Phase 4) specifies the correlation-ID's precise propagation mechanism.
- **Frozen by:** [Phase 3.1 — Architecture Freeze](../phase3-1-brain-gateway-architecture-freeze.md), §2.6, §3, §4 (GAP-04), §5 (Decision Inventory item 6)

---

## Context

No tracing, metrics, or structured logging exists anywhere in the AI pipeline. Sentry is instrumented at exactly 3 of 16+ invocation-adjacent call sites, and the Gateway's own header comment explicitly declines ownership of "Sentry capture policy" with no other component picking it up (Phase 1 §1.4.14). Phase 2's Gap Analysis (GAP-04) independently confirmed by `package.json` inspection that no `pino`, `winston`, `@opentelemetry/*`, `statsd`, or `posthog` dependency exists — this is the domain with the fewest existing artifacts of any explored in the entire initiative (Phase 2 §11, Phase 2 Independent Review's Root Cause D: "no operational foundation to build cross-cutting concerns on... a total absence of a designed layer, not a fragmentation of an existing one").

Phase 3's Architecture Discovery catalogued three candidates (Centralized Gateway-Level Instrumentation; Distributed Instrumentation with a Shared Correlation Contract; Adopt an Existing Observability Library/Platform). Response validation's log-only, non-blocking design (ADR-0001, `response-validator.ts`) is preserved as-is per Phase 3's Current Architecture Preservation Report (§2) — no candidate in this domain proposes making validation gating/blocking.

## Decision

**Operational instrumentation is centralized at the Gateway boundary — inside `gateway.ts` itself, wrapping every call to `brainChat`/`brainChatStream`/`brainEmbed` — extended with a correlation-ID contract narrowed in scope to correlation-ID propagation only (not full per-layer structured-event emission), so that Application-Layer callers can be joined to Gateway-boundary telemetry, built on the already-present `@sentry/nextjs` dependency rather than a new observability platform.**

This is a synthesis, not a single unmodified candidate: the Gateway-level instrumentation foundation is Candidate A; the correlation-ID mechanism is drawn from Candidate B, narrowed to correlation-ID propagation only rather than B's full "every layer independently emits structured events" scope; the platform choice (extend Sentry rather than adopt OpenTelemetry) is Candidate C's lowest-adoption-cost variant.

## Decision Drivers

- **Minimize architectural coupling.** Gateway-boundary instrumentation stays inside the Gateway; only a correlation ID, not business context (which behavior flags, which persona, which channel), crosses the boundary.
- **Evidence-justified.** Targets exactly the gap Centralized Instrumentation's own limitation names (it cannot answer _why_ a request was made) using the mechanism Distributed Instrumentation's own text identifies as the fix (a correlation ID) — without adopting that candidate's full scope.

## Alternatives Considered

**Distributed Instrumentation with a Shared Correlation Contract (in full).** Every layer independently emits structured log/metric events, unified only by a correlation ID threaded through the request lifecycle. Only candidate that can answer both "what happened at the Gateway boundary" and "why" in full. Rejected in its full form: highest implementation and coordination cost in the document, requiring every layer to independently agree on a structured-event shape with no existing shared library to anchor against — a coordination problem structurally identical to the ownership-fragmentation pattern (Root Cause B) found elsewhere in this initiative. Not rejected in its entirety: its correlation-ID mechanism is retained, narrowed in scope, in the selected synthesis. Reconsideration condition: its full "every layer emits structured events independently" scope could be reconsidered if a shared structured-logging library is adopted later, changing the coordination-cost calculus.

**Adopt an Existing Observability Platform (OpenTelemetry variant).** Avoids designing a correlation-ID contract, event shape, or metrics taxonomy from scratch. Rejected as the platform choice for this decision: introduces a new dependency and operational surface (a collector, an exporter configuration, potentially new infrastructure) — a cost/vendor decision this phase does not evaluate. The lower-cost variant of the same candidate category (extending the already-present `@sentry/nextjs` dependency) is adopted instead. Reconsideration condition: if Technical Design finds Sentry's tracing insufficient for metrics/counters (a gap this candidate's own analysis already flags — Sentry's strength is error/trace capture, not necessarily gauge/histogram-style metrics), OpenTelemetry adoption becomes the natural next candidate to formally evaluate.

## Consequences

**Positive:**

- Every inference request gains latency/error/retry telemetry and a joinable identifier to its Application-Layer cause, without a new observability dependency or a full per-layer rebuild.
- Touches only the Gateway's three exported functions, not any of the 16+ call sites — the lowest-blast-radius way to close a total-absence gap.
- Makes the Gateway the compensating owner of "Sentry capture policy" explicitly, rather than leaving the question the Gateway's own header currently declines unresolved.

**Negative / Accepted trade-offs:**

- The correlation-ID contract still requires touching every layer that calls the Gateway (route handlers, the agent loop, utility routes) to generate and thread the identifier — a smaller version of the full Distributed Instrumentation candidate's "touches every layer" cost.

**Accepted limitations:**

- **This decision cannot, by construction, see _why_ a request was made** (which behavior flags, which persona, which channel) — that context lives in the Application Layer and, per ADR-0003, must not leak into the Gateway. The correlation-ID contract is the accepted minimum viable mechanism to join Gateway telemetry to its Application-Layer cause without violating that boundary.

**Deferred considerations:**

- The correlation ID's precise propagation contract — a header, an async-context value, or an explicit parameter threaded through every call — is explicitly left to Technical Design (Freeze §7, clarification 3), an interface-design decision better made against concrete call-site shapes than pre-empted here.

## Architectural Impact

**Affected domain:** Operational. **Affected components:** `src/core/brain/gateway.ts` (instrumentation wraps its three exported functions), every Gateway-calling layer (route handlers, the agent loop, utility routes) gains correlation-ID generation/threading responsibility. **Dependency implications:** builds on the existing `@sentry/nextjs` dependency; no new package is introduced by this decision. **Extensibility implications:** consistent with the Gateway already being the single point through which every inference request passes (ADR-0003 Principle 1) — this makes it the natural single point through which every inference request's telemetry also passes, without repeating Context Candidate C's rejected coupling violation ([ADR-0008](0008-centralized-context-pipeline.md)): telemetry about a request the Gateway is single-entry-point for is categorically different from a business decision (what to summarize) the Gateway was never meant to make.

## Traceability

```
GAP-04 (no tracing/metrics/structured logging) ──► Phase 3.1 Freeze §2.6 ──► ADR-0011 ──► Technical Design (Phase 4):
                                                                                           correlation-ID propagation mechanism
```

## References

- [Phase 3.1 Architecture Freeze](../phase3-1-brain-gateway-architecture-freeze.md), §1.4, §2.6, §3, §4, §5 (item 6), §7
- [Phase 3 Architecture Discovery](../phase3-brain-gateway-architecture-discovery.md), §9
- [Phase 2 Gap Analysis](../phase2-brain-gateway-gap-analysis.md), §11, §16 (GAP-04)
- [Phase 2 Independent Review](../phase2-independent-review.md), §4 (Root Cause D)
- [ADR-0001: Behavior Flags](0001-behavior-flags.md) (response-validator.ts, log-only design)
- [ADR-0003: Brain Gateway Architecture](ADR-0003-brain-gateway-architecture.md) (Principle 1: Single Inference Entry Point)
- [ADR-0008: Centralized Context Pipeline](0008-centralized-context-pipeline.md)
