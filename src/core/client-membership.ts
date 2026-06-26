// Supabase query builders are structurally typed here to keep this helper testable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseQueryBuilder = any;

interface SupabaseLike {
  from(table: string): SupabaseQueryBuilder;
}

interface ClientDefaults {
  name?: string | null;
  personaName?: string | null;
  personaPrompt?: string | null;
  personaGreeting?: string | null;
  voiceId?: string | null;
  autonomyTier?: number | null;
  proactiveVision?: boolean | null;
}

interface EnsureClientMembershipOptions {
  userId: string;
  defaults?: ClientDefaults;
}

interface EnsureClientMembershipResult {
  clientId: string;
  createdClient: boolean;
  createdMembership: boolean;
}

const DUPLICATE_ERROR_CODE = "23505";

async function findMembership(supabase: SupabaseLike, userId: string) {
  const { data, error } = await supabase
    .from("client_members")
    .select("client_id, role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as { client_id: string; role?: string } | null;
}

async function findOwnedClient(supabase: SupabaseLike, userId: string) {
  const { data, error } = await supabase
    .from("clients")
    .select("id")
    .eq("owner_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as { id: string } | null;
}

async function createClient(
  supabase: SupabaseLike,
  userId: string,
  defaults: ClientDefaults | undefined
) {
  const { data, error } = await supabase
    .from("clients")
    .insert({
      name: defaults?.name || "My Emma",
      owner_id: userId,
      slug: `client-${userId.slice(0, 8)}`,
      persona_name: defaults?.personaName || "Emma",
      persona_prompt: defaults?.personaPrompt || null,
      persona_greeting: defaults?.personaGreeting || "Hi, I'm Emma. What's on your mind?",
      voice_id: defaults?.voiceId || null,
      autonomy_tier: defaults?.autonomyTier ?? 2,
      proactive_vision: defaults?.proactiveVision ?? false,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === DUPLICATE_ERROR_CODE) {
      const existingClient = await findOwnedClient(supabase, userId);
      if (existingClient) {
        return existingClient;
      }
    }

    throw error;
  }

  return data as { id: string };
}

async function createMembership(supabase: SupabaseLike, userId: string, clientId: string) {
  const { error } = await supabase.from("client_members").insert({
    client_id: clientId,
    user_id: userId,
    role: "owner",
  });

  if (error && error.code !== DUPLICATE_ERROR_CODE) {
    throw error;
  }
}

export async function ensureClientMembership(
  supabase: SupabaseLike,
  options: EnsureClientMembershipOptions
): Promise<EnsureClientMembershipResult> {
  const existingMembership = await findMembership(supabase, options.userId);
  if (existingMembership) {
    return {
      clientId: existingMembership.client_id,
      createdClient: false,
      createdMembership: false,
    };
  }

  let createdClient = false;
  let client = await findOwnedClient(supabase, options.userId);

  if (!client) {
    client = await createClient(supabase, options.userId, options.defaults);
    createdClient = true;
  }

  await createMembership(supabase, options.userId, client.id);

  return {
    clientId: client.id,
    createdClient,
    createdMembership: true,
  };
}
