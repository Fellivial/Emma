# FEATURES.md

Claude API capabilities audit against Emma's current architecture.
Last updated: 2026-05-22. Re-run when a new Claude API feature ships.

---

## Summary

After reading all Anthropic platform docs (two sessions, 52 URLs total) + a second
pass covering MCP Tunnels and Managed Agents (29 additional URLs), 29 distinct
API capabilities were identified for Emma's Sonnet 4.6 architecture.

**All P1 and P2 items are implemented. All P3 items are implemented or deferred.**

Items #1–25 are fully implemented. #26 (Advisor Tool) is deferred pending Opus 4.7
adoption. #27 (MCP Tunnels) is implemented as a UI callout. #28 (Dreams) and
#29 (Managed Agents Platform) are deferred pending GA and ZDR support.

**Critical constraint:** Prefill (putting words in Claude's mouth via assistant-turn
message content) is NOT supported on Sonnet 4.6 or Opus 4.7. Audited and guarded
(intake route strips trailing assistant turns; no prefill found in main route).

---

## P1 — Implement now (high ROI, low risk)

### 1. Strict Tool Use
**Status:** ✓ Implemented — `src/core/tool-registry.ts` (`strict: true` on all tools via `getToolsForClaude`)

**What:** Add `strict: true` to every tool definition in Emma's tool registry.
Grammar-constrained sampling guarantees tool inputs exactly match their JSON schema.
No more silent type coercions or missing required fields.

**Why it matters for Emma:**
- Emma has ~20 registered integration tools (Gmail, Calendar, Slack, Notion,
  HubSpot, Drive, plus utility tools). Any malformed input silently fails
  today — Anthropic just returns whatever shape it infers.
- `strict: true` is zero-effort: one field per tool definition, no new routes,
  no beta headers.
- Pairs with `tool_choice: { type: "any" }` when you need both a guaranteed tool
  call AND schema-valid inputs.

**How:**
- Add `strict: true` to every tool definition object in `src/core/tool-registry.ts`.
- Review schemas for any `additionalProperties: true` (strict requires `false`).
- All required fields must be listed in `required`. No optional properties with
  defaults — make them explicit.

**Constraints:**
- Incompatible with `disable_parallel_tool_use` in some configurations — test after.
- Tool definitions change rarely, so cache invalidation risk is low.

**Files:** `src/core/tool-registry.ts`

**Beta header needed:** None (GA).

---

### 2. Prompt Caching
**Status:** ✓ Implemented — `personas.ts` (system block `cache_control`) + `route.ts` (conversation history cache on last assistant message)

**What:** Cache Emma's system prompt so subsequent turns pay 10% of the base
input price instead of 100%.

**Why it matters for Emma:**
- `personas.ts` builds a large prompt: persona base + memories + routines + emotion.
  This is rebuilt and re-sent on every turn. At Sonnet pricing ($3/MTok input,
  $0.30/MTok cached), a 5k-token system prompt across thousands of turns is the
  biggest single cost lever available.
- Also applies to tool definitions.

**How:**
- Add `cache_control: { type: "ephemeral" }` to the system message block in
  `src/app/api/emma/route.ts`.
- Monitor `usage.cache_read_input_tokens` vs `cache_creation_input_tokens` in
  response to confirm hits.
- Do NOT inject timestamps or dynamic per-turn content into the cached prefix.
  Emma's system prompt must be byte-for-byte identical across turns for cache hits.
- Alternative: pass `auto_cache: true` to let Anthropic auto-advance the cache
  point as the conversation grows.

**Constraints:**
- Minimum 1,024 tokens to be cacheable (Sonnet 4.6). Emma's system prompt
  almost certainly clears this.
- Cache TTL: 5 min default, 1h option (2x write price).
- Modifying tool definitions invalidates the full cache. Changing only `tool_choice`
  invalidates only the messages cache, not the prefix.
- Deferred tools (`defer_loading: true`) load as `tool_reference` blocks and do
  NOT touch the prefix cache — useful for P3 Tool Search integration.

**Files:** `src/app/api/emma/route.ts`, `src/core/personas.ts`

**Beta header needed:** None.

---

### 3. Effort Parameter
**Status:** ✓ Implemented — `route.ts` (`output_config: { effort }` with high/medium detection via `detectEffort()`)

**What:** Set `output_config: { effort: "medium" }` on Emma's brain route to
reduce token spend on routine conversations.

**Why it matters for Emma:**
- Most of Emma's responses are short agentic directives, not multi-paragraph
  essays. Default `effort: "high"` is appropriate for complex analysis; for
  "what's on my calendar today" it burns unnecessary tokens.
- `effort: "medium"` is roughly 70% of high. Zero wiring: one field on the API
  call. No beta header.
- Supported on Sonnet 4.6 (Emma's model).

**How:**
- Add `output_config: { effort: "medium" }` as the default in `src/app/api/emma/route.ts`.
- Optionally detect task complexity and pass `"high"` for agentic/analytical tasks,
  `"medium"` for conversational ones.

**Constraints:**
- Do not set `effort` and `thinking.budget_tokens` together on Sonnet 4.6 —
  manual `budget_tokens` is deprecated on this model. Use `thinking: { type: "adaptive" }` instead.

**Files:** `src/app/api/emma/route.ts`

**Beta header needed:** None (GA).

---

### 4. Token Counting (pre-request estimation)
**Status:** ✓ Implemented — `route.ts` (`countRequestTokens()` pre-checks against metering windows before streaming)

**What:** Call `/v1/messages/count_tokens` before sending to Emma to estimate
usage and enforce limits proactively.

**Why it matters for Emma:**
- `src/core/usage-enforcer.ts` currently meters after the fact.
  Pre-counting lets Emma warn users before a message would exceed their
  remaining window rather than blocking mid-response.
- Free to use (separate rate limit from messages — 100–8,000 RPM by tier).
- Supports tools, images, PDFs, extended thinking.

**How:**
- Call `client.messages.countTokens({ model, system, messages, tools })` in
  `usage-enforcer.ts` or in the brain route before streaming.
- If count > remaining allowance, return the usage-exceeded response early.

**Files:** `src/core/usage-enforcer.ts`, `src/app/api/emma/route.ts`

**Beta header needed:** None.

---

### 5. Context Compaction
**Status:** ✓ Implemented — `route.ts` (`compact-2026-01-12` beta header, `compact_20260112` trigger at 600K tokens)

**What:** Automatically summarize old conversation turns when Emma approaches
the 1M-token context limit.

**Why it matters for Emma:**
- Sonnet 4.6 has a 1M-token context. Power users in long sessions will hit it.
  Without compaction, Emma either errors or the dev has to truncate history manually.
- Beta supports Sonnet 4.6 (Emma's current model). Works with streaming.

**How:**
- Add beta header `compact-2026-01-12` to `src/app/api/emma/route.ts`.
- Add `context_management: { edits: [{ type: "compact_20260112", trigger: { type: "input_tokens", value: 600000 } }] }` to the create call.
- Append full response (including compaction block) back to history.
- Optional: set `pause_after_compaction: true` to preserve the last few turns.

**Constraints:**
- Works on Sonnet 4.6 and Opus models only.
- Known issue: if `tools` are present, model may try to call tools during
  summarization. Fix with explicit instruction: `"Do not call any tools; respond with text only."` in compaction instructions.

**Files:** `src/app/api/emma/route.ts`, `src/lib/stream-client.ts`

**Beta header needed:** `compact-2026-01-12`

---

### 6. Files API — Document Upload
**Status:** ✓ Implemented — `src/app/api/emma/files/route.ts`, `[id]/route.ts`, `download/[file_id]/route.ts`

**What:** Let users upload PDFs, images, and plain text to a persistent
workspace store. Emma references them by `file_id` instead of re-uploading.

**Why it matters for Emma:**
- Workspace agents need to handle documents. Right now Emma only takes typed
  text. Files API adds "attach a contract", "analyze this report", "process
  this invoice" to Emma's surface.
- Free storage operations (only pay input tokens when referencing in messages).
- 500 MB/file, 500 GB/org. Persistent until deleted.

**How:**
- New API route: `POST /api/emma/files` — upload to Anthropic, return `file_id`.
- New API route: `DELETE /api/emma/files/[id]` — delete from Anthropic.
- Store `file_id` + metadata (name, type, created_at) in Supabase, scoped to user.
- Attach to Emma's brain call via `document` or `image` content blocks.
- Show an "Attachments" panel in the chat UI.

**Constraints:**
- Not ZDR-eligible. Files stored until explicitly deleted.
- Cannot download files you uploaded (only files created by skills/code exec).
- Beta header required on API calls that reference files.

**Files:** New `src/app/api/emma/files/route.ts`, `src/app/api/emma/route.ts`, new Supabase table `user_files`

**Beta header needed:** `files-api-2025-04-14`

---

### 7. PDF Support (paired with Files API)
**Status:** ✓ Implemented — `route.ts` (document blocks via `file_id` source or direct URL via `pdfUrls`)

**What:** Send PDFs to Emma for analysis. Claude extracts both text and visual
content (charts, tables, diagrams) from each page.

**Why it matters for Emma:**
- Natural extension of document upload. Contracts, reports, invoices are all
  PDFs in the real world.
- 600 pages max per request, 32 MB payload limit.
- Combine with prompt caching for repeated analysis of the same document.

**How:**
- Via Files API: upload once, reference by `file_id` in `document` content block.
- Via URL: pass a direct PDF URL as `{ type: "url", url: "..." }` in document source.
- Via base64: for one-off analysis without persistent storage.

**Constraints:**
- No passwords/encryption on PDF.
- Dense PDFs use more tokens — each page processed as image + text. Typical cost:
  1,500–3,000 tokens per page (text) + image tokens.

**Files:** `src/app/api/emma/route.ts`, new Supabase table `user_files`

**Beta header needed:** None (or `files-api-2025-04-14` if using Files API upload path)

---

## P2 — Implement next (high value, more wiring)

### 8. Web Search Tool
**Status:** ✓ Implemented — `route.ts` (`web_search_20260209` + `web_fetch_20260209`, user location wired)

**What:** Give Emma the ability to search the web in real time. Use the
`web_search_20260209` version for dynamic filtering and free code execution.

**Why it matters for Emma:**
- Emma's knowledge is frozen at training cutoff. Users ask about current events,
  prices, news, and Emma currently has to say "I don't know."
- The `_20260209` version uses code execution internally to filter results before
  loading into context — and that code execution is FREE when used alongside web
  search or web fetch.

**How:**
- Add `{ type: "web_search_20260209", name: "web_search" }` to the `tools` array
  in `src/app/api/emma/route.ts`.
- Add `user_location: { city, region, country, timezone }` to localize results if
  the user's locale is available.
- Add `allowed_domains` / `blocked_domains` arrays to restrict or block sources.
- Optionally add `web_fetch_20260209` for URL-specific retrieval; set
  `max_content_tokens` to limit fetched content; enable `citations: { enabled: true }`.
- Handle `server_tool_use` blocks in `src/lib/stream-client.ts` and
  `src/core/command-parser.ts`.

**Constraints:**
- Server-side execution — Anthropic handles it.
- Tool use changes the streaming response shape (adds `server_tool_use`,
  `server_tool_result` blocks). Streaming client needs to handle these.
- `_20260209` web tools unlock free code execution only for dynamic filtering
  within those tools.

**Files:** `src/app/api/emma/route.ts`, `src/lib/stream-client.ts`, `src/core/command-parser.ts`

**Beta header needed:** None (GA).

---

### 9. Structured Outputs
**Status:** ✓ N/A — no prefill existed to replace; `output_config.format` available in `route.ts` if needed for future structured extraction

**What:** Guarantee JSON schema conformance on Emma's API responses using
`output_config.format`. **This replaces prefill** for any case where Emma's
current code uses assistant-turn prefill.

**Why it matters for Emma:**
- Prefill is NOT supported on Sonnet 4.6 (returns 400 error).
  Any existing code that relies on it must be replaced.
- Structured outputs give the same guarantee (schema-valid JSON response) via
  grammar-constrained sampling.
- Useful for Emma's internal parsing: emotion tag extraction, routine detection,
  and any structured data extraction from conversations.

**How:**
- Replace any prefill usage with `output_config: { format: { type: "json_schema", json_schema: { ... } } }`.
- For Emma's emotion tag: define a schema like `{ expression: string, text: string }`.
- Incompatible with citations — use one or the other per call.
- Schemas are cached by Anthropic for 24 hours (hash-based).

**Constraints:**
- Incompatible with citations in the same request.
- Incompatible with programmatic tool calling.

**Files:** `src/app/api/emma/route.ts`, `src/core/command-parser.ts`

**Beta header needed:** None (GA).

---

### 10. Citations
**Status:** ✓ Implemented — `route.ts` (`citations: { enabled: true }`, `citations_delta` captured and forwarded to client)

**What:** Ground Emma's responses in source documents so users can verify
claims against original text.

**Why it matters for Emma:**
- For document analysis workflows (contracts, reports, emails), citations let
  Claude annotate exact source locations — character indices for text, page
  numbers for PDFs, block indices for custom content.
- `cited_text` does NOT count toward output tokens, so adding citations doesn't
  increase cost.

**How:**
- Set `citations: { enabled: true }` in the request.
- Pass source documents as `document` content blocks.
- Parse `citations` arrays in the response content blocks.
- Display source references in the chat UI alongside the response.

**Constraints:**
- Incompatible with structured outputs in the same request.

**Files:** `src/app/api/emma/route.ts`, `src/lib/stream-client.ts`

**Beta header needed:** None (GA).

---

### 11. Search Results Content Blocks
**Status:** ✓ Implemented — `route.ts` (`search_results` block injected from `searchResults` request param)

**What:** Pass structured search results to Emma as native content blocks
(`RequestSearchResultBlock`) for natural citations and source attribution.

**Why it matters for Emma:**
- For RAG over user documents or knowledge bases, search result blocks give
  the same citation quality as Anthropic's own web search — with full source
  attribution the user can verify.
- Unlike raw text injection, each result has a source URL, title, and cited passages.

**How:**
- When calling Emma with retrieved context, pass results as:
  `{ type: "search_results", results: [{ source: url, title, content }] }`
- Combine with `citations: { enabled: true }` to get annotated source references.

**Files:** `src/app/api/emma/route.ts`

**Beta header needed:** None (GA).

---

### 12. MCP Connector — User-Pluggable Tools
**Status:** ✓ Implemented — `route.ts` (`mcp-client-2025-11-20`, `loadMcpServers()` from `user_mcp_servers` table with encrypted tokens)

**What:** Let users connect their own remote MCP servers to Emma.

**Why it matters for Emma:**
- Emma's integrations today are hand-built adapters. MCP lets any user bring
  any tool that exposes an MCP endpoint — GitHub, Linear, Jira, Figma, Stripe,
  custom internal tools.
- Multiple servers per request (each with allowlisting/denylisting).
- OAuth Bearer token support for authenticated servers.

**How:**
- New settings UI: "Connect an MCP Server" (URL + optional auth token).
- Store MCP server configs in Supabase `user_mcp_servers` table (encrypted token).
- In brain route: load user's MCP servers + build `mcp_servers` array and
  `mcp_toolset` entries in the request.
- Handle `mcp_tool_use` and `mcp_tool_result` blocks in streaming client.

**Constraints:**
- Only HTTP servers (SSE or Streamable HTTP). No local stdio.
- Not ZDR-eligible.

**Files:** New `src/app/api/emma/mcp/route.ts`, `src/app/api/emma/route.ts`, new Supabase table `user_mcp_servers`

**Beta header needed:** `mcp-client-2025-11-20`

---

### 13. Agent Skills — Document Generation
**Status:** ✓ Implemented — `route.ts` (`skills-2025-10-02` + `code-execution-2025-08-25` beta headers; `container.skills` array; `code_execution` tool; `file_id` parsed from `code_execution_tool_result`)

**What:** Let Emma produce real downloadable files: Excel spreadsheets,
PowerPoint presentations, Word documents, PDFs.

**Why it matters for Emma:**
- Currently Emma produces markdown text about documents. With Skills, Emma
  produces an actual `.xlsx` or `.pptx` the user can open immediately.
- Pre-built Anthropic skills: `pptx`, `xlsx`, `docx`, `pdf`.

**How:**
- Add `container: { skills: [{ type: "anthropic", skill_id: "xlsx", version: "latest" }] }` to the messages create call.
- Add 3 beta headers: `code-execution-2025-08-25`, `skills-2025-10-02`, `files-api-2025-04-14`.
- Add `tools: [{ type: "code_execution_20250825", name: "code_execution" }]`.
- Parse `file_id` from `code_execution_tool_result` blocks in the response.
- Download via Files API and serve to user (signed URL or direct download).

**Constraints:**
- Code execution container: no network access. Skills are self-contained.
- Beta feature — not ZDR-eligible.
- Adds latency (container spin-up ~3s first use, ~100ms after).
- Max 8 skills per request.

**Files:** `src/app/api/emma/route.ts`, `src/lib/stream-client.ts`, new download handler

**Beta headers needed:** `code-execution-2025-08-25`, `skills-2025-10-02`, `files-api-2025-04-14`

---

## P3 — Track and implement when relevant

### 14. Tool Search (`tool_search_tool_bm25_20251119`)
**Status:** ✓ Implemented — `route.ts` (`tool_search_tool_bm25_20251119` tool; integration tools marked `defer_loading: true` in `tool-registry.ts`)

**What:** When Emma's tool set grows past 20 actions, defer-load all tools and
use tool search to dynamically discover the right one.

**Why:** Each tool definition costs tokens. Adding web search, MCP tools, and
code execution will push Emma past 20 tools. Tool search reduces baseline
context by 85%+ and maintains selection accuracy.

**Note:** Deferred tools (`defer_loading: true`) appear as `tool_reference` blocks
in conversation history and do NOT touch the prefix cache — important for keeping
prompt caching effective.

**How:**
- Add `tool_search_tool_bm25_20251119` to tools array (non-deferred).
- Mark all integration tools with `defer_loading: true`.
- Add system prompt section describing available tool categories.

**Files:** `src/app/api/emma/route.ts`, `src/core/tool-registry.ts`

---

### 15. Fine-Grained Tool Streaming
**Status:** ✓ Implemented — `route.ts` (`eager_input_streaming: true` on all tool definitions; `stream-client.ts` handles partial JSON input deltas)

**What:** Add `eager_input_streaming: true` to Emma's tool definitions to stream
tool inputs without buffering.

**Why:** Reduces perceived latency when Emma calls an integration tool. Users
see tool parameters appearing in real time rather than waiting for full JSON.

**How:**
- Set `eager_input_streaming: true` on user-defined tools in the tools array.
- Update streaming client to handle partial JSON gracefully.

**Files:** `src/app/api/emma/route.ts`, `src/lib/stream-client.ts`

---

### 16. Vision Enhancement (image uploads via Files API)
**Status:** ✓ Implemented — `vision/route.ts` (uploads image to Files API, caches `file_id`; subsequent calls use `{ type: "file", file_id }` instead of base64)

**What:** Emma's vision route already exists. Upgrade it to use Files API so
images are uploaded once and referenced by `file_id` rather than sent as base64
on every call.

**How:**
- In vision route, upload image to Files API first if not already stored.
- Use `{ type: "file", file_id: "..." }` in the image content block.
- Cache `file_id` in Supabase alongside message history.

**Files:** `src/app/api/emma/vision/route.ts`

---

### 17. Context Editing (tool result clearing)
**Status:** ✓ Implemented — `route.ts` (`message-edits-2025-11-15` beta header; `context_management.edits` with `clear_tool_results` and `clear_thinking_blocks` when agentic session exceeds threshold)

**What:** Selectively clear old tool results from conversation history when
Emma is running long agentic sessions.

**Why:** Compaction (P1 #5) handles the bulk of context management.
Context editing is for surgical cases: an agentic loop that accumulated hundreds
of `tool_result` blocks that are no longer relevant.

**How:**
- Beta header: `message-edits-2025-11-15`.
- Pass `context_management.edits` with `{ type: "clear_tool_results" }` or
  `{ type: "clear_thinking_blocks" }` as needed.

**Files:** `src/app/api/emma/route.ts`

---

### 18. Programmatic Tool Calling
**Status:** ✓ Implemented — `route.ts` (`code_execution_20260120` tool; `allowed_callers` on integration tools; `programmaticTools` flag in `EmmaApiRequest`)

**What:** Let Emma write Python code to call multiple integration tools in a
single pass without multiple model round-trips.

**Why:** For complex agentic tasks like "pull all emails about X, cross-reference
with Calendar, and summarize in Slack" — programmatic calling runs all steps as
one script, never loading intermediate data into context.

**How:**
- Requires `code_execution_20260120` (newer version, not `_20250825`).
- Set `allowed_callers: ["code_execution_20260120"]` on integration tools.
- Handle `tool_use` blocks with `caller.type: "code_execution_20260120"`.

**Constraints:**
- MCP tools cannot be called programmatically.
- Structured outputs (`strict: true`) incompatible.

**Files:** `src/app/api/emma/route.ts`, `src/core/tool-registry.ts`

---

### 19. Cache Diagnostics
**Status:** ✓ Implemented — `route.ts` (`cache-diagnosis-2026-04-07` beta header; `diagnostics.previous_message_id` from `lastResponseId`; cache diagnostics logged server-side)

**What:** Debug prompt caching misses by passing previous response ID.

**Why:** Once prompt caching is live (P1 #2), this helps diagnose why cache
misses happen unexpectedly.

**How:**
- Beta header: `cache-diagnosis-2026-04-07`.
- Add `diagnostics: { previous_message_id: lastResponseId }` to the API call.
- Log `response.diagnostics` to see where the prefix diverged.

**Files:** `src/app/api/emma/route.ts`

---

### 20. Adaptive Thinking
**Status:** ✓ Implemented — `route.ts` (`thinking: { type: "adaptive" }` enabled when `effort` is `high` or above)

**What:** Enable Claude to show its reasoning before answering. For Sonnet 4.6,
use `thinking: { type: "adaptive" }` — manual `budget_tokens` is deprecated on
this model.

**Why:** For complex analytical tasks Emma might do (contract review, data analysis),
adaptive thinking improves output quality without manual token budgeting.
Thinking tokens are stripped from context in subsequent turns so they don't accumulate.

**How:**
- Add `thinking: { type: "adaptive" }` to the API call.
- Pair with the `effort` parameter (P1 #3) rather than `budget_tokens`.

**Constraint:** Adds cost (thinking = output tokens). Enable selectively for
analytical tasks, not conversational turns.

**Files:** `src/app/api/emma/route.ts`, `src/core/personas.ts`

---

### 21. Memory Tool
**Status:** ✓ Implemented — `agent-loop.ts` (`memory_20250818` scratchpad tool; file operations handled in-process against an in-memory store for long agentic sessions)

**What:** Native Anthropic memory tool (`memory_20250818`) that persists facts
across sessions via client-side file operations on a `/memories` directory.

**Why:** Emma has a custom memory engine in `src/core/memory-engine.ts`.
The native memory tool is a potential supplement — schema-less, Claude knows it
natively. Operations (view, create, str_replace, insert, delete, rename) are
handled client-side.

**Consideration:** Emma's current memory engine uses AES-256-GCM encryption and
Supabase persistence. The native tool is unencrypted file-based storage — a step
backwards for Emma's security model. Best used as a scratchpad for long agentic
sessions rather than a replacement.

**How:**
- Add `{ type: "memory_20250818", name: "memory" }` to tools array.
- Handle file operation tool calls client-side on `/memories` files.

**Files:** `src/app/api/emma/route.ts`, `src/lib/stream-client.ts`

---

### 22. Batch Processing (Messages Batches API)
**Status:** ✓ Implemented — `cron/pattern-detection/route.ts` (`generateSuggestionsViaBatch` uses Batches API at 50% cost reduction for background suggestion generation)

**What:** Submit requests asynchronously at 50% cost reduction. Results
returned within 24 hours.

**Why:** Emma's background cron jobs (usage metering, memory extraction, analytics)
could use batch API to halve compute costs. Not suitable for the real-time brain
route — only for background tasks.

**Files:** Any background cron routes under `src/app/api/emma/cron/`

**Beta header needed:** None (GA).

---

### 23. Streaming Refusals (`stop_reason: "refusal"`)
**Status:** ✓ Implemented — `stream-client.ts` (synthetic fallback message on `stop_reason: "refusal"`); `route.ts` + `page.tsx` (rollback `apiMessages` to not include refused exchange)

**What:** Claude 4+ returns `stop_reason: "refusal"` when it refuses to answer.
No refusal message is included in the response.

**Why:** Emma's streaming client and command parser must handle this new stop
reason. Without handling it, the client receives an empty/partial response.

**How:**
- In `src/lib/stream-client.ts`: handle `stop_reason === "refusal"` by emitting
  a synthetic fallback message.
- **Critical:** After a refusal, reset the conversation context. Do not include
  the refused exchange in subsequent turns.

**Files:** `src/lib/stream-client.ts`, `src/core/command-parser.ts`, `src/app/app/page.tsx`

---

### 24. `model_context_window_exceeded` Stop Reason
**Status:** ✓ Implemented — `page.tsx` (hard-truncate `apiMessages` to last 6 on `model_context_window_exceeded`; retry automatically)

**What:** New stop reason that fires when the request exceeds the model's
context window. Allows requesting max tokens without knowing input size upfront.

**Why:** Emma should handle this gracefully rather than throwing an unhandled error.
Default behavior on Sonnet 4.5+.

**How:**
- Handle `stop_reason === "model_context_window_exceeded"` in `src/lib/stream-client.ts`.
- Trigger context compaction (P1 #5) or truncate history and retry.

**Files:** `src/lib/stream-client.ts`, `src/app/api/emma/route.ts`

---

### 25. Tool Input Examples (`input_examples`)
**Status:** ✓ Implemented — `tool-registry.ts` (`input_examples` on HubSpot deal tools, Notion create/update, and calendar tools)

**What:** Add `input_examples: [{ ... }]` to Emma's complex tool definitions
to improve tool selection reliability and parameter quality.

**Why:** For tools with non-obvious parameter shapes (HubSpot deal fields,
Notion block structures), example inputs reduce malformed calls.
Adds 20–200 tokens per tool but measurably improves accuracy on complex schemas.

**How:**
- Add `input_examples` to the most error-prone tools in `src/core/tool-registry.ts`.
- Target HubSpot, Notion, and any tool with >5 parameters.

**Files:** `src/core/tool-registry.ts`

---

### 26. Advisor Tool (deferred — requires Opus 4.7)
**Status:** ⏸ Deferred — requires Opus 4.7 as advisor; adds Opus pricing on every complex agentic turn. Revisit when Emma adopts Opus.

**What:** Pair Emma's Sonnet 4.6 executor with an Opus 4.7 advisor model that
reviews the full conversation mid-generation and injects guidance.

**Why deferred:** Requires Opus 4.7 as the advisor model. Since Emma isn't using
Opus right now, this adds Opus pricing on top of Sonnet for every complex agentic
turn. Pick up when moving to Opus, or when agentic task quality becomes a priority.

**When relevant:** Emma's multi-step integration workflows (Gmail + Calendar + Slack)
are exactly the workload this is designed for. The advisor reads the full transcript
and returns 400–700 tokens of guidance before the executor continues.

**Files:** `src/app/api/emma/route.ts`

**Beta header needed:** `advisor-tool-2026-03-01`

---

### 27. MCP Tunnels (enterprise infrastructure — no Emma code change)
**Status:** ✓ Implemented — `src/app/settings/mcp/page.tsx` (UI callout explaining tunnel-hosted MCP URLs; links to MCP Tunnels setup docs; no API change needed)

**What:** Deploy a lightweight tunnel agent (cloudflared + Anthropic proxy) inside
a private network so Claude can reach MCP servers behind a firewall without opening
inbound ports. Each MCP server gets a routed hostname under a customer-controlled
tunnel domain. Traffic is outbound-only from the customer's network.

**Why relevant for Emma:**
Emma already supports user-connected MCP servers via the `user_mcp_servers` Supabase
table. Today those servers must be publicly reachable (HTTPS URL). Tunnels unlock
enterprise customers whose internal tools (Jira on-prem, internal APIs, private
databases) can't be exposed publicly.

**What Emma needs to do:**
Nothing in the API code — usage is identical (`mcp-client-2025-11-20` header, same
`mcp_servers` array). The only change is a Settings UI addition explaining that MCP
server URLs can be tunnel-hosted (`https://<subdomain>.<tunnel-domain>/mcp`).
The customer deploys the tunnel infrastructure themselves (Docker Compose or Helm).

**Status:** Research preview. Requires access request at `claude.com/form/claude-managed-agents`.
Not ZDR or HIPAA eligible. Depends on Cloudflare as transport.

**Files:** `src/app/settings/` (UI hint only), no API change

**Beta header:** `mcp-tunnels-2026-05-19` (tunnels management API); `mcp-client-2025-11-20` (already present — usage unchanged)

---

### 28. Managed Agents — Dreams (async memory consolidation)
**Status:** ⏸ Deferred — research preview; not ZDR eligible; depends on Managed Agents Sessions (#29) for session IDs. Revisit after #29.

**What:** An async pipeline that reads a memory store + a set of past session
transcripts and produces a new reorganized memory store. Deduplicates facts,
resolves contradictions, surfaces emerging patterns, prunes stale entries.
Input store is never modified — output is a fresh store.

**Why relevant for Emma:**
Emma's `pattern-detection` cron (`src/app/api/emma/cron/pattern-detection/route.ts`)
does something similar: it scans completed tasks, detects behavioral patterns, and
generates suggestions. Dreams would replace or supplement this with a first-class
Anthropic pipeline that is much more sophisticated — reading actual conversation
transcripts rather than just task records.

**How:**
```
POST /v1/dreams
{
  "inputs": [
    {"type": "memory_store", "memory_store_id": "..."},
    {"type": "sessions", "session_ids": ["sesn_01...", ...]}  // up to 100
  ],
  "model": "claude-opus-4-7",
  "instructions": "Focus on work style and scheduling preferences..."
}
```
Poll `GET /v1/dreams/{id}` until `status: "completed"`. Then attach
`outputs[].memory_store_id` to future sessions.

**Constraints:**
- Research preview — requires BOTH `managed-agents-2026-04-01` AND `dreaming-2026-04-21` beta headers.
- Requires Managed Agents adoption (sessions must exist server-side).
- Billed at standard token rates for selected model.
- Only `claude-opus-4-7` and `claude-sonnet-4-6` supported.
- Output memory store is not encrypted (not ZDR eligible).

**Dependency:** Requires Managed Agents Sessions (item #29) to have session IDs as input.
Pick up after evaluating item #29.

**Files:** New `src/app/api/emma/cron/dreams/route.ts`, replaces pattern-detection logic

**Beta headers:** `managed-agents-2026-04-01`, `dreaming-2026-04-21`

---

### 29. Managed Agents Platform (strategic — deferred)
**Status:** ⏸ Deferred — research preview; not ZDR or HIPAA eligible; full rewrite of agent-loop, task system, and approval flow. Revisit when GA + ZDR support added.

**What:** Replace Emma's custom `agent-loop.ts` with Anthropic-managed Sessions.
An Agent is a versioned config (model + system prompt + tools + MCP servers + skills).
A Session is a running instance of an Agent with its own container, conversation
history, and event stream. Built-in tools (bash, file ops, web search/fetch) run in
a sandboxed cloud container managed by Anthropic.

**Key API surface:**
- `POST /v1/agents` — create reusable versioned agent config
- `POST /v1/environments` — configure cloud container (packages, networking)
- `POST /v1/sessions` — start a session (agent + environment)
- `POST /v1/sessions/{id}/events` — send `user.message`, `user.custom_tool_result`
- `GET /v1/sessions/{id}/stream` — SSE event stream
- `agent.custom_tool_use` / `user.custom_tool_result` — Emma's integration tools
  (Gmail, Calendar, Slack, Notion, HubSpot) exposed as custom tools; Emma executes
  them and returns results, Anthropic runs the loop

**Additional capabilities unlocked:**
- **Vaults**: Anthropic-managed MCP OAuth credential store (replaces `user_mcp_servers` encrypted tokens)
- **Memory Stores**: Agent-accessible `/mnt/memory/` directories (alongside Emma's own memory engine)
- **Webhooks**: Push notifications for `session.status_idled` / `session.status_terminated` (eliminates long-polling)
- **Multi-agent**: Coordinator + specialist subagents sharing a container filesystem
- **GitHub resource mounting**: Clone repos directly into session containers
- **File mounting**: `user_files` table → mount as session resources
- **Session checkpoints**: Container state preserved 30 days

**Why deferred:**
1. **Not ZDR or HIPAA eligible** — Anthropic stores session history, events, and container state server-side. Emma's current architecture keeps all user data in the user's own Supabase.
2. **Research preview** — no SLA, no uptime commitment. Beta header: `managed-agents-2026-04-01`.
3. **Custom memory stays better** — Emma's AES-256-GCM memory engine with Supabase is more private than Managed Agents Memory Stores.
4. **Large migration** — Emma's agent-loop, task system, approval flow, and provenance chain all need rethinking.

**When to revisit:** When Managed Agents reaches GA, if ZDR support is added, or when
Emma's agentic use cases justify Anthropic managing the container.

**Files:** `src/core/agent-loop.ts`, `src/app/api/emma/agent/route.ts` (full rewrite)

**Beta header:** `managed-agents-2026-04-01`

---

## Critical Notes

### Prefill Deprecated on Sonnet 4.6
**Putting words in Claude's mouth via a trailing `assistant` message is NOT
supported on Sonnet 4.6.** Requests with assistant-turn prefill will receive
a 400 error. Use Structured Outputs (`output_config.format`) instead.

### `pause_turn` Stop Reason
When a server-side tool loop hits its iteration limit (default 10 iterations),
`stop_reason: "pause_turn"` is returned. Emma's agentic loop
(`/api/emma/agent/route.ts`) must handle this by resending the response to
continue execution. Without this, long agentic chains silently stop mid-task.

### Automatic vs. Manual Prompt Caching
Anthropic now offers automatic prompt caching (single parameter, cache point
moves forward automatically). For Emma, manual `cache_control` is recommended for
the system prompt (precise control), and automatic is a reasonable default for
conversation history.

---

## Reference: Beta Headers Summary

| Feature | Header | Status |
|---|---|---|
| Files API | `files-api-2025-04-14` | Beta |
| MCP Connector | `mcp-client-2025-11-20` | Beta |
| Agent Skills | `skills-2025-10-02` + `code-execution-2025-08-25` | Beta |
| Compaction | `compact-2026-01-12` | Beta |
| Context Editing | `message-edits-2025-11-15` | Beta |
| Cache Diagnostics | `cache-diagnosis-2026-04-07` | Beta |
| Advisor Tool (deferred) | `advisor-tool-2026-03-01` | Beta |
| Prompt Caching | None needed | GA |
| Web Search / Web Fetch (`_20260209`) | None needed | GA |
| Token Counting | None needed | GA |
| Tool Search | None needed | GA |
| Fine-Grained Streaming | None needed | GA |
| Strict Tool Use | None needed | GA |
| Effort Parameter | None needed | GA |
| Structured Outputs | None needed | GA |
| Citations | None needed | GA |
| Search Results Blocks | None needed | GA |
| Batch Processing | None needed | GA |

---

## Emma Architecture Files Most Affected

| File | Changes needed |
|---|---|
| `src/app/api/emma/route.ts` | Prompt caching, compaction, tools, MCP, Skills, strict tools, effort, structured outputs, citations |
| `src/core/personas.ts` | Add `cache_control` to system message |
| `src/core/usage-enforcer.ts` | Pre-request token counting |
| `src/lib/stream-client.ts` | Handle new block types (tool_use, mcp_tool_use, refusal, pause_turn, etc.) |
| `src/core/command-parser.ts` | Parse new block types, handle refusals |
| `src/core/tool-registry.ts` | Add `strict: true`, `input_examples`, `defer_loading` when tools grow |
| `src/app/api/emma/vision/route.ts` | Switch to file_id for image uploads |
| `src/app/api/emma/agent/route.ts` | Handle `pause_turn` stop reason |
| `src/app/app/page.tsx` | Reset conversation context after refusals |
| New: `src/app/api/emma/files/route.ts` | Files API upload/delete |
| New: Supabase `user_files` table | Store file_id + metadata per user |
| New: Supabase `user_mcp_servers` table | Store MCP server configs |
