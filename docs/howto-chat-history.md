# How to Enable Chat History Persistence

Make Emma's conversation survive page refreshes. Messages are saved to Supabase and reloaded on every `/app` visit, so the user's session continues exactly where they left off.

## Prerequisites

- Emma running with Supabase auth configured
- The `chat_messages` migration applied to your database

---

## Step 1: Apply the migration

The `chat_messages` table is defined in `supabase/migrations/20260523000002_chat_messages.sql`. Apply it:

```bash
# Via Supabase CLI (recommended)
supabase db push

# Or manually: paste the file contents into the Supabase SQL Editor and run
```

The migration creates:
- `chat_messages` table with `id`, `user_id`, `role`, `content`, `display`, `expression`, `created_at`
- An index on `(user_id, created_at desc)` for fast per-user queries
- Row-level security: users can only read and write their own messages

---

## Step 2: Verify it works

1. Start Emma and send a few messages
2. Reload the page
3. Your conversation reappears immediately — no greeting, no blank slate

That's all. The feature is automatic once the migration is applied and `NEXT_PUBLIC_SUPABASE_URL` is set.

---

## How it works

**On load:** `src/app/app/page.tsx` fetches `GET /api/emma/history` alongside memory loading. The history route returns the last 50 messages for the authenticated user, ordered chronologically.

**Race guard:** The greeting `useEffect` waits for `historyReady !== null` before running. This prevents a race where the greeting fires before history loads, which would display a welcome message on top of an existing conversation.

- `historyReady === null` → history check in progress, greeting blocked
- `historyReady.length > 0` → history found, restore it, skip greeting
- `historyReady.length === 0` → no history, show greeting

**On each exchange:** After Emma responds, a fire-and-forget `POST /api/emma/history` saves the user message and assistant response as a pair. The save uses upsert (idempotent — safe to call multiple times for the same message IDs).

**Excluded from history:**
- Refused responses (`event.refused = true`) — Emma declined to answer
- Context window exceeded responses (`event.contextWindowExceeded = true`) — these represent a truncated state that shouldn't be persisted

---

## Customizing

**Change the history limit** — the default is 50 messages. Edit the `.limit(50)` call in `src/app/api/emma/history/route.ts:23`.

**Clear history for a user** — delete from `chat_messages` where `user_id = '<uuid>'`.

**Disable persistence** — set `NEXT_PUBLIC_SUPABASE_URL` to empty or remove it; the history API returns `{ messages: [] }` and the client falls back to greeting-on-load behavior.

---

## Troubleshooting

**History not loading after migration** — check that the migration ran successfully. `select count(*) from public.chat_messages` should return without error.

**Greeting appears on top of history** — this was a race condition fixed by the `historyReady` pattern. If you see it, ensure `src/app/app/page.tsx` has the `historyReady === null` guard in the greeting `useEffect`.

**Messages not saving** — check the browser console for failed `POST /api/emma/history` requests. The most common cause: RLS policy mismatch (the user is not authenticated when the save fires).

---

## Related

- [Reference: API routes](reference-api.md) — `GET /api/emma/history` and `POST /api/emma/history` spec
- [Explanation: Architecture](explanation-architecture.md) — chat pipeline and state management
