# TODOS

Open work items and deferred decisions. All SMB intake items have been removed — Emma is a personal AI companion platform.

---

## Agent Security — Fixed 2026-06-13

### ~~action_log Missing client_id — Hourly Rate Limit Permanently Bypassed~~ ✅ Fixed

`logAction` in `agent-loop.ts` now inserts `client_id` and `user_id` into every `action_log` row, so `checkAutonomousAccess` hourly cap is correctly enforced. Also added `reason` column to schema (inline inserts were silently failing without it).

### ~~approve Has Check-Then-Act Race~~ ✅ Fixed

Approve handler now uses a single atomic `UPDATE WHERE status='pending' RETURNING *` — only one concurrent request can win. The loser receives a 404.

### ~~approve Path Lacks Plan-Tier Re-Check~~ ✅ Fixed

Approve case now calls `checkAutonomousAccess` before resuming the agent loop, blocking downgraded users.

---

## Open Items

### ElevenLabs — `speak_text` Not a Registered Tool

**What:** ElevenLabs is BYOK for TTS voice only. `speak_text` is not registered in `tool-registry.ts` as an agentic tool Emma can call autonomously.
**Impact:** Emma can use ElevenLabs for her own voice but can't call it as a tool in response to user requests.
**Files:** `src/core/tool-registry.ts`, possibly a new `src/core/integrations/elevenlabs.ts`
**Priority:** Low — the voice use-case is primary; agentic TTS is speculative.
