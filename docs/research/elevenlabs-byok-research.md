# ElevenLabs BYOK Integration Research

> **Status: RESEARCH ONLY — do not implement until instructed.**
> Sources: ElevenLabs API docs (authentication, user/subscription, models, concurrency) — live-browsed 2026-05-31.

---

## Emma's Current ElevenLabs BYOK Setup

ElevenLabs is already BYOK in Emma — users connect their own key via Settings → Integrations (per CLAUDE.md, `ELEVENLABS_API_KEY` is NOT a server var).

### What exists today

| Route        | File                                      | What it does                                                                                                                       |
| ------------ | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Connect key  | `POST /api/integrations/elevenlabs`       | Takes `apiKey` + optional `voiceId`, validates via `GET /v1/voices`, AES-256-GCM encrypts, upserts to `client_integrations`        |
| Update voice | `PATCH /api/integrations/elevenlabs`      | Verifies a new `voiceId` against the stored key                                                                                    |
| List voices  | `GET /api/integrations/elevenlabs/voices` | Decrypts key, fetches `/v1/voices`, maps to `VoiceOption[]`, marks `auth_expired` on 401                                           |
| TTS          | `POST /api/emma/tts`                      | Resolves key (60s cache), calls `/v1/text-to-speech/{voice}`, `eleven_turbo_v2_5`, returns 204 on no-key/401 (Web Speech fallback) |

**Storage**: `client_integrations` row, `service: "elevenlabs"`, `access_token` = `encrypt(key)`, `metadata: { voiceId, voiceName }`, `status`, `account_identifier`.

**Security posture (good)**: key is encrypted at rest, decrypted only server-side, never sent to the client. All TTS is proxied through Emma's server. The `xi-api-key` header is correct.

### Gaps in the current BYOK setup

1. **Validates via `/v1/voices`, never reads quota/tier.** Emma can't show the user "you've used 8,200 / 10,000 characters this month" — the single most useful BYOK signal. `GET /v1/user/subscription` provides all of it.
2. **No key-scope preflight.** The code reacts to `missing_permissions` after the fact (401). It can't tell the user upfront "this key needs Text to Speech + Voices read access."
3. **Hardcoded model** `eleven_turbo_v2_5`. BYOK keys on different plans have different model access and different per-model character limits. `/v1/models` exposes this.
4. **Hardcoded 1000-char slice** in the TTS route. The real per-request limit is model-specific AND differs for free vs subscribed users (`max_characters_request_free_user` vs `..._subscribed_user`).
5. **No concurrency awareness.** A BYOK user on the Free plan gets only 2 concurrent Multilingual-v2 requests. Emma doesn't read the concurrency response headers, so parallel TTS calls can silently queue or 429.
6. **No usage/cost surfacing.** Since the user pays for their own key, Emma should show remaining quota and warn before the user hits their cap.
7. **All TTS proxied through Emma's server.** Fine for security, but for streaming, single-use tokens would let the client stream directly from ElevenLabs (lower server load, lower latency).

---

## ElevenLabs Authentication (BYOK fundamentals)

### The header

Every request uses an `xi-api-key` header:

```
xi-api-key: <USER_KEY>
```

Emma already does this correctly.

### API key restrictions (what a BYOK user controls when creating a key)

ElevenLabs keys can be configured with three restriction types — this is why Emma sees `missing_permissions`:

| Restriction                               | What it does                                                   | BYOK relevance                                                                                                                                              |
| ----------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Scope restriction**                     | Limits which API endpoints the key can access                  | A user might create a key scoped to only TTS — but Emma also needs `/voices` read. Tell users to grant **Text to Speech + Voices** (or "has access to all") |
| **Credit quota**                          | Custom per-key credit cap                                      | A user can cap how much Emma is allowed to spend — surfaces as `quota_exceeded`                                                                             |
| **IP whitelisting** (Enterprise, preview) | Restricts the key to specific IPs/CIDRs; non-whitelisted → 403 | If a BYOK user whitelists IPs, Emma's server IP must be allowed, or every call 403s                                                                         |

**Key guidance for Emma's connect UI**: tell the user to create a key with access to **Text to Speech**, **Voices** (read), and **User** (read, for quota). The current error message already points at `elevenlabs.io/app/settings/api-keys` — good. Add the explicit scope list.

### Single-use tokens (client-side without exposing the key)

> "For certain endpoints, you can use single use tokens to authenticate your requests. These tokens are valid for a limited time and can be used to connect to the API without exposing your API key, for example from the client side."

Emma's server can mint a short-lived single-use token from the stored key and hand it to the browser, which streams TTS directly from ElevenLabs. The real key never leaves Emma's server, and Emma's server isn't in the audio path. Useful for the WebSocket streaming endpoint. Not required — current server-proxy approach is secure — but it's the path to lower-latency streaming.

---

## `GET /v1/user/subscription` — The BYOK Quota Endpoint (biggest missing piece)

This is what Emma should call on connect (and periodically) to give the user visibility into their own usage.

```typescript
// GET https://api.elevenlabs.io/v1/user/subscription
// headers: { "xi-api-key": key }
```

Response (key fields for BYOK):

| Field                              | Meaning                                                                            | Emma use                                    |
| ---------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------- |
| `tier`                             | Plan name (`free`, `starter`, `creator`, `pro`, `scale`, `business`, `enterprise`) | Show plan; drives concurrency expectations  |
| `character_count`                  | Characters used this period                                                        | "8,200 used"                                |
| `character_limit`                  | Max characters this billing period                                                 | "/ 10,000"                                  |
| `next_character_count_reset_unix`  | When the quota resets                                                              | "resets in 6 days"                          |
| `status`                           | Subscription status (`active`, …)                                                  | Detect lapsed/paused accounts               |
| `can_extend_character_limit`       | Whether overage billing is on                                                      | Whether requests still succeed past the cap |
| `current_overage`                  | `{ amount, currency }` extra spend                                                 | Warn before charging the user               |
| `has_open_invoices`                | Billing problem flag                                                               | Surface "fix billing on ElevenLabs"         |
| `voice_slots_used` / `voice_limit` | Voice clone usage                                                                  | For voice-management UI                     |
| `can_use_instant_voice_cloning`    | Whether IVC is available on this key                                               | Gate the clone feature                      |

**This solves gaps #1 and #6.** On connect, store `tier` + limits in `metadata`; show a usage bar in Settings; warn when `character_count / character_limit > 0.8`.

---

## `GET /v1/models` — Capability Discovery (per BYOK key)

```typescript
// GET https://api.elevenlabs.io/v1/models  (xi-api-key header)
```

Returns the models THIS key can use, with per-model details:

| Field                                     | Meaning                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------ |
| `model_id`                                | e.g. `eleven_turbo_v2_5`, `eleven_multilingual_v2`, `eleven_flash_v2_5`, `eleven_v3` |
| `can_do_text_to_speech`                   | Filter to TTS-capable models                                                         |
| `can_use_style` / `can_use_speaker_boost` | Whether `voice_settings.style` / `use_speaker_boost` are honored                     |
| `max_characters_request_free_user`        | Per-request char cap for FREE users                                                  |
| `max_characters_request_subscribed_user`  | Per-request char cap for SUBSCRIBED users                                            |
| `maximum_text_length_per_request`         | Hard ceiling                                                                         |
| `token_cost_factor`                       | Relative cost (e.g. Flash is cheaper)                                                |
| `languages[]`                             | Supported languages                                                                  |
| `concurrency_group`                       | Which concurrency bucket it uses                                                     |

**This solves gaps #3 and #4.** Instead of hardcoding `eleven_turbo_v2_5` and a 1000-char slice, Emma can: list TTS-capable models the key supports, pick per expression (per `tts-voice-quality-research.md`), and slice text to the model's actual `max_characters_request_*` limit for the user's tier.

### Model character limits (from /docs/models)

| Model                    | Per-request char limit | ~Audio  | Notes                                |
| ------------------------ | ---------------------- | ------- | ------------------------------------ |
| `eleven_v3`              | 5,000                  | ~5 min  | Most expressive; audio tags          |
| `eleven_flash_v2_5`      | 40,000                 | ~40 min | Ultra-low latency ~75ms, 50% cheaper |
| `eleven_multilingual_v2` | 10,000                 | ~10 min | Most stable, 29 langs                |
| `eleven_turbo_v2_5`      | (turbo, low latency)   | —       | Emma's current default               |

---

## Concurrency Limits by Tier (critical for BYOK)

A BYOK user's plan determines how many simultaneous requests Emma can make on their key.

| Plan           | Multilingual v2 | Flash    | STT      | Priority    |
| -------------- | --------------- | -------- | -------- | ----------- |
| **Free**       | **2**           | **4**    | 6        | 3           |
| **Starter**    | 3               | 6        | 9        | 4           |
| **Creator**    | 5               | 10       | 20       | 5           |
| **Pro**        | 10              | 20       | 40       | 5           |
| **Scale**      | 15              | 30       | 60       | 5           |
| **Business**   | 15              | 30       | 60       | 5           |
| **Enterprise** | Elevated        | Elevated | Elevated | Highest (6) |

**Key facts for Emma:**

- **A Free BYOK key gets only 2 concurrent Multilingual-v2 requests.** Many BYOK users will be on Free/Starter. Emma must not fire parallel TTS calls without checking.
- **Monitor via response headers**: every TTS response includes `current-concurrent-requests` and `maximum-concurrent-requests`. Read them to back off before hitting the cap.
- **WebSocket is far more concurrency-efficient**: with HTTP, each request counts the whole time. With a WebSocket, **only the time the model is generating audio counts** — an idle open socket counts for nothing. For low-tier BYOK keys, the streaming WebSocket endpoint stretches the concurrency budget dramatically.
- Past the limit, requests queue (typically +~50ms). On Enterprise they may still succeed slower; on lower tiers they can fail.

**This solves gap #5.** Emma should: read the tier from `/v1/user/subscription`, avoid parallel HTTP TTS on Free/Starter, and prefer the WebSocket streaming endpoint for low-tier keys.

---

## Error Handling for BYOK Keys

| Status / error               | Cause                                       | Emma's response                                                                       |
| ---------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------- |
| `401` (invalid)              | Key revoked or wrong                        | Mark `auth_expired`, prompt reconnect (Emma does this ✅)                             |
| `401` `missing_permissions`  | Key scoped too narrowly                     | Tell user to grant TTS + Voices + User scopes (Emma detects this ✅, improve message) |
| `403`                        | IP whitelist block (Enterprise)             | Tell user to whitelist Emma's server IP                                               |
| `429` / concurrency exceeded | Too many simultaneous requests for the tier | Back off, retry, or queue; read `current-concurrent-requests` header                  |
| `quota_exceeded`             | Character limit hit, no overage             | Show "ElevenLabs quota reached — resets <date>"; fall back to Web Speech              |
| `402` / `has_open_invoices`  | Billing problem                             | Surface "fix billing on ElevenLabs"                                                   |

---

## Recommended BYOK Improvements for Emma

### Phase 1 — Quota visibility (highest value, low effort)

- On connect, also call `GET /v1/user/subscription`. Store `tier`, `character_count`, `character_limit`, `next_character_count_reset_unix` in `metadata`.
- Add a usage bar to Settings → Integrations: "8,200 / 10,000 characters · resets in 6 days · Starter plan".
- Warn at 80% usage; surface `has_open_invoices` / `status != active`.

### Phase 2 — Model + scope correctness

- Call `GET /v1/models` on connect; store the TTS-capable model list. Stop hardcoding `eleven_turbo_v2_5`.
- Slice TTS text to the model's `max_characters_request_subscribed_user` (or `_free_user`) instead of a fixed 1000.
- Improve the connect UI to list required scopes (Text to Speech, Voices read, User read).

### Phase 3 — Concurrency + streaming

- Read `current-concurrent-requests` / `maximum-concurrent-requests` response headers; throttle parallel TTS.
- For low-tier keys, switch to the WebSocket streaming endpoint (`/v1/text-to-speech/{voice}/stream-input`) — far better concurrency economics, lower latency.
- Optionally mint single-use tokens so the browser streams directly from ElevenLabs (key stays server-side, Emma's server leaves the audio path).

### Files that would change (when implementing)

| File                                                      | Phase | Change                                                                         |
| --------------------------------------------------------- | ----- | ------------------------------------------------------------------------------ |
| `src/app/api/integrations/elevenlabs/route.ts`            | 1     | After validation, fetch `/v1/user/subscription`; store tier+limits in metadata |
| New: `src/app/api/integrations/elevenlabs/usage/route.ts` | 1     | GET endpoint returning live quota for the Settings usage bar                   |
| `src/app/api/integrations/elevenlabs/route.ts`            | 2     | Fetch `/v1/models`; store supported TTS models                                 |
| `src/app/api/emma/tts/route.ts`                           | 2     | Model from metadata not hardcoded; slice to model's real char limit            |
| `src/app/api/emma/tts/route.ts`                           | 3     | Read concurrency headers; throttle; optional WebSocket streaming path          |

---

## Key Findings Summary

| Topic                 | Finding                                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Auth                  | `xi-api-key` header; keys have scope/credit/IP restrictions (Emma's `missing_permissions` = scope too narrow)           |
| Biggest missing piece | `GET /v1/user/subscription` — tier, character_count/limit, reset date, overage, billing status                          |
| Model discovery       | `GET /v1/models` — which models the key supports + free-vs-subscribed per-request char limits                           |
| Hardcode to fix       | `eleven_turbo_v2_5` model + 1000-char slice — both should come from `/v1/models`                                        |
| Concurrency           | Plan-driven: Free=2, Starter=3, Creator=5, Pro=10 (Multilingual v2). Read `current/maximum-concurrent-requests` headers |
| Streaming efficiency  | WebSocket only counts toward concurrency while generating — huge win for low-tier BYOK keys                             |
| Client-side option    | Single-use tokens let the browser stream directly without exposing the key                                              |
| Security posture      | Emma's encrypt-at-rest + server-proxy is already correct; single-use tokens are an optional optimization                |

---

## Sources

- ElevenLabs Authentication — `xi-api-key` header, scope/credit/IP key restrictions, single-use tokens — live-browsed 2026-05-31
- ElevenLabs `GET /v1/user/subscription` — full field reference (tier, character_count/limit, reset, overage, voice slots, status)
- ElevenLabs `GET /v1/models` — capability fields (can_do_text_to_speech, max_characters_request_free/subscribed_user, token_cost_factor, languages, concurrency_group)
- ElevenLabs Models / Concurrency docs — per-tier concurrency table, WebSocket vs HTTP concurrency, `current/maximum-concurrent-requests` headers, model character limits
- Emma source: `src/app/api/integrations/elevenlabs/route.ts`, `voices/route.ts`, `src/app/api/emma/tts/route.ts`
