# Emma Brain Gateway — Implementation Journal

Living artifact. Starting with Wave 6B, this single document replaces the three previously-separate living artifacts (`implementation-decision-log.md`, `technical-debt-register.md`, `architecture-compliance-log.md`) going forward — those three files are left in place as the historical record of Wave 6A and are not appended to again. Every subsequent implementation wave (6B–6F) appends one `# Wave <N>` section here, containing its own Repository Changes, Implementation Discoveries, Implementation Decisions, Technical Debt, Architecture Compliance, Rollback Validation, Test Results, and Lessons Learned.

---

# Wave 6B

## Repository Changes

- `src/lib/errors.ts`: `DEFAULT_RETRY.retryOn` changed from `[429, 500, 502, 503, 529]` to `[429, 500, 502, 503]` — `529` (an Anthropic-via-OpenRouter-specific "overloaded" status) is no longer treated as a genuinely cross-provider retryable status by the shared retry helper.
- `src/core/brain/providers/openrouter.ts`: new private `OPENROUTER_RETRY_ON = [429, 500, 502, 503, 529]` constant, passed as a `retryOn` override on both `fetchWithRetry` call sites (`sendChatRequest`, `embed`) — preserves OpenRouter's own `529`-retry behavior at the Adapter Layer.
- `tests/unit/errors.test.ts`: +2 tests (default `retryOn` no longer retries `529`; still retries `500`).
- `tests/unit/openrouter.test.ts`: +1 test (OpenRouter's own override still retries `529`).
- `tests/unit/provider-conformance.ts` (new): `runProviderConformanceSuite(providerName, createProvider, capabilities)`, 11 shape-level assertions per provider.
- `tests/unit/fake-provider.ts` (new): `createFakeProvider()`, a second, independent, test-only `BrainProvider` implementation (OpenAI-compatible wire shape), never registered in `gateway.ts`.
- `tests/unit/provider-conformance.test.ts` (new): runs the suite against both `createOpenRouterProvider` and `createFakeProvider`.

No file under `supabase/`, and none of `src/core/brain/{registry,types,gateway}.ts` (Wave 6A's deliverables), were touched.

## Implementation Discoveries

### D-6B-1 — `fetchWithRetry`'s `retryOn` override already existed before this wave

Phase 5 §5.2 describes `fetchWithRetry`'s call signature as "gaining" an optional `retryOn` override. Direct inspection of the pre-6B `src/lib/errors.ts` shows `RetryOptions.retryOn?: number[]` and the third parameter's `Partial<RetryOptions>` type already permitted this override — it was simply never passed by the one caller that existed (`openrouter.ts`). Wave 6B activates an already-present, dormant extension point rather than adding new type surface. No scope or architecture impact; recorded for documentation accuracy only, the same category of finding as Wave 6A's `registry.test.ts` naming-collision discovery.

## Implementation Decisions

### DEC-6B-1 — Conformance suite factory signature: `(providerName, createProvider, capabilities)`, not `(provider, capabilities)`

Phase 5 §5.2 names `runProviderConformanceSuite(provider: BrainProvider, capabilities: CapabilitiesDescriptor)` without specifying its shape beyond purpose. Implemented instead as `(providerName: string, createProvider: () => BrainProvider, capabilities: CapabilitiesDescriptor) => void`. Rationale: `providerName` labels each provider's `describe()` block so a failing assertion's test name identifies which provider failed; `createProvider` (a constructor) gives every individual `it()` a freshly constructed provider instance, removing any risk of cross-test state leakage as a matter of test-isolation defense-in-depth (not a correctness requirement of today's stateless providers). No production-code interface is affected — this is a test-only artifact, per Phase 5's own scope statement. Full rationale in [Wave 6B Implementation Report §9](phase6b-provider-layer-implementation.md#9-implementation-discoveries-and-decisions).

## Technical Debt

None introduced by Wave 6B. TD-6A-1, TD-6A-2, TD-6A-3 (see [Technical Debt Register](technical-debt-register.md)) remain open, all owned by Wave 6C exactly as recorded when Wave 6A shipped them.

## Architecture Compliance

10 of 10 checked ADR-0006/ADR-0012 requirements touched by this wave PASS, 0 FAIL. Full evidence table in [Wave 6B Implementation Report §10](phase6b-provider-layer-implementation.md#10-architecture-compliance). Headline items: `529` fully relocated out of shared code into the OpenRouter Adapter Layer (re-verified by direct grep that no other caller of `fetchWithRetry` exists in `src/`); no new production-code-level interface introduced; provider-conformance suite exists and passes for both OpenRouter and the new fake provider.

## Rollback Validation

Empirically tested, not asserted: `git stash push -u` (removing every Wave 6B change) reproduced the exact Wave 6A baseline — `npm test` → 804 passed / 3 skipped / 67 of 68 files; `npm run build` → passes, identical route list. `git stash pop` restored Wave 6B cleanly; the suite was re-confirmed green (829/832, 68/69 files) afterward.

## Test Results

| Stage                           | Tests                  | Files    | Build | Lint                               |
| ------------------------------- | ---------------------- | -------- | ----- | ---------------------------------- |
| Wave 6A baseline (pre-6B)       | 804 passed / 3 skipped | 67 of 68 | Pass  | 0 errors, 10 pre-existing warnings |
| Post-6B (before rollback test)  | 829 passed / 3 skipped | 68 of 69 | Pass  | 0 errors, 10 pre-existing warnings |
| Rollback test (Wave 6B stashed) | 804 passed / 3 skipped | 67 of 68 | Pass  | —                                  |
| Post-restore (final)            | 829 passed / 3 skipped | 68 of 69 | Pass  | 0 errors, 10 pre-existing warnings |

+25 tests, +1 file, 0 regressions at every stage.

## Lessons Learned

- Local `main` can silently drift behind `origin/main` between sessions (a merged PR's commit was invisible to `git log main` until `git fetch`/`git pull` ran) — always re-fetch before trusting a local branch ref as "latest main," even when the prior session's own report claims a specific merge commit is current.
- `core.autocrlf=true` on Windows can make `git status` report files as "modified" with zero actual content difference (line-ending normalization only) — `git diff --stat` producing no hunks, only LF/CRLF warnings, is the tell; don't mistake this for real uncommitted work, and don't discard it via a destructive checkout — `git stash` is the safe way to clear it before switching branches.
- A "gains an optional X" claim in an upstream planning document is worth verifying against the actual current file before implementing — Phase 5's `retryOn` framing describes the feature's _activation_, not literally new type surface (D-6B-1).
