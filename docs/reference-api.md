# API Reference

All routes live under `src/app/api/`. Auth is Supabase SSR unless noted.

---

## Brain Route

### `POST /api/emma`

Main chat endpoint. Streams SSE deltas to the client.

**Auth:** Required (Supabase session)

**Request body:**

```typescript
{
  message: string;           // User's message (sanitised server-side)
  personaId?: "mommy" | "neutral";  // Defaults to "mommy"
  memories?: MemoryEntry[];  // Injected into system prompt
  visionContext?: string;    // Screen-share description from /api/emma/vision
  emotionState?: EmotionState; // From /api/emma/emotion
  pdfUrls?: string[];        // PDF URLs to attach as document blocks
  searchResults?: SearchResultBlock[]; // RAG results to attach
  programmaticTools?: boolean; // Enable code_execution for tool chaining
}
```

**Response:** SSE stream. Each event is `data: <json>\n\n`. Event types:

- `delta` — partial text chunk
- `tool_start` — tool call beginning (name, inputs)
- `tool_result` — tool execution result
- `server_tool_use` — hosted tool result (web_search, web_fetch)
- `done` — final event with `{ text, expression, routineId, refused, contextWindowExceeded, tokensUsed }`

**Usage enforcement:** Runs `checkUsage()` before streaming. Returns a 200 with `refused: true` in the `done` event when blocked — not a 4xx — so the client can show an in-persona message.

---

## Chat History

### `GET /api/emma/history`

Returns the authenticated user's last 50 chat messages, ordered chronologically.

**Auth:** Required

**Response:**

```json
{
  "messages": [
    {
      "id": "uuid",
      "role": "user" | "assistant",
      "content": "raw content (may include emotion tag for assistant)",
      "display": "stripped display text",
      "expression": "neutral" | "warm" | ... | null,
      "created_at": "2026-05-23T10:00:00Z"
    }
  ]
}
```

### `POST /api/emma/history`

Saves one or more messages. Upserts on `id` — idempotent.

**Auth:** Required

**Request body:** Single message object or array:

```json
[
  { "id": "uuid", "role": "user", "content": "...", "display": "...", "timestamp": 1234567890 },
  {
    "id": "uuid",
    "role": "assistant",
    "content": "...[emotion: warm]",
    "display": "...",
    "expression": "warm",
    "timestamp": 1234567890
  }
]
```

---

## Memory

### `GET /api/emma/memory`

Returns all memories for the authenticated user.

**Auth:** Required

**Query params:**

- `category` (optional) — filter by `preference | fact | habit | goal | relationship`

**Response:** `{ memories: MemoryEntry[] }`

### `POST /api/emma/memory`

Creates or updates a memory entry.

**Auth:** Required

**Request body:**

```json
{
  "action": "extract" | "add" | "update" | "delete",
  "text": "...",   // For "extract" — sends to Claude Haiku for extraction
  "entry": { ... } // For "add" / "update"
  "id": "..."      // For "delete"
}
```

---

## Vision

### `POST /api/emma/vision`

Analyzes a screenshot using Claude Sonnet vision. Returns a scene description suitable for injection into the system prompt.

**Auth:** Required

**Request body:**

```json
{
  "imageBase64": "data:image/png;base64,...",
  "question": "What is the user working on?" // Optional focus hint
}
```

**Response:** `{ context: "string description of the screen" }`

---

## Emotion

### `POST /api/emma/emotion`

Detects emotional state from voice transcription or text. Uses Claude Haiku.

**Auth:** Required

**Request body:**

```json
{
  "text": "I'm really stressed about this deadline",
  "source": "voice" | "text"
}
```

**Response:**

```json
{
  "emotion": {
    "primary": "stressed",
    "valence": -0.6,
    "arousal": 0.8,
    "confidence": 0.85,
    "source": "voice"
  }
}
```

---

## Usage

### `GET /api/emma/usage`

Returns token and message usage for the current window, plan limits, and any active extra packs.

**Auth:** Required

**Response:**

```json
{
  "windows": {
    "daily": {
      "windowType": "daily",
      "windowStart": "2026-06-10T10:00:00.000Z",
      "tokensUsed": 45000,
      "tokensLimit": 35714,
      "messagesUsed": 12,
      "messagesLimit": 40,
      "tokenPct": 63,
      "messagePct": 30,
      "pct": 63,
      "warningSent": false
    },
    "weekly": null,
    "monthly": null
  },
  "extraPacks": {
    "totalTokensRemaining": 500000,
    "packs": [
      {
        "id": "uuid",
        "tokensGranted": 500000,
        "tokensRemaining": 500000,
        "validUntil": "2026-07-10T10:00:00.000Z"
      }
    ]
  },
  "planId": "starter",
  "limits": {
    "daily": { "tokens": 35714, "messages": 40 },
    "weekly": { "tokens": 250000, "messages": 200 },
    "monthly": { "tokens": 1000000, "messages": 1200 }
  }
}
```

**Note:** Only the `daily` window is actively enforced (5-hour UTC-aligned rolling window). The `weekly` and `monthly` keys are always `null` in the current enforcer; `limits` provides the per-plan quota reference for display.

````

---

## Settings

### `GET /api/emma/settings`

Returns user settings (profile, preferences, timezone, billing anchor).

**Auth:** Required

### `PUT /api/emma/settings`

Updates user settings.

**Auth:** Required

**Request body:** Partial user settings object. Only provided fields are updated.

---

## Tasks (Autonomous)

### `GET /api/emma/tasks`

Lists autonomous tasks for the authenticated user.

**Auth:** Required

**Query params:**

- `status` — filter by `pending | running | completed | failed`

### `POST /api/emma/tasks`

Creates a new autonomous task.

**Auth:** Required

**Request body:**

```json
{
  "title": "Research competitors",
  "description": "Find the top 5 competitors...",
  "schedule": "2026-05-24T09:00:00Z" // Optional; null = run immediately
}
````

### `GET /api/emma/tasks/[id]`

Returns a single task with full execution log.

### `DELETE /api/emma/tasks/[id]`

Cancels a pending task.

---

## Agent Loop

### `POST /api/emma/agent`

Manages the autonomous agent loop — create tasks, approve/reject pending actions, query status, and browse history. Returns JSON (not a stream).

**Auth:** Required

**Request body:**

```json
{
  "action": "create" | "approve" | "reject" | "status" | "history",
  "goal": "Research competitors and send summary",  // create only
  "context": "Focus on pricing",                    // create only, optional
  "triggerSource": "user_request",                  // create only, optional
  "approvalId": "uuid",                             // approve / reject only
  "taskId": "uuid",                                 // status only
  "limit": 20                                       // history only, default 20
}
```

**Actions:**

| `action`  | Description                                                                       |
| --------- | --------------------------------------------------------------------------------- |
| `create`  | Starts a new agent task. Runs the loop synchronously and returns the result.      |
| `approve` | Approves a pending dangerous/moderate action and resumes the loop from that step. |
| `reject`  | Rejects a pending action and cancels the task.                                    |
| `status`  | Returns a task record with its full `action_log`.                                 |
| `history` | Returns recent tasks + any pending approvals for the user.                        |

**`create` response:** `AgentResult` — `{ taskId, status, steps[], summary, totalTokens }`

**`history` response:** `{ tasks: Task[], approvals: Approval[] }`

---

## Files

### `POST /api/emma/files`

Uploads a file. Returns the `file_id`.

**Auth:** Required

**Request body:** `multipart/form-data` with `file` field.

**Response:** `{ file_id: "file_...", name: "...", size: 12345 }`

### `GET /api/emma/files`

Lists the user's uploaded files.

### `DELETE /api/emma/files/[id]`

Deletes a file and removes the record from the `user_files` table.

### `GET /api/emma/files/download/[file_id]`

Returns a signed download URL for a file (works for files created by code execution skills).

---

## Text-to-Speech

### `POST /api/emma/tts`

Generates speech audio using ElevenLabs. Resolves the user's API key server-side from the `client_integrations` Supabase table — the client never sends the key.

**Auth:** Required

**Request body:**

```json
{
  "text": "...",
  "voiceId": "...", // Optional — ElevenLabs voice ID; falls back to persona default, then integration default, then Rachel
  "expression": "..." // Optional — one of the 10 avatar expressions; adjusts voice speed/style
}
```

**Response:** Audio stream (MP3) with `Content-Type: audio/mpeg`.

**204 response:** Returned when no ElevenLabs API key is connected. The client falls back to the browser Web Speech API silently.

**Plan-restricted voices:** If the configured voice requires a higher ElevenLabs subscription tier, the route falls back to Rachel (voice ID `21m00Tcm4TlvDq8ikWAM`) rather than failing. The stored `voiceId` in `client_integrations.metadata` is cleared so future calls use Rachel directly.

---

## Speech-to-Text

### `POST /api/emma/stt`

Server-side STT fallback using OpenAI Whisper. Used when the browser Web Speech API returns `service-not-allowed` (e.g. Linux, some mobile browsers).

**Auth:** Required  
**Plan gate:** Starter and above

**Request body:** `multipart/form-data` with `audio` field (WebM, MP4, or WAV blob recorded via `MediaRecorder`).

**Response:** `{ "transcript": "..." }`

**Model selection:** Starter → `gpt-4o-mini-transcribe`; Pro/Enterprise → `gpt-4o-transcribe`.

**Requires env var:** `OPENAI_API_KEY` (separate from `OPENROUTER_API_KEY` — OpenRouter does not expose audio endpoints).

---

## Push Notifications

### `GET /api/emma/push/subscribe`

Returns the user's current push subscription status.

**Auth:** Required

**Response:** `{ "subscribed": true | false }`

### `POST /api/emma/push/subscribe`

Registers a Web Push subscription for the authenticated user. Called by the service worker registrar after the browser grants push permission.

**Auth:** Required

**Request body:** The `PushSubscription` JSON object from `registration.pushManager.subscribe()`.

**Response:** `{ "ok": true }`

### `DELETE /api/emma/push/subscribe`

Removes the user's push subscription.

**Auth:** Required

**Response:** `{ "ok": true }`

---

## Custom Persona

### `GET /api/emma/persona`

Returns the authenticated user's custom persona configuration (decrypted).

**Auth:** Required

**Response:** `{ "persona": CustomPersona | null }`

### `PUT /api/emma/persona`

Creates or replaces the user's custom persona. Validates tone adjectives and topic tags against allowlists, runs an LLM injection classifier on the free-text description, and encrypts `voice_id` and `description` at rest.

**Auth:** Required  
**Plan gate:** Pro and above

**Request body:**

```json
{
  "name": "My Persona",
  "base_persona_id": "mommy" | "neutral",
  "tone_adjectives": ["warm", "concise"],
  "communication_style": "casual" | "professional" | "playful",
  "verbosity": "brief" | "balanced" | "detailed",
  "topics_emphasise": ["fitness", "cooking"],
  "topics_avoid": ["politics"],
  "language": "en",
  "voice_id": "ElevenLabs-voice-id",
  "description": "Optional freetext persona note (max 500 chars)"
}
```

**Response:** `{ "ok": true }`

---

## Proactive Patterns

### `GET /api/emma/patterns`

Returns the top unseen proactive suggestion for the authenticated user. Called on app mount to surface pattern-based nudges.

**Auth:** Required

**Response:** `{ "pattern": PatternDetection | null }` — `null` during quiet hours or when the daily message cap (3/day) is reached.

---

## GDPR

### `POST /api/emma/gdpr`

With `{ "action": "delete", "confirmEmail": "..." }`, deletes directly
user-owned Emma data, including encrypted and legacy chat history, memories,
uploaded-file records, tasks, approvals/action logs, usage, provenance, persona,
trial/email-sequence data, and user-owned referral/affiliate records.

Tenant-owned or shared `client_integrations` are not automatically deleted.
Referral records owned by another referrer or affiliate are also retained until
an explicit shared-data retention policy applies. The Supabase authentication
account is preserved; full login deletion requires a separate administrative
action.

**Auth:** Required

**Response:**

```
{
  "success": true,
  "status": "completed",
  "deletedAt": "...",
  "summary": ["table: count", ...],
  "verification": {
    "database": { "verified": 32, "failed": 0, "inconclusive": 0, "skipped": 0 },
    "storage":  { "verified": 2,  "failed": 0, "inconclusive": 0, "skipped": 0 },
    "external": { "verified": 0,  "failed": 0, "inconclusive": 0, "skipped": 2 }
  },
  "note": "..."
}
```

`verification` (added Phase 5D, WP7) is additive — a client written before this
field existed simply never reads it, and every other field keeps its exact
prior type and truthy/falsy meaning (`success`/`status` already reflect
verification outcome, not just deletion, since Phase 5C). It reports, per
resource category, how many resources the workflow's own independent
re-check (not the deletion step's self-report) found in each of four states:

- `verified` — confirmed empty (deletion held).
- `failed` — confirmed non-empty (deletion did not hold; drives `retry_pending`/`failed`).
- `inconclusive` — the check itself couldn't run (e.g. a transient RPC/Storage error) — evidence the check didn't happen, not evidence of leftover data.
- `skipped` — no verification adapter exists yet for this resource (currently always true for `external`, since no OAuth/background-job deletion adapter is implemented).

Clients should treat `verification` as informational detail alongside
`status`/`success`, not as a replacement for them — a verification failure
already changes `status` to `retry_pending`/`failed` on its own.

---

## MCP Servers (Unavailable)

The legacy `/api/emma/mcp/*` routes have been removed and must not be used.
Their `user_mcp_servers` storage model is inert pending a production data audit.

`client_integrations` is the sole authoritative MCP runtime model. The remaining
internal `/api/integrations/mcp/*` endpoints are feature-gated and return an
unavailable response while MCP is disabled. MCP tool execution remains
hard-blocked even if discovery is explicitly enabled; execution cannot be made
available until a verified per-action approval workflow is implemented.

---

## Integrations

### `GET /api/integrations/status`

Returns connection status for all integrations.

**Auth:** Required

**Response:**

```json
{
  "gmail": "connected",
  "google_calendar": "not_connected",
  "slack": "auth_expired",
  "notion": "connected",
  "hubspot": "not_connected"
}
```

### `GET /api/integrations/[service]/oauth/start`

Initiates OAuth flow for `gmail`, `google_calendar`, `google_drive`, `slack`, or `notion`. Redirects to the service consent screen.

### `GET /api/integrations/[service]/oauth/callback`

OAuth callback. Exchanges the authorization code for tokens, encrypts them, and stores in `client_integrations`. Redirects to `/settings/integrations`.

### `POST /api/integrations/disconnect`

Disconnects an integration and deletes its tokens.

**Auth:** Required

**Request body:** `{ "service": "gmail" }`

---

## Document Ingest

### `POST /api/emma/ingest/document`

Parses an uploaded document (PDF, DOCX, PPTX, XLSX) and returns structured text for injection into Emma's context.

**Auth:** Required

**Request body:** `multipart/form-data` with `file` field.

### `POST /api/emma/ingest/email`

Parses an email (EML or raw text) for CRM logging.

### `POST /api/emma/ingest/whatsapp`

WhatsApp Business webhook. Receives incoming messages and routes them to Emma.

**Auth:** Webhook verification token (`WHATSAPP_VERIFY_TOKEN`)

---

## Admin

### `GET /api/admin`

Returns aggregate usage stats and user list.

**Auth:** Required + email must be in `EMMA_ADMIN_EMAILS`

---

## Cron

All cron routes are authenticated via `Authorization: Bearer <CRON_SECRET>` header.

| Route                                   | Schedule         | Purpose                                                |
| --------------------------------------- | ---------------- | ------------------------------------------------------ |
| `POST /api/emma/cron/scheduled-tasks`   | every minute     | Runs pending scheduled tasks                           |
| `POST /api/emma/cron/approvals-expiry`  | every 5 minutes  | Expires stale pending approvals                        |
| `POST /api/emma/cron/heartbeat`         | every 30 minutes | Creates nudge suggestions for tasks due soon           |
| `POST /api/emma/cron/email-sequences`   | every 15 minutes | Sends drip email sequences                             |
| `POST /api/emma/cron/connection-health` | hourly           | Checks for expiring OAuth tokens, queues re-auth nudge |
| `POST /api/emma/cron/pattern-detection` | daily 02:00 UTC  | Analyzes usage patterns, generates suggestions         |
| `POST /api/emma/cron/reflection`        | daily 03:30 UTC  | Memory reflection — surfaces unresolved commitments    |
| `POST /api/emma/cron/memory-prune`      | daily 04:00 UTC  | Prunes stale/superseded memory entries                 |

---

## Billing (LemonSqueezy)

### `POST /api/lemon/checkout`

Creates a LemonSqueezy checkout session.

**Auth:** Required

**Request body:** `{ "variantId": "111111" }`

**Response:** `{ "checkoutUrl": "https://..." }`

### `POST /api/lemon/webhook`

LemonSqueezy webhook receiver. Verifies HMAC signature before processing.

**Auth:** HMAC signature (`LEMONSQUEEZY_WEBHOOK_SECRET`)

---

## Waitlist

### `GET /api/waitlist`

Returns current spot availability. Public endpoint.

**Response:**

```json
{
  "spotsRemaining": 3,
  "totalSpots": 10,
  "activeUsers": 7,
  "waitlistCount": 42
}
```

### `POST /api/waitlist`

Joins the waitlist or claims an immediate spot if one is available. Public endpoint.

**Request body (full):**

```json
{
  "action": "join",
  "name": "Jane Smith",
  "email": "jane@example.com",
  "industry": "Healthcare",
  "message": "Optional note",
  "referralSource": "Twitter"
}
```

**Request body (legacy — email only):** `{ "email": "..." }`

When a spot is available, the user's auth account is stamped with `app_metadata.waitlist_approved = true` and a magic-link welcome email is sent via Resend.

**Response variants:** `{ "result": "accepted" | "waitlisted" | "already_active" | "already_waitlisted", ... }`

---

## Waitlist Management (Admin)

### `POST /api/emma/waitlist-manage`

Admin-only endpoint for managing the waitlist. Caller must be authenticated and their email must be in `EMMA_ADMIN_EMAILS`.

**Auth:** Required + `EMMA_ADMIN_EMAILS`

**Actions:**

| `action`    | Additional fields    | Description                                                                                                                |
| ----------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `"list"`    | —                    | Returns all `waitlist_v2` entries                                                                                          |
| `"invite"`  | `waitlistId: string` | Moves entry to `invited`, stamps `waitlist_approved` on their auth account, sends magic-link invite email (48-hour expiry) |
| `"set_cap"` | `maxUsers: number`   | Updates `max_active_users` in `global_config`                                                                              |
| `"stats"`   | —                    | Returns seat counts: `maxSpots`, `activeUsers`, `spotsRemaining`, `waiting`, `invited`                                     |

---

## Related

- [Reference: Environment variables](reference-env-vars.md)
- [Reference: Plans and limits](reference-plans.md)
- [Explanation: Architecture](explanation-architecture.md)
