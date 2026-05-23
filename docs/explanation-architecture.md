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
  - call Anthropic Messages API (streaming)
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

## The System Prompt: Two Blocks

Emma's system prompt is split into two Anthropic content blocks:

**Block 1 — Stable (cached)**  
Contains: persona, response length rules, routine instructions, avatar expression rules, available tools, memories, active user profile.

This block is marked `cache_control: { type: "ephemeral" }`. After the first request, Anthropic caches it. Subsequent turns pay ~10% of the base input token price for the prefix (90% cost reduction on the system prompt once the cache warms up).

The stable block must be byte-for-byte identical across turns for the cache to hit. That's why timestamps, vision context, and emotion state are NOT in this block.

**Block 2 — Dynamic (never cached)**  
Contains: current screen description (from vision), detected emotion state.

Omitted entirely when neither is present. Changes every turn — putting it in a separate block ensures it never pollutes the cached prefix.

```
buildSystemPromptBlocks()        ← src/core/personas.ts
  returns [
    { type: "text", text: stablePrompt, cache_control: { type: "ephemeral" } },
    { type: "text", text: dynamicContext }  // omitted if empty
  ]
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

## Prompt Caching Economics

At Sonnet 4.6 pricing ($3/MTok input, $0.30/MTok cached):

Emma's system prompt is approximately 2,000–5,000 tokens (varies by persona + memories).  
Without caching: 2,500 tokens × $3/MTok × 1,000 requests/day = **$7.50/day** in system prompt costs.  
With caching: $7.50 first turn + 999 × $0.75 = **$8.25/day** total — same coverage, ~10× lower marginal cost per turn after warmup.

The 5-minute cache TTL means the cache resets between conversations that have more than 5 minutes between turns. For power users in active sessions, the cache almost always hits.

---

## Chat History Race Guard

When the app loads, two things happen in parallel:
1. `fetchMemories()` — loads user's persistent memories
2. `fetch("/api/emma/history")` — loads the last 50 messages

The greeting `useEffect` must not fire until we know whether history exists. If it fired before history loaded, a returning user would see a greeting message appear above their restored conversation — wrong.

The solution is a three-state `historyReady` variable:
- `null` — history check in progress, greeting blocked
- `[]` — no history, show greeting
- `[...messages]` — history found, restore and skip greeting

`historyReady` starts as `null`. The greeting effect checks `if (historyReady === null) return` before doing anything. History fetch sets it to the loaded array (or `[]` on error). Only then does the effect run to completion.

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
