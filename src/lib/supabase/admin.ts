import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

/**
 * Returns a service-role Supabase client that bypasses RLS.
 * Use only in server-side code (API routes, server actions).
 * Returns null when env vars are not set (e.g. local dev without Supabase).
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _client = createClient(url, key);
  return _client;
}
