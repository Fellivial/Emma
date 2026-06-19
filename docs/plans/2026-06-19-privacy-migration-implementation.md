# Privacy Migration Implementation Plan

> **For agentic workers:** Use test-driven development for every behavior change and run the focused test after each implementation step.

**Goal:** Safely migrate legacy plaintext chat rows into encrypted daily conversations, disable legacy reads by default, fail closed on missing production encryption, encrypt future conversation metadata, and close user-owned GDPR deletion gaps.

**Architecture:** A service-role-only CLI drives an injected backfill module. It groups legacy rows by user and UTC day, maps each row to its existing legacy UUID as the target message ID, and records every applied decision in a content-free ledger. Runtime history reads use encrypted storage exclusively unless an emergency flag is explicitly enabled.

**Tech Stack:** Next.js route handlers, TypeScript, Supabase/Postgres, Node crypto, Vitest.

## Global Constraints

- Dry-run is the default; writes require `--apply`.
- Rollback requires both `--rollback` and `--apply`.
- Never log message content, display text, titles, summaries, or tokens.
- Never overwrite a conflicting encrypted message.
- Never mutate legacy `chat_messages` rows.
- Never delete shared `client_integrations` automatically.

---

### Task 1: Lock the storage contract with tests

**Files:**
- Create: `tests/unit/privacy-migration.test.ts`
- Modify: `tests/unit/encryption.test.ts`
- Modify: `tests/unit/p0-blockers.test.ts`

1. Add failing tests for deterministic daily conversation IDs and UTC grouping.
2. Add failing tests proving dry-run performs no writes and apply is idempotent.
3. Add failing tests proving conflicts are counted and never overwritten.
4. Add failing tests proving rollback deletes only ledger-proven, backfill-created rows.
5. Add failing tests proving production encryption throws when the key is absent or malformed.
6. Add failing tests proving the legacy fallback is disabled unless the flag is exactly `true`.
7. Run the focused tests and confirm failures are caused by missing behavior.

### Task 2: Add the service-role-only migration ledger

**Files:**
- Create: `supabase/migrations/20260619000003_legacy_chat_migration_ledger.sql`
- Modify: `supabase/schema.sql`

1. Create `legacy_chat_migration_ledger` with legacy ID, owner, UTC date, target IDs, provenance booleans, and timestamp only.
2. Enable RLS and add no authenticated or anonymous policies, leaving access to the service role only.
3. Add indexes for user/date and target conversation lookup.
4. Add the same current-state definition to `schema.sql`.

### Task 3: Implement the idempotent backfill engine and CLI

**Files:**
- Create: `src/core/privacy/legacy-chat-backfill.ts`
- Create: `scripts/backfill-legacy-chat.ts`
- Modify: `package.json` only if a compatible local TypeScript runner is already available

1. Implement stable RFC 4122 UUIDv5 conversation IDs from user ID plus UTC date.
2. Group legacy rows by `user_id` plus UTC date and preserve `created_at`, then ID ordering.
3. Reconcile existing encrypted messages without overwriting conflicts.
4. Encrypt inserted `content` and `display` through the current encryption helper.
5. Write target rows and ledger entries idempotently in apply mode; dry-run returns counts only.
6. Implement rollback from ledger provenance, deleting only rows marked as created by this backfill.
7. Build a service-role-only CLI with dry-run default and aggregate-only output.
8. Run the focused backfill tests until green.

### Task 4: Gate legacy runtime reads

**Files:**
- Modify: `src/app/api/emma/history/route.ts`
- Modify: `.env.local.example`
- Modify: `tests/unit/request-validation.test.ts` or create a focused history route test

1. Export a small flag predicate that returns true only for the exact value `true`.
2. Skip every `chat_messages` query while the flag is false or missing.
3. Retain the fallback only as an explicitly enabled emergency path and comment it as legacy read-only behavior.
4. Document `ENABLE_LEGACY_CHAT_FALLBACK=false` in the example environment.
5. Run the focused history tests until green.

### Task 5: Fail closed in production and encrypt conversation metadata

**Files:**
- Modify: `src/core/security/encryption.ts`
- Modify: `src/core/memory-db.ts`
- Modify: `tests/unit/encryption.test.ts`
- Modify: `tests/unit/memory-db.test.ts`

1. Validate that `EMMA_ENCRYPTION_KEY` is exactly 64 hexadecimal characters.
2. Make sensitive encryption writes throw a clear configuration error in production when validation fails.
3. Preserve explicit development/test compatibility without claiming plaintext is secure.
4. Encrypt future conversation titles and summaries on write.
5. Decrypt conversation summaries/titles on read while preserving legacy plaintext compatibility.
6. Run encryption and memory tests until green.

### Task 6: Strengthen GDPR deletion behavior

**Files:**
- Modify: `src/app/api/emma/gdpr/route.ts`
- Create or modify: `tests/unit/gdpr.test.ts`
- Modify: `docs/explanation-security.md`

1. Add behavior-based tests for encrypted messages, conversations, legacy chat rows, memories, summaries stored on conversations, tasks, approvals, and action logs.
2. Make deletion fail visibly when a required table deletion fails instead of silently reporting success.
3. Delete direct user-owned operational records in foreign-key-safe order.
4. Explicitly document that tenant-owned/shared `client_integrations` are excluded pending an ownership policy and production-data audit.
5. Run the focused GDPR tests until green.

### Task 7: Verify the complete sprint

**Files:** All changed files

1. Run `npm run lint`.
2. Run `npm run test`.
3. Run `npm run build`.
4. Run `git diff --check`.
5. Run `git status`.
6. Review the full diff for plaintext logging, accidental legacy mutations, unrelated files, and missing default-off environment values.
