/**
 * Client Config Loader — server-side only.
 *
 * Reads per-client configuration from Supabase.
 * Falls back to default config when no client is configured.
 *
 * Config hierarchy: client override > user preference > system default
 */

import { createClient } from "@supabase/supabase-js";
import type { AutonomyTier } from "@/types/emma";

export interface ClientConfig {
  id: string;
  slug: string;
  name: string;
  personaName: string;
  personaPrompt: string | null;     // null = use default Mommy prompt
  personaGreeting: string | null;   // null = use greeting engine
  voiceId: string | null;           // null = use default Rachel
  toolsEnabled: string[];
  tokenBudgetMonthly: number;
  tokenBudgetDaily: number;
  messageLimitDaily: number;
  planId: string;
  // DB columns required: autonomy_tier integer default 2, proactive_vision boolean default false
  autonomyTier: AutonomyTier;
  proactiveVision: boolean;
}

const DEFAULT_CONFIG: ClientConfig = {
  id: "default",
  slug: "default",
  name: "Emma",
  personaName: "Emma",
  personaPrompt: null,
  personaGreeting: null,
  voiceId: null,
  toolsEnabled: ["chat", "memory", "tts", "vision", "routines"],
  tokenBudgetMonthly: 500_000,
  tokenBudgetDaily: 50_000,
  messageLimitDaily: 50,
  planId: "free",
  autonomyTier: 2,
  proactiveVision: false,
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Load client config by slug.
 * Returns default config if client not found or DB unavailable.
 */
export async function loadClientConfig(slug?: string): Promise<ClientConfig> {
  if (!slug || slug === "default") return DEFAULT_CONFIG;

  const supabase = getSupabase();
  if (!supabase) return DEFAULT_CONFIG;

  try {
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .eq("slug", slug)
      .single();

    if (error || !data) return DEFAULT_CONFIG;

    return {
      id: data.id,
      slug: data.slug,
      name: data.name,
      personaName: data.persona_name,
      personaPrompt: data.persona_prompt,
      personaGreeting: data.persona_greeting,
      voiceId: data.voice_id,
      toolsEnabled: data.tools_enabled || DEFAULT_CONFIG.toolsEnabled,
      tokenBudgetMonthly: data.token_budget_monthly,
      tokenBudgetDaily: data.token_budget_daily,
      messageLimitDaily: data.message_limit_daily,
      planId: data.plan_id || "free",
      autonomyTier: (data.autonomy_tier as AutonomyTier) ?? 2,
      proactiveVision: data.proactive_vision ?? false,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

/**
 * Load client config for a user (via client_members join).
 */
export async function loadClientConfigForUser(userId: string): Promise<ClientConfig> {
  const supabase = getSupabase();
  if (!supabase) return DEFAULT_CONFIG;

  try {
    const { data, error } = await supabase
      .from("client_members")
      .select("client_id, clients(*)")
      .eq("user_id", userId)
      .limit(1)
      .single();

    if (error || !data || !data.clients) return DEFAULT_CONFIG;

    const c = data.clients as any;
    return {
      id: c.id,
      slug: c.slug,
      name: c.name,
      personaName: c.persona_name,
      personaPrompt: c.persona_prompt,
      personaGreeting: c.persona_greeting,
      voiceId: c.voice_id,
      toolsEnabled: c.tools_enabled || DEFAULT_CONFIG.toolsEnabled,
      tokenBudgetMonthly: c.token_budget_monthly,
      tokenBudgetDaily: c.token_budget_daily,
      messageLimitDaily: c.message_limit_daily,
      planId: c.plan_id || "free",
      autonomyTier: (c.autonomy_tier as AutonomyTier) ?? 2,
      proactiveVision: c.proactive_vision ?? false,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

/**
 * Check if user is within their usage limits.
 */
export async function checkUsageLimits(
  userId: string,
  config: ClientConfig
): Promise<{ allowed: boolean; reason?: string; dailyMessages: number; monthlyTokens: number }> {
  const supabase = getSupabase();
  if (!supabase) return { allowed: true, dailyMessages: 0, monthlyTokens: 0 };

  try {
    const today = new Date().toISOString().split("T")[0];

    // Daily usage
    const { data: dailyData } = await supabase
      .from("usage")
      .select("message_count, token_count")
      .eq("user_id", userId)
      .eq("date", today)
      .single();

    const dailyMessages = dailyData?.message_count || 0;
    const dailyTokens = dailyData?.token_count || 0;

    // Monthly usage (sum all days this month)
    const monthStart = new Date();
    monthStart.setDate(1);
    const monthStartStr = monthStart.toISOString().split("T")[0];

    const { data: monthlyData } = await supabase
      .from("usage")
      .select("token_count")
      .eq("user_id", userId)
      .gte("date", monthStartStr);

    const monthlyTokens = (monthlyData || []).reduce(
      (sum: number, row: any) => sum + (row.token_count || 0), 0
    );

    // Check limits
    if (dailyMessages >= config.messageLimitDaily) {
      return {
        allowed: false,
        reason: "daily_message_limit",
        dailyMessages,
        monthlyTokens,
      };
    }

    if (dailyTokens >= config.tokenBudgetDaily) {
      return {
        allowed: false,
        reason: "daily_token_limit",
        dailyMessages,
        monthlyTokens,
      };
    }

    if (monthlyTokens >= config.tokenBudgetMonthly) {
      return {
        allowed: false,
        reason: "monthly_token_limit",
        dailyMessages,
        monthlyTokens,
      };
    }

    return { allowed: true, dailyMessages, monthlyTokens };
  } catch {
    // If check fails, allow (don't block users due to DB issues)
    return { allowed: true, dailyMessages: 0, monthlyTokens: 0 };
  }
}

export { DEFAULT_CONFIG };
