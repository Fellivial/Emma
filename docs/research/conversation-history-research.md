# Conversation History Persistence — Research Notes

> **Status: RESEARCH ONLY — do not implement until instructed.**

Researched: 2026-05-31
Researcher: Claude Code (Sonnet 4.6)

---

## Context: What Emma Has Today

Before the findings: a quick map of the current state so the gap is clear.

**What exists:**

- `chat_messages` table (migration `20260523000002_chat_messages.sql`) — flat table per user, no conversation grouping, no encryption, plain `content` + `display` text columns, cascade-delete from `auth.users`.
- `/api/emma/history` — GET returns last 50 messages ordered by `created_at`; POST upserts a pair (user + assistant) as a fire-and-forget after each exchange.
- `src/app/app/page.tsx` — fetches history on mount with `historyReady` guard; greeting is suppressed if history comes back non-empty.
- `saveMessage()` in `memory-db.ts` — a parallel (unused in production flow today) path that writes to the `messages` table with `encrypt(content)` and `encrypt(display)`, linked to a `conversations` row.
- `/api/emma/summarize` — an LLM-powered summarizer using `MODEL_UTILITY`, already complete, but not wired into the persistence or context-injection flow.
- `/api/emma/gdpr` — deletes from `messages` + `conversations` tables (the encrypted path), but **does not delete from `chat_messages`** (the active flat path). This is a current GDPR gap.
- `conversations` table in `schema.sql` has `title text` and `summary text` columns — not populated by anything today.

**Key structural tension:**
There are two competing persistence paths: the active `chat_messages` flat path (simple, unencrypted, no conversation grouping) and the `messages`/`conversations` path in `memory-db.ts` (encrypted, grouped, unused in the main flow). Unifying these is the core architectural decision.

---

## 1. Conversation Persistence Patterns

### When to Write

The consensus across sources is **immediate per-exchange persistence** rather than batching.

Emma already does this correctly: fire-and-forget `POST /api/emma/history` after each `done` event. The upsert-on-conflict-id pattern means duplicate calls are safe.

**What the sources say:**

- "When a new message is received, the server should immediately validate and store it before broadcasting" — immediate write is the standard.
- Supabase Realtime docs: "use the `onMessage` callback if you want to store messages permanently" — write on receipt, not on batch flush.
- The current 50-message limit on GET is a reasonable default. Sources recommend "last 50, with pagination for older" as the production pattern. Infinite scroll / load-more for history is the standard UX for long-running sessions.

**What Emma is missing on write timing:**

- The fire-and-forget has no retry. If the POST fails silently (e.g. network blip), that exchange is lost. A localStorage pending-queue fallback would cover this.
- Refused responses (`event.refused`) are correctly excluded. Context-exceeded responses are also excluded — this is correct; persisting a truncated exchange would corrupt the reconstructed history.

### Optimistic Updates

The current pattern is already optimistic: the UI updates immediately from React state; the `POST /api/emma/history` is a background write that does not block the UI.

On page load, the pattern is:

- `historyReady === null` — history fetch in progress, greeting blocked.
- `historyReady.length > 0` — restore history, skip greeting.
- `historyReady.length === 0` — show greeting.

This is a correct loading-state guard. The only gap: there is no loading skeleton shown to the user while `historyReady === null` (it just shows nothing / the greeting is held). A subtle "Loading your conversation..." state would improve perceived UX.

### Conversation Grouping

`chat_messages` is a flat per-user table. All messages from all sessions are one bucket. This means:

- No concept of "start a new conversation."
- No per-conversation title.
- History loads the last 50 messages from any session, not just the current session.

The `conversations` + `messages` schema in `schema.sql` already models grouped conversations correctly, but the main flow does not use it. Migrating to that schema is the path to conversation titling, per-session history, and conversation switching.

---

## 2. Message Content Encryption

### Current State

`chat_messages.content` is stored **plaintext** (confirmed in `docs/explanation-security.md`: "What is NOT encrypted — chat_messages.content — conversation history stored plaintext").

The parallel `saveMessage()` path in `memory-db.ts` does encrypt: `encrypt(msg.content)` and `encrypt(msg.display)` using the same AES-256-GCM function from `src/core/security/encryption.ts` that memories use. This path is not the active one.

### Decision Matrix: Encrypt vs. Not Encrypt

| Dimension                   | Encrypt message content                                                                                                                         | Do not encrypt                                             |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Protection scope**        | Protects against DB admin reads, SQL injection data leaks, backup exposure                                                                      | Only disk-level Supabase encryption (physical access only) |
| **GDPR / insider threat**   | Meaningful defence; content unintelligible without `EMMA_ENCRYPTION_KEY`                                                                        | Admin with DB access can read all conversations            |
| **Searchability**           | None — cannot `ILIKE`, `tsvector`, or full-text search encrypted blobs                                                                          | Full Postgres text search, `ILIKE`, `tsvector` possible    |
| **Performance overhead**    | ~22% average overhead on column reads (measured in DuckDB SGX study); per-field AES-GCM is fast in Node.js (sub-ms for typical message lengths) | Baseline                                                   |
| **Key rotation complexity** | Must re-encrypt all rows on key change; no automated tooling in Emma today                                                                      | Not applicable                                             |
| **Key management**          | One shared `EMMA_ENCRYPTION_KEY` for all users — same key protects all messages; compromise exposes all history                                 | Not applicable                                             |
| **Export (GDPR art. 20)**   | Must decrypt at export time — `/api/emma/gdpr` export already does this for memories                                                            | Trivial                                                    |
| **Incremental cost**        | Zero at rest; decrypt on every GET (marginal CPU)                                                                                               | Zero                                                       |
| **Existing infra**          | `encrypt()`/`decrypt()` already in `src/core/security/encryption.ts`, already used by `saveMessage()`                                           | —                                                          |

**Verdict:** Encrypt. Emma already has the infrastructure (`saveMessage()` in `memory-db.ts` uses it), memories already encrypt at all tiers. Message content is PII of the highest sensitivity — it is the actual conversation. The searchability loss is not a real loss for Emma: there is no server-side message search feature today, and any future search would be semantic (vector) rather than text-match.

The shared key per deployment (not per-user) is an acceptable tradeoff at Emma's current scale. Per-user keys would require key derivation from the user's credentials, adding significant complexity for marginal gain on a single-tenant deployment.

---

## 3. GDPR Compliance

### Current Gap

`/api/emma/gdpr` with `action: "delete"` deletes from `messages` and `conversations` (the encrypted path) but **does not delete from `chat_messages`** (the active flat path). This means GDPR erasure is currently incomplete.

The deletion order in the GDPR route matters due to FK constraints:

1. `messages` — then `conversations` (messages.conversation_id references conversations.id CASCADE, but explicit delete order is safer)
2. `chat_messages` — **currently missing from the deletion list**

### Cascade Delete Coverage

`chat_messages` migration: `user_id uuid not null references auth.users on delete cascade` — so deleting the `auth.users` row cascades. However, `auth.users` deletion is explicitly avoided in the GDPR route ("Auth account preserved"). That means cascade delete does not fire, and only an explicit `DELETE FROM chat_messages WHERE user_id = ?` will clear the data.

`messages` table: `user_id uuid references public.profiles on delete cascade` — profiles cascade from `auth.users`, so if auth deletion is ever used, this cascades. The GDPR route explicitly deletes from `messages` by `user_id`, which is correct.

`conversations` table: same cascade chain from `profiles`.

### RLS Policy Review

**`chat_messages` (active path):**

```sql
create policy "Users manage own messages"
  on public.chat_messages for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

This is a `for all` policy — covers SELECT, INSERT, UPDATE, DELETE. It is correct for user-facing access. Service role bypasses this for admin operations.

**`messages` (encrypted path):**

```sql
create policy "Users own messages" on public.messages for all using (auth.uid() = user_id);
```

Same pattern, correct.

**`conversations`:**

```sql
create policy "Users own conversations" on public.conversations for all using (auth.uid() = user_id);
```

Correct.

**Gap:** Both message tables use `for all` single-policy patterns. Supabase docs recommend splitting into separate SELECT / INSERT / UPDATE / DELETE policies for clarity and to avoid future policy drift. For now, the `for all` pattern is functionally correct.

**Performance:** Supabase docs recommend `(select auth.uid())` (subquery form) over direct `auth.uid()` function call in policies to avoid repeated function evaluation on row-by-row scan. Neither active policy uses the subquery form. On large message tables this matters at scale.

### GDPR Export

The export path decrypts memories before returning them. If message content becomes encrypted, the export path must also decrypt `content` and `display` fields before returning. The pattern from the memories export already shows how to do this inline.

---

## 4. Cross-Session Context Injection

### Current State

Emma's brain route (`/api/emma/route.ts`) injects up to `MAX_HISTORY_MESSAGES = 20` messages from the current React state as `messages[]` in the API request. This is pure in-memory — no cross-session context exists. The `buildSystemPrompt()` in `personas.ts` has no `summary` or `previousContext` parameter.

`/api/emma/summarize` exists and is functional but is not called from the main flow.

### Strategy Comparison

| Strategy                               | Description                                                                                             | Pros                                                                         | Cons                                                                                      | Fit for Emma                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Sliding window (current)**           | Last N messages verbatim                                                                                | Simple, zero DB reads                                                        | No cross-session memory; loses context on refresh                                         | Current baseline only                                                            |
| **DB history reload**                  | Load last 50 messages from DB on mount                                                                  | Restores within-session continuity across refreshes                          | Still no cross-session summary; 50 messages can be 15–25k tokens if naively injected      | What the current `chat_messages` path provides — but not injected into API calls |
| **LLM-generated summary stored in DB** | After N messages or end of session, call `/api/emma/summarize`; store result in `conversations.summary` | Sub-50ms retrieval; 80–90% token reduction vs raw history; semantically rich | Async summarization adds latency/cost; summary goes stale if not updated                  | Best fit for Emma — infrastructure is 80% built                                  |
| **Vectorized memory / RAG**            | Embed each message; retrieve top-K relevant past messages via cosine similarity                         | Highly targeted; scales to unlimited history                                 | Requires vector DB (pgvector extension or separate service); significant infra investment | Future state only                                                                |
| **Recursive summarization**            | Summarize older segments progressively; most recent verbatim                                            | Handles arbitrarily long histories                                           | Complex implementation; risk of summary drift over many recursions                        | Over-engineered for Emma's current scale                                         |

**Recommended approach for Emma: LLM-generated session summary injected at conversation start.**

The flow:

1. On session end (or when message count crosses a threshold, e.g. 30 messages), call `POST /api/emma/summarize` with the last 30 messages and any existing `conversations.summary`.
2. Store the returned summary in `conversations.summary`.
3. On next session load, fetch the most recent `conversations.summary` for the user.
4. Inject it into `buildSystemPrompt()` as a `previousContext` parameter.

The summarizer prompt already says: "If a previous summary is provided, merge it with the new messages — don't repeat what's already summarized." This incremental/merge behavior is already designed in.

**Token budget:** A 500-word summary (the summarizer's stated cap) is approximately 650 tokens. Adding this to the system prompt increases context cost by ~650 tokens per request — negligible vs. the 15–25k cost of injecting 50 raw messages.

**When to trigger summarization:**

- Option A (session-end): Triggered when the user closes the tab or navigates away (`beforeunload` event). Unreliable on mobile.
- Option B (threshold): Triggered server-side when `messages` count on a conversation crosses a threshold (e.g. 30 messages). Can be done in a Vercel cron or inline in the brain route.
- Option C (lazy on next load): When loading a conversation, if `message_count > N` and `summary` is null or stale, trigger summarization before injecting context. Adds latency to first message of a new session.

Option B (threshold trigger, inline or cron) is most reliable and avoids `beforeunload` fragility.

**Microsoft Agent Framework constraints (always apply regardless of strategy):**

- Always preserve the system message — never summarize it away.
- Never separate tool-call request/response pairs. Emma does not use tool-call pairs in message history today, so this is a non-issue currently.

---

## 5. Conversation Titling

### Current State

`conversations.title` column exists in the schema; it is `text` (nullable). Nothing writes to it today.

### Strategy Comparison

| Strategy                                | Mechanism                                                                                                          | Latency                       | Quality                                 | Cost                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------- | --------------------------------------- | ---------------------------- |
| **First message truncation**            | Take first user message, truncate to 40–60 chars, strip punctuation                                                | Zero                          | Poor for long or complex first messages | Zero                         |
| **First message NLP slice**             | Extract first noun phrase or sentence fragment from first message                                                  | ~0ms (regex/heuristic)        | Acceptable                              | Zero                         |
| **Async LLM call after first exchange** | Fire-and-forget call to `MODEL_UTILITY` after first response: "Give this conversation a title in 6 words or fewer" | ~1–3s async, non-blocking     | Excellent; context-aware                | ~200 tokens per conversation |
| **Summary-derived title**               | Extract title from the summary when summarization runs                                                             | Same as summarization trigger | Good                                    | No additional cost           |

**Industry pattern:** ChatGPT and Claude.ai both use an async LLM call fired after the first user message to generate a 4–6 word title. The call is non-blocking — the title appears shortly after the first exchange without blocking the chat flow. Claude Code's session titling (GitHub issue #47176) validates the "async LLM call, not truncation" as the preferred approach.

**Recommended approach for Emma:** Async LLM call via `MODEL_UTILITY` after the first exchange, updating `conversations.title`. The title prompt can be minimal: "Title this conversation in 5 words or fewer, based on the first exchange." Fire-and-forget, same pattern as the history POST. If the call fails, fall back to first-message truncation.

A secondary fallback display rule: if `title` is null, show "today at HH:MM" using `conversations.created_at`.

---

## 6. Offline / Optimistic UI

### Current State

Emma's fire-and-forget `POST /api/emma/history` has no retry, no queue, and no offline fallback. If the save fails, the exchange is silently lost — on next page load, those messages are gone.

### Recommended Patterns

**Tier 1 — localStorage pending queue (simple, sufficient for current scale):**

Before sending history to the server, write the pair to `localStorage` under a key like `emma_pending_history`. After the server confirms (200 OK on the history POST), clear the pending entry. On page load, if `localStorage` has pending entries, re-submit them.

This covers the common case: brief network blip, tab closed unexpectedly, server momentarily unavailable.

**Tier 2 — IndexedDB + service worker (robust, complex):**

IndexedDB handles gigabytes vs. localStorage's 5–10 MB cap, supports ACID transactions, and pairs with service workers for background sync. The service worker processes the pending queue even when the tab is closed. This is the correct architecture for a native-like experience.

For Emma's current scale and UX (single-tab, authenticated web app, not a native PWA), Tier 1 is the right call. Tier 2 is appropriate if Emma targets mobile with offline-first requirements.

**Storage choice table:**

| Property                   | localStorage                     | IndexedDB                    |
| -------------------------- | -------------------------------- | ---------------------------- |
| Capacity                   | 5–10 MB                          | Multiple GB                  |
| API                        | Synchronous (blocks main thread) | Async (Promise/cursor)       |
| Data types                 | Strings only                     | Objects, blobs, typed arrays |
| Transaction support        | No                               | Yes (ACID)                   |
| Service worker access      | No                               | Yes                          |
| Fit for Emma pending queue | Yes (small payloads)             | Overkill for current scale   |

**Conflict resolution:** Since Emma conversations are append-only (no edit/delete of messages), conflict resolution is trivial — just replay the pending inserts in order. No CRDT needed.

**User transparency:** Show a subtle "Saving..." or "Unsaved" indicator when a history POST is in-flight or failed. Currently there is none.

---

## Recommended Implementation Order (when instructed)

This section is forward-looking — do not act on it until explicitly asked.

1. **Fix the GDPR gap** — add `chat_messages` deletion to `/api/emma/gdpr`. Single-line fix, zero risk.
2. **Migrate to `messages`/`conversations` schema** — retire `chat_messages` as the active path; use `saveMessage()` from `memory-db.ts`, which already encrypts and already uses the right schema. The GET history route would query `messages` joined to `conversations` instead of `chat_messages`.
3. **Wire summarization** — trigger `/api/emma/summarize` at 30-message threshold, store in `conversations.summary`, inject into `buildSystemPrompt()` as `previousContext`.
4. **Add conversation titling** — async LLM call after first exchange; update `conversations.title`.
5. **Add localStorage pending queue** — wrap the history POST with a pending-write / retry loop.

---

## Open Questions

- **Single vs. multi-conversation UI:** Today Emma has one perpetual conversation per user. Adding a conversation switcher (sidebar with conversation list) is a separate UX decision independent of persistence. The schema supports it; the UI does not yet.
- **chat_messages migration plan:** Existing `chat_messages` rows need to be migrated or discarded when switching to the `messages` table. Since `chat_messages` content is plaintext, migration would require encrypting all existing rows — a one-time migration script.
- **pgvector for RAG:** Supabase supports `pgvector`. If semantic search across past conversations becomes a requirement, enabling the extension and adding embeddings columns is feasible. Not recommended until the simpler summary approach proves insufficient.
- **RLS performance at scale:** The `for all` policies and direct `auth.uid()` calls (not the subquery form) will degrade on large message tables. Not a concern until message volume is high, but the fix is a one-line policy update.

---

## Sources

- [Supabase Realtime Chat (Next.js)](https://supabase.com/ui/docs/nextjs/realtime-chat) — Supabase Docs, 2025
- [Using Realtime with Next.js](https://supabase.com/docs/guides/realtime/realtime-with-nextjs) — Supabase Docs, 2025
- [Row Level Security — Supabase Docs](https://supabase.com/docs/guides/database/postgres/row-level-security) — Supabase Docs, 2025
- [LLM Chat History Summarization: Best Practices (October 2025)](https://mem0.ai/blog/llm-chat-history-summarization-guide-2025) — mem0.ai, Oct 2025
- [Managing Chat History for LLMs — Microsoft Agent Framework](https://devblogs.microsoft.com/agent-framework/managing-chat-history-for-large-language-models-llms/) — Microsoft DevBlogs, 2025
- [Implementing Message Persistence in Real-Time Chat Applications](https://dev.to/hexshift/implementing-message-persistence-in-real-time-chat-applications-18eo) — DEV Community, 2024
- [Database Encryption in 2026: A Security-First Implementation Guide](https://www.bioquro.com/2026/05/database-encryption-in-2026-security.html) — bioquro.com, May 2026
- [Offline-First Frontend Apps in 2025: IndexedDB and SQLite](https://blog.logrocket.com/offline-first-frontend-apps-2025-indexeddb-sqlite/) — LogRocket Blog, 2025
- [Frontend System Design: Building a Web Chat Application](https://dev.to/vishwark/frontend-system-design-deep-dive1-building-a-web-chat-application-5c8j) — DEV Community, 2024
- [AI Chat UI Best Practices: Designing Better LLM Interfaces](https://dev.to/greedy_reader/ai-chat-ui-best-practices-designing-better-llm-interfaces-18jj) — DEV Community, 2024
- [Feature: Native auto-session-title generation on first user message](https://github.com/anthropics/claude-code/issues/47176) — GitHub, Anthropic/claude-code
- [Recursively Summarizing Enables Long-Term Dialogue Memory in LLMs](https://arxiv.org/pdf/2308.15022) — arXiv, 2023
- [Evaluation of AES Encryption Impact on Query Performance](https://www.mdpi.com/2410-387X/9/4/77) — MDPI Cryptography, 2025
- [Building an Optimistic UI with RxDB](https://rxdb.info/articles/optimistic-ui.html) — RxDB Docs, 2024
