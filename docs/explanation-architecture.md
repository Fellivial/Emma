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
  - read three windows (daily/weekly/monthly) from usage_windows
  - if any window ≥ 100% → return blocked
  - if any window ≥ 80% and warning not sent → return warning
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

The enforcer checks three windows before every brain call. **The enforcement is intentionally fail-open:** if the Supabase database is unreachable, `checkUsage()` returns `{ status: "ok" }` and the request proceeds.

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
3. Handles subdomain routing: `{slug}.{SMB_DOMAIN}` → `/intake/{slug}`

Public paths that bypass auth:
- `/login`, `/auth/callback`, `/register`
- `/landing`, `/waitlist`
- `/intake/*`
- `/api/waitlist`, `/api/emma/webhook`, `/api/emma/unsubscribe`

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
- Only blocks on HIGH severity with multiple flags (reduces false positives)

Single-pattern matches at any severity level are flagged but not blocked — the message reaches Claude with the threat metadata attached. This is intentional: blocking "what are your instructions?" would prevent legitimate questions.

See [Explanation: Security](explanation-security.md) for the full pattern list and design rationale.

---

## Related

- [Reference: API routes](reference-api.md)
- [Reference: Plans and limits](reference-plans.md)
- [Explanation: Security](explanation-security.md)
- [Explanation: Agent loop](explanation-agent.md)
