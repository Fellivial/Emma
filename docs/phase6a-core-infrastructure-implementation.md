# Emma Brain Gateway — Phase 6A: Core Infrastructure Implementation

## Document Status

- Roadmap: [Brain Gateway Roadmap v1.1](roadmaps/brain-gateway-roadmap-v1.md)
- Phase: Phase 6, Wave 6A — Core Infrastructure (first production implementation wave)
- Type: **Implementation.** This document reports what Wave 6A actually built, per the task list in [Phase 5 Implementation Planning §5.1](phase5-brain-gateway-implementation-planning.md#51-wave-6a--core-infrastructure), against [Phase 4 Technical Design §3–§4, §11.1](phase4-brain-gateway-technical-design.md), governed by [ADR-0006](adr/0006-provider-registry-capabilities-descriptor-adapter-layer.md) and [ADR-0013](adr/0013-brain-gateway-boundary-dependency-inversion-enforcement.md).
- Branch: `feature/brain-gateway-phase6a-provider-registry`
- Preconditions verified before implementation began: PR #161 (Phase 6 Implementation Kickoff) merged to `main` (`mergedAt: 2026-07-24T03:52:22Z`); `main` pulled and synchronized; working tree clean before branching; Roadmap v1.1, Phase 5, Phase 5.1, Phase 6 Kickoff, ADR-0006–0014, and Phase 4 Technical Design re-read in full.
- Related living artifacts updated alongside this report: [Implementation Decision Log](implementation-decision-log.md), [Technical Debt Register](technical-debt-register.md), [Architecture Compliance Log](architecture-compliance-log.md).

---

## 1. Executive Summary

Wave 6A (Core Infrastructure) is implemented in full against Phase 5's six-task list. The Brain Gateway now has a queryable, boot-populated Provider Registry (`src/core/brain/registry.ts`) with an attached `CapabilitiesDescriptor` per provider, replacing the previous single module-level provider reference. OpenRouter is registered into the Registry at `gateway.ts` module load with a hand-maintained `CapabilitiesDescriptor`. `gateway.ts`'s three exported inference functions (`brainChat`, `brainChatStream`, `brainEmbed`) and `isBrainConfigured()` are rewired to a Registry-backed lookup — an interim, pre-Routing-Engine state, deliberately not yet routed through a Routing Engine (Wave 6C's task). The Provider-boundary `no-restricted-imports` lint rule (Technical Design §11.1, relocated to this wave per Phase 5.1 Finding M-1) is in place and verified not to false-positive against the current tree.

Seventeen new unit tests (`tests/unit/brain-registry.test.ts`) cover registration, duplicate-name rejection, descriptor validation, `getConfigured()` ordering/filtering, `findByCapability()` matching, and `list()`. The full regression suite is green: 804 tests passed, 3 skipped, across 67 of 68 test files — zero regressions, +17 new tests, +1 new test file relative to the Phase 6 Kickoff baseline (787/790, 66/67 files). Production build and lint both pass cleanly (0 lint errors; the same 10 pre-existing, unrelated warnings as baseline). Rollback was tested in practice, not merely asserted: stashing every Wave 6A change reproduces the exact pre-6A baseline (787/790 tests, 67/68 files, clean build) — confirmed, not assumed.

**One real implementation-fidelity finding surfaced during this wave, corrected in place:** the plan's literal test filename (`registry.test.ts`, Phase 5 §5.1 task 5) collides with a pre-existing, unrelated file — the Account Deletion Resource Registry test suite. This was not caught by Phase 5, Phase 5.1, or Phase 6 Kickoff's repository verification. The new test file is named `brain-registry.test.ts` instead; see Implementation Decision Log entry 4.

**No architecture, ADR, or Technical Design deviation occurred.** One narrow, evidence-driven implementation decision was required to make Phase 5's own "zero-behavior-change interim state" claim (task 4) literally true rather than merely asserted — see §4 and §9 below.

---

## 2. Implemented Components

Per Phase 5 §5.1's task list, all six tasks completed:

| #   | Task                                                                                                                                                   | Status                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| 1   | `CapabilitiesDescriptor` added to `src/core/brain/types.ts` (§4.1)                                                                                     | Done                                                               |
| 2   | `src/core/brain/registry.ts` created: `ProviderRegistry`, `RegisteredProvider`, `createProviderRegistry()` (§3.1), with registration validation (§3.3) | Done                                                               |
| 3   | OpenRouter's concrete `CapabilitiesDescriptor` populated and registered at `gateway.ts` module load (§3.2, §4.3)                                       | Done                                                               |
| 4   | `gateway.ts`'s three exported functions rewired to Registry-backed lookup, zero-behavior-change interim state                                          | Done                                                               |
| 5   | `registry.test.ts` (register/get/getConfigured/duplicate-name-rejection/descriptor-validation, §19.1)                                                  | Done, filed as `brain-registry.test.ts` (naming collision, see §9) |
| 6   | Provider-boundary `no-restricted-imports` lint rule added (relocated from 6F, Finding M-1)                                                             | Done                                                               |

---

## 3. Files Modified

| File                                | Change                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/brain/types.ts`           | Added `CapabilitiesDescriptor` interface (additive). No existing type changed.                                                                                                                                                                                                                                                                             |
| `src/core/brain/registry.ts`        | **New.** `ProviderRegistry`, `RegisteredProvider`, `createProviderRegistry()`.                                                                                                                                                                                                                                                                             |
| `src/core/brain/gateway.ts`         | Module-level `const provider` replaced with `createProviderRegistry()` + `registry.register(...)`; `brainChat`/`brainChatStream`/`brainEmbed`/`isBrainConfigured` rewired to a Registry-backed `selectedProvider()` lookup. Header comment updated for accuracy. Re-exports `CapabilitiesDescriptor`, `ProviderRegistry`, `RegisteredProvider` (additive). |
| `eslint.config.mjs`                 | New config block: Provider-boundary `no-restricted-imports` rule (`@/core/brain/providers/*` unreachable outside `src/core/brain/`).                                                                                                                                                                                                                       |
| `tests/unit/brain-registry.test.ts` | **New.** 17 tests covering `registry.ts`'s full public surface.                                                                                                                                                                                                                                                                                            |

No file under `supabase/` was touched. No file outside the above five was touched.

---

## 4. Interfaces Added

| Interface                                                            | Location            | New/Changed | Additive? |
| -------------------------------------------------------------------- | ------------------- | ----------- | --------- |
| `CapabilitiesDescriptor`                                             | `brain/types.ts`    | New         | Yes       |
| `ProviderRegistry`, `RegisteredProvider`, `createProviderRegistry()` | `brain/registry.ts` | New         | Yes       |

`brainChat`, `brainChatStream`, `brainEmbed`, `isBrainConfigured` keep their exact pre-existing signatures — zero change visible to any of the 16 Application-Layer call sites. No existing exported type in `types.ts` was modified, narrowed, or removed.

---

## 5. Dependency Verification

Per Phase 5 §5.1: Wave 6A has no dependency on any other wave (first wave). Verified directly:

- `src/core/brain/providers/` existed before this wave (confirmed by directory listing before any 6A change) — the Provider-boundary lint rule protects a directory that already existed, not one this wave created, satisfying Finding M-1's rationale for relocating it here.
- No file this wave touches (`types.ts`, `gateway.ts`, `registry.ts`, `eslint.config.mjs`) was touched by any commit since PR #161 merged (Phase 6 Kickoff's own architecture-baseline re-verification, §4 of that document, is still the accurate pre-6A state).
- `registry.ts` has no import from any module Wave 6B–6F will introduce (`routing.ts`, `context-pipeline.ts` do not exist and are not referenced).

**Verdict: no undocumented dependency was introduced. Wave 6A depends on nothing beyond the pre-existing repository state Phase 6 Kickoff verified.**

---

## 6. Tests Added

`tests/unit/brain-registry.test.ts` — 17 tests, 6 groups:

- **`register`** (6 tests): valid registration; duplicate-name rejection with exact error message; two distinct names both succeed; missing-boolean-field rejection; `contextWindowTokens <= 0` rejection; non-integer `contextWindowTokens` rejection.
- **`get`** (2 tests): returns the registered entry; returns `undefined` for an unregistered name.
- **`getConfigured`** (2 tests): filters to `isConfigured() === true` only, preserving registration order; returns `[]` when none configured.
- **`findByCapability`** (5 tests): matches on required boolean capabilities; imposes no constraint for omitted fields; treats `contextWindowTokens` as a minimum floor; returns `[]` on no match; excludes unconfigured providers even when their descriptor would otherwise match.
- **`list`** (2 tests): returns every registered provider regardless of configured status, in order; returns `[]` for a fresh registry.

**Regression suite:** all 67 pre-existing test files (65 unit + 2 integration) remain green. Total: 804 passed, 3 skipped, across 67 of 68 files (+17 tests, +1 file vs. the Phase 6 Kickoff baseline of 787/790, 66/67 files).

**Build/Lint/Type-check:**

| Check                              | Result                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `npm run build`                    | Passes — full production build, all routes compile                                                      |
| `npm run lint`                     | Passes — 0 errors, 10 warnings (identical, pre-existing, unrelated to Brain Gateway)                    |
| Type-check                         | Passes (folded into `npm run build`, per this repo's `npm run build` also validating types)             |
| New lint rule false-positive check | Passes — `npm run lint` output contains zero matches on the new rule's message against the current tree |
| `npx prettier --check`             | Passes on all five touched/created files                                                                |

---

## 7. Migration Notes

**None.** Wave 6A introduces no database migration, no schema change, and no data backfill. `supabase/schema.sql` is untouched (confirmed by `git status`). This matches Technical Design §18 step 6.1's "Low risk... no data touched" classification.

---

## 8. Rollback Strategy

Per Phase 5 §9.1 ("6A: Revert PR. No data touched.") — **tested in practice, not merely asserted, per Definition of Done item 7.**

`git stash -u` was used to remove every Wave 6A change from the working tree, reproducing the exact pre-6A state, then:

- `npm test` → 787 passed, 3 skipped, 66/67 files — **identical** to the Phase 6 Kickoff baseline.
- `npm run build` → passes, identical route list.

The stash was then restored (`git stash pop`) and the suite re-confirmed green (804/807, 67/68 files). This demonstrates a revert of this wave's future PR would cleanly restore the exact pre-6A behavior, with no data or schema to clean up and no other wave's code yet depending on this wave's additions (Wave 6A is the first wave; nothing built on top of it yet).

---

## 9. Risks

Carried forward from Phase 5 §8 / Phase 6 Kickoff §9.1, re-assessed against what was actually built:

- **Capabilities Descriptor "n=1" evidentiary risk** (ADR-0006, accepted, unresolved by design): OpenRouter's descriptor has every field definitionally `true`, untested against a provider that would return `false`. Unchanged — Wave 6B's conformance suite is the planned mitigation, not this wave's responsibility.
- **`selectedProvider()`'s fallback-to-unconfigured-provider mechanism is an interim shim**, not the final `PROVIDER_UNAVAILABLE` contract (Technical Design §5.3, §17.1, a Wave 6C deliverable). Recorded as Technical Debt TD-6A-3 (§10).
- **`contextWindowTokens`'s value (128,000) is a hand-maintained estimate**, not verified against a live OpenRouter API call. Recorded as Technical Debt TD-6A-1 (§10).

No new architectural risk was introduced. No risk category from Phase 5/Phase 6 Kickoff's baseline changed in kind, only in specificity (now grounded in actual code rather than plan text).

---

## 10. Technical Debt

Full entries in [Technical Debt Register](technical-debt-register.md); summarized here:

| ID      | Description                                                                                                             | Owner Wave  | Status          |
| ------- | ----------------------------------------------------------------------------------------------------------------------- | ----------- | --------------- |
| TD-6A-1 | `contextWindowTokens: 128_000` is a hand-maintained placeholder, not live-API-verified                                  | 6C / future | Open            |
| TD-6A-2 | `routing.ts` (Wave 6C) has no planned boundary/DI lint-rule protection (carried forward, Phase 5.1 Finding Min-4)       | 6C / 6F     | Open            |
| TD-6A-3 | `selectedProvider()`'s unconfigured-fallback is an interim shim superseded by Wave 6C's `PROVIDER_UNAVAILABLE` contract | 6C          | Open, scheduled |

No debt is hidden. Every item above is either explicitly scheduled for resolution in a specific future wave, or carried forward from a prior phase's own already-recorded finding.

---

## 11. Completion Summary

All six Wave 6A tasks are complete. The Architecture Compliance Checklist (Phase 5 §6.1) is satisfied in full — see the [Architecture Compliance Log](architecture-compliance-log.md) for the evidence-based, per-requirement verification. The regression suite is green with zero regressions. Rollback is tested, not merely asserted. Three technical debt items are recorded, none hidden, all scheduled. One implementation-fidelity finding (the test-filename collision) was discovered and corrected during this wave, logged in the Decision Log.

**Wave 6A is complete and ready for its Independent Implementation Review (Wave 6A Review).**
