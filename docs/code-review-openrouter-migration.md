# Code Review: feat/openrouter-migration

**Branch:** `feat/openrouter-migration`
**Reviewed:** 2026-05-26
**Scope:** 94 files changed, 3682 insertions / 5542 deletions
**Method:** 3 finder angles × verify (recall-biased) → 10 confirmed findings

---

## Findings (ranked most-severe first)

### 1. Duplicate assistant message per tool call → OpenRouter 400 on every multi-tool task

**File:** `src/core/agent-loop.ts:298`

The `messages.push(assistantMessage)` call sits _inside_ the `for (const toolCall of toolCalls)` loop. When the model returns N tool calls in a single response, N copies of the same assistant+tool_calls entry are prepended before each tool result. OpenRouter rejects the resulting message sequence with a 400 because adjacent duplicate assistant turns are invalid.

**Failure scenario:** Model returns 2 tool_calls → loop runs twice, each iteration pushes the full assistant message → conversation history becomes `[assistant+tools, tool_result_1, assistant+tools, tool_result_2]` → next request 400s → every multi-tool agent task hard-fails.

Same pattern repeats at the "not found" branch (~line 332) and "success" branch (~line 490).

---

### 2. Free-tier MODEL_UTILITY ignores tool schema → agent silently exits after 1 step

**File:** `src/core/agent-loop.ts:231`

`MODEL_UTILITY` is now `gpt-oss-120b:free`. The models.ts comment explicitly notes "gpt-oss-20b doesn't support tool_calls", and the free-tier 120b variant carries the same risk. When the model returns `finish_reason: 'stop'` with no `tool_calls`, `hasToolUse` is false, `taskCompleted` is set to true, and the agent exits — zero tools executed.

**Failure scenario:** Agent dispatched with a tools array → model returns plain text + `finish_reason: 'stop'` → `!hasToolUse` branch marks task `completed` with the raw text as summary → no error, no tool execution, silent success.

---

### 3. `checkAutonomousAccess()` never called → free users run unlimited agent loops

**File:** `src/app/api/emma/agent/route.ts:20`

`checkAutonomousAccess` is defined in `addon-enforcer.ts` and has zero call-sites in the agent route or its call chain. The feature-flags module that previously gated `agent` behind `plan.features.autonomous` was deleted; no replacement gate was wired.

**Failure scenario:** Free-tier user POSTs to `/api/emma/agent` → route authenticates, immediately calls `runAgentLoop()` → agent runs with full tool access, bypassing plan-tier enforcement entirely.

---

### 4. `hasDocuments` path coerces image array content to `""` → images silently dropped

**File:** `src/app/api/emma/route.ts:239`

When `hasDocuments` is true, the code reads:

```ts
const baseText = typeof last.content === "string" ? last.content : "";
```

If the last user message has array content (e.g. an `image_url` part), the empty string is used as the base. PDF/search extras are appended to `""`, and `last.content` is overwritten with the joined string — the image payload is gone with no error.

**Failure scenario:** User sends a message with an attached image, then uploads a PDF → `last.content` is an array → coerced to `''` → model receives no image context.

---

### 5. Sequential LLM loop times out Vercel function at any real user count

**File:** `src/app/api/emma/cron/pattern-detection/route.ts:92`

`generateSuggestionsViaBatch` iterates patterns in a plain sequential `for` loop with `await generateSuggestion(...)` per iteration. Each call is a separate HTTP round-trip to OpenRouter with up to 1 retry. No concurrency cap or timeout guard exists. The Vercel function timeout (10 s default, 60 s max) is reachable with as few as 5 patterns.

**Failure scenario:** 10 users × 3 patterns = 30 sequential calls × ~2 s each = ~60 s → function killed mid-loop → patterns after the cutoff are never persisted, `suggestions.get('p${i}')` returns `undefined` for those indices.

---

### 6. Rate-limit window is `1_000_000 ms` (~16.7 min) instead of 60 s

**File:** `src/app/api/intake/[slug]/chat/route.ts:74`

```ts
checkRateLimit(rateLimitKey, 20, 1_000_000);
```

The old in-memory limiter used `RATE_LIMIT_WINDOW_MS = 60_000` (1 minute). The new DB-backed call passes `1_000_000` ms — roughly 16.7 minutes — making the effective rate limit 16× looser than intended.

**Failure scenario:** Attacker sends 20 messages in rapid succession → window won't reset for ~16 min instead of 1 min, allowing sustained low-rate abuse that easily stays under the 20-message ceiling.

---

### 7. No `OPENROUTER_API_KEY` guard in pattern detector → 401 flood exhausts cron budget

**File:** `src/core/pattern-detector.ts:183`

The old code had `if (!skipSuggestions && !apiKey) return []` as a killswitch. That guard was removed. `openRouterHeaders()` is now called unconditionally; when `OPENROUTER_API_KEY` is absent it returns `Authorization: Bearer ` (empty) with only a `console.error`. Every `generateSuggestion()` call then 401s and retries.

**Failure scenario:** Missing `OPENROUTER_API_KEY` in env → cron fires → N users × M patterns sequential 401s with full retry budget → cron times out, no suggestions written, execution budget burned.

---

### 8. `startsWith('[')` guard discards valid ElevenLabs keys → permanent Web Speech fallback

**File:** `src/app/api/emma/tts/route.ts:66`

```ts
if (decrypted && !decrypted.startsWith('['))
```

The intent is to catch `[error: ...]` strings returned by the AES-GCM decrypt module on failure. However, the condition fires on _any_ decrypted value starting with `[`, silently leaving `apiKey` as null. When this happens, the TTS cache is never written, the Supabase query runs on every request, and the user permanently falls back to browser Web Speech with no error surfaced.

**Failure scenario:** Decrypt failure returns `'[error: ...]'` → `startsWith('[')` true → key discarded → every TTS call returns 204, browser uses Web Speech forever.

---

### 9. `refused`/`contextWindowExceeded` never emitted → rejection-rollback is dead code, enabling sticky refusal loops

**File:** `src/app/api/emma/route.ts:539`

The `doneEvent` constructed by the new route never sets `refused` or `contextWindowExceeded`. `stream-client.ts` and `page.tsx` still contain rollback logic keyed on these fields, but since the server never emits them, the condition `!event.refused` in `page.tsx` is permanently `true`.

**Failure scenario:** OpenRouter returns a content-policy rejection → `refused` never set → `page.tsx` appends the rejected exchange to API history → next request re-sends the rejected turn → repeated rejections or context bloat with no UI recovery path.

---

### 10. Missing `OPENROUTER_API_KEY` causes silent 401s instead of a fast-fail

**File:** `src/app/api/emma/route.ts:64`

`openRouterHeaders()` in `src/lib/openrouter.ts` only calls `console.error` when `OPENROUTER_API_KEY` is absent and returns `Authorization: Bearer ` (empty string). The route performs no key validation before building the full system prompt and firing the request. The 401 from OpenRouter surfaces as a generic 500 to the client.

**Failure scenario:** Misconfigured deployment with no `OPENROUTER_API_KEY` → every chat request builds a full prompt + history, fires a network call, receives 401, returns 500 → operators see nothing actionable, hard to diagnose.

---

## Not in scope / already handled

- **Usage pre-send gate** — `checkUsage()` is correctly called before `fetchWithRetry`; pre-send enforcement is intact.
- **Extra-pack deduction guard** — The enterprise sentinel check uses `tokenBudgetMonthly` but the comparison uses `tokenBudgetDaily`; logic is correct for the single 5-hour window model.
- **`speak()` dropping clientId** — The TTS route now resolves the ElevenLabs key from the session cookie; the omission is harmless given the server-side compensation.

---

## Bonus: unwired / incomplete integrations observed

- **MCP server configs** — User-configured MCP servers (stored in `user_mcp_servers`) are no longer injected into the brain request. OpenRouter does not support the `mcp_servers` parameter. MCP integrations are silently non-functional.
- **`json_schema` structured output on free-tier models** — Memory extraction (`memory/route.ts`) and vision (`vision/route.ts`) send `response_format: { type: 'json_schema', ... }` to `gpt-oss-120b:free` and `gemma-4-31b-it:free` respectively. Both routes have a `try/catch` that silently returns empty results on `JSON.parse` failure; whether this fires depends on model compliance.
- **Production model IDs** — `models.ts` has a comment `// DEV: free tier. LAUNCH: anthropic/claude-sonnet-4-5` on `MODEL_BRAIN`. No CI gate validates that free-tier IDs aren't deployed to production (the `anthropic-beta-headers` test suite was deleted with no OpenRouter equivalent added).
