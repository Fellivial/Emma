# Architecture: How Emma Works

Emma is a Next.js application with a streaming AI brain at its center. Every chat message travels through a four-stage pipeline before the user sees a response.

---

## The Chat Pipeline

```
User types message
       │
       ▼
sanitiseInput()          ← src/core/security/sanitise.ts
  - length limit (10K chars)
  - strip zero-width / control chars
  - detect injection patterns
  - block on HIGH threat + multiple flags
       │
       ▼
checkUsage()             ← src/core/usage-enforcer.ts
  - read current 5-hour UTC-aligned window from usage_windows
  - if window ≥ 100% → return blocked
  - if window ≥ 80% and warning not sent → return warning
  - fail-open on DB error
       │
       ▼
POST /api/emma            ← src/app/api/emma/route.ts
  - build system prompt blocks (stable + dynamic)
  - call OpenRouter chat completions API (streaming)
  - attach tools: web_search, web_fetch, integration tools, MCP tools
  - stream SSE deltas to client
       │
       ▼
parseEmmaResponse()      ← src/core/command-parser.ts
  - extract [emotion: <expr>] from tail
  - extract [EMMA_ROUTINE]<id>[/EMMA_ROUTINE] if present
  - strip both tags from display text
       │
       ▼
Client handles done event
  - update avatar expression
  - trigger routine if found
  - save to chat history (POST /api/emma/history)
  - record usage (recordUsage())
```

---

## The System Prompt: Two Parts

Emma's system prompt is assembled in `buildSystemPromptBlocks()` as two logical parts, then concatenated into a flat string before being sent to OpenRouter:

**Part 1 — Stable**  
Contains: persona, response length rules, routine instructions, avatar expression rules, available tools, memories, active user profile.

Kept separate from the dynamic part because it's large and changes rarely. If you switch to a provider that supports prompt caching (e.g. native Anthropic SDK), this part is the right unit to mark cacheable.

**Part 2 — Dynamic**  
Contains: current screen description (from vision), detected emotion state.

Omitted entirely when neither is present. Changes every turn — keeping it separate from the stable part avoids unnecessary churn if caching is later re-enabled.

```
buildSystemPromptBlocks()        ← src/core/personas.ts
  returns [
    { type: "text", text: stablePrompt },
    { type: "text", text: dynamicContext }  // omitted if empty
  ]
// Joined into a flat string before the OpenRouter call
buildSystemPrompt()  →  stablePrompt + "\n\n" + dynamicContext
```

---

## Behavior Flags: State → Behavior, Deterministically

Before the system prompt is assembled, the brain route derives a set of **behavior flags** — the single source of truth for behavioral decisions (see [ADR 0001](adr/0001-behavior-flags.md)):

```
persona baseline → custom persona settings → memory preferences → emotion/time modulation
        │
        ▼
deriveBehaviorFlags()           ← src/core/behavior-flags.ts (pure, deterministic)
        │
        ├──► personas.ts        renders compact "## Behavior Directives" in the dynamic block
        └──► response-validator confirms the reply honored the flags (log-only)
```

Five flags: `verbosity`, `emojiUsage`, `teasingLevel`, `warmth`, `initiative` — small closed enums, each mapping to a concrete directive and (where checkable) a validator rule.

Key invariants:

- Durable preferences beat per-turn emotion for style flags — a sad user who hates emojis still hates emojis.
- Negative emotion always suppresses teasing, and can only ever lower it — distress leads with care, regardless of persona or preference.
- A fully-baseline flag set renders zero extra prompt text.

After the full response is parsed, `validateResponseBehavior()` (`src/core/response-validator.ts`) checks emoji usage, prose length, and teasing markers against the flags. Violations are logged and surfaced as `behaviorViolations` in the SSE `done` event — observability only, the response is never rewritten.

---

## The Emotion Tag

Every response from Claude ends with `[emotion: <expression>]`. This is not shown to users.

Why it's in the response tail rather than a separate API call:

1. Zero additional latency — it arrives with the response, not after it
2. No extra API call cost
3. Grounded in the actual response text — the expression matches what Emma just said

The `done` SSE event strips the tag and includes `expression` as a separate field. The client sends `expression` to the avatar engine independently of the display text.

Available expressions: `neutral`, `smirk`, `warm`, `concerned`, `amused`, `skeptical`, `listening`, `flirty`, `sad`, `idle_bored`

---

## Usage Enforcement: Fail-Open

The enforcer checks a **single 5-hour UTC-aligned rolling window** before every brain call. Windows align to UTC blocks: 00:00–04:59, 05:00–09:59, 10:00–14:59, 15:00–19:59, 20:00–23:59. Using one window per-period (rather than three concurrent daily/weekly/monthly windows) simplifies enforcement and avoids edge cases around timezone-aware window boundaries.

**The enforcement is intentionally fail-open:** if the Supabase database is unreachable, `checkUsage()` returns `{ status: "ok" }` and the request proceeds.

This is a deliberate availability trade-off: a broken metering database should not cause Emma to stop working for users. The alternative — blocking all requests when metering fails — would be worse for users and indistinguishable from an outage.

Blocked requests return `{ refused: true }` in the SSE `done` event rather than an HTTP 4xx. This allows the client to display an in-persona block message instead of a generic error.

---

## Chat History Race Guard

When the app loads, two things happen in parallel:

1. `fetchMemories()` — loads user's persistent memories
2. `fetch("/api/emma/history")` — loads the last 50 messages

To avoid a blank screen while history loads, Emma shows a greeting immediately on mount and replaces it when history arrives:

- **Effect 1** — runs on mount. Renders the greeting immediately. The user sees something in under one frame (~16ms) instead of waiting 100–400ms for the DB round-trip.
- **Effect 2** — runs when `historyReady` resolves. If history is non-empty, replaces the greeting with the real conversation. If empty, the greeting stays.

The chat panel shows pulsing skeleton bubbles while `historyReady === null` and messages are empty, so returning users see visual continuity rather than a flash.

`historyReady` is a three-state variable:

- `null` — history fetch in progress (skeleton shown)
- `[]` — no history found (greeting stays)
- `[...messages]` — history loaded (greeting replaced)

---

## Supabase Auth + Middleware

`src/proxy.ts` handles auth and routing for every request. It:

1. Refreshes the Supabase session cookie if needed
2. Redirects unauthenticated requests to `/login` (except public paths)
3. Redirects waitlisted users (not yet approved) to `/waitlist`
4. Redirects already-authenticated users hitting `/login`, `/`, or `/landing` back to `/app`

Public paths that bypass auth:

- `/login`, `/register`, `/auth/callback`
- `/landing`, `/waitlist`
- `/api/waitlist`, `/api/emma/webhook`, `/api/emma/unsubscribe`

API routes (`/api/*`) bypass the middleware redirect — each route handler performs its own auth check internally.

When `NEXT_PUBLIC_SUPABASE_URL` is not set, the middleware is a no-op — useful for local dev without Supabase.

---

## Streaming Architecture

Emma uses Server-Sent Events (SSE), not WebSockets. Every brain route response is a stream of `data: {...}\n\n` lines.

Why SSE instead of WebSockets:

- SSE is unidirectional (server → client), which matches the chat pattern
- Works over standard HTTP — no connection upgrade, compatible with edge runtimes
- Simpler reconnection logic than WebSockets
- Vercel's Edge Runtime supports SSE natively

The `stream-client.ts` client handles the SSE stream, collects partial deltas into full text, and fires the `done` callback when the stream ends.

---

## Prompt Injection Defense

Every message is run through `sanitiseInput()` before reaching Claude. The sanitiser:

- Truncates messages over 10,000 characters
- Removes zero-width and direction-override Unicode characters
- Collapses repeated-character spam
- Pattern-matches 16 known injection categories (instruction override, persona hijack, DAN mode, etc.)
- Blocks on HIGH severity when any high-severity pattern matches (e.g. `instruction_override`, `jailbreak_keyword`, `dan_mode`)

MEDIUM and LOW pattern matches are flagged but not blocked — the message reaches Claude with the threat metadata attached. This is intentional: blocking "what are your instructions?" would prevent legitimate questions. Only unambiguous HIGH-severity attack patterns trigger a hard block.

See [Explanation: Security](explanation-security.md) for the full pattern list and design rationale.

---

## Companion Presence Systems

Several client-side engines make Emma feel present between messages. They predate Phase 3 but were previously undocumented:

- **Greeting engine** (`src/core/greeting-engine.ts`) — on app load, picks a greeting from persona-specific banks keyed by time of day and absence length (`quick_return` < 1h, `long_absence` > 24h, `very_long_absence` > 72h, tracked via `localStorage`). ~40% of the time it swaps in the user's name from memory; ~50% of the time it appends a follow-up drawn from a high-confidence goal/relationship/habit memory ("How's Alex doing?").

- **Proactive speech** (`src/core/proactive-speech.ts`) — timers reset on user activity trigger unprompted speech: a playful comment at 45s idle (occasionally personalized from memory), a genuine check-in at 2min, and a bedtime nudge after 5min during late-night hours. Wired in the app shell via `useProactiveSpeech`.

- **Pattern detector** (`src/core/pattern-detector.ts` + `/api/emma/patterns`) — a daily cron clusters the last 30 days of completed tasks, detects daily/weekly recurrences and repeated tool sequences, and generates an in-persona scheduling suggestion. The app shell surfaces the top unseen pattern as proactive speech ~4s after the greeting (quiet-hours aware, capped at 3/day).

- **Context manager** (`src/core/context-manager.ts`) — token-budget-aware summarization for long conversations: at 75% budget utilization, older messages are compressed into a `[SUMMARY]` message via `/api/emma/summarize`, always preserving the 10 most recent messages. Falls back to trimming when summarization fails.

---

## Related

- [ADR 0001: Behavior Flags](adr/0001-behavior-flags.md)
- [Reference: API routes](reference-api.md)
- [Reference: Plans and limits](reference-plans.md)
- [Explanation: Security](explanation-security.md)
- [Explanation: Agent loop](explanation-agent.md)
