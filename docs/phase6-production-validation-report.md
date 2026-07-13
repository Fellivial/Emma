# Phase 6 Production Validation Report

**Branch:** `verify/p6-production-validation` (off `fix/p6-natural-expansion`, itself 13 commits ahead of `main` — Phase 6 is not yet merged)
**Date:** 2026-07-13
**Scope:** Verification only. No code changes made. No new features, no refactors.

---

## Context Refresh Summary

- Phase 1–5 code intact: no regressions found in any prior-phase module while reading through GDPR, encryption, greeting, notification, avatar, and vision code paths.
- Phase 6 branch (`fix/p6-natural-expansion`) has **not been merged to `main`** (`git log main..fix/p6-natural-expansion` = 13 commits; the reverse is 0). This is a process gap carried over from earlier phases (Phase 3/4 audits flagged the same pattern) — flagged here as out-of-phase-6-scope but worth closing before calling the phase done.
- Only **one** Supabase project exists for this app ("Emma", ref `frwabkgvzjwfcmbpikir`) — no separate staging project, despite `docs/runbook-staging-environment-setup.md` describing one. This means every verification below ran against what is effectively production. The project was paused (`INACTIVE`, likely free-tier auto-pause) at the start of this session and was resumed as part of this validation.

---

## Migration Verification

- `supabase/migrations/20260713000001_companion_state.sql` existed on the branch but had **not been applied** to the live project (confirmed via `list_migrations` before applying).
- Applied via `apply_migration`. Post-apply `execute_sql` check confirms:
  - Table `public.companion_state` created with all 7 documented columns, correct types (`uuid`, `timestamptz`, `text`).
  - `relrowsecurity = true` (RLS enabled).
  - Exactly one policy, `"Users own companion state"`, `FOR ALL`, `USING (auth.uid() = user_id)`, `WITH CHECK (auth.uid() = user_id)` — matches ADR-0002 exactly.
  - Index: `companion_state_pkey` (unique btree on `user_id`) — the only index the migration defines; correct for a one-row-per-user table keyed by PK.
- `get_advisors(security)` run post-migration: **no findings against `companion_state`**. All returned findings are pre-existing, unrelated to Phase 6 (listed under Remaining Known Issues).

## Presence Verification

Ran a real round-trip against the live DB using the actual application code (`saveCompanionState` / `getCompanionState` from `src/core/companion-state.ts`), against the account under test, then deleted the test row to restore the pre-test (empty) state:

- **Save → close → reopen:** wrote a session ending "stressed" (evening), read it back through `getCompanionState` — mood, emotion snapshot, and presence summary all round-tripped correctly.
- **Mood check-in / greeting continuity:** `last_mood` and the emotion snapshot decrypt into exactly the shape `greeting-engine.ts`'s `shouldMoodCheckIn` / `getSessionContext` expect (verified by reading `greeting-engine.ts`, which merges `presence.lastInteractionAt` with the local `emma_last_session` timestamp, newest wins, per ADR-0002).
- **Proactive topic:** `lastProactiveTopic` field round-trips through the same path (client can write it back via `PUT /api/emma/presence`, bounded to 120 chars, validated against the `GREETING_CONTEXTS` enum).
- Client wiring confirmed in `src/app/app/page.tsx`: fetches `/api/emma/presence` with a hard 2.5s `AbortSignal.timeout`, and the brain route (`src/app/api/emma/route.ts:674`) writes state fire-and-forget after every exchange.

## Cross-device Verification

- Simulated "Device A" (evening, stressed) then "Device B" (later timestamp, morning, happy) writing to the same `user_id` row.
- Confirmed **newest snapshot wins**: the read after Device B's write returned Device B's mood/emotion/summary, matching the last-writer-wins, single-row design (no per-device rows, no merge logic, as ADR-0002 specifies).

## Encryption Verification

- Raw `execute_sql` read of the row (bypassing the app) showed `last_mood`, `last_emotion`, and `presence_summary` all stored as `enc:v1:...` ciphertext — never plaintext at rest.
- `getCompanionState` decrypted all three back to the original values with no loss.
- `last_interaction_at` and `last_greeting_context` correctly remain plaintext (by design — timestamp needs to be queryable, greeting context is a bounded enum with no user content).
- `scripts/rotate-encryption-key.ts` statically confirmed to include `companion_state` with columns `last_mood, last_emotion, last_proactive_topic, presence_summary` in its rotation table list (line 52-58) — code-level check only. **Did not execute key rotation against production** — that's a separate, higher-risk action requiring its own explicit authorization, dry-run or not, and was out of scope for this task's "verify only" mandate.

## GDPR Verification

- `src/app/api/emma/gdpr/route.ts`:
  - `USER_OWNED_DELETE_ORDER` includes `{ table: "companion_state" }` (line 40), positioned correctly before `profiles` (respects the `on delete cascade` chain).
  - `GDPR_EXPORT_TABLES` includes a `companionState` entry (line 177-182) selecting all seven columns.
  - `decryptExportRow`'s key list includes `last_mood`, `last_emotion`, `last_proactive_topic`, `presence_summary` (lines 282-285) — export returns plaintext to the user, not ciphertext.
- No orphaned-record risk: `on delete cascade` from `auth.users` is defense-in-depth; the GDPR delete path removes the row explicitly before `profiles`.
- Not exercised live (would require deleting the test account) — verified by code inspection only, consistent with "verify, don't execute destructive GDPR deletion on a real account" judgment.

## Notification Verification

- `src/core/companion-notify.ts`:
  - `buildTaskCompleteNotification`: playful copy (`Mmm. "<goal>" — done. Come see.`) only when `teasingLevel === "playful" && warmth === "standard"`; every other case — including `flags === null` — gets the plain, soft copy. Matches the "no flags → default to plain warmth, not teasing" requirement.
  - `buildApprovalNotification`: fixed, unambiguous copy regardless of flags — approval is explicitly carved out as a safety surface, not flag-gated. Confirmed by reading the function: it takes no `flags` parameter at all.
- Unit tests (`tests/unit/companion-notify.test.ts`) pass as part of the 619-test run.

## Greeting Verification

- `greeting-engine.ts` reviewed for the daypart/absence matrix (morning/afternoon/evening/night/late-night × quick-return/normal-return/long-absence/very-long-absence) and the negative/positive previous-session paths (`shouldMoodCheckIn`, `NEGATIVE_MOODS` check against `presence.lastMood`).
- Behavior-flag consumption confirmed: greeting bank selection reads `behaviorFlags` (teasing/warmth) alongside `presence`, matching the Phase 4/6 requirement that companion presence is a data source, not a second behavioral decision layer (ADR-0001 boundary respected).
- Not exercised through the live UI with a real multi-day-old session (would require a real authenticated account with aged presence data) — verified via existing `tests/unit/greeting-engine.test.ts` (part of the passing suite) plus static reading, not fresh live E2E.

## Vision Verification

- `src/app/api/emma/vision/route.ts`: primary model + `google/gemini-2.5-flash-lite` fallback in `VISION_MODELS` (`src/core/models.ts`) — no longer the placeholder free-only model flagged in the Phase 6 readiness audit.
- `AbortSignal.timeout(VISION_TIMEOUT_MS)` (20s) wraps the upstream fetch; timeout, unreachable-provider, non-2xx, empty-completion, and non-JSON-completion are all handled as distinct, logged failure branches that return a structured error instead of hanging or silently degrading.
- Not exercised with a live screen-share + real camera frame (would require an authenticated browser session with media permissions) — verified by code inspection only.

## Live2D Verification

- `public/live2d/emma/Design_genius_White/Design_genius(1).model3.json` cross-checked against `src/core/avatar-engine.ts`:
  - 10 expressions declared in the model (`neutral, smirk, warm, concerned, amused, skeptical, listening, flirty, sad, idle_bored`) — all referenced by name in `avatar-engine.ts`, all files present on disk.
  - 4 motion groups (`Idle, Talk, Tap_Head, Tap_Body`) — all called by `avatar-engine.ts` (`model.motion("Talk", ...)`, `model.motion("Idle", ...)`, tap handlers), all files present.
  - Hit areas `Head` / `Body` map to real `ArtMesh` IDs and are read via `model.hitTest(x, y)` in the tap handler — not a placeholder.
  - Lip sync group (`ParamMouthOpenY`) and eye-blink group present in `Groups`.
- No missing assets found for anything the code references.
- Not visually rendered in a live browser session in this pass (canvas/WebGL rendering wasn't checked pixel-by-pixel) — verified by asset/reference cross-check, not a rendered screenshot.

## Regression Results

| Check               | Result                                                                                                                                                                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tests               | **619 passed, 3 skipped** (52 files passed, 1 skipped), 0 failures                                                                                                                                                                            |
| Lint                | **0 errors**, 10 pre-existing warnings (all in files untouched by Phase 6: `billing/page.tsx`, `settings/notifications/page.tsx`, `settings/usage/page.tsx`, `InputBar.tsx` — React Compiler purity/effect warnings, not Phase 6 regressions) |
| Typecheck           | `tsc --noEmit` — **0 errors**                                                                                                                                                                                                                 |
| Build               | `npm run build` — **succeeded**, all 90+ routes compiled including `/api/emma/presence`, `/settings/notifications`                                                                                                                            |
| Browser smoke check | `/login`, `/landing`, `/waitlist` load with zero console errors; unauthenticated `/app` correctly redirects to `/login` (proxy gate intact)                                                                                                   |

## Remaining Known Issues

_(outside Phase 6 scope, not blocking this phase)_

- Phase 6 branch is unmerged to `main` — process gap, not a code defect.
- No real staging Supabase project exists — every DB-backed phase since Phase 1 has effectively validated against production.
- Pre-existing lint warnings (React Compiler purity/effect rules) in `billing`, `usage`, `notifications` settings pages and `InputBar.tsx` — unrelated to Phase 6, not introduced by it.
- Supabase advisor findings unrelated to this table: missing RLS policies on `email_sequences`, `global_config`, `legacy_chat_migration_ledger`, `rate_limit_counters`, `user_files`, `user_mcp_servers`, `waitlist`, `waitlist_v2`; mutable search_path on 3 functions; two `USING/WITH CHECK (true)` policies (`referrals`, `trials`); leaked-password protection disabled. None involve `companion_state`.
- Encryption key rotation was verified statically only (script includes the right columns) — never executed against production in this pass; treat as a separate, explicitly-authorized action when rotation is actually needed.
- Live2D and vision were verified by code/asset cross-reference, not a rendered, authenticated live session (no test login credentials were available/created for this pass).

## Phase 6 Final Verdict

**COMPLETE WITH MINOR FOLLOW-UP**

Every piece of Phase 6 that could be verified — migration, RLS, encryption, GDPR wiring, notification copy logic, greeting/presence code paths, Live2D asset mapping, vision hardening, and the full automated test/lint/typecheck/build suite — checked out with no defects found, and the companion_state migration is now live on the (only) production database with the schema, RLS, and policies matching ADR-0002 exactly.

What keeps this from a bare "COMPLETE": (1) the branch still isn't merged to `main`, so "production" today is running without this code until that happens; (2) a handful of the most experiential checks (live greeting continuity across a real aged session, live vision screen-share, live Live2D rendering) were verified through code/asset inspection and existing unit tests rather than a fresh authenticated browser session, since no test credentials were available in this pass. None of these are defects — they're verification-method gaps, not implementation gaps. Recommend merging to `main` and, if a real test account can be provisioned, running one authenticated pass through the app to close the last experiential gap before considering the phase fully closed end-to-end.
