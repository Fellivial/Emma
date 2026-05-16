import { redirect } from "next/navigation";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getUser } from "@/lib/supabase/server";

interface BusinessClient {
  id: string;
  name: string;
  slug: string;
}

interface BusinessSession {
  userId: string;
  client: BusinessClient;
  supabase: SupabaseClient;
}

function getServiceSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Gate for all /business/[slug] routes.
 * Redirects to /login if unauthenticated, /app if not a member of this client.
 */
export async function requireClientAccess(slug: string): Promise<BusinessSession> {
  const user = await getUser();
  if (!user) redirect("/login");

  const supabase = getServiceSupabase();
  if (!supabase) redirect("/app");

  const { data: client } = await supabase
    .from("clients")
    .select("id, name, slug")
    .eq("slug", slug)
    .single();

  if (!client) redirect("/app");

  const { data: membership } = await supabase
    .from("client_members")
    .select("user_id")
    .eq("client_id", client.id)
    .eq("user_id", user.id)
    .single();

  if (!membership) redirect("/app");

  return { userId: user.id, client, supabase };
}
