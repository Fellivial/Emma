# Privacy Migration Design

## Goal

Eliminate routine access to legacy plaintext chat history, provide a safe and
repeatable path to encrypt legacy rows, and prevent production from silently
writing sensitive fields without a valid encryption key.

## Current Storage Audit

Emma has three chat-history stores:

- `chat_messages` is the legacy flat store. Its `content` and `display` columns
  are plaintext. New writes no longer use this table, but `/api/emma/history`
  can still read it as a fallback.
- `messages` is the current message store. `content` and `display` are passed
  through the AES-256-GCM field-encryption helper before insert and decrypted
  on read. Message IDs, roles, expressions, token estimates, ownership, and
  timestamps are plaintext metadata.
- `conversations` groups current messages. Its `title` and `summary` fields are
  encrypted on future writes and decrypted on read. Older plaintext titles and
  summaries remain backward-readable so existing conversations continue to
  load. Ownership, counts, and timestamps are plaintext metadata.

The current write path is `POST /api/emma/history` to `saveMessage()` in
`src/core/memory-db.ts`. It writes only `messages` and `conversations`.
Conversation title and summary updates are separate asynchronous writes from
the history route. The primary read path is `GET /api/emma/history`, which reads
the latest conversation and its encrypted messages before trying the legacy
flat table. The brain route also reads the latest conversation summary for
cross-session context.

GDPR deletion explicitly covers current and legacy history, memories, tasks,
approvals, logs, and directly user-owned auxiliary data. This includes
`user_mcp_servers`, `user_files`, `trials`, `trial_events`, `email_sequences`,
`affiliates`, affiliate referrals attached to an affiliate owned by the user,
and referral rows where the user is the referrer. `client_integrations` is
tenant-owned and may be shared; it is deliberately excluded from automatic
deletion in this sprint.

## Backfill Architecture

The backfill is an admin-only TypeScript CLI backed by a small service-role-only
migration ledger. It never runs from an API route, build, startup, cron, or
database migration. Dry-run is the default. Writes require `--apply`; rollback
requires both `--rollback` and `--apply`.

Legacy rows are grouped by `user_id` and the UTC date derived from
`created_at`. Rows within each group are ordered by `created_at`, then by `id`
as a stable tie-breaker. Each group targets one encrypted conversation.

The target message ID is the legacy message UUID rendered as text. This allows
former dual-written messages to be recognized without content-derived IDs. If
matching target messages already identify one conversation for the UTC day,
that conversation is reused. If no encrypted counterpart exists, the script
uses a deterministic UUID derived from a fixed namespace plus `user_id` and UTC
date. More than one existing target conversation, ownership mismatches, or
content/metadata conflicts are hard conflicts: the script reports aggregate
conflict counts and does not overwrite anything.

Missing messages are inserted with their original role, expression, and
timestamp. `content` and `display` are encrypted before insertion. The script
recomputes the target conversation's message count after successful inserts.

## Migration Ledger

The new ledger table contains no message content:

- `legacy_message_id uuid primary key`
- `user_id uuid not null`
- `utc_date date not null`
- `target_message_id text unique not null`
- `target_conversation_id uuid not null`
- `message_created_by_backfill boolean not null`
- `conversation_created_by_backfill boolean not null`
- `migrated_at timestamptz not null`

RLS is enabled with no `anon` or `authenticated` policies. Only service-role
operations may access it. The ledger is written after the target row is
verified or inserted. A rerun reconciles partial work: existing matching rows
are recorded, while mismatches remain conflicts.

Rollback first loads ledger records, deletes only target messages with
`message_created_by_backfill = true`, then deletes only conversations marked as
created by the backfill and proven empty. Pre-existing messages and
conversations are never deleted. Rollback removes ledger records only after
the corresponding rollback action succeeds.

## Runtime Safety

Legacy reads require `ENABLE_LEGACY_CHAT_FALLBACK` to equal `true`. The example
environment sets it to `false`. When disabled, history reads return encrypted
history or an empty result and never query `chat_messages`. Enabling the escape
hatch permits the legacy read-only query; it does not enable legacy writes.

The encryption helper validates that `EMMA_ENCRYPTION_KEY` is exactly 64
hexadecimal characters. In production, encryption throws a clear configuration
error when the key is missing or invalid. Development and tests retain the
existing plaintext fallback with a warning.

Future conversation titles and summaries are encrypted on write and decrypted
on read. Existing plaintext values remain readable through the helper's current
backward-compatible behavior. This sprint reports, but does not automatically
rewrite, unrelated historical plaintext already present in current tables.

## GDPR Coverage

The delete route explicitly deletes directly user-owned history, memory, task,
approval, action-log, task-summary, provenance, and other relevant user-scoped
records in foreign-key-safe order. Coverage includes `user_mcp_servers`,
`user_files`, `trials`, `trial_events`, `email_sequences`, `affiliates`, child
affiliate referrals for an affiliate owned by the user, and referral rows where
the user is the referrer. Required deletion failures are propagated rather than
reported as success. Logs and responses contain table names and counts, never
deleted content.

Tenant-owned `client_integrations` remain outside automatic GDPR deletion.
Deleting them for one user could revoke shared credentials for other members.
This limitation is documented as requiring a later tenant ownership and
credential-attribution policy.

## Testing

Behavior tests cover:

- disabled and explicitly enabled legacy fallback reads;
- production fail-closed encryption and development compatibility;
- encrypted summary and title writes plus backward-compatible reads;
- UTC-day grouping and stable ordering;
- deterministic IDs, dry-run, partial reruns, conflicts, and idempotency;
- rollback deleting only ledger-proven backfill records;
- GDPR deletion of legacy and current history plus directly user-owned task and
  log records.

Source-text assertions are limited to static environment and SQL policy
configuration where a runtime test is not practical.

## Deployment Sequence

1. Deploy the ledger migration, fallback gate, encryption validation, encrypted
   conversation metadata, GDPR updates, and backfill CLI.
2. Confirm `ENABLE_LEGACY_CHAT_FALLBACK=false` and a valid production
   `EMMA_ENCRYPTION_KEY`.
3. Run the backfill in dry-run mode and review aggregate counts.
4. Run a scoped apply, verify counts and encrypted reads, then expand to all
   users only after the scoped run succeeds.
5. Keep `chat_messages` and the migration ledger intact during the observation
   period. Any later deletion requires a separate production data audit and
   explicit migration.

## Non-Goals

- Dropping or truncating `chat_messages`
- Automatically deleting tenant-owned integrations
- Changing persona, prompts, or chat behavior
- Automatically running the backfill in production
- Logging message content or plaintext values
