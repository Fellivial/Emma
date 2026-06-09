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

Returns token and message usage for all three windows.

**Auth:** Required

**Response:**

```json
{
  "windows": [
    {
      "windowType": "daily",
      "tokensUsed": 45000,
      "tokensLimit": 107142,
      "messagesUsed": 12,
      "messagesLimit": 40,
      "pct": 42
    }
  ],
  "planId": "starter"
}
```

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
```

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

Generates speech audio from text.

**Auth:** Required

**Request body:**

```json
{
  "text": "...",
  "voice_id": "...", // ElevenLabs voice ID
  "api_key": "..." // User's ElevenLabs API key (BYOK)
}
```

**Response:** Audio stream (MP3).

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

### `DELETE /api/emma/gdpr`

Permanently erases all data for the authenticated user: memories, chat history (`chat_messages` + encrypted `messages`/`conversations`), usage windows, tasks, integrations, persona, and the Supabase auth account.

**Auth:** Required

**Response:** `{ "ok": true }`

---

## MCP Servers

### `GET /api/emma/mcp`

Lists the user's connected MCP servers.

**Auth:** Required

### `POST /api/emma/mcp`

Adds a new MCP server.

**Auth:** Required

**Request body:**

```json
{
  "name": "My GitHub MCP",
  "url": "https://github-mcp.example.com/mcp",
  "auth_token": "bearer-token" // Optional; stored encrypted
}
```

### `DELETE /api/emma/mcp/[id]`

Removes an MCP server.

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

## SMB Intake (Public)

### `POST /api/intake/[slug]/chat`

Handles a chat message for the intake widget. No auth required.

**Rate limit:** 20 messages/minute per IP+slug (in-memory).

**Request body:**

```json
{
  "message": "...",
  "sessionId": "uuid"
}
```

**Response:** SSE stream (same format as brain route).

### `POST /api/intake/[slug]/form`

Submits a completed intake form directly (non-chat path).

**Request body:**

```json
{
  "name": "Jane Smith",
  "contact": "jane@example.com",
  "reason": "..."
}
```

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
| `POST /api/emma/cron/leads-cleanup`     | daily 03:00 UTC  | Purges stale leads                                     |
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
