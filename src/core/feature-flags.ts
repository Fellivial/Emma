/**
 * Feature Flags — gradual rollout control.
 *
 * Allows deploying new features to specific clients before enabling globally.
 * Checked at runtime — no redeploy needed to toggle.
 *
 * Sources (in priority order):
 *   1. Client config in DB (tools_enabled field)
 *   2. Environment variable overrides (EMMA_FF_<FLAG>=true/false)
 *   3. Hardcoded defaults below
 *
 * Usage:
 *   if (isFeatureEnabled("screen_capture", clientId)) { ... }
 */

import { createClient } from "@supabase/supabase-js";
import { getPlan } from "@/core/pricing";

// ─── Flag Definitions ────────────────────────────────────────────────────────

export interface FeatureFlag {
  name: string;
  description: string;
  default: boolean;
  /** If true, requires explicit opt-in per client */
  requiresOptIn: boolean;
}

const FLAGS: Record<string, FeatureFlag> = {
  // Core features (on by default)
  chat: { name: "chat", description: "Chat with Emma", default: true, requiresOptIn: false },
  memory: { name: "memory", description: "Persistent memory", default: true, requiresOptIn: false },
  tts: { name: "tts", description: "Text-to-speech", default: true, requiresOptIn: false },

  // Advanced features (on by default for Pro+)
  vision: { name: "vision", description: "Screen awareness", default: false, requiresOptIn: true },
  routines: { name: "routines", description: "Device routines", default: false, requiresOptIn: true },
  agent: { name: "agent", description: "Autonomous agent loop", default: false, requiresOptIn: true },
  webhooks: { name: "webhooks", description: "Webhook triggers", default: false, requiresOptIn: true },

  // Experimental features (off by default, opt-in only)
  proactive_speech: { name: "proactive_speech", description: "Emma speaks unprompted", default: true, requiresOptIn: false },
  audio_lip_sync: { name: "audio_lip_sync", description: "Audio-driven lip sync", default: true, requiresOptIn: false },
  encryption: { name: "encryption", description: "Field-level encryption", default: false, requiresOptIn: true },

  // Future features (not built yet, gated)
  multi_language: { name: "multi_language", description: "Multi-language support", default: false, requiresOptIn: true },
  mobile_app: { name: "mobile_app", description: "Mobile app access", default: false, requiresOptIn: true },
  api_access: { name: "api_access", description: "External API access", default: false, requiresOptIn: true },
};

// ─── In-memory client feature cache ──────────────────────────────────────────

const clientFeaturesCache: Map<string, { features: string[]; loadedAt: number }> = new Map();
const CACHE_TTL = 60_000; // 1 minute

async function getClientFeatures(clientId: string): Promise<{ toolsEnabled: string[]; planId: string }> {
  const cached = clientFeaturesCache.get(clientId);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL) {
    return { toolsEnabled: cached.features, planId: "" };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { toolsEnabled: [], planId: "" };

  try {
    const supabase = createClient(url, key);
    const { data } = await supabase
      .from("clients")
      .select("tools_enabled, plan_id")
      .eq("id", clientId)
      .single();

    const toolsEnabled = data?.tools_enabled || [];
    clientFeaturesCache.set(clientId, { features: toolsEnabled, loadedAt: Date.now() });
    return { toolsEnabled, planId: data?.plan_id || "" };
  } catch {
    return { toolsEnabled: [], planId: "" };
  }
}

// ─── Check Functions ─────────────────────────────────────────────────────────

// Flags that are gated by plan tier rather than client DB config
const PLAN_GATED_FLAGS = new Set(["agent", "webhooks", "api_access"]);

/**
 * Check if a feature is enabled.
 *
 * Priority: env override > plan features (for plan-gated flags) > client DB config > default
 */
export async function isFeatureEnabled(
  flag: string,
  clientId?: string,
  planId?: string
): Promise<boolean> {
  // 1. Environment override (EMMA_FF_VISION=true)
  const envKey = `EMMA_FF_${flag.toUpperCase()}`;
  const envValue = process.env[envKey];
  if (envValue === "true") return true;
  if (envValue === "false") return false;

  // 2. Plan-gated flags: check plan features object
  if (PLAN_GATED_FLAGS.has(flag)) {
    let resolvedPlanId = planId;
    if (!resolvedPlanId && clientId) {
      const { planId: dbPlanId } = await getClientFeatures(clientId);
      resolvedPlanId = dbPlanId;
    }
    if (resolvedPlanId) {
      const plan = getPlan(resolvedPlanId);
      if (flag === "agent" || flag === "webhooks") return plan.features.autonomous;
      if (flag === "api_access") return plan.features.apiAccess;
    }
  }

  // 3. Client DB config
  if (clientId) {
    const { toolsEnabled } = await getClientFeatures(clientId);
    if (toolsEnabled.includes(flag)) return true;

    // If client has features configured but this flag isn't in the list
    if (toolsEnabled.length > 0 && FLAGS[flag]?.requiresOptIn) return false;
  }

  // 4. Hardcoded default
  return FLAGS[flag]?.default ?? false;
}

/**
 * Sync check (no DB) — uses env + defaults only.
 * Use in client-side code or when you can't await.
 */
export function isFeatureEnabledSync(flag: string): boolean {
  const envKey = `EMMA_FF_${flag.toUpperCase()}`;
  const envValue = process.env[envKey];
  if (envValue === "true") return true;
  if (envValue === "false") return false;
  return FLAGS[flag]?.default ?? false;
}

/**
 * Get all flags and their current state for a client.
 */
export async function getAllFlags(clientId?: string): Promise<Record<string, boolean>> {
  const result: Record<string, boolean> = {};
  for (const flag of Object.keys(FLAGS)) {
    result[flag] = await isFeatureEnabled(flag, clientId);
  }
  return result;
}

/**
 * Invalidate cached features for a client (call after config changes).
 */
export function invalidateFeatureCache(clientId: string): void {
  clientFeaturesCache.delete(clientId);
}

export { FLAGS };
