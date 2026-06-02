/**
 * OAuth Token Refresh — HubSpot & Notion
 *
 * HubSpot: API-key-based in this codebase — no refresh token.
 *   On 401 we mark the integration expired so the user re-enters their key.
 *
 * Notion: OAuth bearer token with optional rotating refresh token.
 *   CRITICAL: Notion rotates the refresh_token on every use.
 *   The new access_token AND new refresh_token MUST be written atomically
 *   in a single Supabase update. If the write fails after the HTTP call
 *   succeeds the integration is permanently broken.
 *
 * Usage:
 *   const result = await callWithTokenRefresh(clientId, "notion", (token) =>
 *     fetch("https://api.notion.com/v1/pages", { headers: { Authorization: `Bearer ${token}` } })
 *   );
 */

import { createClient } from "@supabase/supabase-js";
import { encrypt, decrypt } from "@/core/security/encryption";
import { markIntegrationExpired, type IntegrationService } from "@/core/integrations/adapter";

// ─── Error Types ─────────────────────────────────────────────────────────────

export class IntegrationExpiredError extends Error {
  constructor(public readonly provider: string) {
    super(`${provider} integration requires re-authorization`);
    this.name = "IntegrationExpiredError";
  }
}

// ─── Refresh Configuration ───────────────────────────────────────────────────

interface RefreshConfig {
  endpoint: string;
  /** "form" = application/x-www-form-urlencoded; "basic_json" = Basic auth + JSON body */
  method: "form" | "basic_json";
  /** If true, the provider issues a new refresh_token each time — must store atomically */
  rotatesRefreshToken: boolean;
  notionVersion?: string;
}

const REFRESH_CONFIGS: Record<string, RefreshConfig> = {
  hubspot: {
    endpoint: "https://api.hubapi.com/oauth/v3/token",
    method: "form",
    rotatesRefreshToken: false,
  },
  notion: {
    endpoint: "https://api.notion.com/v1/oauth/token",
    method: "basic_json",
    rotatesRefreshToken: true,
    notionVersion: "2026-03-11",
  },
};

// ─── Providers that get proactive refresh (short-lived tokens) ────────────────
// Notion OAuth tokens expire in ~1 hour; proactive refresh avoids mid-request expiry.
// HubSpot uses API keys (no expiresAt), so proactive refresh never applies to it.
const PROACTIVE_REFRESH_PROVIDERS = new Set(["notion"]);

// ─── Supabase ────────────────────────────────────────────────────────────────

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns true if an error represents a 401 Unauthorized response. */
export function isAuthError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  const status = (e.status ?? e.statusCode ?? e.httpStatus) as number | undefined;
  return status === 401;
}

// ─── Token Row (raw from DB) ─────────────────────────────────────────────────

interface TokenRow {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null; // Unix ms
}

async function getTokenRow(clientId: string, provider: string): Promise<TokenRow | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data: row } = await supabase
    .from("client_integrations")
    .select("access_token, refresh_token, token_expires_at, status")
    .eq("client_id", clientId)
    .eq("service", provider)
    .single();

  if (!row || row.status === "auth_expired") return null;

  const accessToken = row.access_token ? decrypt(row.access_token) : "";
  if (!accessToken || accessToken.startsWith("[")) return null;

  const refreshToken = row.refresh_token ? decrypt(row.refresh_token) : null;
  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : null;

  return { accessToken, refreshToken, expiresAt };
}

// ─── Core Refresh Logic ───────────────────────────────────────────────────────

interface RefreshedTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null; // ISO string for DB
}

/**
 * Call the provider's token endpoint to get a new access token.
 * Returns null if the refresh_token is missing or the provider is not configured.
 * Throws on network errors; returns null on invalid_grant / 4xx errors.
 */
export async function refreshProviderToken(
  provider: string,
  currentRefreshToken: string
): Promise<RefreshedTokens | null> {
  const config = REFRESH_CONFIGS[provider];
  if (!config) return null;

  let res: Response;

  if (config.method === "form") {
    // HubSpot: application/x-www-form-urlencoded
    const clientId = process.env.HUBSPOT_CLIENT_ID ?? "";
    const clientSecret = process.env.HUBSPOT_CLIENT_SECRET ?? "";
    if (!clientId || !clientSecret) {
      console.warn(
        `[oauth-refresh] ${provider}: HUBSPOT_CLIENT_ID / HUBSPOT_CLIENT_SECRET not set`
      );
      return null;
    }
    res = await fetch(config.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: currentRefreshToken,
      }),
    });
  } else {
    // Notion: Basic auth + JSON body
    const clientId = process.env.NOTION_CLIENT_ID ?? "";
    const clientSecret = process.env.NOTION_CLIENT_SECRET ?? "";
    if (!clientId || !clientSecret) {
      console.warn(`[oauth-refresh] ${provider}: NOTION_CLIENT_ID / NOTION_CLIENT_SECRET not set`);
      return null;
    }
    const basicAuth = btoa(`${clientId}:${clientSecret}`);
    const headers: Record<string, string> = {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/json",
    };
    if (config.notionVersion) {
      headers["Notion-Version"] = config.notionVersion;
    }
    res = await fetch(config.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ grant_type: "refresh_token", refresh_token: currentRefreshToken }),
    });
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.warn(`[oauth-refresh] ${provider}: refresh failed (${res.status}): ${body}`);
    return null;
  }

  const json = await res.json();
  const newAccess: string = json.access_token ?? "";
  if (!newAccess) return null;

  const newRefresh: string | null = config.rotatesRefreshToken
    ? (json.refresh_token ?? null)
    : null; // HubSpot keeps the same refresh token

  const expiresAt: string | null = json.expires_in
    ? new Date(Date.now() + json.expires_in * 1000).toISOString()
    : null;

  return { accessToken: newAccess, refreshToken: newRefresh, expiresAt };
}

/**
 * Atomically persist refreshed tokens back to Supabase.
 * For rotating-refresh-token providers (Notion), both access_token AND
 * refresh_token are written in the same update call.
 */
async function storeRefreshedTokens(
  clientId: string,
  provider: string,
  tokens: RefreshedTokens,
  rotates: boolean
): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = {
    access_token: encrypt(tokens.accessToken),
    status: "connected",
    updated_at: new Date().toISOString(),
  };

  if (tokens.expiresAt) {
    update.token_expires_at = tokens.expiresAt;
  }

  // CRITICAL for Notion: write new refresh_token in the same atomic update
  if (rotates && tokens.refreshToken) {
    update.refresh_token = encrypt(tokens.refreshToken);
  }

  const { error } = await supabase
    .from("client_integrations")
    .update(update)
    .eq("client_id", clientId)
    .eq("service", provider);

  if (error) {
    console.error(`[oauth-refresh] ${provider}: failed to store refreshed tokens:`, error.message);
    return false;
  }

  return true;
}

// ─── Public Wrapper ───────────────────────────────────────────────────────────

/**
 * Execute `apiCall` with the stored access token, refreshing once on 401.
 *
 * Flow:
 *  1. Load tokens from DB
 *  2. If HubSpot token is within 5 min of expiry, proactively refresh
 *  3. Try apiCall(accessToken)
 *  4. On 401 → attempt refresh → retry once
 *  5. On second 401 or refresh failure → markIntegrationExpired + throw IntegrationExpiredError
 *
 * @param clientId  The client (tenant) ID
 * @param provider  "hubspot" | "notion"
 * @param apiCall   Function that takes an access token and returns a Promise<T>
 */
export async function callWithTokenRefresh<T>(
  clientId: string,
  provider: string,
  apiCall: (accessToken: string) => Promise<T>
): Promise<T> {
  // 1. Load tokens
  const tokens = await getTokenRow(clientId, provider);
  if (!tokens) {
    throw new IntegrationExpiredError(provider);
  }

  let accessToken = tokens.accessToken;

  // 2. Proactive refresh for short-lived tokens (HubSpot OAuth: 30-min TTL)
  const shouldRefreshProactively =
    PROACTIVE_REFRESH_PROVIDERS.has(provider) &&
    tokens.expiresAt !== null &&
    tokens.expiresAt - Date.now() < 5 * 60 * 1000;

  if (shouldRefreshProactively && tokens.refreshToken) {
    const refreshed = await refreshProviderToken(provider, tokens.refreshToken);
    if (refreshed) {
      const config = REFRESH_CONFIGS[provider];
      const stored = await storeRefreshedTokens(
        clientId,
        provider,
        refreshed,
        config?.rotatesRefreshToken ?? false
      );
      if (stored) {
        accessToken = refreshed.accessToken;
      }
      // If store fails we continue with the old token — the 401 branch below
      // will handle it if the API rejects it.
    }
  }

  // 3. Attempt the API call.
  // IMPORTANT: fetch resolves (does NOT throw) on 401 — we must check the
  // Response status explicitly. Non-fetch errors (network, JSON parse, etc.)
  // can still throw and are caught below.
  let firstResult: T;
  let caughtAuthError = false;

  try {
    firstResult = await apiCall(accessToken);
  } catch (err) {
    if (!isAuthError(err)) throw err;
    // A thrown auth error (e.g. from a non-fetch library) — fall through to refresh.
    caughtAuthError = true;
    firstResult = undefined as T; // will be overwritten after refresh
  }

  // Check for 401 returned as a resolved Response (the common fetch case).
  const is401Response = firstResult instanceof Response && firstResult.status === 401;

  if (!is401Response && !caughtAuthError) {
    return firstResult;
  }

  // 4. Got 401 (either as a Response or as a thrown error) — try to refresh.
  if (!tokens.refreshToken) {
    await markIntegrationExpired(clientId, provider as IntegrationService);
    throw new IntegrationExpiredError(provider);
  }

  const refreshed = await refreshProviderToken(provider, tokens.refreshToken);
  if (!refreshed) {
    await markIntegrationExpired(clientId, provider as IntegrationService);
    throw new IntegrationExpiredError(provider);
  }

  const config = REFRESH_CONFIGS[provider];
  const stored = await storeRefreshedTokens(
    clientId,
    provider,
    refreshed,
    config?.rotatesRefreshToken ?? false
  );
  if (!stored) {
    // Write failed — mark expired to force re-auth
    await markIntegrationExpired(clientId, provider as IntegrationService);
    throw new IntegrationExpiredError(provider);
  }

  // 5. Retry once with the new token.
  let retryResult: T;
  try {
    retryResult = await apiCall(refreshed.accessToken);
  } catch (retryErr) {
    if (isAuthError(retryErr)) {
      await markIntegrationExpired(clientId, provider as IntegrationService);
      throw new IntegrationExpiredError(provider);
    }
    throw retryErr;
  }

  if (retryResult instanceof Response && retryResult.status === 401) {
    await markIntegrationExpired(clientId, provider as IntegrationService);
    throw new IntegrationExpiredError(provider);
  }

  return retryResult;
}
