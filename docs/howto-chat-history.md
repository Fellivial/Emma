# Chat History Persistence

Emma stores current conversation history in Supabase using encrypted message
fields. The legacy plaintext `chat_messages` table is not an active write path.

## Prerequisites

- Supabase authentication and the current schema/migrations configured
- A valid `EMMA_ENCRYPTION_KEY` generated with `openssl rand -hex 32`
- `ENABLE_LEGACY_CHAT_FALLBACK=false` in production

Production sensitive writes fail closed when `EMMA_ENCRYPTION_KEY` is missing or
is not exactly 64 hexadecimal characters.

## Current storage model

- `conversations` groups messages. Future `title` and `summary` writes are
  encrypted; older plaintext values remain readable for compatibility.
- `messages` stores current history. `content` and `display` are encrypted with
  AES-256-GCM before insertion.
- `chat_messages` is a legacy plaintext table. New history writes never use it.

`POST /api/emma/history` writes through the encrypted `messages` and
`conversations` path. `GET /api/emma/history` reads encrypted history first.
Legacy fallback reads occur only when `ENABLE_LEGACY_CHAT_FALLBACK=true`; the
example and recommended production value is `false`.

## Verify persistence

1. Confirm the encryption key and Supabase environment variables are set.
2. Start Emma and send a user/assistant exchange.
3. Verify new `messages.content` and `messages.display` values begin with
   `enc:v1:` and no new `chat_messages` row appears.
4. Reload `/app` and confirm the encrypted conversation is restored.

## Legacy plaintext backfill

The backfill is manual and never runs from app startup, an API route, cron, or
the production build. It groups legacy rows into one encrypted conversation per
user per UTC day and records content-free provenance in a service-role-only
ledger.

```bash
# Dry-run only; this is the default
npx tsx scripts/backfill-legacy-chat.ts

# Apply only after reviewing the dry-run counts and production backup
npx tsx scripts/backfill-legacy-chat.ts --apply

# Explicit rollback of ledger-proven backfill records
npx tsx scripts/backfill-legacy-chat.ts --rollback --apply
```

Every mode requires `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and
`EMMA_ENCRYPTION_KEY`. Output contains aggregate counts only.

Do not truncate or directly delete from `chat_messages` as part of routine
operation. Retain it until the backfill report, rollback window, production-data
audit, and retention decision are complete. User erasure should go through the
GDPR endpoint so encrypted history, legacy history, and related records are
handled together.

## Troubleshooting

- **History is empty:** confirm encrypted `messages` exist. The legacy fallback
  is intentionally disabled unless explicitly enabled for emergency recovery.
- **Sensitive write fails in production:** verify `EMMA_ENCRYPTION_KEY` contains
  exactly 64 hexadecimal characters and matches the key used for existing data.
- **Backfill reports conflicts:** do not overwrite the target rows. Investigate
  the conflicting message IDs and conversation ownership before applying again.
- **Greeting appears over restored history:** verify the `historyReady === null`
  guard remains in the app history-loading flow.

## Related

- [API reference](reference-api.md)
- [Security explanation](explanation-security.md)
- [Privacy migration design](plans/2026-06-19-privacy-migration-design.md)
