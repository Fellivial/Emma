/**
 * Trial Engine — product-led growth core.
 *
 * Manages the free trial lifecycle:
 *   1. Create trial on signup (14 days, 500 messages, Starter features)
 *   2. Track activation milestones (first message, voice, memory, routine)
 *   3. Enforce message limits — surface upgrade prompt when hit
 *   4. Schedule email sequence (day 1, 7, 12, 14)
 *   5. Convert or expire
 *
 * No credit card required to start.
 */

import { createClient } from "@supabase/supabase-js";
import { getPlan } from "@/core/pricing";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Trial {
  id: string;
  userId: string;
  clientId: string | null;
  planId: string;
  status: "active" | "converted" | "expired" | "cancelled";
  messagesUsed: number;
  messagesLimit: number;
  startedAt: string;
  expiresAt: string;
  daysRemaining: number;
  percentUsed: number;
  activated: boolean;       // Has sent at least one message
  source: string | null;
}

export interface TrialCheck {
  hasTrial: boolean;
  trial: Trial | null;
  canSendMessage: boolean;
  shouldShowUpgrade: boolean;
  upgradeReason: string | null;
}

export type ActivationMilestone =
  | "first_message"
  | "first_voice"
  | "first_memory"
  | "first_routine";

export type TrialEvent =
  | "signup"
  | "first_message"
  | "first_voice"
  | "first_memory"
  | "first_routine"
  | "hit_limit"
  | "upgrade_shown"
  | "upgrade_clicked"
  | "converted"
  | "expired";

// ─── Trial CRUD ──────────────────────────────────────────────────────────────

export async function createTrial(
  userId: string,
  email: string,
  options?: { source?: string; referralCode?: string; affiliateCode?: string }
): Promise<Trial | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  // Check if user already has an active trial
  const { data: existing } = await supabase
    .from("trials")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .single();

  if (existing) return getActiveTrial(userId);

  const plan = getPlan("starter");
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase.from("trials").insert({
    user_id: userId,
    plan_id: "starter",
    messages_limit: 500,
    expires_at: expiresAt,
    source: options?.source || "organic",
    referral_code: options?.referralCode || null,
    affiliate_code: options?.affiliateCode || null,
  }).select("id").single();

  if (error || !data) return null;

  // Log signup event
  await logTrialEvent(data.id, userId, "signup", { email, source: options?.source });

  // Schedule email sequence
  await scheduleEmailSequence(data.id, userId, email);

  // Create client with Starter features (trial)
  if (plan) {
    const { data: client } = await supabase.from("clients").insert({
      slug: `trial-${userId.slice(0, 8)}`,
      name: "Emma Trial",
      owner_id: userId,
      persona_name: "Emma",
      token_budget_monthly: plan.tokenBudgetMonthly,
      token_budget_daily: plan.tokenBudgetDaily,
      message_limit_daily: 200,
      tools_enabled: plan.toolsEnabled,
    }).select("id").single();

    if (client) {
      await supabase.from("trials").update({ client_id: client.id }).eq("id", data.id);
      await supabase.from("client_members").insert({
        client_id: client.id,
        user_id: userId,
        role: "owner",
      });
    }
  }

  return getActiveTrial(userId);
}

export async function getActiveTrial(userId: string): Promise<Trial | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data } = await supabase
    .from("trials")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .single();

  if (!data) return null;

  const now = new Date();
  const expires = new Date(data.expires_at);
  const daysRemaining = Math.max(0, Math.ceil((expires.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
  const percentUsed = Math.round((data.messages_used / data.messages_limit) * 100);

  return {
    id: data.id,
    userId: data.user_id,
    clientId: data.client_id,
    planId: data.plan_id,
    status: data.status,
    messagesUsed: data.messages_used,
    messagesLimit: data.messages_limit,
    startedAt: data.started_at,
    expiresAt: data.expires_at,
    daysRemaining,
    percentUsed,
    activated: !!data.first_message_at,
    source: data.source,
  };
}

// ─── Trial Check (called before every message) ──────────────────────────────

export async function checkTrial(userId: string): Promise<TrialCheck> {
  const trial = await getActiveTrial(userId);

  if (!trial) {
    return { hasTrial: false, trial: null, canSendMessage: true, shouldShowUpgrade: false, upgradeReason: null };
  }

  // Check expiry
  if (trial.daysRemaining <= 0) {
    await expireTrial(trial.id, userId);
    return {
      hasTrial: true,
      trial: { ...trial, status: "expired" },
      canSendMessage: false,
      shouldShowUpgrade: true,
      upgradeReason: "Your 14-day trial has ended. Upgrade to keep all your features.",
    };
  }

  // Check message limit
  if (trial.messagesUsed >= trial.messagesLimit) {
    await logTrialEvent(trial.id, userId, "hit_limit");
    return {
      hasTrial: true,
      trial,
      canSendMessage: false,
      shouldShowUpgrade: true,
      upgradeReason: `You've used all ${trial.messagesLimit} trial messages. Upgrade to continue.`,
    };
  }

  // Approaching limit (80%+)
  const approaching = trial.percentUsed >= 80;
  // Last 3 days
  const urgentDays = trial.daysRemaining <= 3;

  return {
    hasTrial: true,
    trial,
    canSendMessage: true,
    shouldShowUpgrade: approaching || urgentDays,
    upgradeReason: approaching
      ? `${trial.messagesLimit - trial.messagesUsed} messages remaining in your trial.`
      : urgentDays
      ? `Your trial ends in ${trial.daysRemaining} day${trial.daysRemaining !== 1 ? "s" : ""}.`
      : null,
  };
}

// ─── Increment Message Count ─────────────────────────────────────────────────

export async function incrementTrialMessages(userId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const { data: trial } = await supabase
    .from("trials")
    .select("id, messages_used, first_message_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .single();

  if (!trial) return;

  const updates: Record<string, any> = {
    messages_used: trial.messages_used + 1,
  };

  // Track first message activation
  if (!trial.first_message_at) {
    updates.first_message_at = new Date().toISOString();
    await logTrialEvent(trial.id, userId, "first_message");
  }

  await supabase.from("trials").update(updates).eq("id", trial.id);
}

// ─── Track Activation Milestones ─────────────────────────────────────────────

export async function trackActivation(userId: string, milestone: ActivationMilestone): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const column = {
    first_message: "first_message_at",
    first_voice: "first_voice_at",
    first_memory: "first_memory_at",
    first_routine: "first_routine_at",
  }[milestone];

  const { data: trial } = await supabase
    .from("trials")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .single();

  if (!trial || (trial as any)[column]) return; // Already tracked

  await supabase.from("trials").update({ [column]: new Date().toISOString() }).eq("id", (trial as any).id);
  await logTrialEvent((trial as any).id, userId, milestone);
}

// ─── Convert Trial ───────────────────────────────────────────────────────────

export async function convertTrial(userId: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  const { error } = await supabase.from("trials").update({
    status: "converted",
    converted_at: new Date().toISOString(),
  }).eq("user_id", userId).eq("status", "active");

  if (!error) {
    const trial = await supabase.from("trials").select("id").eq("user_id", userId).eq("status", "converted").single();
    if (trial.data) await logTrialEvent(trial.data.id, userId, "converted");
  }

  return !error;
}

// ─── Expire Trial ────────────────────────────────────────────────────────────

async function expireTrial(trialId: string, userId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  await supabase.from("trials").update({ status: "expired" }).eq("id", trialId);
  await logTrialEvent(trialId, userId, "expired");
}

// ─── Event Logging ───────────────────────────────────────────────────────────

async function logTrialEvent(trialId: string, userId: string, event: TrialEvent, metadata?: Record<string, unknown>): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  try {
    await supabase.from("trial_events").insert({
      trial_id: trialId,
      user_id: userId,
      event,
      metadata: metadata || null,
    });
  } catch {}
}

// ─── Email Sequence Scheduling ───────────────────────────────────────────────

async function scheduleEmailSequence(trialId: string, userId: string, email: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  const emails = [
    { template_id: "day1_welcome",  scheduled_for: new Date(now + 1 * 60 * 60 * 1000).toISOString() },  // 1 hour after signup
    { template_id: "day7_checkin",  scheduled_for: new Date(now + 7 * day).toISOString() },
    { template_id: "day12_urgency", scheduled_for: new Date(now + 12 * day).toISOString() },
    { template_id: "day14_expiry",  scheduled_for: new Date(now + 14 * day).toISOString() },
  ];

  const rows = emails.map((e) => ({
    trial_id: trialId,
    user_id: userId,
    email,
    template_id: e.template_id,
    scheduled_for: e.scheduled_for,
    status: "pending",
  }));

  try { await supabase.from("email_sequences").insert(rows); } catch {}
}

// ─── Trial Analytics (for admin dashboard) ───────────────────────────────────

export async function getTrialAnalytics(): Promise<{
  totalTrials: number;
  activeTrials: number;
  conversionRate: number;
  activationRate: number;
  avgMessagesUsed: number;
  topSources: Array<{ source: string; count: number }>;
}> {
  const supabase = getSupabase();
  if (!supabase) return { totalTrials: 0, activeTrials: 0, conversionRate: 0, activationRate: 0, avgMessagesUsed: 0, topSources: [] };

  const { data: all } = await supabase.from("trials").select("status, messages_used, first_message_at, source");

  if (!all || all.length === 0) {
    return { totalTrials: 0, activeTrials: 0, conversionRate: 0, activationRate: 0, avgMessagesUsed: 0, topSources: [] };
  }

  const total = all.length;
  const active = all.filter((t) => t.status === "active").length;
  const converted = all.filter((t) => t.status === "converted").length;
  const activated = all.filter((t) => t.first_message_at).length;
  const completed = all.filter((t) => t.status === "converted" || t.status === "expired").length;
  const avgMsgs = Math.round(all.reduce((s, t) => s + t.messages_used, 0) / total);

  // Source breakdown
  const sourceCounts: Record<string, number> = {};
  for (const t of all) {
    const src = t.source || "unknown";
    sourceCounts[src] = (sourceCounts[src] || 0) + 1;
  }
  const topSources = Object.entries(sourceCounts)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalTrials: total,
    activeTrials: active,
    conversionRate: completed > 0 ? Math.round((converted / completed) * 100) : 0,
    activationRate: total > 0 ? Math.round((activated / total) * 100) : 0,
    avgMessagesUsed: avgMsgs,
    topSources,
  };
}
