/**
 * Integration Adapter Layer
 *
 * All external service adapters implement IntegrationAdapter.
 * Tool handlers import from here — never from service-specific files.
 *
 * Tokens are AES-256-GCM encrypted at rest via the existing
 * encryption module. Decrypted only at call time, never logged.
 */

import { createClient } from "@supabase/supabase-js";
import { encrypt, decrypt } from "@/core/security/encryption";

// ─── Types ───────────────────────────────────────────────────────────────────

export type IntegrationService =
  | "gmail"
  | "google_calendar"
  | "google_drive"
  | "slack"
  | "notion"
  | "hubspot";

export interface IntegrationAdapter {
  service: IntegrationService;
  validate(clientId: string): Promise<boolean>;
  send(clientId: string, params: Record<string, unknown>): Promise<AdapterResult>;
}

export interface AdapterResult {
  success: boolean;
  output: string;
  data?: Record<string, unknown>;
}

export class IntegrationNotConfiguredError extends Error {
  constructor(service: IntegrationService) {
    super(`Integration not configured: ${service}`);
    this.name = "IntegrationNotConfiguredError";
  }
}

export class IntegrationAuthExpiredError extends Error {
  constructor(service: IntegrationService) {
    super(`Auth expired for integration: ${service}`);
    this.name = "IntegrationAuthExpiredError";
  }
}

// ─── Supabase ────────────────────────────────────────────────────────────────

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// ─── Token Retrieval ─────────────────────────────────────────────────────────

export async function getIntegrationTokens(
  clientId: string,
  service: IntegrationService
): Promise<{
  accessToken: string;
  metadata: Record<string, unknown> | null;
  accountIdentifier: string | null;
}> {
  const supabase = getSupabase();
  if (!supabase) throw new IntegrationNotConfiguredError(service);

  const { data: row } = await supabase
    .from("client_integrations")
    .select("*")
    .eq("client_id", clientId)
    .eq("service", service)
    .single();

  if (!row || row.status !== "connected") {
    throw new IntegrationNotConfiguredError(service);
  }

  // Check token expiry (with 5-minute buffer)
  if (row.token_expires_at) {
    const expiresAt = new Date(row.token_expires_at).getTime();
    const buffer = 5 * 60 * 1000;
    if (expiresAt < Date.now() + buffer && row.refresh_token) {
      // Attempt refresh — caller provides the refresh logic
      throw new IntegrationAuthExpiredError(service);
    }
  }

  const accessToken = row.access_token ? decrypt(row.access_token) : "";
  if (!accessToken) throw new IntegrationNotConfiguredError(service);

  return {
    accessToken,
    metadata: row.metadata,
    accountIdentifier: row.account_identifier,
  };
}

// ─── Status Helpers ──────────────────────────────────────────────────────────

export async function markIntegrationUsed(
  clientId: string,
  service: IntegrationService
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase
    .from("client_integrations")
    .update({
      last_used_at: new Date().toISOString(),
      status: "connected",
      last_error: null,
    })
    .eq("client_id", clientId)
    .eq("service", service);
}

export async function markIntegrationError(
  clientId: string,
  service: IntegrationService,
  error: Error
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase
    .from("client_integrations")
    .update({
      status: "error",
      last_error: error.message,
      updated_at: new Date().toISOString(),
    })
    .eq("client_id", clientId)
    .eq("service", service);
}

export async function markIntegrationExpired(
  clientId: string,
  service: IntegrationService
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase
    .from("client_integrations")
    .update({
      status: "auth_expired",
      updated_at: new Date().toISOString(),
    })
    .eq("client_id", clientId)
    .eq("service", service);
}
