# ADR 0002: Companion State Persistence — cross-session presence without abusing memory

- **Status:** Accepted
- **Date:** 2026-07-13
- **Phase:** 6 — "Natural Expansion"
- **Implementation:** `src/core/companion-state.ts`, `supabase/migrations/20260713000001_companion_state.sql`, `src/app/api/emma/presence/route.ts`

---

## Problem Statement

Emma's presence today ends when the tab closes. The only cross-session signal is `localStorage["emma_last_session"]` — a raw epoch timestamp read by `greeting-engine.ts` — and the fused `EmotionState` in `emotion-engine.ts` lives in React state that resets on reload. The consequences:

1. **Device amnesia.** On a new device (or after clearing site data) Emma greets a months-long user as a first-time visitor.
2. **Emotional discontinuity.** A user who ended last night's session stressed gets a playful "Miss me?" this morning — the greeting engine has no idea how the last session ended.
3. **No substrate for later phases.** Relational pattern intelligence ("you've seemed tense this week") requires _some_ persisted emotional trace; today there is none, by construction.

The architecture doc has carried this as an explicit deferral since Phase 4 ("Cross-session presence… requires a new table and migration").

## Why companion state is separate from long-term memory

The `memories` table is the wrong home for session state, deliberately:

- **Different semantics.** Memories are durable facts with a confidence score, a supersession chain (`status`, `superseded_by`), and a fixed category enum (`preference, habit, personal, goal, relationship, context, constraint`). "The user's last session ended at 23:40 feeling tired" is not a fact about the user — it is a snapshot of a moment, wrong within hours and worthless within weeks.
- **Different lifecycle.** Memories are extracted by an LLM, pruned by relevance, and surface in the system prompt through `getRelevantMemoriesForUser`. Companion state is written deterministically by code on every exchange and overwritten in place. Routing it through memory would pollute retrieval ranking with ephemeral rows and force fake `category`/`key`/`confidence` values.
- **Honesty constraint.** The product-identity checklist requires Emma to feel continuous _without pretending to remember more than she does_. A single overwritten snapshot ("last time you were here…") is honest presence. Injecting session snapshots into the memory system would let them masquerade as durable knowledge.

Behavior remains governed by ADR-0001: companion state is a **data source consumers may read** (greeting engine now; notifications later) — it does not add a second behavioral decision layer.

## What is persisted

One row per user (`companion_state`, PK `user_id`), overwritten in place:

| Column                  | Content                                                                | Stored as               |
| ----------------------- | ---------------------------------------------------------------------- | ----------------------- |
| `last_interaction_at`   | Timestamp of the user's last exchange with Emma                        | plaintext `timestamptz` |
| `last_greeting_context` | Which greeting bucket was last used (`morning`, `quick_return`, …)     | plaintext bounded enum  |
| `last_mood`             | Primary label of the last fused emotion (`stressed`, `happy`, …)       | **encrypted** text      |
| `last_emotion`          | Last emotion snapshot `{primary, valence, arousal, confidence}` (JSON) | **encrypted** text      |
| `last_proactive_topic`  | Topic of the last proactive/companion nudge, if any                    | **encrypted** text      |
| `presence_summary`      | One short line of session context ("late-night session, ended calm")   | **encrypted** text      |
| `updated_at`            | Row bookkeeping                                                        | plaintext `timestamptz` |

## What is NOT persisted

- **No transcripts or message content** — conversations/messages already own that, with their own encryption.
- **No emotion history/time series** — only the latest snapshot; a longitudinal emotional record is a Phase 7+ decision that must come back through an ADR (it is the substrate pattern-intelligence deepening was deferred for).
- **No vision frames or screen content** — vision analyses remain transient by design.
- **No derived intimate detail** — nothing beyond the six fields above; specifically no free-text about _why_ the user felt something. The `presence_summary` is generated from bounded, code-controlled inputs (time-of-day, mood label), never from conversation text.
- **No device identifiers** — the row is per-user, not per-device.

## Privacy implications

Mood and emotional trajectory are among the most intimate data Emma holds — arguably more sensitive than most memory rows. Treatment:

- Written **server-side only** (service role) from state the server already processes per-request (the brain route already receives `EmotionState` on every message). No new collection occurs — only retention of the latest value.
- Encrypted at the field level before insert (below), so DB operators, backups, and SQL injection see ciphertext.
- Surfaced back to the user transparently: the greeting may reference it ("you seemed wiped out last night") — the user always _sees_ what Emma retained, and a stale row (30 days) is ignored rather than surfaced.
- Included in GDPR export (decrypted for the user) and deletion, like every other user-owned table.

## Encryption requirements

- `last_mood`, `last_emotion`, `last_proactive_topic`, `presence_summary` MUST pass through `encrypt()` / `decrypt()` from `src/core/security/encryption.ts` (AES-256-GCM, `enc:v1:` prefix, `EMMA_ENCRYPTION_KEY`, rotation via `EMMA_ENCRYPTION_KEY_PREVIOUS` — same contract as `memory-db.ts`).
- `last_interaction_at` and `last_greeting_context` stay plaintext: they contain no user content (a timestamp and a bounded enum of Emma's own greeting buckets) and the timestamp must be queryable for staleness.
- The key-rotation script (`scripts/rotate-encryption-key.ts`) must include the new table's encrypted columns.

## Export / deletion requirements

- Add `companion_state` to `USER_OWNED_DELETE_ORDER` and `GDPR_EXPORT_TABLES` in `src/app/api/emma/gdpr/route.ts` (the table-driven GDPR surface).
- Add the encrypted column names to `decryptExportRow`'s key list so exports return plaintext to the user.
- `on delete cascade` from `auth.users` as defense in depth.

## RLS requirements

- `enable row level security` with the standard owner policy: `for all using (auth.uid() = user_id) with check (auth.uid() = user_id)` — same shape as `memories`/`push_subscriptions`.
- Server writes use the service role (bypasses RLS), matching every other server-written user table.

## Multi-device behavior

- One row per user, **last-writer-wins** upsert on `user_id`. No per-device rows, no merge logic — the newest interaction anywhere is the truth "when did we last talk".
- On app load the client fetches `GET /api/emma/presence`; the greeting engine uses the **most recent** of (server `last_interaction_at`, local `emma_last_session`) so a same-device return stays accurate even if the server row lags, and a new device inherits continuity instead of a first-visit greeting.
- `localStorage` is retained as a resilience fallback (offline, DB unavailable), not as a second source of truth.

## Expiration / retention rules

- **Overwrite-in-place**: the table never accumulates history — total stored state per user is one row, ever.
- **Read-time staleness**: state older than **30 days** is treated as absent (Emma should not claim presence over a gap that long; the greeting engine's own `very_long_absence` bank handles the reunion instead). Implemented as a pure, tested predicate, not a cron.
- Deleted with the account via GDPR deletion and the FK cascade.
- Failure posture is **fail-open like usage enforcement**: a read/write error yields "no presence state" and never blocks or delays chat.

## Migration strategy

1. Additive migration `20260713000001_companion_state.sql` (also appended to `supabase/schema.sql` for fresh installs). No backfill — presence accumulates naturally from the first post-deploy exchange; until then the greeting engine behaves exactly as today (localStorage only).
2. Consumers adopt incrementally: greeting engine in Phase 6; companion notifications may read `last_proactive_topic` next; pattern intelligence explicitly must NOT consume this single snapshot as if it were a history.
3. Rollback: stop reading (the greeting engine treats absent state as today's behavior); the table sits inert. Dropping it loses only ephemeral snapshots by design.

## Alternatives considered

- **Store session state as `memories` rows** (e.g. category `context`, key `last_session`). Rejected — see "Why separate from long-term memory": wrong semantics, pollutes retrieval, fakes confidence, and lets ephemeral state impersonate durable knowledge.
- **Server-side sessions table with full history (append-only).** Rejected for Phase 6: retains an emotional time series nobody consumes yet — maximal privacy cost for zero current product value. Revisit behind its own ADR when pattern intelligence needs it.
- **Extend `profiles` with presence columns.** Rejected: `profiles` is settings-shaped, read broadly by the client; mixing encrypted ephemeral state into it widens the audience for the most intimate fields and complicates RLS reasoning.
- **Keep localStorage, sync via browser storage APIs.** Rejected: cannot cross devices, silently lost on data clearing, and leaves emotional continuity client-controlled where Emma cannot use it server-side (notifications, future cron greetings).
