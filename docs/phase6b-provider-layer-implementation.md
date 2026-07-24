# Emma Brain Gateway — Phase 6B: Provider Layer Implementation

## Document Status

- Roadmap: [Brain Gateway Roadmap v1.1](roadmaps/brain-gateway-roadmap-v1.md)
- Phase: Phase 6, Wave 6B — Provider Layer
- Type: **Implementation.** This document reports what Wave 6B actually built, per the task list in [Phase 5 Implementation Planning §5.2](phase5-brain-gateway-implementation-planning.md#52-wave-6b--provider-layer), against [Phase 4 Technical Design §17.3, §19.3](phase4-brain-gateway-technical-design.md), governed by [ADR-0006](adr/0006-provider-registry-capabilities-descriptor-adapter-layer.md) and [ADR-0012](adr/0012-provider-conditional-boot-validation.md).
- Branch: `feature/brain-gateway-phase6b-provider-layer`
- Preconditions verified before implementation began: PR #162 (Wave 6A — Core Infrastructure) merged to `main`; local `main` ref was stale (behind `origin/main`) and was fetched/pulled before branching — resolved by re-fetching rather than assumed; working tree confirmed clean on `main` (the only "modified" files git reported on the prior branch were a `core.autocrlf` line-ending artifact with zero content diff, verified via `git diff`, not a real uncommitted change); `npm run build` / `npm run lint` / `npm test` re-run directly against `main` (804 passed, 3 skipped, 67/68 files; 0 lint errors, 10 pre-existing unrelated warnings) before any Wave 6B file was touched; ADR-0006, ADR-0012, Phase 4 Technical Design §17.3/§19.3, Phase 5 §5.2, Phase 5.1 §5.2-relevant findings, and the Phase 6A Implementation Report were re-read in full.
- Related living artifact updated alongside this report: [Implementation Journal](implementation-journal.md) — per this phase's own instruction, the three previously-separate living documents (Decision Log, Technical Debt Register, Architecture Compliance Log) are **not** appended to going forward; their Wave 6A entries remain in place as history, and all new entries from this wave onward live in the single journal.

---

## 1. Executive Summary

Wave 6B (Provider Layer) is implemented in full against Phase 5 §5.2's six-task list. The provider-specific `529` ("overloaded", an Anthropic-via-OpenRouter status) is relocated out of `src/lib/errors.ts`'s shared, nominally cross-provider `DEFAULT_RETRY.retryOn` default and into `providers/openrouter.ts` itself, which now supplies its own `retryOn` override (`[429, 500, 502, 503, 529]`) on every `fetchWithRetry` call it makes — closing the last open instance of GAP-07 (provider-specific vocabulary leaking into nominally provider-agnostic shared code) that Technical Design §17.3 named as this wave's concrete fix. A shared provider-conformance test factory (`runProviderConformanceSuite`) now exists and is run against both OpenRouter and a new fake, test-only second `BrainProvider` implementation — the mechanism ADR-0006 names as the way to close its "n=1, provider-neutrality proven only by inspection" risk by construction rather than leave it permanently accepted.

Twenty-five new tests are added: 2 in `errors.test.ts` (default-retryOn regression coverage), 1 in `openrouter.test.ts` (529-retry-preserved-via-override), and 22 in a new `provider-conformance.test.ts` (11 conformance assertions × 2 providers). The full regression suite is green: 829 tests passed, 3 skipped, across 68 of 69 test files — zero regressions, +25 new tests, +1 new test file relative to the Phase 6A baseline (804/3, 67/68 files). Production build and lint both pass cleanly (0 lint errors; the same 10 pre-existing, unrelated warnings as every prior wave's baseline). Rollback was tested in practice: stashing every Wave 6B change reproduces the exact Wave 6A baseline (804/3 tests, 67/68 files, clean build) — confirmed, not assumed, then the stash was restored and the suite re-confirmed green.

**No architecture, ADR, or Technical Design deviation occurred.** One narrow, evidence-driven implementation decision was required where Phase 5's plan named a mechanism's outcome without fully specifying its shape (the conformance suite's concrete factory signature) — see §9 below. One implementation-fidelity fact is recorded as a Discovery, not a deviation: `fetchWithRetry`'s `retryOn` override parameter already existed in `RetryOptions`/`Partial<RetryOptions>` before this wave (unused by any caller) — Wave 6B activates an already-present extension point rather than adding new type surface, a narrower change than Phase 5's own text ("`fetchWithRetry`'s call signature gains an optional `retryOn` override") implied.

---

## 2. Implemented Components

Per Phase 5 §5.2's task list, all six tasks completed:

| #   | Task                                                                                                                          | Status                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 1   | Remove `529` from `src/lib/errors.ts`'s shared `DEFAULT_RETRY.retryOn` default                                                | Done                                                |
| 2   | Add a provider-supplied `retryOn` override, passed by `openrouter.ts`, preserving `529`-retry behavior for OpenRouter (§17.3) | Done                                                |
| 3   | Build `runProviderConformanceSuite(provider, capabilities)` — shared test factory (§19.3)                                     | Done, with one narrow signature adjustment — see §9 |
| 4   | Author a fake, test-only second `BrainProvider` implementation                                                                | Done                                                |
| 5   | Run `openrouter.ts` through the same conformance suite to re-verify unchanged behavior                                        | Done                                                |
| 6   | Update `errors.test.ts` / `openrouter.test.ts` for the retry-list change (§19.4 regression gate)                              | Done                                                |

---

## 3. Files Modified

| File                                      | Change                                                                                                                                                                                                                                             |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/errors.ts`                       | `DEFAULT_RETRY.retryOn` changed from `[429, 500, 502, 503, 529]` to `[429, 500, 502, 503]`. No exported signature changed — `RetryOptions`/`fetchWithRetry` already accepted an optional `retryOn` override before this wave (see §9's Discovery). |
| `src/core/brain/providers/openrouter.ts`  | New private `OPENROUTER_RETRY_ON = [429, 500, 502, 503, 529]` constant; passed as `retryOn` in both `fetchWithRetry` call sites (`sendChatRequest` and `embed`). No exported function signature changed.                                           |
| `tests/unit/errors.test.ts`               | **New describe block** (2 tests): default `retryOn` no longer includes `529`; default `retryOn` still includes `500` (unchanged, genuinely cross-provider status).                                                                                 |
| `tests/unit/openrouter.test.ts`           | **New describe block** (1 test): `createOpenRouterProvider().chat()` still retries a `529` response via its own override, unaffected by the shared default's `529` removal.                                                                        |
| `tests/unit/provider-conformance.ts`      | **New.** `runProviderConformanceSuite(providerName, createProvider, capabilities)` — 11 assertions per provider (isConfigured/name shape, chat/chatStream/embed success+error+transport-failure shapes, capabilities descriptor shape).            |
| `tests/unit/fake-provider.ts`             | **New.** `createFakeProvider()` — a second, independent `BrainProvider` implementation speaking the same OpenAI-compatible wire shape as OpenRouter and the conformance suite's mocks. Test-only; never registered in `gateway.ts`.                |
| `tests/unit/provider-conformance.test.ts` | **New.** Invokes `runProviderConformanceSuite` against `createOpenRouterProvider` and `createFakeProvider` with an identical `CapabilitiesDescriptor`.                                                                                             |

No file under `supabase/` was touched. No file outside the above seven was touched. `src/core/brain/registry.ts`, `types.ts`, and `gateway.ts` (Wave 6A's deliverables) are untouched by this wave.

---

## 4. Interfaces Added

| Interface                     | Location                             | New/Changed                               | Additive?                                                  |
| ----------------------------- | ------------------------------------ | ----------------------------------------- | ---------------------------------------------------------- |
| `runProviderConformanceSuite` | `tests/unit/provider-conformance.ts` | New                                       | Yes — test-only, no production dependency                  |
| `createFakeProvider`          | `tests/unit/fake-provider.ts`        | New                                       | Yes — test-only, never registered in `gateway.ts`          |
| `fetchWithRetry`'s `retryOn`  | `src/lib/errors.ts`                  | Activated, not newly typed (§9 Discovery) | Yes — the field already existed in `Partial<RetryOptions>` |

No production-code-level interface is new, per Phase 5 §5.2's own scope statement ("Interfaces affected: None new at the production-code level"). This is consistent with every "Changed" row remaining additive, matching Technical Design §13's guarantee.

---

## 5. Dependency Verification

Per Phase 5 §5.2 and Phase 5.1's Wave Dependency Audit: Wave 6B has no ADR-stated dependency on Wave 6A — only a "soft test-fixture convenience" relationship (the conformance suite's `capabilities` parameter is typed `CapabilitiesDescriptor`, a Wave 6A type). Verified directly:

- `tests/unit/provider-conformance.ts` and `tests/unit/fake-provider.ts` import only from `@/core/brain/types` and `@/lib/errors` — neither imports `@/core/brain/registry` or `@/core/brain/gateway`.
- **Risk re-verified directly, not assumed:** `grep -rl "fetchWithRetry(" src/` returns exactly two files — `src/core/brain/providers/openrouter.ts` (the call sites) and `src/lib/errors.ts` (the definition itself). No other file in `src/` calls `fetchWithRetry`, confirming Phase 5's own risk-mitigation claim ("only `openrouter.ts` currently calls `fetchWithRetry` with retry-eligibility needs tied to `529`") holds exactly as stated — the shared default's `529` removal cannot silently change any other caller's behavior because no other caller exists.
- `src/lib/ratelimit.ts` (the only other production file importing `@/lib/errors`) imports only the `RateLimitUnavailableError` class, not `fetchWithRetry` — confirmed by direct grep, not assumed from Phase 4.1's prior claim.

**Verdict: no undocumented dependency was introduced. Wave 6B depends on nothing beyond Wave 6A's `CapabilitiesDescriptor` type (test-fixture typing only) and the pre-existing `fetchWithRetry` extension point.**

---

## 6. Tests Added

**`tests/unit/errors.test.ts`** — new `describe("fetchWithRetry — shared default retryOn list (Wave 6B, §17.3)")` block, 2 tests: default `retryOn` no longer retries a `529` response (fetch called exactly once); default `retryOn` still retries a `500` response (fetch called twice, second call succeeds) — the explicit regression gate proving the shared list's genuinely-cross-provider statuses are unaffected.

**`tests/unit/openrouter.test.ts`** — new `describe("createOpenRouterProvider — 529 retry override (Wave 6B, §17.3)")` block, 1 test: `chat()` retries a `529` response via its own provider-supplied override (fetch called twice, second call succeeds), proving OpenRouter's `529`-retry behavior is unchanged by the shared default's removal of `529`.

**`tests/unit/provider-conformance.ts` / `tests/unit/provider-conformance.test.ts`** — 11 shape-level assertions run against each of 2 providers (22 tests total): `isConfigured()` returns a boolean; `name` is a non-empty string; `chat()` returns a well-formed `BrainChatResult` on success, normalizes a non-ok upstream response into `{ok:false, error}` with all five required error fields present and correctly typed, and propagates a transport failure as a throw (never a value return); `chatStream()` yields events ending in exactly one trailing `done` event and normalizes a non-ok upstream response the same way; `embed()` returns a well-formed `BrainEmbedResult` on success and normalizes errors the same way; the capabilities descriptor declares every required boolean field and a positive-integer `contextWindowTokens`. Deliberately shape-only, never asserting a provider-specific wire value — exact wire-format fidelity for OpenRouter remains the responsibility of `openrouter.test.ts` and `brain-gateway.test.ts`'s own existing, more specific tests (unchanged, still passing).

**Regression suite:** all 68 pre-existing test files remain green. Total: 829 passed, 3 skipped, across 68 of 69 files (+25 tests, +1 file vs. the Phase 6A baseline of 804/3, 67/68 files).

**Build/Lint/Type-check:**

| Check                                | Result                                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `npm run build`                      | Passes — full production build, all routes compile                                             |
| `npm run lint`                       | Passes — 0 errors, 10 warnings (identical, pre-existing, unrelated to Brain Gateway)           |
| Type-check                           | Passes (folded into `npm run build`)                                                           |
| `npx prettier --check` (all 7 files) | Passes after one `--write` pass (all seven touched/created files reformatted to project style) |

---

## 7. Migration Notes

**None.** Wave 6B introduces no database migration, no schema change, and no data backfill. `supabase/schema.sql` is untouched. This matches Technical Design §18 step 6.2's "Low risk" classification.

---

## 8. Rollback Strategy

Per Phase 5 §5.2 ("Revert the PR. The conformance suite and fake provider are additive test-only artifacts with no production dependency — reverting them affects nothing outside `tests/`.") — **tested in practice, not merely asserted.**

`git stash push -u` was used to remove every Wave 6B change from the working tree, reproducing the exact pre-6B (Wave 6A) state, then:

- `npm test` → 804 passed, 3 skipped, 67/68 files — **identical** to the Wave 6A baseline.
- `npm run build` → passes, identical route list.

The stash was then restored (`git stash pop`) and the suite re-confirmed green (829/832, 68/69 files). This demonstrates a revert of this wave's future PR would cleanly restore the exact Wave 6A behavior: the two production-code edits (`errors.ts`, `openrouter.ts`) touch no file any later wave depends on yet, and the three new test files have no production dependency at all.

---

## 9. Implementation Discoveries and Decisions

Per this phase's governance requirement, every unforeseen fact or narrow implementation-level choice is classified explicitly below rather than silently resolved.

### Discovery D-6B-1 — `fetchWithRetry`'s `retryOn` override already existed before this wave

- **Description:** Phase 5 §5.2's "Interfaces affected" text states `fetchWithRetry`'s call signature "gains an optional `retryOn` override — additive." Direct inspection of `src/lib/errors.ts` (pre-6B) shows `RetryOptions.retryOn?: number[]` and the third parameter's type, `Partial<RetryOptions>`, already permitted a `retryOn` override — it was simply unused by any caller (the only caller, `openrouter.ts`, never passed it).
- **Impact:** None on scope or architecture. The change actually shipped is narrower than Phase 5's text implies: no new type surface is added; an already-present, previously-dormant extension point is activated for the first time.
- **Resolution:** Documented here for accuracy; no code or plan change required. This is the same category of implementation-fidelity finding Wave 6A recorded once (the `registry.test.ts` filename collision) — a documentation-precision gap in an upstream planning document, not a defect in this wave's own work.
- **Owner:** N/A — informational only, closed by this entry.

### Decision DEC-6B-1 — Conformance suite factory takes a provider constructor and a display name, not a bare instance

- **Decision:** `runProviderConformanceSuite` is implemented as `(providerName: string, createProvider: () => BrainProvider, capabilities: CapabilitiesDescriptor) => void`, rather than Phase 5's literal `runProviderConformanceSuite(provider: BrainProvider, capabilities: CapabilitiesDescriptor)`.
- **Related ADR:** [ADR-0006](adr/0006-provider-registry-capabilities-descriptor-adapter-layer.md) (§19.3's conformance-suite mechanism)
- **Technical Design reference:** §19.3 (names the suite's purpose and the four methods it exercises; does not specify a literal function signature)
- **Rationale:** (1) `providerName` labels each provider's `describe()` block so a failing assertion's test name identifies which provider failed, which the literal spec signature is silent on and which matters once a real second provider exists. (2) A constructor (`createProvider`) rather than a shared instance means every individual `it()` starts from a freshly constructed provider, removing any risk of one test's `vi.stubGlobal("fetch", ...)` mocking or mutable state (today: none — both `openrouter.ts` and the fake provider are stateless closures reading `process.env` per call) leaking into another test — defense-in-depth for test isolation rather than a correctness requirement of the current providers.
- **Consequences:** None at the production-code level — this is a test-only artifact per Phase 5's own scope statement. Both `createOpenRouterProvider` and `createFakeProvider` already match the `() => BrainProvider` shape without modification, since both are factory functions today.
- **Owner Wave:** N/A — resolved within 6B, no follow-up needed.

No other discovery or decision arose. No technical debt is introduced by this wave: Technical Debt Register entries TD-6A-1/2/3 remain open, all still owned by Wave 6C exactly as recorded in Wave 6A's report — this wave neither resolves nor adds to them.

---

## 10. Architecture Compliance

| #   | Requirement                                                                                                                  | ADR                               | Technical Design ref | Evidence                                                                                                                                                                                                         | Verdict |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1   | `529` is removed from the shared, nominally cross-provider `DEFAULT_RETRY.retryOn` default                                   | ADR-0006 (GAP-07)                 | §17.3                | `src/lib/errors.ts` diff: `retryOn: [429, 500, 502, 503, 529]` → `[429, 500, 502, 503]`                                                                                                                          | PASS    |
| 2   | OpenRouter supplies its own `retryOn` override preserving `529`-retry behavior                                               | ADR-0006 (GAP-07)                 | §17.3                | `providers/openrouter.ts`'s `OPENROUTER_RETRY_ON` constant passed to both `fetchWithRetry` call sites; `tests/unit/openrouter.test.ts`'s new test asserts a `529` response is retried and eventually succeeds    | PASS    |
| 3   | No other caller is affected by the shared default's `529` removal                                                            | ADR-0006 (GAP-07)                 | §17.3                | `grep -rl "fetchWithRetry(" src/` returns only `openrouter.ts` and `errors.ts` itself; `ratelimit.ts` (the only other `@/lib/errors` importer) imports only `RateLimitUnavailableError`                          | PASS    |
| 4   | A shared provider-conformance suite exists, exercising `chat`/`chatStream`/`embed`/`isConfigured` against a mocked transport | ADR-0006                          | §19.3                | `tests/unit/provider-conformance.ts`'s `runProviderConformanceSuite`; 11 assertions per provider                                                                                                                 | PASS    |
| 5   | The conformance suite is run against OpenRouter, re-verifying it unchanged by the `529` relocation                           | ADR-0006                          | §19.3                | `provider-conformance.test.ts` invokes the suite against `createOpenRouterProvider`; all 11 assertions pass                                                                                                      | PASS    |
| 6   | A fake, test-only second `BrainProvider` exists, never shipped to production                                                 | ADR-0006                          | §19.3                | `tests/unit/fake-provider.ts`'s `createFakeProvider`; imported only from `tests/unit/provider-conformance.test.ts`; not referenced anywhere in `src/` (confirmed by grep)                                        | PASS    |
| 7   | No new production-code-level interface is introduced                                                                         | Technical Design §13              | §13                  | `registry.ts`/`types.ts`/`gateway.ts` untouched by this wave; only `errors.ts`'s internal default and `openrouter.ts`'s internal constant change                                                                 | PASS    |
| 8   | No provider-specific logic leaks outside the Provider Layer                                                                  | ADR-0006 (Adapter Layer boundary) | Context              | `529`'s status code now lives only inside `providers/openrouter.ts`'s `OPENROUTER_RETRY_ON`/`normalizeHttpError`; `errors.ts` (shared, cross-provider) contains no provider-specific status code after this wave | PASS    |
| 9   | Regression suite remains green throughout                                                                                    | Technical Design §19.4            | §19.4                | 829/832 tests, 68/69 files — 0 regressions, +25 new (§6)                                                                                                                                                         | PASS    |
| 10  | Rollback is empirically verified, not merely asserted                                                                        | Phase 5 §9 / §5.2                 | §18 step 6.2         | `git stash`/`test`/`build`/`stash pop`/`test` cycle reproduces the exact Wave 6A baseline then restores Wave 6B cleanly (§8)                                                                                     | PASS    |

**Wave 6B verdict: 10 of 10 checked requirements PASS. 0 FAIL.** No ADR-0006 or ADR-0012 requirement touched by this wave is unmet.

---

## 11. Risks

Carried forward from Phase 5 §5.2, re-assessed against what was actually built:

- **A caller implicitly relying on the shared list's `529` entry** (rather than a provider-supplied one) could see a behavior change. **Disconfirmed as a live risk** for the current repository: §5/§10 above directly re-verify, by grep, that no caller other than `openrouter.ts` calls `fetchWithRetry` at all — the risk Phase 5 named is fully mitigated by construction, not merely by argument.
- **Capabilities Descriptor "n=1" evidentiary risk** (ADR-0006, carried from Wave 6A): now **partially mitigated** rather than fully accepted — the conformance suite gives a second, independent `BrainProvider` implementation something to be verified against, closing the "proven only by inspection" gap for the four-method contract's shape (though the Descriptor's own field values remain definitionally `true` with only one real provider, per Wave 6A's TD-6A-1).

No new architectural risk was introduced. No risk category from Phase 5/Wave 6A's baseline changed in kind, only in specificity.

---

## 12. Technical Debt Summary

No new technical debt is introduced by Wave 6B. TD-6A-1, TD-6A-2, TD-6A-3 (Technical Debt Register) remain open, all owned by Wave 6C exactly as recorded when Wave 6A shipped them — this wave neither resolves nor adds to any of the three.

---

## 13. Discoveries Summary

One Discovery (D-6B-1, §9) and one Decision (DEC-6B-1, §9) were recorded during this wave. Neither changes scope, architecture, or any ADR's decision — both are narrow implementation-level facts/choices, fully detailed in §9 and in the [Implementation Journal](implementation-journal.md)'s Wave 6B section.

---

## 14. Definition of Done Verification

- [x] All six Phase 5 §5.2 tasks complete (§2)
- [x] Production code + tests + documentation delivered (§3, §6, this report)
- [x] Regression suite green, zero regressions (§6, §10 row 9)
- [x] Build/lint/type-check green (§6)
- [x] Rollback empirically verified, not merely asserted (§8, §10 row 10)
- [x] Every Discovery/Decision/Technical Debt classified and recorded (§9, §12, §13)
- [x] Architecture Compliance Checklist evidenced, not self-reported (§10)
- [x] Implementation confined to Wave 6B scope — no Routing Engine, Context Pipeline, Memory Ranking, Prompt Composition, or Telemetry code introduced (§15)

---

## 15. Explicit Non-Goals Confirmation

Per the Wave 6B brief, this implementation does not introduce the Routing Engine (`routing.ts`, Wave 6C — confirmed absent by file-existence check), does not touch Context Pipeline, Memory Ranking, or Prompt Composition (no file under `context-pipeline.ts`, `memory-db.ts`, or `personas.ts` is modified), does not add Operational Instrumentation (`correlationId`/`withInstrumentation` — Wave 6F, confirmed absent from `gateway.ts`/`types.ts`, both untouched by this wave), and does not add `PROVIDER_UNAVAILABLE` or any Routing-layer error code (Wave 6C, Technical Design §17.1 — `BrainRequestError.code`'s union is unchanged, confirmed by direct diff review showing `types.ts` untouched). No architectural decision was made or revisited; every choice in §9 is a narrow implementation-level judgment call within Wave 6B's own approved scope.

---

## 16. Ready for Independent Review

Wave 6B is complete and ready for its Independent Implementation Review (Wave 6B Review), on the same precedent as Wave 6A.
