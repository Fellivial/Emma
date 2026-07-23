# ADR 0010: Prompt Pipeline — Centralized Composition, Phased Migration

- **Status:** Accepted
- **Date:** 2026-07-23
- **Phase:** 3.2 — "ADR Authoring" (documents a decision frozen in Phase 3.1, not a new one)
- **Domain:** Prompt
- **Implementation:** None yet. Supersedes six independent prompt-construction owners with one; the phased migration path itself is recorded so later contributors understand why `personas.ts` was restructured before the other five call sites changed. Technical Design (Roadmap Phase 4) specifies the fragment boundaries and channel-adapter interfaces.
- **Frozen by:** [Phase 3.1 — Architecture Freeze](../phase3-1-brain-gateway-architecture-freeze.md), §2.5, §3, §4 (GAP-05 Prompt instance), §5 (Decision Inventory item 5)

---

## Context

Prompt construction is nominally owned by `personas.ts`, but six competing owners exist in practice: five external call sites (`vision/route.ts`, `summarize/route.ts`, `ingest/whatsapp/route.ts`, and two owners within `history/route.ts`) each construct prompt text independently, plus internal mixing within `personas.ts` itself — persona-voice content and `[EMMA_ROUTINE]`/`[emotion:]` protocol-tag instructions are interleaved as undifferentiated string literals (Phase 1 §1.4.10). Phase 2's Gap Analysis (GAP-05, Prompt instance) found near-zero reuse across channels — the `[EXTERNAL DATA]` prompt-injection guard is implemented three separate times — and no mechanism for a tone-rule change to propagate beyond the file it was made in. `buildSystemPromptBlocks()`'s stable/dynamic split is a genuinely useful seam anticipating prompt-caching, but the only function any caller actually invokes (`buildSystemPrompt()`) flattens it back into one string, so the seam provides zero runtime value today.

Isolation — prompt text never crossing into the Gateway as anything but opaque content — is sound and preserved as-is; ADR-0003's boundary holds completely here, and this decision does not touch it.

Phase 3's Architecture Discovery catalogued three candidates (Centralized Prompt Composition; Modular Prompt Composition/composable fragments; Layered Prompt Composition/persona-protocol separation plus channel adapters). The Phase 3 Independent Review's Candidate Independence Assessment found a real, previously undisclosed relationship between Candidates A and C (Finding Min-1): Candidate C's first phase — separating persona-voice content from protocol-tag instructions within `personas.ts` — is a subset of what Candidate A's centralization already accomplishes as part of its larger migration. The Freeze treats this finding as decision-relevant: A (the end-state) and C (the path to it) are not competing selections, but the same selection described at two different grains.

## Decision

**Centralized Prompt Composition is adopted as the end-state, reached via the Layered migration path — internal `personas.ts` persona/protocol separation first, channel adapters second — with each channel adapter internally built as composable fragments rather than a monolithic per-channel function.**

A single module (extending or replacing `personas.ts`) becomes the sole prompt-construction owner; every current independent owner becomes a caller supplying parameters to shared composition functions. The migration is sequenced: `personas.ts`'s internal persona/protocol separation happens first, without touching the other five owners; each channel adapter is introduced afterward, incrementally, built as composable fragments (activating the dormant `buildSystemPromptBlocks()` prompt-caching seam) rather than a single monolithic per-channel function.

## Decision Drivers

- **Resolve the ownership, reuse, and consistency sub-gaps of GAP-05's Prompt instance most completely.** A shared composition function has exactly one implementation of any given guard or template fragment; a tone-rule change in one place propagates to every caller through the shared function rather than requiring six manual edits.
- **Improve long-term maintainability.** A tone-rule change propagates once, not six times.
- **Minimize architectural coupling during the transition.** The phased sequencing avoids a single large five-call-site migration, reducing coupling risk during the transition itself, relative to a big-bang migration.

## Alternatives Considered

**Modular Prompt Composition (composable fragments, no single owner) as a standalone destination.** Independently-versioned, composable fragments (persona voice, protocol-tag instructions, injection guards, memory serialization, routine descriptions) that any caller assembles in whatever combination its channel needs, with no single top-level "build the prompt" function. Directly activates the dormant prompt-caching seam and accommodates per-channel differences naturally. Rejected as a standalone destination because it does not guarantee cross-caller consistency the way full centralization does — five callers independently choosing which fragments to compose can still drift from each other in effect even if every fragment is shared and correct, per Phase 3's own comparison ("consistency less completely than Candidate A"). Not rejected as a technique: retained as the internal building method for each channel adapter in the selected Layered path.

**Layered Prompt Composition as an independent, standalone candidate (rather than a subset of Centralized Composition).** Not treated as a separately-rejected alternative — the Phase 3 Independent Review (Finding Min-1) established it is more accurately characterized as an incremental, phased path toward Candidate A's same end-state than a fundamentally distinct target architecture. This ADR adopts that finding directly: selecting Centralized Composition as the destination and the Layered path as its route is one architecture described completely, not a synthesis of two different ones.

## Consequences

**Positive:**

- The reuse gap closes by construction — a shared composition function has exactly one implementation of any given guard or template fragment, versus three independent implementations of the `[EXTERNAL DATA]` guard today.
- A tone-rule change propagates from one owner to every channel, not six independent edits.
- The dormant `buildSystemPromptBlocks()` prompt-caching seam gains real runtime value, because composable fragments are the actual API surface rather than an internal detail immediately flattened away.

**Negative / Accepted trade-offs:**

- The largest total migration surface of any Prompt candidate — five external call sites plus internal `personas.ts` restructuring.
- Risk of becoming an over-general module if the five channels' actual prompt needs differ more than this decision assumes (vision and WhatsApp prompts plausibly have structurally different needs than standard chat) — an open question this ADR does not resolve.

**Accepted limitations:**

- **The six-owner fragmentation persists until every channel adapter is built** — gap-closure is back-loaded, not immediate. Accepted because the alternative (a single large migration) carries higher transitional coupling risk, per the "minimize architectural coupling" driver.

**Deferred considerations:**

- The base/adapter boundary — what belongs in the shared `personas.ts` base versus what is channel-specific — is a new design surface with no existing precedent to validate it against, deferred to Technical Design.

## Architectural Impact

**Affected domain:** Prompt. **Affected components:** `src/core/personas.ts` (internal restructuring first, becomes the centralized owner), `src/app/api/emma/vision/route.ts`, `src/app/api/emma/summarize/route.ts`, `src/app/api/emma/ingest/whatsapp/route.ts`, `src/app/api/emma/history/route.ts` (its two independent owners) — all become callers of shared composition functions, migrated incrementally after the internal `personas.ts` phase. **Dependency implications:** none on Provider/Routing decisions. **Extensibility implications:** mutually reinforcing with [ADR-0013](0013-brain-gateway-boundary-dependency-inversion-enforcement.md)'s tooling-enforced dependency inversion — a centralized Prompt Pipeline is exactly the kind of new, substitutable component DI-as-systemic-convention is meant to apply to going forward, built DI-shaped from its first line.

## Traceability

```
GAP-05 (Prompt ownership fragmentation) ──► Phase 3.1 Freeze §2.5 ──► ADR-0010 ──► Technical Design (Phase 4):
                                                                                    fragment boundary design
                                                                                    channel-adapter interfaces
```

## References

- [Phase 3.1 Architecture Freeze](../phase3-1-brain-gateway-architecture-freeze.md), §2.5, §3, §4, §5 (item 5)
- [Phase 3 Architecture Discovery](../phase3-brain-gateway-architecture-discovery.md), §8
- [Phase 3 Independent Review](../phase3-independent-review.md), §4 (Finding Min-1), §8 (M-2, Min-1 detail)
- [Phase 2 Gap Analysis](../phase2-brain-gateway-gap-analysis.md), §10, §16 (GAP-05)
- [Phase 1 Architecture Review](../phase1-brain-gateway-architecture-review.md), §1.4.10
- [ADR-0013: Brain Gateway Boundary & Dependency-Inversion Enforcement](0013-brain-gateway-boundary-dependency-inversion-enforcement.md)
