/**
 * Autonomous Access Enforcer — plan-based gate replacing client_addons lookups.
 *
 * Checks whether a client's plan permits autonomous actions and enforces
 * the per-hour rate limit defined by plan.autonomy.actionsPerHour.
 */

import { createClient } from "@supabase/supabase-js";
import { getPlan } from "@/core/pricing";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export interface AccessResult {
  allowed: boolean;
  reason?: string;
  actionsPerHour: number;
  actionsUsedThisHour: number;
  planId: string;
}

/**
 * Check whether a client is allowed to run an autonomous action.
 *
 * @param clientId  The client making the request.
 * @param planId    The client's current plan ID (e.g. "starter", "pro").
 * @param feature   The specific feature being checked (e.g. "agent", "webhooks").
 */
export async function checkAutonomousAccess(
  clientId: string,
  planId: string,
  feature: keyof import("@/core/pricing").PlanFeatures = "autonomous"
): Promise<AccessResult> {
  const plan = getPlan(planId);
  const actionsPerHour = plan.autonomy.actionsPerHour;

  // Plan does not include this feature at all
  if (!plan.features[feature]) {
    return {
      allowed: false,
      reason: `Your ${plan.name} plan does not include ${feature}. Upgrade to Starter or higher.`,
      actionsPerHour,
      actionsUsedThisHour: 0,
      planId,
    };
  }

  // Unlimited (enterprise)
  if (actionsPerHour >= 9999) {
    return { allowed: true, actionsPerHour, actionsUsedThisHour: 0, planId };
  }

  // Count autonomous actions in the last hour from action_log
  const supabase = getSupabase();
  if (!supabase) {
    return { allowed: true, actionsPerHour, actionsUsedThisHour: 0, planId };
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count } = await supabase
    .from("action_log")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .gte("created_at", oneHourAgo);

  const used = count ?? 0;

  if (used >= actionsPerHour) {
    return {
      allowed: false,
      reason: `Rate limit reached: ${used}/${actionsPerHour} autonomous actions this hour. Resets in ${minutesUntilNextHour()} minutes.`,
      actionsPerHour,
      actionsUsedThisHour: used,
      planId,
    };
  }

  return { allowed: true, actionsPerHour, actionsUsedThisHour: used, planId };
}

/**
 * Record an autonomous action usage tick. Fire-and-forget — never throws.
 */
export async function consumeAutonomousAction(
  clientId: string,
  tokensUsed: number
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  try {
    await supabase.from("autonomous_usage").insert({
      client_id: clientId,
      tokens_used: tokensUsed,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Non-critical — usage tracking failure should not block the action
  }
}

function minutesUntilNextHour(): number {
  const now = new Date();
  return 60 - now.getMinutes();
}
