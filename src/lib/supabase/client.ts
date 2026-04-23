import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // Return a mock client for build/dev without Supabase configured
    console.warn("[EMMA] Supabase not configured — auth disabled");
    return null as any;
  }

  return createBrowserClient(url, key);
}
