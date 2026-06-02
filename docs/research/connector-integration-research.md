# Connector Integration Research: OAuth, MCP, and Universal Platforms

> **Status: RESEARCH ONLY — do not implement until instructed.**
> Sources: MCP authorization spec (2025-06-18), Anthropic MCP connector/tunnels docs, Composio, Pipedream Connect, Nango — live-browsed 2026-05-31.

---

## Emma's Current Connector Architecture

### What exists today

Emma has a **hand-rolled OAuth + adapter layer**. Each service is implemented from scratch.

| Layer             | File                                                         | What it does                                                                                   |
| ----------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Adapter interface | `src/core/integrations/adapter.ts`                           | `IntegrationAdapter` with `validate()` + `send()`; token retrieval with AES-256-GCM decryption |
| OAuth start       | `src/app/api/integrations/[service]/oauth/start/route.ts`    | Per-provider auth URL builder; CSRF `state` in `oauth_states` table                            |
| OAuth callback    | `src/app/api/integrations/[service]/oauth/callback/route.ts` | Single-use state validation, code→token exchange, encrypt + upsert                             |
| Google adapter    | `src/core/integrations/google.ts`                            | Gmail/Calendar/Drive; manual token refresh with 401 retry                                      |
| Other adapters    | `slack.ts`, `notion.ts`, `hubspot.ts`, `whatsapp.ts`         | Per-service fetch wrappers                                                                     |
| Ingest            | `src/app/api/emma/ingest/{email,whatsapp,document}/route.ts` | Inbound webhook receivers                                                                      |
| MCP token         | `src/app/api/integrations/mcp/encrypt-token/route.ts`        | Encrypts a user-supplied MCP token (MCP awareness exists, unused)                              |

**Current supported services**: `gmail`, `google_calendar`, `google_drive`, `slack`, `notion`, `hubspot`.

**Storage**: `client_integrations` table — `access_token` / `refresh_token` (encrypted), `token_expires_at`, `account_identifier`, `metadata`, `status`, `last_error`, `last_used_at`.

**Token lifecycle**: 5-minute expiry buffer → `IntegrationAuthExpiredError` → adapter calls its own `refreshGoogleToken()`. Each provider reimplements refresh.

### Gaps in the current architecture

1. **Every connector is hand-written** — adding Linear, Jira, Salesforce, Discord, etc. means writing a new adapter, OAuth branch, scope map, and refresh logic each time. This does not scale past ~10 services.
2. **Token refresh is per-provider** — only Google has refresh. Notion/Slack tokens don't refresh (they're long-lived today, so it works, but it's fragile).
3. **No MCP client** — the `mcp/encrypt-token` route hints at MCP intent, but Emma can't actually connect to remote MCP servers. The entire MCP connector ecosystem (1000s of servers) is unreachable.
4. **OAuth scopes are minimal and hardcoded** — `gmail.send` only (can't read mail), `calendar.events`, `drive.file`. No read scopes for proactive features.
5. **Webhook ingestion is custom per source** — WhatsApp/email/document each have bespoke receivers. No unified signature-verification or event-routing layer.
6. **No connection-expiry events** — Emma can't proactively tell a user "your Slack connection expired, reconnect."
7. **No per-tool allowlist/denylist** — when a connector is connected, all its capabilities are exposed. No read-only mode or human-confirm gate for destructive actions.

---

## Two Architectural Paths

There are two fundamentally different ways to add connectors:

| Path                                     | What it is                                                                    | Best when                                                                           |
| ---------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **A. Direct OAuth + adapters** (current) | You write OAuth + API calls per service                                       | You need 5–15 deeply-customized integrations, full control, no per-call vendor cost |
| **B. Universal connector platform**      | A vendor handles OAuth, refresh, and normalized APIs for 800–10,000+ services | You need breadth fast, don't want to maintain auth for dozens of APIs               |
| **C. MCP connector**                     | Connect to remote MCP servers that expose tools over HTTP                     | The service already has an MCP server; you want the model to call tools directly    |

Emma is on Path A. The deep dive below covers when to adopt B or C, and how.

---

## Path C: MCP Connector (Model Context Protocol)

### What it is

MCP is the open standard. A **remote MCP server** exposes tools over HTTP. The Anthropic Messages API can connect to them directly via the **MCP connector** — no MCP client implementation needed.

### Anthropic MCP Connector — API shape

Beta header required: `"anthropic-beta": "mcp-client-2025-11-20"`.

```typescript
const response = await client.beta.messages.create({
  model: "claude-opus-4-8",
  max_tokens: 1000,
  messages: [{ role: "user", content: "What's blocking the release?" }],
  mcp_servers: [
    {
      type: "url", // only "url" supported
      url: "https://mcp.linear.app/sse", // must be https://
      name: "linear-mcp", // unique id
      authorization_token: "USER_OAUTH_TOKEN", // optional OAuth bearer
    },
  ],
  tools: [{ type: "mcp_toolset", mcp_server_name: "linear-mcp" }],
  betas: ["mcp-client-2025-11-20"],
});
```

### Tool configuration — allowlist / denylist / defer

This solves Emma gap #7 directly:

```typescript
// Allowlist: disable all by default, enable specific tools
{
  type: "mcp_toolset",
  mcp_server_name: "google-calendar-mcp",
  default_config: { enabled: false },
  configs: {
    search_events: { enabled: true },
    create_event: { enabled: true },
  }
}

// Denylist: enable all, block destructive tools (read-only assistant pattern)
{
  type: "mcp_toolset",
  mcp_server_name: "google-calendar-mcp",
  configs: {
    delete_all_events: { enabled: false },
    share_calendar_publicly: { enabled: false },
  }
}

// defer_loading: hide tool descriptions until the model searches for them
// (pairs with the Tool Search tool — saves context tokens on large servers)
{
  type: "mcp_toolset",
  mcp_server_name: "big-server",
  default_config: { defer_loading: true }
}
```

Config merge precedence: per-tool `configs` > set-level `default_config` > system defaults.

### Response content types

```json
{ "type": "mcp_tool_use", "id": "mcptoolu_...", "name": "echo",
  "server_name": "linear-mcp", "input": {...} }

{ "type": "mcp_tool_result", "tool_use_id": "mcptoolu_...",
  "is_error": false, "content": [{ "type": "text", "text": "..." }] }
```

### Limits

- **Tool calls only** — MCP resources, prompts, sampling are NOT supported via the connector.
- **Public HTTPS only** — Streamable HTTP or SSE transport. Local STDIO servers can't connect directly (see MCP Tunnels below).
- **Not ZDR-eligible** — data retained per standard policy.
- Available on Claude API, Claude Platform on AWS, Microsoft Foundry. NOT on Bedrock or Vertex AI.

### MCP Tunnels — connecting private servers

For MCP servers inside a private network (no public HTTPS), **MCP tunnels** (beta) carry traffic over an outbound-only `cloudflared` connection. No inbound firewall ports.

Three security layers:

1. Outer mTLS between Anthropic and the transport, with IP validation
2. Inner TLS from Anthropic's backend to your proxy (Cloudflare can't read payloads)
3. OAuth on each MCP server

Relevance to Emma: only matters if Emma ever runs internal MCP servers. Not a near-term need.

### Emma + MCP — what this unlocks

If Emma adds MCP client support, she can reach any of the **1000s of remote MCP servers** (Linear, Sentry, Notion, Stripe, Asana, etc.) without writing adapters. The OAuth token Emma already stores in `client_integrations` can be passed as `authorization_token`.

**The MCP authorization model is the standardized version of what Emma hand-rolls today** — see next section.

---

## MCP Authorization Spec (OAuth 2.1)

This is the canonical security model for connector auth. Emma's current OAuth implementation should be measured against it. Based on:

- OAuth 2.1 (draft-ietf-oauth-v2-1)
- RFC 8414 (Authorization Server Metadata)
- RFC 7591 (Dynamic Client Registration)
- RFC 9728 (Protected Resource Metadata)
- RFC 8707 (Resource Indicators)

### Key requirements

| Requirement                        | What it means                                                                                 | Emma status                                     |
| ---------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| **PKCE** (mandatory)               | Client creates a secret verifier/challenge pair so an intercepted auth code can't be redeemed | ❌ Emma uses `state` only, no PKCE              |
| **`state` param**                  | CSRF protection; verify it matches on callback                                                | ✅ Emma does this (single-use, TTL)             |
| **Exact redirect URI**             | AS validates redirect URI against pre-registered value                                        | ✅ Emma uses fixed redirect URIs                |
| **Resource indicators (RFC 8707)** | `resource` param binds token to a specific server audience                                    | ❌ N/A for direct APIs; needed for MCP          |
| **Short-lived access tokens**      | Reduce blast radius of a leaked token                                                         | ⚠️ Depends on provider                          |
| **Refresh token rotation**         | For public clients, rotate refresh tokens on each use                                         | ❌ Emma reuses the same refresh token           |
| **HTTPS everywhere**               | All AS endpoints + redirect URIs over HTTPS (localhost exempt)                                | ✅                                              |
| **Token audience validation**      | Server rejects tokens not issued for it                                                       | N/A (Emma is the client, not a resource server) |
| **No token passthrough**           | An MCP server must NOT forward the client's token to upstream APIs (confused deputy)          | Relevant only if Emma becomes an MCP server     |

### The two security upgrades Emma should adopt regardless of path

1. **Add PKCE to the OAuth flow.** The `oauth/start` route should generate a `code_verifier`, store it alongside `state`, send `code_challenge` + `code_challenge_method=S256`, and the callback should send `code_verifier` in the token exchange. This is the single biggest security gap.

2. **Confused-deputy protection.** Emma's `oauth_states` already binds `state` to `client_id` + `user_id` + `service`. Good. The spec's main warning (don't proxy tokens to third parties) doesn't apply because Emma calls provider APIs directly with provider-issued tokens.

---

## Path B: Universal Connector Platforms

Three platforms dominate. All solve the "I don't want to hand-write 50 OAuth flows" problem.

### Comparison

| Platform              | Coverage                   | Model                                       | Self-host             | Token refresh  | Best for                                   |
| --------------------- | -------------------------- | ------------------------------------------- | --------------------- | -------------- | ------------------------------------------ |
| **Composio**          | 1000+ toolkits             | Agent-first; per-user sessions, tool search | No (hosted)           | Auto, per-user | AI agents that call tools by intent        |
| **Pipedream Connect** | 2700+ apps / 10,000+ tools | Managed auth + proxy + MCP server           | No (hosted)           | Auto           | Embedding integrations in your product     |
| **Nango**             | 800+ APIs                  | Code-first; OAuth + syncs + webhooks        | **Yes (open-source)** | Auto           | Full control, self-hosting, data residency |

### Composio (Agent-First)

Built specifically for AI agents. The model:

- **Toolkits** — 1000+ pre-built app integrations (Slack, Gmail, Linear, etc.)
- **Auth Configs** — a blueprint per toolkit defining OAuth/API-key/Bearer + scopes. Reusable across all users.
- **Connect Link** — hosted OAuth flow. You redirect the user to a Composio URL; they auth; Composio handles the callback and stores the token scoped to your `user_id`.
- **Per-user sessions** — tokens scoped + auto-refreshed per end-user.
- **Tool search** — `COMPOSIO_SEARCH_TOOLS` surfaces the right tool from 1000+ by intent (just-in-time loading).
- **Triggers** — subscribe to events (`gmail.message.new`, `stripe.charge.succeeded`, `linear.issue.opened`) routed to your agent.
- **White-labeling** — remove Composio branding from OAuth consent screens.

```typescript
// Hosted auth (Connect Link)
const connectionRequest = await composio.connectedAccounts.link(
  userId, // your end-user id
  authConfigId, // your reusable auth config
  { callbackUrl: "https://emma.app/callback" }
);
// redirect user to connectionRequest.redirectUrl
```

First-class providers for Anthropic, OpenAI, Vercel AI, LangChain, etc.

### Pipedream Connect

- **Managed auth** for 2700+ APIs via Client SDK or Connect Link.
- **Connect proxy** — send custom API requests without ever touching the user's credentials yourself.
- **MCP server** — exposes 10,000+ tools as an MCP server your agent connects to.
- **`external_user_id`** — identifies each end-user; tokens scoped per user.
- Does NOT store request/response payloads. Credentials encrypted at rest.
- Free in dev mode; paid for production.

### Nango (Open-Source, Self-Hostable)

The only self-hostable option. Code-first.

- **800+ APIs** with OAuth, token refresh, and API-key handling built in.
- **Syncs** — scheduled incremental data sync with checkpointing, caching, deletion detection.
- **Actions** — one-off API calls.
- **Webhooks** — high-concurrency inbound webhook handling.
- **MCP + tools** — expose integrations as MCP servers / tool-calling schemas.
- **Per-tenant credential isolation**, encryption at rest, RBAC, self-hosting.
- Open-source (9k+ GitHub stars).

```typescript
// Nango sync example (code-first)
export default createSync({
  frequency: "every 5 minutes",
  model: Contact,
  exec: async (nango) => {
    for (const contact of nango.paginate("/crm/contacts")) {
      await nango.batchSave(contact);
    }
  },
});
```

### Which fits Emma

| If Emma wants...                                | Choose                                                                                        |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Keep data on own infra, self-host, full control | **Nango** (open-source) — closest to current architecture, replaces hand-rolled OAuth/refresh |
| Fastest agent tool coverage by intent           | **Composio** — agent-first, tool search                                                       |
| Embed many integrations with managed proxy      | **Pipedream Connect**                                                                         |
| Reach MCP servers without a platform            | **Anthropic MCP connector** directly                                                          |

Given Emma already encrypts tokens in Supabase and values control (AES-256-GCM, RLS), **Nango** is the most natural platform fit, and **MCP connector** is the most natural way to add breadth without a vendor.

---

## Webhook Ingestion (Emma already does this for WhatsApp/email)

Connector platforms standardize inbound events. Emma's `ingest/*` routes are bespoke. The patterns to adopt:

### Signature verification at ingress (before any handler runs)

From Composio's trigger ingress model:

- **HMAC-SHA256** for Slack-style providers (Emma's WhatsApp already uses `WHATSAPP_APP_SECRET` for HMAC per CLAUDE.md ✅)
- **Ed25519** or shared-token matching for others
- **Timestamp replay protection** — reject requests outside an allowed skew window
- Reject unsigned/tampered requests with `400` before fanning out

### Per-tenant webhook routing

Each connected OAuth app gets its own ingress URL:

```
https://ingress.example.com/webhook/{toolkit}/{endpoint_id}/event
```

Events route only to that tenant's subscriptions. Per-project rate limit + backpressure budget.

### Connection-expiry events

Subscribe to connection-expiry so the agent can proactively prompt re-auth. This fixes Emma gap #6 — pairs perfectly with the autonomy/proactive system (a Tier 2 suggestion: "Your Slack connection expired — reconnect?").

---

## OAuth Scope Expansion (for proactive features)

Emma's current scopes are write-only-minimal. Proactive vision/autonomy features need read scopes:

| Service  | Current scope     | Proactive scope needed                                  |
| -------- | ----------------- | ------------------------------------------------------- |
| Gmail    | `gmail.send`      | `gmail.readonly` (scan for urgent unread)               |
| Calendar | `calendar.events` | `calendar.readonly` (morning briefing, deadline alerts) |
| Drive    | `drive.file`      | `drive.readonly` (read shared docs)                     |
| Slack    | `chat:write`      | `channels:history`, `users:read` (read mentions)        |

Read scopes require a re-consent flow. Each is incremental; expanding scope means the user re-authorizes. Plan scope upgrades as a migration, not a silent change.

---

## Recommended Direction for Emma

Three layers, adopt in order:

### Phase 1 — Harden the existing OAuth (security)

- Add **PKCE** (`code_verifier` + `S256 challenge`) to `oauth/start` + `oauth/callback`. Biggest security gap.
- Add **refresh-token rotation** where providers support it.
- Add a **connection-expiry check cron** → surface re-auth as a Tier 2 proactive suggestion.

### Phase 2 — Add MCP client support (breadth, low effort)

- Implement the MCP connector pattern in `agent-loop.ts`: pass `mcp_servers` + `mcp_toolset` to the Messages API.
- Reuse `client_integrations` tokens as `authorization_token`.
- Use **denylist** config to block destructive tools by default (read-only-first).
- This unlocks Linear, Sentry, Stripe, Asana, etc. with zero per-service adapters.

### Phase 3 — Universal platform (scale, if breadth demands it)

- If Emma needs 30+ integrations, adopt **Nango** (self-hostable, matches the encrypt-at-rest model) to replace hand-rolled OAuth/refresh, or **Composio** for agent-first tool search.
- Migrate `IntegrationAdapter` implementations to thin wrappers over the platform.

### Files that would change (when implementing)

| File                                                         | Phase | Change                                                  |
| ------------------------------------------------------------ | ----- | ------------------------------------------------------- |
| `src/app/api/integrations/[service]/oauth/start/route.ts`    | 1     | Generate + store `code_verifier`; send `code_challenge` |
| `src/app/api/integrations/[service]/oauth/callback/route.ts` | 1     | Send `code_verifier` in token exchange                  |
| `src/core/integrations/adapter.ts`                           | 1     | Add `refreshToken()` rotation helper; expiry-event emit |
| New: `src/app/api/emma/cron/connection-health/route.ts`      | 1     | Detect expiring tokens → Tier 2 suggestion              |
| `src/core/agent-loop.ts`                                     | 2     | Pass `mcp_servers` + `mcp_toolset` to Messages API      |
| New: `src/core/integrations/mcp-client.ts`                   | 2     | Build MCP server config from `client_integrations`      |
| `src/core/integrations/*.ts`                                 | 3     | (Optional) thin wrappers over Nango/Composio            |

---

## Key Findings Summary

| Topic                | Finding                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------ |
| Emma's model         | Hand-rolled OAuth + per-service adapters; doesn't scale past ~10 services                  |
| Biggest security gap | No PKCE — auth codes are interceptable. OAuth 2.1 / MCP spec mandate it                    |
| Fastest breadth win  | MCP connector — `mcp_servers` + `mcp_toolset`, reuse existing tokens, zero adapters        |
| Tool safety          | `mcp_toolset` allowlist/denylist gives read-only mode + destructive-action gating          |
| Best platform fit    | Nango (open-source, self-host, encrypt-at-rest matches Emma); Composio for agent-first     |
| Webhook hardening    | HMAC-SHA256 + timestamp replay protection at ingress before any handler                    |
| Connection expiry    | Subscribe to expiry events → proactive re-auth suggestion (ties to autonomy system)        |
| Scope expansion      | Proactive features need read scopes (`gmail.readonly`, `calendar.readonly`) via re-consent |
| MCP connector limits | Tool calls only, public HTTPS only, not ZDR-eligible, not on Bedrock/Vertex                |

---

## Provider-Agnostic MCP — Reaching Connectors WITHOUT the Anthropic API

> **Added 2026-05-31.** Path C above describes **Anthropic's** MCP connector (`mcp_servers` +
> `mcp_toolset` inside the Messages API). That feature runs on the **Anthropic API only** — it is
> NOT available through OpenRouter, which is how Emma talks to every model
> (`OPENROUTER_API_KEY`, free models like `openai/gpt-oss-120b:free`). So Path C as written is off
> the table. **But Emma can still use MCP** — by running her own MCP client. This section is the
> provider-agnostic, free replacement.

### The shift: Anthropic-hosted MCP → Emma-hosted MCP client

|                                 | Anthropic MCP connector (Path C above) | Provider-agnostic MCP client (this section)     |
| ------------------------------- | -------------------------------------- | ----------------------------------------------- |
| Who runs the MCP client         | Anthropic's servers                    | **Emma's own server**                           |
| Where tools are sent            | Anthropic Messages API                 | Any model via OpenRouter (free models included) |
| API shape                       | `mcp_servers` + `mcp_toolset` blocks   | Standard OpenAI-format `tools` array            |
| Works on OpenRouter free models | ❌ No                                  | ✅ Yes                                          |
| Cost                            | Anthropic API pricing                  | Free (just Emma's compute + the model)          |

The mechanism: Emma connects to a remote MCP server, lists its tools, converts them to plain
function tools, and passes them to the OpenRouter chat call. When the model emits a `tool_call`,
Emma's MCP client executes it against the MCP server. No Anthropic API anywhere.

### The recommended stack (Emma is Next.js — this is the natural fit)

Three free, open-source packages:

1. **`@openrouter/ai-sdk-provider`** — official OpenRouter provider for the Vercel AI SDK. Makes any
   OpenRouter model (including free ones) a drop-in AI SDK model.
2. **Vercel AI SDK (`ai`)** — `generateText` / `streamText` with a `tools` object, multi-step loop
   (`stopWhen`), and per-tool approval gates (`needsApproval`).
3. **`@ai-sdk/mcp`** — `createMCPClient` connects to remote MCP servers (HTTP/SSE/stdio) and
   `mcpClient.tools()` converts MCP tools into AI SDK tools.

```typescript
import { openrouter } from "@openrouter/ai-sdk-provider";
import { streamText, stepCountIs } from "ai";
import { createMCPClient } from "@ai-sdk/mcp";

// 1. Connect to a remote MCP server (reuse Emma's stored OAuth token).
const mcpClient = await createMCPClient({
  transport: {
    type: "http",
    url: "https://mcp.linear.app/mcp",
    headers: { Authorization: `Bearer ${userLinearToken}` }, // from client_integrations
    redirect: "error", // SSRF protection — reject redirects
    // authProvider: emmaOAuthProvider,  // alternative: full OAuth handshake
  },
});

// 2. Convert MCP tools → AI SDK tools.
const tools = await mcpClient.tools(); // schema discovery (auto)

// 3. Run on a FREE OpenRouter model. Same tools, no Anthropic API.
const result = await streamText({
  model: openrouter("openai/gpt-oss-120b:free"),
  tools,
  stopWhen: stepCountIs(5), // multi-step agent loop
  prompt: "What's blocking the release?",
  onFinish: async () => {
    await mcpClient.close();
  },
});
```

That is the entire replacement for Anthropic's `mcp_servers` + `mcp_toolset`, on free models.

### Mapping Anthropic's MCP features to the provider-agnostic equivalents

| Anthropic MCP connector feature                      | Provider-agnostic equivalent                                                             |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `mcp_servers: [{ url, authorization_token }]`        | `createMCPClient({ transport: { type:"http", url, headers } })`                          |
| `mcp_toolset` allowlist (`enabled:false` + per-tool) | `mcpClient.tools({ schemas: { onlyThisTool: {...} } })` — only listed tools load         |
| `mcp_toolset` denylist (block destructive tools)     | Omit them from `schemas`, OR set `needsApproval:true` to gate execution                  |
| `defer_loading` (hide until searched)                | AI SDK doesn't defer MCP tools; keep the toolset small per request instead               |
| `authorization_token` (OAuth bearer)                 | `headers.Authorization` or `authProvider` (full OAuth on HTTP/SSE transport)             |
| Human-confirm before destructive action              | `needsApproval: true` → returns `tool-approval-request`, you collect a decision, re-call |
| Private network (MCP Tunnels)                        | Self-host the MCP server; reach it over your own network — no Anthropic tunnel needed    |

**Tool approval (the safety gate)** is actually better than Anthropic's static denylist — it's
dynamic:

```typescript
import { tool } from "ai";
import { z } from "zod";

const sendEmail = tool({
  description: "Send an email",
  inputSchema: z.object({ to: z.string(), subject: z.string(), body: z.string() }),
  needsApproval: async ({ to }) => !to.endsWith("@trusted.com"), // gate by input
  execute: async (args) => {
    /* ... */
  },
});
```

When `needsApproval` fires, the SDK returns a `tool-approval-request` part instead of executing.
Emma surfaces it as a Tier 2/3 confirmation (ties into the autonomy system), collects the user's
decision, and re-calls with a `tool-approval-response`. This is the read-only-first / human-in-the-loop
gate, model-agnostic.

### MCP elicitation (in-flow user input)

The AI SDK MCP client supports **elicitation** — a server can ask the user for input mid-call:

```typescript
const mcpClient = await createMCPClient({
  transport: { type: "sse", url: "https://your-server.com/sse" },
  capabilities: { elicitation: {} },
});

mcpClient.onElicitationRequest(ElicitationRequestSchema, async (request) => {
  const userInput = await getInputFromUser(request.params.message, request.params.requestedSchema);
  return { action: "accept", content: userInput }; // or "decline" / "cancel"
});
```

Useful when an MCP connector needs a missing parameter (a date, a confirmation) without breaking the
agent loop. Emma routes the prompt to the chat UI.

### Connecting to MCP servers WITHOUT the AI SDK (raw client)

If Emma doesn't adopt the Vercel AI SDK, the official **`@modelcontextprotocol/client`** package
(v1.x stable; v2 in pre-alpha) gives a raw MCP client: transports (StreamableHTTP/SSE/stdio), OAuth
helpers, `listTools()`, `callTool()`. Emma would call `listTools()`, convert the JSON schemas to
OpenAI `tools` format herself, and execute `callTool()` when the model responds. More wiring, zero
extra dependencies beyond the MCP SDK. The AI SDK route is less code.

### Free connector platforms still work (they're provider-agnostic)

The platforms in "Path B" above (Composio, Pipedream, Nango) are NOT tied to Anthropic. They expose
either **MCP servers** or **OpenAI-format tool schemas**, both of which plug into the OpenRouter +
AI SDK stack above. Free tiers:

| Platform              | Free tier                                                       | How it plugs in                                                                      |
| --------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Nango**             | **Open-source, self-host (free, unlimited)**                    | Exposes MCP servers / tool schemas → `createMCPClient` or function tools             |
| **Composio**          | Free dev tier (Composio-managed auth, no your-own-OAuth needed) | Has a first-class OpenAI/Vercel-AI provider; or its MCP endpoint → `createMCPClient` |
| **Pipedream Connect** | **Free in dev mode**                                            | MCP server (10,000+ tools) → `createMCPClient`; paid only for production scale       |

For Emma (values self-hosting + encrypt-at-rest), **Nango self-hosted** remains the best platform
fit, and it speaks MCP so it drops straight into the AI SDK client.

### Revised recommendation for Emma (provider-agnostic, free)

The original Phase 2 said "pass `mcp_servers` + `mcp_toolset` to the Messages API." That's Anthropic-only.
**Revised Phase 2:**

- Adopt **Vercel AI SDK + `@openrouter/ai-sdk-provider`** in `src/core/agent-loop.ts` (Emma is Next.js — natural fit, replaces hand-rolled OpenRouter fetch loops).
- Use **`@ai-sdk/mcp` `createMCPClient`** to reach remote MCP servers; pass `mcpClient.tools()` into `streamText`.
- Reuse `client_integrations` tokens as the `Authorization` header / `authProvider`.
- Gate destructive tools with **`needsApproval`** (the model-agnostic denylist + human-confirm).
- Self-host **Nango** later for breadth — it exposes MCP, so it uses the exact same client path.

Everything runs on the free OpenRouter models Emma already uses. No Anthropic API, no per-tool vendor cost.

---

## Sources

- MCP Authorization spec (2025-06-18) — OAuth 2.1, PKCE, RFC 8707/7591/9728/8414, confused deputy, token theft
- Vercel AI SDK docs — `@ai-sdk/mcp` `createMCPClient` (HTTP/SSE/stdio transports, `authProvider`, `redirect`), `mcpClient.tools()` schema discovery/definition, elicitation, tool-calling `needsApproval` approval flow, `stopWhen` multi-step — live-browsed 2026-05-31
- `@openrouter/ai-sdk-provider` (OpenRouterTeam) — official OpenRouter provider for Vercel AI SDK, `openrouter("model:free")`, 300+ models, tool-calling support
- MCP TypeScript SDK (`modelcontextprotocol/typescript-sdk`) — `@modelcontextprotocol/client` raw client, StreamableHTTP/SSE/stdio transports, OAuth helpers
- Anthropic MCP connector docs — `mcp_servers`, `mcp_toolset`, allowlist/denylist, `defer_loading`, OAuth bearer
- Anthropic remote MCP servers directory — third-party server catalog
- Anthropic MCP tunnels docs — private-network connection, cloudflared, 3-layer security model
- Composio docs — toolkits, auth configs, Connect Link, sessions, triggers, webhook HMAC verification, white-labeling
- Pipedream Connect docs — managed auth, connect proxy, MCP server (10,000+ tools), `external_user_id`
- Nango — 800+ APIs, code-first syncs/actions/webhooks, open-source, self-hostable, per-tenant isolation
- Emma source: `src/core/integrations/adapter.ts`, `google.ts`, OAuth `start`/`callback` routes, `mcp/encrypt-token`
