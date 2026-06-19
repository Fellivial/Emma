# How to Connect Integrations

Connect external services so Emma can take real actions — send email, check your calendar, post to Slack, create Notion pages, manage HubSpot deals.

## Prerequisites

- Emma running with Supabase auth configured (see [Getting Started](tutorial-getting-started.md))
- A Supabase project with the schema applied
- The service's OAuth app credentials (or API key for HubSpot)

---

## Overview

Integrations use OAuth 2.0. Emma never sees your credentials — it gets a short-lived access token stored encrypted (AES-256-GCM) in the `client_integrations` Supabase table. Each token is decrypted only at call time and never logged.

The OAuth flow:

```
Settings UI → /api/integrations/[service]/oauth/start
           → Service OAuth consent screen
           → /api/integrations/[service]/oauth/callback
           → token stored encrypted in client_integrations
```

---

## Gmail

### 1. Create a Google OAuth app

1. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create an OAuth 2.0 Client ID (Web application)
3. Add authorized redirect URI: `https://yourdomain.com/api/integrations/gmail/oauth/callback`
4. Copy the Client ID and Client Secret

### 2. Add to .env.local

```
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
```

### 3. Enable the Gmail API

In Google Cloud Console → APIs & Services → Library → search "Gmail API" → Enable.

### 4. Connect in Emma

Go to `/settings/integrations` → Gmail → Connect. Approve the consent screen.

### 5. Verify

Ask Emma: "Send an email to test@example.com saying hello." Emma will call `send_email` and confirm. If the integration isn't connected, Emma will say so rather than silently failing.

---

## Google Calendar

Same OAuth app as Gmail. Enable the Calendar API additionally:

1. Google Cloud Console → APIs & Services → Library → "Google Calendar API" → Enable
2. The `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are shared with Gmail — no new credentials needed.
3. Connect at `/settings/integrations` → Google Calendar → Connect.

Ask Emma: "What's on my calendar today?" to verify.

---

## Slack

### 1. Create a Slack app

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → Create New App → From scratch
2. Under OAuth & Permissions, add redirect URL: `https://yourdomain.com/api/integrations/slack/oauth/callback`
3. Add Bot Token Scopes: `chat:write`, `files:write`, `channels:read`
4. Under Basic Information, copy the Client ID and Client Secret

### 2. Add to .env.local

```
SLACK_CLIENT_ID=your-client-id
SLACK_CLIENT_SECRET=your-client-secret
```

### 3. Connect in Emma

`/settings/integrations` → Slack → Connect. Authorize the workspace.

Ask Emma: "Post 'hello world' to #general" to verify.

---

## Notion

### 1. Create a Notion OAuth integration

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations) → New integration
2. Set type to **Public** (required for OAuth)
3. Add redirect URI: `https://yourdomain.com/api/integrations/notion/oauth/callback`
4. Copy Client ID and Client Secret

### 2. Add to .env.local

```
NOTION_CLIENT_ID=your-client-id
NOTION_CLIENT_SECRET=your-client-secret
```

### 3. Connect in Emma

`/settings/integrations` → Notion → Connect.

Ask Emma: "Create a Notion page titled 'Meeting notes'" to verify.

---

## HubSpot

HubSpot uses a private app token (not OAuth). There's no user-facing consent screen.

### 1. Create a HubSpot private app

1. HubSpot portal → Settings (gear icon) → Integrations → Private Apps
2. Create app, name it "Emma"
3. Scopes: `crm.objects.contacts.read`, `crm.objects.contacts.write`, `crm.objects.deals.read`, `crm.objects.deals.write`, `crm.objects.notes.write`
4. Copy the access token

### 2. Add to .env.local

```
HUBSPOT_API_KEY=pat-na1-...
```

HubSpot doesn't require a user-specific OAuth flow — the token is server-side only.

Ask Emma: "Get my HubSpot contacts" to verify.

---

## ElevenLabs (voice TTS)

ElevenLabs is BYOK (bring your own key) — Emma has no server-side ElevenLabs key. The user connects their own API key through the settings UI. The key is stored AES-256-GCM encrypted in `client_integrations` and decrypted server-side at call time only.

**No env vars required.** ElevenLabs is entirely user-configured.

### 1. Get an ElevenLabs API key

Go to [elevenlabs.io](https://elevenlabs.io) → your profile → API Keys → Create new key. The Free tier works; higher tiers unlock cloned and professional voices.

Ensure the key has the **Text to Speech** scope enabled. Keys missing this scope fail with a `missing_permissions` error and the integration stays connected but non-functional.

### 2. Connect in Emma

`/settings/integrations` → ElevenLabs → Connect. Paste your API key.

Emma saves it encrypted. The integration page also lets you select a default voice from your ElevenLabs library (cloned and generated voices sort first).

### 3. Verify

After connecting, Emma's voice output switches from the browser Web Speech API to ElevenLabs audio. Ask Emma anything — you should hear the ElevenLabs voice instead of the system TTS.

### Voice selection and plan restrictions

Voice priority (highest to lowest):

1. `voiceId` passed in the TTS request (per-message override)
2. `voice_id` from the user's custom persona (`personas` table)
3. Default voice saved in `client_integrations.metadata.voiceId`
4. Rachel (`21m00Tcm4TlvDq8ikWAM`) — built-in fallback

If the configured voice requires a higher ElevenLabs subscription tier than the connected key supports, Emma automatically falls back to Rachel rather than failing or disconnecting the integration. The stored voice preference is cleared so future calls use Rachel directly until the user picks a new voice.

---

## MCP Servers

Custom MCP servers are currently unavailable. MCP is disabled by default, its
settings surface is gated, and remote tool execution is hard-blocked until a
verified per-action approval workflow exists.

`client_integrations` is the sole authoritative MCP runtime model. The legacy
`user_mcp_servers` table is inert and retained only pending a production data
audit; it is not a supported setup path. Do not use `/settings/mcp` or the
removed `/api/emma/mcp/*` routes to configure MCP.

---

## Troubleshooting

**"Integration not configured"** — the OAuth flow didn't complete, or the token was revoked. Reconnect at `/settings/integrations`.

**"Auth expired"** — the access token expired and can't auto-refresh. Reconnect.

**Tool calls silently doing nothing** — check that the right API scopes were granted during OAuth. Gmail `send_email` requires `https://www.googleapis.com/auth/gmail.send`.

**Local dev** — OAuth redirect URIs must match exactly. For local dev use `http://localhost:3000/api/integrations/[service]/oauth/callback` and add it to your OAuth app's authorized URIs.

**ElevenLabs "missing_permissions"** — the API key was created without the Text to Speech scope. Delete the key in ElevenLabs, create a new one with TTS scope enabled, and reconnect.

**ElevenLabs voice silently falls back to Rachel** — the selected voice requires a higher ElevenLabs subscription tier than your key supports. Upgrade your ElevenLabs plan or pick a premade voice that your tier includes. The integration stays connected; only the voice preference is cleared.

---

## Related

- [Reference: API routes](reference-api.md) — OAuth start/callback endpoint spec
- [Reference: Environment variables](reference-env-vars.md) — full list of integration vars
- [Explanation: Security model](explanation-security.md) — how tokens are encrypted
