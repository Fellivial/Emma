# GAP ANALYSIS AUDIT: Implementation vs. Research Documents

**Conducted:** June 2, 2026  
**Branches Analyzed:** `fix/p11-p18-improvements` (subsumes `fix/p1-p10-improvements`)  
**Research Scope:** 27 research documents in `docs/research/`

---

## EXECUTIVE SUMMARY

The implementation branches (P1–P18) show **strong implementation of core, immediate priorities** (OAuth refresh, rate limiting, memory extraction, email, billing, agent tools, security hardening). **Significant research was documented but NOT implemented** in: autonomous/proactive systems, document ingestion, conversation history persistence, custom persona configuration, background workers beyond cron, connector/MCP integration, multiple AI/ML quality improvements (STT fallback, OpenRouter fallback, vision improvements), and advanced integrations (realtime push, WhatsApp, connector platforms).

The gap is **architectural rather than tactical** — the implemented features are foundation-level (security, billing, integrations at baseline). The unimplemented features are **enhancement/expansion-tier**: proactive UX, document intelligence, multi-user/team features, and infrastructure scaling.

---

## IMPLEMENTED (WITH EVIDENCE)

### 1. OAuth Token Refresh (`oauth-token-refresh-research.md`)

**Research required:** Proactive refresh + retry logic with 401 detection for Google, Notion, HubSpot.

**Implemented:** ✅

- **Commit:** `c7de96d` — "fix: P10 oauth-refresh correctness — 401 detection, proactive set, dedup markExpired"
- **Commit:** `41a7697` — "feat: OAuth token refresh for HubSpot (proactive 5min) and Notion (rotating refresh token)"
- Detects 401 on requests and triggers refresh
- HubSpot proactive refresh every 5 minutes
- Notion rotating refresh token pattern
- Prevents duplicate refreshes via dedup logic

---

### 2. Rate Limiter (`rate-limiter-research.md`)

**Research required:** Upstash Redis sliding-window rate limiting on brain route, per-client quotas.

**Implemented:** ✅

- **Commit:** `c35f464` — "feat: Upstash Redis sliding-window rate limiter on brain route"
- **Commit:** `18dc716` — "fix: null-guard rate limiter for missing env vars, fix X-RateLimit-Reset to seconds"
- Wired to Upstash Redis
- X-RateLimit-Reset header returns seconds (correct per RFC)
- Null-guards missing env vars

---

### 3. Memory Extraction (`memory-extraction-research.md`)

**Research required:** 7-category taxonomy, extraction prompt with few-shot examples, confidence thresholding, staleness pruning.

**Implemented:** ✅ Complete

- 7-category taxonomy, 0.55 confidence threshold, 4 few-shot examples, explicit skip rules, staleness pruning cron
- **Key normalization** in `addMemoryForUser`: lowercase → strip stop words → snake_case → 60-char limit; eliminates "prefers_tea" vs "prefer_tea" duplicates without embedding cost
- **Soft delete / superseded tracking**: `memories.status TEXT DEFAULT 'active'` + `memories.superseded_by TEXT`; on value conflict, old row is marked `status='superseded'` before new row is inserted; partial unique index `WHERE status='active'` enforces uniqueness
- `getMemoriesForUser` filters `status='active'` only — superseded rows never reach the system prompt
- Memory-prune cron updated: all 3 active-memory rules now filter `status='active'`; new rule 5 hard-deletes 90-day-old superseded tombstones
- Semantic dedup + retrieval switchover deferred (lower priority per research — key normalization solves most duplicates algorithmically)

---

### 4. Email Deliverability (`email-deliverability-research.md`)

**Research required:** List-Unsubscribe headers, suppression check, physical address in footer, GDPR compliance.

**Implemented:** ✅

- **Commit:** `9e82138` — "feat: P17 email deliverability — List-Unsubscribe headers, suppression check, physical address"
- `List-Unsubscribe` and `List-Unsubscribe-Post` headers added
- Suppression check before sends
- Physical postal address in email footer (CAN-SPAM compliance)

---

### 5. LemonSqueezy Billing (`lemonsqueezy-billing-research.md`)

**Research required:** `payment_recovered` handler, `variantId` fix, extra-pack idempotency, subscription metadata storage.

**Implemented:** ✅ Complete

- **Commit:** `e491e4c` — "fix: P15 lemon webhook — payment_recovered handler, variantId fix, extra-pack idempotency"
- `subscription_payment_recovered` handler restores full plan limits (reverses `payment_failed` grace-period reduction)
- `variantId` simplified to `String(attrs?.variant_id || "")` — the `first_subscription_item.variant_id` path was not a real field
- Extra-pack one-time purchase idempotency enforced
- `clients.lemon_meta JSONB` column stores `{lemonSqueezyId, orderId, renewsAt, endsAt, cardBrand, cardLastFour, status}` on all active subscription events
- Schema migration: `ALTER TABLE clients ADD COLUMN IF NOT EXISTS lemon_meta jsonb`

---

### 6. Agent Tools (`agent-tools-research.md`)

**Research required:** Web search (Tavily) + web fetch (Jina) as OpenAI-format function tools for free models via OpenRouter.

**Implemented:** ✅

- **Commit:** `3e4cbec` — "feat: P18 add web_search (Tavily) and web_fetch (Jina) agent tools"
- **Commit:** `0995b04` — "fix: P18 web_search empty query guard + Jina fetch timeout"
- Tavily web_search integrated
- Jina web_fetch integrated
- Empty query guard and fetch timeout protection added

---

### 7. Security Audit (`security-audit.md`)

**Research required:** Injection sentinel, SSRF blocklist, tier-2 status label, EXTERNAL_READ_TOOLS gaps, ocr_image isSafeUrl.

**Implemented:** ✅

- **Commit:** `73495e1` — "security(agent): P11 — injection quarantine, tier-2 gate, 8k cap, SSRF blocklist"
- **Commit:** `3693441` — "fix: P11 code-review — injection sentinel, SSRF 172.16-31 + IPv6 ULA, ocr_image isSafeUrl, tier-2 status label"
- Injection sentinel pattern implemented
- SSRF blocklist covers 172.16–31 ranges + IPv6 ULA
- Tier-2 gate for autonomy
- EXTERNAL_READ_TOOLS validated
- ocr_image isSafeUrl check added

---

### 8. OpenRouter Model Fallback (`openrouter-model-reliability-research.md`)

**Research required:** Model fallback arrays for brain/vision/utility routes to handle provider outages.

**Implemented:** ✅

- **Commit:** `477e8b8` — "feat: OpenRouter model fallback arrays for brain/vision/utility routes"
- Fallback arrays configured for brain, vision, utility models
- Routes check primary model, fall back to secondary if unavailable

---

### 9. TTS/Live2D Expression Sync (`tts-voice-quality-research.md`, `tts-live2d-sync-research.md`)

**Research required:** TTS voice settings mapping, expression sync, lip sync improvements.

**Implemented:** ✅

- **Commit:** `9f1a66e` — "feat: expression-mapped voice_settings on ElevenLabs TTS"
- **Commit:** `7a1243c` — "fix: delay expression to audio start, improve lip sync (quintic easing + lerp + addParameter)"
- Expression mapping to voice settings
- Lip sync easing (quintic + lerp)
- Additive expression parameters
- Speaker boost restored

---

### 10. STT Bug Fixes (`stt-bug-diagnosis.md`)

**Research required:** Transcript fill, toggle listening, error feedback, Firefox detection.

**Implemented:** ✅

- **Commit:** `df4d378` — "fix: STT bugs — transcript fills textarea, toggle listening, error feedback, Firefox detection"
- Transcript textarea filling fixed
- Listen toggle state corrected
- Error feedback added
- Firefox detection for Web Speech API compatibility

---

### 11. Live2D Idle Pose (`live2d-idle-pose-research.md`)

**Research required:** Idle animation reset guards, currentPriority defensive default, motion guard, delay constants.

**Implemented:** ✅

- **Commit:** `c50039f` — "fix: P12 idle animation — additive params, remove duplicate blink/breath, motion guard"
- **Commit:** `d52740d` — "fix: P12 idle reset guards, currentPriority defensive default, rename delay constants"
- Idle reset guards in place
- currentPriority defensive default
- Duplicate blink/breath removal
- Delay constants named clearly

---

### 12. ElevenLabs BYOK Quota Visibility (`elevenlabs-byok-research.md`)

**Research required:** `/v1/user/subscription` endpoint for quota, usage bar display, tier detection, concurrency awareness.

**Implemented:** ✅ Complete

- **Commit:** `372ea25` — "feat: P14 ElevenLabs quota visibility bar + dynamic model/char-limit"
- Quota visibility bar, dynamic model/char-limit, `/v1/user/subscription` on connect, live usage endpoint
- Concurrency awareness: TTS route reads `current-concurrent-requests` / `maximum-concurrent-requests` response headers; warns at ≥80% usage; forwards as `x-el-concurrent`/`x-el-concurrent-max` response headers
- WebSocket streaming deferred as a future optimization — HTTP is correct for current single-user-at-a-time TTS calls

---

### 13. Vision Model Enhancements (`vision-research.md`)

**Research required:** Vision model selection, anomaly detection, MediaPipe FaceLandmarker for emotion.

**Implemented:** ✅

- **Commit:** `372ea25` — "feat: P13 wire visionContext anomalies/activities + MediaPipe FaceLandmarker emotion"
- MediaPipe FaceLandmarker integrated
- Vision context for anomalies and activities
- Emotion detection wired through vision pipeline

---

### 14. Cron Route Hardening (`background-workers-research.md`)

**Research required:** `maxDuration` exports + per-step timeouts in agent loop.

**Implemented:** ✅

- **Commit:** `dc35a89` — "fix: P16 add maxDuration to cron routes + 30s per-step timeout in agent loop"
- `maxDuration` exports added to cron routes
- 30-second per-step timeout in agent loop

---

### 15. GDPR Compliance (`conversation-history-research.md`)

**Research required:** Include `chat_messages` in erasure deletion.

**Implemented:** ✅

- **Commit:** `f180318` — "fix: include chat_messages in GDPR erasure deletion"
- `chat_messages` table included in `/api/emma/gdpr` deletion

---

### 16. Supabase Data API & RLS (`supabase-data-api-changes-research.md`)

**Research required:** Post-May-30 project grants, RLS policies, UPDATE grants on clients.

**Implemented:** ✅

- **Commit:** `fbd166d` — "fix: Supabase grants for post-May-30 projects, RLS on missing tables, fix clients owner_id column"
- **Commit:** `90c1aa1` — "fix: add UPDATE grant on clients for authenticated, remove unnecessary anon SELECT on waitlist"
- Grants updated for post-May-30 Supabase projects
- RLS enabled on all tables
- UPDATE grant added for authenticated users

---

## IMPLEMENTED — FORMERLY LISTED AS GAPS

All items below shipped in branches subsequent to this audit's original date. They are preserved here for traceability.

### 1. Autonomous & Proactive Systems (`autonomous-proactive-systems-research.md`)

**Status:** ✅ Complete (Phase 1–3 core)  
**Impact:** Medium-High

**Implemented:**

- ✅ Pattern suggestion surfacing at page mount — `app/page.tsx` calls `GET /api/emma/patterns` on mount; returns top unseen suggestion and pushes a Tier 2 notification via `buildPatternNotification()`
- ✅ Quiet hours enforcement — `isQuietHours()` in `autonomy-engine.ts`; `/api/emma/patterns` reads `profiles.quiet_hours_start/end/tz` and returns `{pattern: null}` during quiet window
- ✅ Message discipline (max 3/day) — `/api/emma/patterns` counts `shown_at` rows for today; blocks at `MAX_DAILY = 3`
- ✅ Memory reflection cron — `src/app/api/emma/cron/reflection/route.ts` (daily 03:30 UTC); pulls old memories per user, calls LLM for unresolved commitments, inserts `pattern_detections` with `pattern_type='memory_reflection'`
- ✅ Heartbeat cron — `src/app/api/emma/cron/heartbeat/route.ts` (every 30 min); creates nudge suggestions for tasks due in the next 30 min; logs stale unsurfaced pattern count for monitoring
- ✅ Schema: `pattern_detections.{suggestion, frequency, example_goals, detected_at, shown_at}` added; constraints extended; `profiles.quiet_hours_tz` added; `proactive_daily` tracking table

**Deferred (Phase 4):**

- ❌ End-of-conversation proactive check (requires idle detection + extra LLM call per session)
- ❌ LangGraph `interrupt()` adoption (full architecture replacement — Phase 4)
- ❌ Evaluator-optimizer pre-execution check (Phase 4)

**Recommendation:** Phase 4: LangGraph for durable approval flows and orchestrator-workers.

---

### 2. Background Workers (`background-workers-research.md`)

**Status:** ✅ Complete  
**Impact:** Low (for current scale)

**Implemented:**

- ✅ `src/inngest/client.ts` — `Inngest` instance (`id: "emma-app"`)
- ✅ `src/inngest/functions.ts` — 9 durable functions (Inngest v4 `triggers` array API) mirroring all Vercel cron schedules; each calls the corresponding cron route via `step.run()` for memoization + retry
- ✅ `src/app/api/inngest/route.ts` — `serve()` handler exposing GET/POST/PUT for Inngest SDK handshake
- ✅ Per-function retry counts match cron criticality (2 for tasks/email/patterns/reflection; 1 for heartbeat/health/approvals/cleanup)
- **To enable:** Set `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` env vars from inngest.com dashboard. Vercel crons remain active and are safe to run in parallel (cron routes are idempotent).

---

### 3. Document Ingestion (`document-ingestion-research.md`)

**Status:** ✅ Complete  
**Impact:** Medium

**Implemented:**

- ✅ `ingested_documents` + `document_chunks` tables in `supabase/schema.sql`; pgvector `extensions.vector(1536)` column; HNSW index (`vector_cosine_ops`); `match_document_chunks` SQL function (cosine similarity, threshold 0.75, top-3)
- ✅ `src/lib/embeddings.ts` — `embedText()` / `embedBatch()` via OpenRouter `openai/text-embedding-3-small`
- ✅ `src/core/text-splitter.ts` — inline `recursiveCharacterSplit()` (1000-char chunks, 150 overlap, paragraph→line→word→char separator hierarchy)
- ✅ `POST /api/emma/ingest/document` — plan gate (Pro/Enterprise), PDF (pdf-parse + OCR fallback), DOCX (mammoth), TXT, images (Tesseract.js); chunking + batch embed + store in both tables; fail-open if embeddings fail
- ✅ `GET /api/emma/ingest/document` — list user's documents
- ✅ `DELETE /api/emma/ingest/document?id=` — delete doc + chunks via CASCADE
- ✅ Brain route — embed user message, `match_document_chunks` RPC (fail-open), inject top-3 chunks as `documentContext` into system prompt
- ✅ `buildSystemPromptBlocks` — `documentContext` field on `PromptContext`; injected first in dynamic block with source labels
- ✅ Settings UI — `/settings/documents` with plan gate, upload form, document list with chunk count + delete
- ✅ Settings nav — "Documents" added to sidebar and breadcrumb map

**Deferred:**

- ❌ Scanned PDF rasterisation (requires `sharp`/`canvas` native binaries — deferred to Phase 3)
- ❌ Background ingestion queue for large files

---

### 4. Conversation History Persistence (`conversation-history-research.md`)

**Status:** ✅ Complete  
**Impact:** Medium

- `history/route.ts` POST now dual-writes to encrypted `messages`/`conversations` (primary) + `chat_messages` (legacy UI compat)
- `history/route.ts` GET reads from encrypted `messages` path first (decrypted), falls back to `chat_messages` for users with no encrypted history yet
- **Summarization**: `after()` fires at `message_count % 30 === 0`; calls UTILITY_MODELS to summarize last 35 messages (merging previous summary); stores in `conversations.summary`
- **Titling**: `after()` fires at `message_count === 2` (first full exchange) if no title yet; generates 5-word title and stores in `conversations.title`
- **Context injection**: `buildSystemPrompt` now accepts `previousContext?: string`; `route.ts` (brain) loads `conversations.summary` from DB and injects as "Previous Session Context" block
- localStorage pending queue deferred — it's a pure frontend resilience feature; the core persistence path is now correct

---

### 5. Custom Persona Configuration (`custom-persona-config-research.md`)

**Status:** ✅ Complete  
**Impact:** Medium (Pro plan marketed feature)

**Implemented:**

- ✅ `personas` table schema — `supabase/schema.sql` (name, base_persona_id, tone_adjectives, communication_style, verbosity, topics_emphasise, topics_avoid, language, voice_id, description, description_screened_at); RLS `auth.uid() = user_id`
- ✅ `src/types/persona.ts` — `ToneAdjective` / `TopicTag` allowlists, `SUPPORTED_LANGUAGES`, `CustomPersona` interface
- ✅ `GET /api/emma/persona` — load with decrypt of voice_id + description
- ✅ `PUT /api/emma/persona` — plan gate (Pro/Enterprise), allowlist filtering, regex injection blocklist (14 patterns), LLM classifier via `UTILITY_MODELS`, AES-256-GCM encryption of voice_id + description
- ✅ `buildSystemPromptBlocks` extended — `customPersona` field on `PromptContext`; XML-sandboxed `<user_persona_preferences>` block injected last in stable prefix; `escapeXml()` on free-text fields
- ✅ Brain route (`/api/emma/route.ts`) loads custom persona from DB (fail-open) and passes to `buildSystemPrompt`
- ✅ Settings UI — `src/app/settings/persona/page.tsx` with plan gate, tone tag picker, segment controls, topic selectors, language dropdown, voice picker, 500-char description textarea
- ✅ Settings nav — "Persona" added to sidebar and breadcrumb map
- ✅ Voice cloning tie-in — `personas.voice_id` stored encrypted; persona page shows ElevenLabs voice picker (cloned voices listed first) when ElevenLabs is connected; TTS route queries `personas.voice_id` on cache miss and uses it with priority above the global integration default (`personaVoiceId` → `storedVoiceId` → Rachel)

---

### 6. Connector Integration / MCP (`connector-integration-research.md`)

**Status:** ✅ Complete (Phase 1 + Phase 2 + Phase 3 core)  
**Impact:** Medium-High

Emma connects to 6 services via OAuth and any MCP Streamable HTTP server via the agent loop.

**Implemented:**

- ✅ PKCE on OAuth start/callback — `code_verifier` stored in `oauth_states`, `code_challenge` (S256) sent in all three provider auth URLs, `code_verifier` sent in all three token exchanges; `oauth_states.code_verifier` column added to schema
- ✅ MCP client support in agent-loop — `src/core/integrations/mcp-client.ts` implements JSON-RPC 2.0 over HTTP (`listMcpTools`, `callMcpTool`); `runAgentLoop` queries `client_integrations` for `mcp_%` services, discovers tools at task start, extends the tools array, and dispatches `mcp__<service>__<tool>` calls to the remote server
- ✅ `mcp_url` + encrypted `access_token` stored in `client_integrations`; token decrypted at dispatch time
- ✅ **Tool allowlist/denylist** — `client_integrations.metadata.allowedTools: string[] | null` (null = all tools); agent-loop filters discovered MCP tools against allowlist before registering; `GET /api/integrations/mcp/tools?service=` discovers live tools + current filter; `PATCH /api/integrations/mcp/tools` persists allowedTools; MCP settings page shows per-server tool checkboxes with "Allow all" reset + Save
- ✅ **Connection-expiry health checks** — `src/app/api/emma/cron/connection-health/route.ts` (hourly); queries `auth_expired` connections + `token_expires_at < now+4h`; inserts `pattern_detections` (type: `connection_expiry`) surfaced as Tier-2 proactive re-auth suggestions at next page mount; dedup: one per user+service per day; registered in `vercel.json`

**Explicitly deferred (not near-term):**

- ❌ **Nango platform** — full infrastructure migration to replace hand-rolled OAuth/refresh; only worthwhile at 30+ integrations. Emma has 6 today.
- ❌ **OAuth scope re-consent flow** — expanding to read scopes (`gmail.readonly`, `calendar.readonly`) requires user re-authorization; breaking change that needs a migration strategy.

**Recommendation:** Revisit Nango when integration count exceeds ~15. Revisit scope expansion when proactive features (inbox scan, morning briefing) are prioritized.

---

### 7. STT Fallback (`stt-fallback-research.md`)

**Status:** ✅ Complete  
**Impact:** Low-Medium

**Implemented:**

- ✅ `POST /api/emma/stt` — plan-gated (Starter+) OpenAI Whisper endpoint; Starter → `gpt-4o-mini-transcribe`, Pro/Enterprise → `gpt-4o-transcribe`; returns `{ transcript: string }`
- ✅ `voice-engine.ts` — `getSupportedMimeType()` detects browser MIME support; `listenViaServer()` captures audio via MediaRecorder with AudioContext silence detection (2s RMS < 15) and POSTs to `/api/emma/stt`
- ✅ `service-not-allowed` handler persists `emma_voice_sna` to localStorage and switches to server path transparently
- ✅ 403/501 responses from the server endpoint disable the server path and show the user an appropriate fallback message
- ✅ `vercel.json` — `maxDuration: 30` added for the STT route
- **Requires env var:** `OPENAI_API_KEY` (separate from OpenRouter — OpenRouter doesn't expose audio endpoints)

---

### 8. Realtime Push Notifications (`realtime-push-notifications-research.md`)

**Status:** ✅ Complete  
**Impact:** Low

- ✅ Service worker at `public/sw.js` — push event handler + notification click → opens `/app`
- ✅ `ServiceWorkerRegistrar` client component wired into `app/layout.tsx`
- ✅ `push_subscriptions` table with RLS; `GET/POST/DELETE /api/emma/push/subscribe`
- ✅ `src/lib/push-notify.ts` — `pushToUser()` via web-push VAPID; stale 410 subscriptions auto-deleted
- ✅ Settings → Notifications page — permission prompt, subscribe/unsubscribe toggle
- ✅ Agent loop broadcasts on `user-{userId}` channel (instant) + `pushToUser` (tab closed)
- ✅ `sw.js` served with `no-cache` + `Service-Worker-Allowed: /` headers
- **Requires env vars:** `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` (generate: `npx web-push generate-vapid-keys`)

---

### 9. WhatsApp Inbound Reply Loop (`whatsapp-inbound-loop-research.md`)

**Status:** ✅ Complete  
**Impact:** Low-Medium

- Inbound webhook stores message with `direction='inbound'` + `window_expires_at` (24h window tracking)
- `after()` fires reply loop post-200: loads last 15 messages for `from_number` as context, calls LLM via `UTILITY_MODELS`, sends reply via `WhatsAppAdapter.sendText()`, stores outbound row with `direction='outbound'`
- Multi-turn threading via `ingested_whatsapp` history (inbound + outbound rows ordered by `received_at`)
- New schema columns: `direction TEXT DEFAULT 'inbound'`, `outbound_wamid TEXT`, `window_expires_at TIMESTAMPTZ`
- Always returns 200 to Meta regardless of reply outcome — prevents webhook retry storms

---

### 10. Realtime Supabase Subscriptions (`supabase-data-api-changes-research.md`)

**Status:** ✅ Complete  
**Impact:** Low-Medium

- ✅ `tasks` + `approvals` added to `supabase_realtime` publication (schema.sql)
- ✅ App shell subscribes to `postgres_changes` on both tables; INSERT/UPDATE update local state without polling
- ✅ Broadcast channel `user-{userId}` wired for instant in-tab delivery of approval requests
- ✅ 15s poll replaced with 60s resilience fallback + Realtime as primary

---

### 11. Security Audit Agent (`security-audit-agent.md`)

**Status:** ✅ Complete (all 8 findings addressed)  
**Impact:** Low-Medium

**Implemented (this branch):**

- ✅ **Finding 1 — Indirect prompt injection (OWASP LLM03/06):** `EXTERNAL_READ_TOOLS` set in `agent-loop.ts`; external tool output wrapped in `[EXTERNAL DATA]...[/EXTERNAL DATA]` message envelope; system prompt (`AGENT_SYSTEM`) includes quarantine instructions; `buildStateSummary()` suppresses external data from history compression
- ✅ **Finding 2 — Tier-2 gate missing:** `agent-loop.ts` now correctly pauses tier-2 on moderate tools (same `createApproval` + `awaiting_approval` path as dangerous tools — previous code fell through to execution)
- ✅ **Finding 4 — Risk label bypass:** Removed `[Risk: ...]` suffix from `getToolsForClaude()` in `tool-registry.ts`; labels were enabling injection attacks ("use only tools labeled safe")
- ✅ **Finding 5 — 8k output cap:** Tool output capped at `MAX_TOOL_OUTPUT = 8_000` chars before storing in context or appending to messages; prevents context flooding and system-prompt eviction
- ✅ **Finding 6 — Context pollution:** External tool output stored in `outputVars` via `sanitiseInput()` truncation before interpolation into subsequent tool parameters
- ✅ **Finding 7 — Injection scan + logging:** High-threat injection attempts logged to `action_log` table with `event_type: "injection_attempt"`
- ✅ **Finding 3 — HITL raw params:** Already done in P11 (ApprovalBubble renders raw params)
- ✅ **Finding 8 — SSRF:** Already done in P11 (web_fetch blocklist covers RFC-1918 + 169.254 + IPv6 ULA)

---

## SUMMARY TABLE

| Area                       | Status      | Priority | Effort | Recommendation                                                                  |
| -------------------------- | ----------- | -------- | ------ | ------------------------------------------------------------------------------- |
| OAuth refresh              | ✅ Complete | —        | —      | Shipped                                                                         |
| Rate limiting              | ✅ Complete | —        | —      | Shipped                                                                         |
| Memory extraction          | ✅ Complete | Medium   | 2–3d   | Key normalization (1d), soft-delete tracking (2d)                               |
| Email deliverability       | ✅ Complete | —        | —      | Shipped                                                                         |
| LemonSqueezy billing       | ✅ Complete | —        | —      | Shipped                                                                         |
| Agent tools                | ✅ Complete | —        | —      | Shipped                                                                         |
| Security audit             | ✅ Complete | —        | —      | Shipped                                                                         |
| OpenRouter fallback        | ✅ Complete | —        | —      | Shipped                                                                         |
| TTS/Live2D                 | ✅ Complete | —        | —      | Shipped                                                                         |
| STT fixes                  | ✅ Complete | —        | —      | Shipped                                                                         |
| Live2D idle                | ✅ Complete | —        | —      | Shipped                                                                         |
| ElevenLabs BYOK            | ✅ Complete | —        | —      | Shipped                                                                         |
| Vision                     | ✅ Complete | —        | —      | Shipped                                                                         |
| Cron hardening             | ✅ Complete | —        | —      | Shipped                                                                         |
| GDPR                       | ✅ Complete | —        | —      | Shipped                                                                         |
| Supabase RLS               | ✅ Complete | —        | —      | Shipped                                                                         |
| **PKCE on OAuth**          | ✅ Complete | —        | —      | Shipped                                                                         |
| **Autonomous systems**     | ✅ Complete | —        | —      | Shipped                                                                         |
| **Custom persona**         | ✅ 100%     | Medium   | done   | DB, API, injection mitigations, Settings UI, voice cloning tie-in               |
| **Conversation history**   | ✅ Complete | —        | —      | Shipped                                                                         |
| **MCP/Connectors**         | ✅ 100%     | —        | done   | Tool allowlist/denylist, connection-expiry cron; Nango+scope-reconsent deferred |
| **Document ingestion**     | ✅ 100%     | Medium   | done   | pgvector RAG, chunking, embeddings, Settings UI                                 |
| **STT fallback**           | ✅ 100%     | Low      | done   | Whisper via `/api/emma/stt`; MediaRecorder + silence detection in voice-engine  |
| **Push notifications**     | ✅ 100%     | Low      | —      | SW + VAPID + Settings UI + agent loop wired                                     |
| **WhatsApp reply loop**    | ✅ Complete | —        | —      | Shipped                                                                         |
| **Realtime subscriptions** | ✅ 100%     | Low      | —      | postgres_changes + broadcast; 15s poll → 60s fallback                           |
| **Background workers**     | ✅ 100%     | Low      | done   | Inngest v4: 9 durable functions, step retry, `/api/inngest` serve endpoint      |
| **Security audit agent**   | ✅ 100%     | Low      | done   | All 8 findings: injection quarantine, tier-2 gate, 8k cap, risk label removal   |

---

## TOP 3 QUICK WINS

1. ✅ **Memory extraction few-shot examples** — **DONE**
   - 4 examples in `MEMORY_EXTRACTION_PROMPT` (including borderline calibration case)
   - Explicit skip rules with inline WHY-comments
   - Confidence threshold raised 0.5 → 0.55 (prompt + filter)
   - Staleness pruning cron registered in `vercel.json` (daily 04:00 UTC)

2. ✅ **ElevenLabs `/v1/user/subscription` integration** — **DONE**
   - Live usage bar: chars used/limit, % fill (amber ≥80%, red ≥95%), reset countdown, tier label
   - Subscription metadata stored on connect; `/api/integrations/elevenlabs/usage` endpoint
   - Billing issue + inactive subscription warnings surfaced
   - `missing_permissions` error and key-input hint now list required scopes

3. ✅ **PKCE on OAuth flow** — **DONE**
   - `code_verifier` (S256) generated in `start`, stored in `oauth_states`, sent in all three token exchanges
   - `oauth_states.code_verifier TEXT` column added to `schema.sql` (with idempotent `ALTER TABLE`)
   - Unlocks MCP connector Phase 2

---

## STRATEGIC OBSERVATIONS

1. **P1–P18 focused on foundation, not expansion.** Core reliability shipped; research covers expansion features.
2. **Memory extraction is the highest-leverage next improvement.** Few-shot prompt engineering is a 1-day fix with outsized impact.
3. **MCP connector work is the natural Phase 2.** Pairs naturally with PKCE security hardening.
4. **Autonomous systems research is mature but undeployed.** Pattern-suggestion surfacing would be a low-risk Phase 1.
5. **Custom persona is a marketed Pro feature with zero implementation.** Direct product gap vs. advertised capability.
6. **Document ingestion is a feature tier unlock.** Becomes a Pro/Enterprise differentiator at scale.
