# Emma Brain Gateway — Technical Debt Register

Living artifact. Appended to by every Phase 6 implementation wave (6A–6F). Every intentionally deferred issue discovered or introduced during implementation is recorded here — nothing is hidden. An entry stays `Open` until its Owner Wave resolves it, at which point it is marked `Resolved` (with the resolving wave/PR noted) rather than deleted, preserving the historical record.

---

## Wave 6A — Core Infrastructure

### TD-6A-1

- **Wave:** 6A
- **Description:** OpenRouter's `CapabilitiesDescriptor.contextWindowTokens` is set to a hand-maintained placeholder (`128_000`), not verified against OpenRouter's live model-listing API.
- **Reason:** Technical Design §4.3 explicitly specifies this value as "a static, hand-maintained constant, not derived from a live OpenRouter API call" — Phase 4 itself deferred exact verification, and no live API call is authorized in this phase's scope.
- **Owner Wave:** 6C (first real consumer of `contextWindowTokens`, via Routing Layer 2 capability matching) or a future Governance/Extension-Model update
- **Resolution Target:** Before Wave 6C's capability-routing tests materially rely on this value's accuracy, or before a second, real provider is registered and its own `contextWindowTokens` is compared against this one
- **Risk:** Low — the field is currently read by no production code path (`n=1`, Layer 2 inert per ADR-0007); an inaccurate value cannot yet cause a wrong routing decision, only a wrong assumption in a future comparison
- **Status:** Open

### TD-6A-2

- **Wave:** 6A
- **Description:** `src/core/brain/routing.ts` (Wave 6C's deliverable) has no planned boundary/DI lint-rule protection anywhere in the current plan.
- **Reason:** carried forward from [Phase 5.1 Independent Review](phase5-1-brain-gateway-independent-implementation-planning-review.md) Finding Min-4 — ADR-0013's own principle ("every new component this Freeze introduces will need its own enforcement rule authored") arguably extends to the Routing Engine, but neither Phase 5's plan nor this wave's Provider-boundary rule covers it. Not introduced by Wave 6A; recorded here now that the enforcement pattern this gap sits alongside actually exists in the codebase (this wave's Provider-boundary rule), making the register the natural place to track it going forward rather than leaving it only in Phase 5.1's prose.
- **Owner Wave:** 6C (when `routing.ts` is created) or 6F (when the lint-rule-extension task runs)
- **Resolution Target:** Whichever of 6C's own PR or 6F's lint-rule-extension task lands first
- **Risk:** Low — `routing.ts` will have exactly one caller (`gateway.ts`) when it ships, per Technical Design §14.1
- **Status:** Open (carried forward, not new to this wave)

### TD-6A-3

- **Wave:** 6A
- **Description:** `gateway.ts`'s `selectedProvider()` falls through to the sole registered provider when no provider reports `isConfigured() === true`, rather than surfacing the proper `PROVIDER_UNAVAILABLE` error contract.
- **Reason:** preserves exact pre-6A behavior (Phase 5's "zero-behavior-change interim state" requirement, task 4) and keeps the existing regression test `tests/unit/brain-gateway.test.ts:109-114` green. Wave 6A does not yet have the `PROVIDER_UNAVAILABLE` error code (a Wave 6C deliverable, Technical Design §17.1) to replace this shim properly — see Implementation Decision Log, 2026-07-24 entry.
- **Owner Wave:** 6C
- **Resolution Target:** Wave 6C, when `routeRequest()` and `PROVIDER_UNAVAILABLE` supersede this direct lookup (Technical Design §5, §17.1–17.2)
- **Risk:** Low — behavior-preserving by design, single-provider scope only, already named in Phase 5's own plan as an interim state explicitly superseded one wave later
- **Status:** Open — resolution already scheduled in the approved plan, not unplanned debt
