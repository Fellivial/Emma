# OpenRouter Migration Tracker

Switch Emma's AI backend from Anthropic's direct API to OpenRouter (`https://openrouter.ai/api/v1`).

## Why

- Access to multiple model providers through one endpoint
- Model flexibility at runtime (swap Claude, GPT, Gemini, etc. without code changes)
- OpenAI-compatible API — one format for all providers

## Tradeoffs

- OpenRouter adds a proxy hop (small latency increase)
- Anthropic prompt caching is lost (may increase costs)
- Three Anthropic-specific APIs have no OpenRouter equivalent (see below)

---

## Model Choices

### Development (free tier — active now)

Using OpenRouter free models during development. Append `:free` to switch to the free tier.

| Role | Model ID | Notes |
|------|----------|-------|
| `MODEL_BRAIN` | `openai/gpt-oss-120b:free` | 120B, OpenInference — verified working, warm persona |
| `MODEL_VISION` | `google/gemma-4-31b-it:free` | Google AI Studio — verified image_url support |
| `MODEL_UTILITY` | `openai/gpt-oss-20b:free` | Fast, OpenInference — verified working |

> **Note**: Original free models (`gemini-2.5-pro:free`, `llama-4-maverick:free`, `gemini-2.5-flash:free`) went offline. Above are verified replacements as of 2026-05-24.

### Launch (paid — switch before going live)

Locked in based on research. Update `src/core/models.ts` before launch.

| Role | Model ID | Price (in/out per M) | Why |
|------|----------|----------------------|-----|
| `MODEL_BRAIN` | `anthropic/claude-sonnet-4-5` | $3 / $15 | Best persona warmth, SWE-bench SOTA, designed for autonomous operation |
| `MODEL_VISION` | `google/gemini-2.5-flash` | $0.30 / $2.50 | Multimodal, 1M context, 10x cheaper than current Claude Sonnet |
| `MODEL_UTILITY` | `google/gemini-2.5-flash` | $0.30 / $2.50 | Reliable structured extraction; built-in thinking helps accuracy |

> **Roleplay alternative for BRAIN**: `nousresearch/hermes-3-llama-3.1-70b` ($0.30/$0.30) — explicitly built for roleplay, 10x cheaper, worth A/B testing at launch.
> **Heavy reasoning/planning**: `deepseek/deepseek-r1` ($0.70/$2.50) — o1-level, consider for the agent loop if reasoning quality needs a boost.

---

## Files to Change

### 1. `src/core/models.ts`
- [x] Replace model IDs with OpenRouter format (dev: free tier, launch: paid tier — see above)

### 2. Auth header (all 10 `/v1/messages` call sites)
- [x] Replace `x-api-key: ANTHROPIC_API_KEY` with `Authorization: Bearer OPENROUTER_API_KEY`
- [x] Replace `anthropic-version: 2023-06-01` header (drop entirely)
- [x] Add `HTTP-Referer` and `X-OpenRouter-Title` optional headers — centralized in `src/lib/openrouter.ts`

### 3. Base URL (all call sites)
- [x] Replace `https://api.anthropic.com/v1/messages` with `https://openrouter.ai/api/v1/chat/completions`

### 4. Message format (all call sites)
Anthropic uses `content: [{type: "text", text: "..."}]` blocks.
OpenRouter/OpenAI uses `content: string`.
- [x] `src/app/api/emma/route.ts`
- [x] `src/app/api/emma/emotion/route.ts`
- [x] `src/app/api/emma/memory/route.ts`
- [x] `src/app/api/emma/summarize/route.ts`
- [x] `src/core/agent-loop.ts`
- [x] `src/core/tool-registry.ts`
- [x] `src/core/task-summarizer.ts`
- [x] `src/core/pattern-detector.ts`
- [x] `src/app/api/intake/[slug]/chat/route.ts`

### 5. Stream parser — `src/lib/stream-client.ts`
- [x] No changes needed — `stream-client.ts` consumes Emma's internal SSE format (`delta`/`done`/`error`),
  not the raw provider SSE. The provider SSE is parsed inside `src/app/api/emma/route.ts`.

### 6. Tool calling — `src/core/agent-loop.ts`, `src/core/tool-registry.ts`
- [x] Tool definitions updated to OpenAI format: `{type: "function", function: {name, description, parameters}}`
- [x] Tool result messages updated: `tool_use_id` → `tool_call_id`, role changed to `"tool"`

---

## Features with No OpenRouter Equivalent

### Token counting — `src/app/api/emma/route.ts:71`
Anthropic-only: `POST /v1/messages/count_tokens`
- [x] **Option B chosen**: Removed `countRequestTokens()` entirely; rely on `usage` in the response

### Files API — `src/app/api/emma/vision/route.ts`, `src/app/api/emma/files/`
Anthropic-only: `POST /v1/files` + `files-api-2025-04-14` beta header
- [x] `vision/route.ts`: always uses inline base64 (`image_url.url: "data:${mimeType};base64,..."`)
- [x] `files/route.ts`, `files/[id]/route.ts`, `files/download/[file_id]/route.ts`: stubbed with 503

### Message Batches API — `src/core/pattern-detector.ts:147`
Anthropic-only: `POST /v1/messages/batches`
- [x] **Option A chosen**: `generateSuggestionsViaBatch()` replaced with sequential loop over `generateSuggestion()`

---

## Environment Variable Change

| Before | After |
|--------|-------|
| `ANTHROPIC_API_KEY` | `OPENROUTER_API_KEY` |

Update all 14 files that reference `process.env.ANTHROPIC_API_KEY`.

---

## Estimated Effort

| Task | Effort |
|------|--------|
| URL + auth header swap (10 files) | ~2h |
| Message format restructure | ~4h |
| Stream parser rewrite | ~2h |
| Token counting replacement | ~2h |
| Files API → inline base64 | ~3h |
| Batch API removal/replacement | ~2h |
| **Total** | **~1–2 days** |

---

## Status

- [x] Migration started
- [x] All call sites updated (10 routes + 4 core modules)
- [x] `src/lib/openrouter.ts` created — shared URL, headers, `extractText`, `extractUsage`
- [x] Stream parser (`stream-client.ts`) — no changes needed; parses Emma's internal SSE, not raw provider SSE
- [x] Token counting replaced — removed `countRequestTokens()`, rely on response `usage`
- [x] Vision/files flow working with inline base64
- [x] Batch API handled — replaced `generateSuggestionsViaBatch` with sequential calls
- [x] `.env.local.example` updated — `OPENROUTER_API_KEY` replaces `ANTHROPIC_API_KEY`
- [x] Set `OPENROUTER_API_KEY` in `.env.local`
- [x] End-to-end chat tested — streaming SSE confirmed, delta events + done event with usage
- [x] End-to-end agent loop tested — `complete_task` tool call round-tripped correctly
