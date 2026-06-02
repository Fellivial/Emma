# OAuth Token Refresh Research

> **Status: RESEARCH ONLY — do not implement until instructed.**

**Date:** 2026-05-31
**Scope:** Per-provider OAuth token lifecycle for Gmail, Google Calendar, Google Drive, Slack, Notion, and HubSpot — as used in Emma's `client_integrations` table.

---

## Summary Table

| Provider                       | Access Token TTL                      | Refresh Token Expires?                     | Refresh Token Rotates?               | Refresh Endpoint                             |
| ------------------------------ | ------------------------------------- | ------------------------------------------ | ------------------------------------ | -------------------------------------------- |
| Google                         | ~1 hour (`expires_in: 3920`)          | Only if unused 6+ months, or time-based    | No (same token reused)               | `POST https://oauth2.googleapis.com/token`   |
| Slack (no rotation)            | Never                                 | No                                         | No                                   | N/A — token is permanent until revoked       |
| Slack (token rotation enabled) | 12 hours (`expires_in: 43200`)        | Undisclosed; single-use, revoked after use | Yes — new token issued per refresh   | `POST https://slack.com/api/oauth.v2.access` |
| Notion                         | ~1 hour (no `expires_in` in response) | No explicit TTL documented                 | Yes — new refresh token on every use | `POST https://api.notion.com/v1/oauth/token` |
| HubSpot                        | 30 minutes (`expires_in: 1800`)       | No (indefinite unless app uninstalled)     | No                                   | `POST https://api.hubapi.com/oauth/v3/token` |

---

## 1. Google (Gmail, Google Calendar, Google Drive)

### Access Token Lifetime

Google access tokens expire after approximately **1 hour**. The token response includes `expires_in: 3920` (seconds). The exact value can vary slightly but is always close to 3600s.

### Refresh Token Behavior

- Refresh tokens are **long-lived and do not expire by default**.
- A refresh token becomes invalid in these scenarios:
  - The user revokes app access via Google Account settings.
  - The token has not been used for **6 months**.
  - The user changes their password (when Gmail scopes are included).
  - The app exceeds the limit of **100 refresh tokens per Google Account per client ID** — the oldest is silently invalidated when the limit is hit.
  - The project is in **Testing** status with external users — tokens expire after 7 days.
  - An administrator applies policies restricting the requested scopes (`admin_policy_enforced`).
- Refresh tokens **do not rotate** on use — the same token is reused repeatedly.

### Refresh Grant Flow

```
POST https://oauth2.googleapis.com/token
Content-Type: application/x-www-form-urlencoded

client_id=<CLIENT_ID>
&client_secret=<CLIENT_SECRET>
&refresh_token=<STORED_REFRESH_TOKEN>
&grant_type=refresh_token
```

**Success response (200):**

```json
{
  "access_token": "ya29.a0AfB_...",
  "expires_in": 3920,
  "token_type": "Bearer",
  "scope": "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar"
}
```

Note: The refresh token is **not** returned in the refresh response. Store the original refresh token permanently; do not overwrite it.

### Error Codes to Handle

| Code                          | Meaning                                | Action                            |
| ----------------------------- | -------------------------------------- | --------------------------------- |
| `invalid_grant`               | Token expired, revoked, or never valid | Mark as needs-reauth; prompt user |
| `admin_policy_enforced`       | Admin blocked the scope                | Show informational error to user  |
| HTTP 401 with `invalid_grant` | As above                               | No retry — go to re-consent       |

The `invalid_grant` error is the primary terminal signal. Do not retry it.

### Re-Consent Requirement

Required when `invalid_grant` is returned and cannot be resolved. Trigger the OAuth flow again with `access_type=offline` and optionally `prompt=consent` to force a new refresh token to be issued.

---

## 2. Slack

Slack has two distinct token modes. Emma's integration must account for both.

### Mode A: Standard Tokens (no token rotation)

Standard Slack bot tokens (`xoxb-`) and user tokens (`xoxp-`) **do not expire**. From the official docs: "OAuth tokens do not expire. If they are no longer needed, they can be revoked."

There is no refresh grant — these tokens are valid indefinitely.

**Tokens become invalid when:**

- A workspace owner uninstalls the app.
- A user removes their configuration or deactivates their account.
- The `auth.revoke` API method is called.

### Mode B: Token Rotation (granular permission apps)

For Slack apps using granular permissions, token rotation can be enabled. This exchanges a long-lived token for a short-lived access token plus a single-use refresh token.

**Access Token Lifetime:** 12 hours (`expires_in: 43200` seconds)

**Refresh Token Behavior:**

- Refresh tokens are **single-use**. After calling `oauth.v2.access` with a refresh token, that token is revoked after a short grace period (duration not publicly disclosed by Slack).
- A new refresh token is returned with each successful refresh.

### Refresh Grant Flow (token rotation mode only)

```
POST https://slack.com/api/oauth.v2.access
Content-Type: application/x-www-form-urlencoded

client_id=<CLIENT_ID>
&client_secret=<CLIENT_SECRET>
&grant_type=refresh_token
&refresh_token=xoxe-1-...
```

**Success response (200):**

```json
{
  "ok": true,
  "access_token": "xoxe.xoxb-1-...",
  "refresh_token": "xoxe-1-...",
  "token_type": "bot",
  "expires_in": 43200,
  "scope": "...",
  "bot_user_id": "U...",
  "app_id": "A...",
  "team": { "name": "...", "id": "T..." }
}
```

### Error Codes to Handle

| Error                   | Meaning                                                      | Action                                                          |
| ----------------------- | ------------------------------------------------------------ | --------------------------------------------------------------- |
| `invalid_auth`          | Token revoked or expired (deliberately vague per Slack docs) | Try refresh once; if still `invalid_auth`, mark as needs-reauth |
| `token_revoked`         | Token was explicitly revoked                                 | Mark as needs-reauth immediately                                |
| `invalid_refresh_token` | Refresh token already used or invalid                        | Mark as needs-reauth                                            |

Slack recommends also subscribing to the `tokens_revoked` event webhook to proactively mark tokens as invalid before the next scheduled cron run hits them.

### Re-Consent Requirement

Required after `invalid_auth` survives a refresh attempt, or after `token_revoked`. Re-run the full OAuth flow from `oauth.v2.access`.

---

## 3. Notion

### Access Token Lifetime

Notion's access token TTL is approximately **1 hour** based on observed behavior in multiple community reports and the open-webui discussion (#19820). Notion **does not include `expires_in`** in the OAuth token response — there is no expiry field to parse. The expiry must be inferred by catching a `401 unauthorized` error, or assumed conservatively (e.g., treat tokens as expired after 55 minutes as a safe pre-expiry buffer).

### Refresh Token Behavior

- Notion **does** provide a `refresh_token` in the initial OAuth exchange response.
- Refresh tokens **rotate on every use** — each successful refresh returns a new `refresh_token` and invalidates the previous one immediately.
- Refresh token lifetime: not publicly documented. Tokens are invalidated if the user disconnects the integration from their Notion workspace, or Notion revokes for security reasons.

### Refresh Grant Flow

```
POST https://api.notion.com/v1/oauth/token
Authorization: Basic <base64(CLIENT_ID:CLIENT_SECRET)>
Content-Type: application/json
Notion-Version: 2026-03-11

{
  "grant_type": "refresh_token",
  "refresh_token": "<STORED_REFRESH_TOKEN>"
}
```

**Success response (200):**

```json
{
  "access_token": "...",
  "token_type": "bearer",
  "refresh_token": "...",
  "bot_id": "uuid",
  "workspace_icon": "string or null",
  "workspace_name": "string or null",
  "workspace_id": "uuid",
  "owner": {
    "type": "user",
    "user": {}
  },
  "duplicated_template_id": null
}
```

**Critical:** Because Notion rotates refresh tokens, the new `refresh_token` in this response **must be stored atomically** alongside the new `access_token`. If the write fails after the refresh call succeeds, the old refresh token is already invalidated — the integration is permanently broken without re-consent.

### Error Codes to Handle

| HTTP | Code                  | Meaning                                 | Action               |
| ---- | --------------------- | --------------------------------------- | -------------------- |
| 400  | `invalid_grant`       | Refresh token used, expired, or revoked | Mark as needs-reauth |
| 400  | `invalid_request`     | Malformed request body                  | Fix request format   |
| 401  | `unauthorized`        | Access token invalid or expired         | Attempt refresh      |
| 401  | `invalid_client`      | Bad client_id/secret in Basic auth      | Fix credentials      |
| 403  | `restricted_resource` | Token valid but lacks permission        | Check scopes         |

### Re-Consent Requirement

Required when `invalid_grant` is returned on a refresh attempt. This covers: user disconnected the integration, Notion revoked the token, or the refresh token was already consumed without a successful storage write completing.

---

## 4. HubSpot

### Access Token Lifetime

HubSpot access tokens expire after **30 minutes** (`expires_in: 1800` seconds). This was reduced from a prior 6-hour lifetime. The current standard as of 2025/2026 is 1800 seconds.

HubSpot launched OAuth **v3** endpoints in January 2026. The v1 endpoint (`/oauth/v1/token`) is deprecated but still operational. New implementations should use v3.

### Refresh Token Behavior

- Refresh tokens do **not expire** under normal circumstances.
- They remain valid indefinitely unless: the user uninstalls the app, the developer manually revokes them, or HubSpot detects abuse.
- Refresh tokens **do not rotate** — the same refresh token is reused each time.

### Refresh Grant Flow (v3 — recommended)

```
POST https://api.hubapi.com/oauth/v3/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&client_id=<CLIENT_ID>
&client_secret=<CLIENT_SECRET>
&refresh_token=<STORED_REFRESH_TOKEN>
```

**Do not** pass these as URL query parameters — HubSpot requires all sensitive parameters in the request body.

**Success response (200):**

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "expires_in": 1800
}
```

**Legacy v1 endpoint** (deprecated but still works):

```
POST https://api.hubapi.com/oauth/v1/token
```

Same body params.

### Error Codes to Handle

| HTTP    | Error            | Status              | Meaning                                    | Action                             |
| ------- | ---------------- | ------------------- | ------------------------------------------ | ---------------------------------- |
| 400     | `invalid_grant`  | `BAD_REFRESH_TOKEN` | Refresh token invalid, expired, or revoked | Mark as needs-reauth; do not retry |
| 401     | `invalid_client` | —                   | Bad client_id or client_secret             | Fix credentials                    |
| 500/503 | —                | —                   | HubSpot server error                       | Retry with exponential backoff     |

**HubSpot error response shape:**

```json
{
  "error": "invalid_grant",
  "error_description": "refresh token is invalid, expired or revoked",
  "status": "BAD_REFRESH_TOKEN",
  "message": "refresh token is invalid, expired or revoked"
}
```

### Re-Consent Requirement

Required when `invalid_grant` / `BAD_REFRESH_TOKEN` is returned. The user must reinstall the app through the HubSpot OAuth flow.

---

## 5. Retry-After-Refresh Pattern

The standard pattern for all providers. Execute at most one refresh per failed request chain.

```typescript
async function callWithTokenRefresh<T>(
  userId: string,
  provider: Provider,
  apiCall: (accessToken: string) => Promise<T>
): Promise<T> {
  const tokens = await getTokens(userId, provider);

  try {
    return await apiCall(tokens.accessToken);
  } catch (err) {
    if (!isAuthError(err)) throw err; // non-401 — rethrow immediately

    // Attempt refresh once
    const newTokens = await refreshProviderToken(userId, provider, tokens);
    if (!newTokens) {
      // Refresh failed (invalid_grant or equivalent) — needs re-auth
      await markIntegrationExpired(userId, provider);
      throw new IntegrationExpiredError(provider);
    }

    // Retry original call once with the new token
    try {
      return await apiCall(newTokens.accessToken);
    } catch (retryErr) {
      if (isAuthError(retryErr)) {
        // Still failing after a fresh token — token is revoked, not just expired
        await markIntegrationExpired(userId, provider);
        throw new IntegrationExpiredError(provider);
      }
      throw retryErr;
    }
  }
}

function isAuthError(err: unknown): boolean {
  return (err as any)?.status === 401 || (err as any)?.statusCode === 401;
}
```

**Key rules:**

- Retry exactly **once** after a successful refresh. A second 401 means revoked.
- Do not retry on HTTP `403` — this is a scopes/permissions issue, not an expiry issue.
- Do not retry on `invalid_grant` from the refresh endpoint itself — that is terminal; go straight to marking expired.
- For HubSpot, check proactively: if `currentTime >= tokenIssuedAt + 25 minutes`, refresh before the API call rather than waiting for failure.

---

## 6. Token Rotation Race Condition

Notion and Slack (with rotation enabled) rotate refresh tokens on use. Concurrent cron jobs hitting the same expired token create a race condition:

1. Job A reads the stored refresh token.
2. Job B reads the same stored refresh token before A's write completes.
3. Job A calls the refresh endpoint — succeeds. New access + refresh tokens written to DB.
4. Job B calls the refresh endpoint with the now-invalidated old refresh token — receives `invalid_grant`.
5. Job B incorrectly marks the integration as permanently expired. User sees a re-auth prompt for no reason.

### In-Process Deduplication (single Vercel function instance)

```typescript
// Module-level in-flight map — one per process instance
const refreshLocks = new Map<string, Promise<OAuthTokens | null>>();

async function refreshProviderToken(
  userId: string,
  provider: Provider,
  currentTokens: OAuthTokens
): Promise<OAuthTokens | null> {
  const lockKey = `${userId}:${provider}`;

  // If a refresh is already in-flight for this user+provider, wait for it
  if (refreshLocks.has(lockKey)) {
    return refreshLocks.get(lockKey)!;
  }

  const refreshPromise = (async () => {
    try {
      // Re-read from DB — another instance may have already refreshed
      const latest = await getTokensFromDB(userId, provider);
      if (latest.accessToken !== currentTokens.accessToken) {
        // Already refreshed by another process — use the new token
        return latest;
      }

      const newTokens = await callRefreshEndpoint(provider, latest.refreshToken);

      // Atomic write: access_token + refresh_token in one DB operation
      await upsertTokensAtomic(userId, provider, newTokens);
      return newTokens;
    } catch (err) {
      if (isInvalidGrantError(err)) return null; // needs re-auth
      throw err;
    } finally {
      refreshLocks.delete(lockKey);
    }
  })();

  refreshLocks.set(lockKey, refreshPromise);
  return refreshPromise;
}
```

### Multi-Instance Distributed Lock (multiple Vercel cron invocations)

Use a Postgres advisory lock via Supabase:

```sql
-- Acquire a per-(user, provider) advisory lock before refreshing.
-- pg_try_advisory_xact_lock returns false immediately if lock is held.
SELECT pg_try_advisory_xact_lock(hashtext(user_id_value || ':' || provider_value));
```

Or a Redis `SET NX EX 30` (30-second TTL to survive crashes):

```
SET token-refresh:{userId}:{provider} locked NX EX 30
```

If the lock is not acquired, the second process should re-read the DB after a short wait — the first process will have updated the tokens.

### Atomic Storage Rule

For rotating providers (Notion, Slack with rotation), **never write access_token and refresh_token in separate DB operations**. Use a single `UPDATE ... SET access_token = $1, refresh_token = $2, updated_at = NOW() WHERE user_id = $3 AND provider = $4`. If either write fails, both must be rolled back (or the row must retain the old values).

Failure scenario to prevent: refresh call succeeds (old refresh token now dead), access_token write succeeds, refresh_token write crashes — the new refresh token is lost permanently, forcing re-consent even though the user did nothing wrong.

---

## Sources

- [Google OAuth 2.0 Web Server Flow — Refreshing Tokens](https://developers.google.com/identity/protocols/oauth2/web-server#refreshing) — accessed 2026-05-31
- [Google OAuth 2.0 — Token Expiration](https://developers.google.com/identity/protocols/oauth2#expiration) — accessed 2026-05-31
- [Slack — Installing with OAuth (redirected from api.slack.com)](https://docs.slack.dev/authentication/installing-with-oauth) — accessed 2026-05-31
- [Slack — Using Token Rotation](https://docs.slack.dev/authentication/using-token-rotation) — accessed 2026-05-31
- [Notion — Authorization (OAuth)](https://developers.notion.com/docs/authorization) — accessed 2026-05-31
- [Notion — Refresh a Token (API Reference)](https://developers.notion.com/reference/refresh-a-token) — accessed 2026-05-31
- [Notion — Error Reference](https://developers.notion.com/reference/errors) — accessed 2026-05-31
- [Nango Blog — Notion OAuth refresh_token invalid_grant](https://nango.dev/blog/notion-oauth-refresh-token-invalid-grant/) — accessed 2026-05-31
- [open-webui Discussion #19820 — MCP OAuth tokens expire after 1 hour](https://github.com/open-webui/open-webui/discussions/19820) — accessed 2026-05-31
- [HubSpot Blog — Production-Ready OAuth Token Management](https://developers.hubspot.com/blog/oauth-token-management-hubspot-integrations) — accessed 2026-05-31
- [HubSpot Changelog — Upcoming OAuth access token expiry change](https://developers.hubspot.com/changelog/upcoming-expiration-of-oauth-access-tokens-is-changing) — accessed 2026-05-31
- [HubSpot — Manage OAuth tokens v1 API reference](https://developers.hubspot.com/docs/api-reference/auth-oauth-v1/guide) — accessed 2026-05-31
- [Nango Blog — Concurrency with OAuth token refreshes](https://nango.dev/blog/concurrency-with-oauth-token-refreshes/) — accessed 2026-05-31
- [Latenode Community — Notion API access token expiration](https://community.latenode.com/t/what-is-the-expiration-time-for-notion-api-access-tokens/31567) — accessed 2026-05-31
