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

## NOT YET IMPLEMENTED (GAPS)

### 1. Autonomous & Proactive Systems (`autonomous-proactive-systems-research.md`)

**Status:** ❌ NOT IMPLEMENTED  
**Impact:** Medium-High

Research identifies five implementation patterns (heartbeat, event-driven, memory-reflection, generative-agent, evaluator-optimizer) for moving Emma from reactive-only to proactive.

**What remains:**

- ❌ 30-minute heartbeat cron (check scheduled tasks, pattern suggestions, integration inbox summaries)
- ❌ Memory reflection cron (periodically review old memories for forgotten commitments)
- ❌ End-of-conversation proactivity (surface tasks mentioned mid-chat)
- ❌ Pattern suggestion surfacing at login (patterns are generated by cron but never shown)
- ❌ Message discipline enforcement (max 3 non-urgent messages/day per user)
- ❌ Quiet hours configuration (per-user timezone working hours)
- ❌ LangGraph `interrupt()` adoption (for durable approval flows)

**Recommendation:** Phase 1: surface existing `pattern_suggestions` at page mount + add quiet-hours check to notification delivery.

---

### 2. Background Workers (`background-workers-research.md`)

**Status:** ❌ NOT IMPLEMENTED (current state acceptable)  
**Impact:** Low (for current scale)

Research recommends Inngest vs Trigger.dev vs QStash for durable task execution with retry semantics and step memoization.

**What remains:**

- ❌ Inngest integration (50k executions/month free tier)
- ❌ Step-level retry semantics (no checkpoint/memoization)
- ❌ Concurrency locking (two cron instances can overlap and double-process tasks)

**Recommendation:** Defer. Stay on Vercel cron; adopt Inngest when the first reliability issue is hit or user count exceeds ~200.

---

### 3. Document Ingestion (`document-ingestion-research.md`)

**Status:** ❌ NOT IMPLEMENTED  
**Impact:** Medium

Allows users to upload context documents (contracts, meeting notes, PDFs) and have Emma reference them in conversation. Pro/Enterprise feature.

**What remains:**

- ❌ File upload route (`POST /api/emma/ingest/document`)
- ❌ pdfjs-dist integration (PDF text extraction)
- ❌ Tesseract.js or OpenRouter vision for OCR (scanned PDFs)
- ❌ mammoth for DOCX extraction
- ❌ RecursiveCharacterTextSplitter for chunking (800–1000 chars, 150-char overlap)
- ❌ OpenAI text-embedding-3-small via OpenRouter for chunk embedding
- ❌ Supabase pgvector schema (`document_chunks` table, HNSW index)
- ❌ Query-time semantic search (match_document_chunks RLS function)
- ❌ Context injection into system prompt (top-3 chunks by similarity >0.75)

**Recommendation:** Phase 2–3 feature (~3–4 weeks).

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

**Status:** ❌ NOT IMPLEMENTED  
**Impact:** Medium (Pro plan marketed feature, not delivered)

**What remains:**

- ❌ `personas` table schema (name, basePersonaId, toneAdjectives, communicationStyle, topicsEmphasise, topicsAvoid, language, voiceId, description)
- ❌ Settings UI for persona configuration
- ❌ Input validation (regex blocklist, LLM classifier on free-text, 500-char limit)
- ❌ Safe injection composition (XML sandboxing, explicit framing label)
- ❌ Encryption of sensitive fields
- ❌ Plan gating (Pro/Enterprise only)
- ❌ Voice customisation tie-in

**Recommendation:** Phase 1 (~1–2 weeks): structured fields only (name, tone, topics, language). Phase 2: description field with mitigations. Phase 3: voice cloning.

---

### 6. Connector Integration / MCP (`connector-integration-research.md`)

**Status:** ⚠️ PARTIAL (~15%)  
**Impact:** Medium-High

Emma currently connects to 6 services via hand-rolled OAuth. MCP connector would unlock 800–10,000+ integrations with zero per-service code.

**What remains:**

- ✅ PKCE on OAuth start/callback — `code_verifier` stored in `oauth_states`, `code_challenge` (S256) sent in all three provider auth URLs, `code_verifier` sent in all three token exchanges; `oauth_states.code_verifier` column added to schema
- ❌ MCP client support in agent-loop (via Vercel AI SDK + `@ai-sdk/mcp`)
- ❌ Tool allowlist/denylist via `needsApproval` gates
- ❌ Connection-expiry health checks + proactive re-auth suggestions
- ❌ Nango platform integration (as universal connector alternative)
- ❌ Scope expansion for proactive features (read scopes for Gmail, Calendar, Slack)
- ❌ OAuth scope re-consent flow

**Recommendation:** Phase 1 (~1 week): add PKCE. Phase 2 (~2–3 weeks): MCP client. Phase 3: Nango platform.

---

### 7. STT Fallback (`stt-fallback-research.md`)

**Status:** ❌ NOT IMPLEMENTED  
**Impact:** Low-Medium

**What remains:**

- ❌ Deepgram API integration (free tier: 600 requests/month)
- ❌ Google Cloud Speech-to-Text integration
- ❌ Fallback trigger logic (on Web Speech failure or confidence < threshold)
- ❌ Streaming audio handling

**Recommendation:** Defer. Web Speech API adequate for MVP.

---

### 8. Realtime Push Notifications (`realtime-push-notifications-research.md`)

**Status:** ❌ NOT IMPLEMENTED  
**Impact:** Low

**What remains:**

- ❌ Service worker registration
- ❌ Push subscription management (Settings UI)
- ❌ Backend Web Push endpoint
- ❌ Notification click handling

**Recommendation:** Phase 3+. Requires PWA infrastructure.

---

### 9. WhatsApp Inbound Reply Loop (`whatsapp-inbound-loop-research.md`)

**Status:** ⚠️ PARTIAL (~20%) — ingest webhook exists, reply loop not automated  
**Impact:** Low-Medium

**What remains:**

- ❌ Inbound webhook triggers agent loop (webhook at `/api/emma/ingest/whatsapp` exists but is passive)
- ❌ Conversation state tracking (link WhatsApp thread to Emma user/conversation)
- ❌ Automatic reply generation and delivery
- ❌ Multi-turn conversation threading in WhatsApp

**Recommendation:** Phase 2 enhancement.

---

### 10. Realtime Supabase Subscriptions (`supabase-data-api-changes-research.md`)

**Status:** ✅ RLS implemented, ❌ Realtime subscriptions NOT implemented  
**Impact:** Low-Medium

**Recommendation:** Phase 3+. Current SSE + polling is sufficient.

---

### 11. Security Audit Agent (`security-audit-agent.md`)

**Status:** ❌ NOT IMPLEMENTED (manual audit done in P11)  
**Impact:** Low-Medium

**Recommendation:** Defer. Manual review per PR is sufficient for current velocity.

---

## SUMMARY TABLE

| Area                       | Status      | Priority    | Effort | Recommendation                          |
| -------------------------- | ----------- | ----------- | ------ | --------------------------------------- |
| OAuth refresh              | ✅ Complete | —           | —      | Shipped                                 |
| Rate limiting              | ✅ Complete | —           | —      | Shipped                                 |
| Memory extraction          | ✅ Complete | —           | —      | Shipped                                 |
| Email deliverability       | ✅ Complete | —           | —      | Shipped                                 |
| LemonSqueezy billing       | ✅ Complete | Medium      | 1–2d   | Add subscription metadata storage       |
| Agent tools                | ✅ Complete | —           | —      | Shipped                                 |
| Security audit             | ✅ Complete | —           | —      | Shipped                                 |
| OpenRouter fallback        | ✅ Complete | —           | —      | Shipped                                 |
| TTS/Live2D                 | ✅ Complete | —           | —      | Shipped                                 |
| STT fixes                  | ✅ Complete | —           | —      | Shipped                                 |
| Live2D idle                | ✅ Complete | —           | —      | Shipped                                 |
| ElevenLabs BYOK            | ✅ Complete | Low         | 1d     | Concurrency headers (optional)          |
| Vision                     | ✅ Complete | —           | —      | Shipped                                 |
| Cron hardening             | ✅ Complete | —           | —      | Shipped                                 |
| GDPR                       | ✅ Complete | —           | —      | Shipped                                 |
| Supabase RLS               | ✅ Complete | —           | —      | Shipped                                 |
| **PKCE on OAuth**          | ✅ Complete | —           | —      | Shipped                                 |
| **Autonomous systems**     | ❌ 0%       | Medium      | 5–7d   | Phase 1: surface patterns + quiet hours |
| **Custom persona**         | ❌ 0%       | Medium      | 2–3w   | Phase 2: structured fields first        |
| **Conversation history**   | ✅ Complete | —           | —      | Shipped                                 |
| **MCP/Connectors**         | ⚠️ 15%      | Medium-High | 2–3w   | PKCE done; Phase 2: MCP client (2w)     |
| **Document ingestion**     | ❌ 0%       | Medium      | 3–4w   | Phase 2–3 feature                       |
| **STT fallback**           | ❌ 0%       | Low         | 2–3d   | Defer                                   |
| **Push notifications**     | ❌ 0%       | Low         | 2–3d   | Phase 3+ (requires PWA)                 |
| **WhatsApp reply loop**    | ⚠️ 20%      | Low         | 2–3d   | Phase 2 enhancement                     |
| **Realtime subscriptions** | ❌ 0%       | Low         | 2–3d   | Phase 3+                                |
| **Background workers**     | ❌ 0%       | Low         | 3–5d   | Defer until ~200 users                  |
| **Security audit agent**   | ❌ 0%       | Low         | 3–5d   | Defer                                   |

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
