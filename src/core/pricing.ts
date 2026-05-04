/**
 * Pricing Module — final confirmed tier plan.
 *
 * Margins at 100% cap (worst case):
 *   Starter: $4.16 cost → $29 price = 86% margin
 *   Pro:     $15.32 cost ($8.32 Anthropic + $7 ElevenLabs) → $79 price = 81% margin
 *
 * At typical 40-60% usage: Starter ~93%, Pro ~89%.
 *
 * Blended Anthropic rate: $4.16/1M tokens (75% Sonnet + 25% Haiku).
 *
 * ElevenLabs gating:
 *   Free/Starter → Web Speech API (browser, $0)
 *   Pro          → ElevenLabs Starter (~$7/mo)
 *   Enterprise   → ElevenLabs Creator (~$22/mo)
 *
 * STT (Web Speech API) is free on ALL plans.
 *
 * Token formula: weekly = monthly ÷ 4, daily = weekly ÷ 7 (rounded down).
 * Resets: daily midnight (user TZ), weekly Monday 00:00, monthly billing anchor.
 *
 * Limits: whichever cap hits first (daily, weekly, monthly).
 *   80% → soft warning in-persona
 *   100% → hard block + Extra Response pack offer
 *
 * Autonomous mode:
 *   Free    → 0 actions/hr (disabled)
 *   Starter → 3 actions/hr (limited)
 *   Pro     → 50 actions/hr (full)
 *   Enterprise → unlimited (9999)
 */

export interface PlanFeatures {
  chat: boolean;
  memory: boolean;
  vision: boolean;
  emotionDetection: boolean;
  routines: boolean;
  autonomous: boolean;
  webhooks: boolean;
  scheduledTasks: boolean;
  apiAccess: boolean;
  multiUser: boolean;
  customPersona: boolean;
  elevenlabs: boolean;
  encryption: boolean;
  prioritySupport: boolean;
}

export interface Plan {
  id: string;
  lemonVariantId: string;
  name: string;
  price: number | null;
  byokElevenLabs: true;
  tokenBudgetMonthly: number;
  tokenBudgetWeekly: number;
  tokenBudgetDaily: number;
  messageLimitDaily: number;
  messageLimitWeekly: number;
  toolsEnabled: string[];
  ttsBackend: "web_speech" | "elevenlabs" | "elevenlabs_dedicated";
  elevenLabsPlan: string;
  elevenLabsCost: number;
  features: PlanFeatures;
  autonomy: {
    actionsPerHour: number;
  };
  featureList: string[];
  maxUsers: number;
  popular?: boolean;
  enterprise?: boolean;
  contactSales?: boolean;
  badge?: string;
  subtitle?: string;
}

/** @deprecated Use Plan instead */
export type PlanTier = Plan;

function derive(monthly: number): { tokenBudgetWeekly: number; tokenBudgetDaily: number } {
  const tokenBudgetWeekly = Math.floor(monthly / 4);
  const tokenBudgetDaily = Math.floor(tokenBudgetWeekly / 7);
  return { tokenBudgetWeekly, tokenBudgetDaily };
}

// ─── Budgets ─────────────────────────────────────────────────────────────────

const FREE_BUDGET       = 300_000;
const STARTER_BUDGET    = 1_000_000;
const PRO_BUDGET        = 2_000_000;
const ENTERPRISE_BUDGET = 999_999_999;

// ─── Plan Map ─────────────────────────────────────────────────────────────────

export const PLANS: Record<string, Plan> = {
  free: {
    id: "free",
    lemonVariantId: "",
    name: "Free",
    price: 0,
    tokenBudgetMonthly: FREE_BUDGET,
    ...derive(FREE_BUDGET),
    messageLimitDaily: 10,
    messageLimitWeekly: 50,
    toolsEnabled: ["chat", "tts"],
    ttsBackend: "web_speech",
    byokElevenLabs: true,
    elevenLabsPlan: "None",
    elevenLabsCost: 0,
    features: {
      chat: true,
      memory: false,
      vision: false,
      emotionDetection: false,
      routines: false,
      autonomous: false,
      webhooks: false,
      scheduledTasks: false,
      apiAccess: false,
      multiUser: false,
      customPersona: false,
      elevenlabs: false,
      encryption: false,
      prioritySupport: false,
    },
    autonomy: { actionsPerHour: 0 },
    featureList: [
      "Chat with Emma",
      "Voice TTS / STT (Web Speech)",
      "300K tokens/month",
      "10 messages/day · 50/week",
    ],
    maxUsers: 1,
    subtitle: "Try Emma",
  },

  starter: {
    id: "starter",
    lemonVariantId: "REPLACE_WITH_LEMON_VARIANT_ID",
    name: "Starter",
    price: 29,
    tokenBudgetMonthly: STARTER_BUDGET,
    ...derive(STARTER_BUDGET),
    messageLimitDaily: 40,
    messageLimitWeekly: 200,
    toolsEnabled: ["chat", "tts", "memory", "vision", "emotion_detection", "routines", "agent", "webhooks"],
    ttsBackend: "web_speech",
    byokElevenLabs: true,
    elevenLabsPlan: "None",
    elevenLabsCost: 0,
    features: {
      chat: true,
      memory: true,
      vision: true,
      emotionDetection: true,
      routines: true,
      autonomous: true,
      webhooks: true,
      scheduledTasks: true,
      apiAccess: false,
      multiUser: false,
      customPersona: false,
      elevenlabs: false,
      encryption: false,
      prioritySupport: false,
    },
    autonomy: { actionsPerHour: 3 },
    featureList: [
      "Everything in Free",
      "Persistent memory",
      "Screen & camera vision",
      "Emotion detection",
      "Routines & schedules",
      "Autonomous mode (3 actions/hr) — New",
      "Webhooks & scheduled tasks — New",
      "1M tokens/month",
      "40 messages/day · 200/week",
    ],
    maxUsers: 1,
    subtitle: "For regular individuals",
  },

  pro: {
    id: "pro",
    lemonVariantId: "REPLACE_WITH_LEMON_VARIANT_ID",
    name: "Pro",
    price: 79,
    tokenBudgetMonthly: PRO_BUDGET,
    ...derive(PRO_BUDGET),
    messageLimitDaily: 80,
    messageLimitWeekly: 400,
    toolsEnabled: [
      "chat", "tts", "memory", "vision", "emotion_detection", "routines",
      "agent", "webhooks", "api_access", "multi_user", "custom_persona", "elevenlabs",
    ],
    ttsBackend: "web_speech",
    byokElevenLabs: true,
    elevenLabsPlan: "ElevenLabs Starter",
    elevenLabsCost: 7,
    features: {
      chat: true,
      memory: true,
      vision: true,
      emotionDetection: true,
      routines: true,
      autonomous: true,
      webhooks: true,
      scheduledTasks: true,
      apiAccess: true,
      multiUser: true,
      customPersona: true,
      elevenlabs: true,
      encryption: false,
      prioritySupport: true,
    },
    autonomy: { actionsPerHour: 50 },
    featureList: [
      "Everything in Starter",
      "Full autonomous mode (50 actions/hr)",
      "ElevenLabs TTS (high quality)",
      "Custom persona config",
      "API access",
      "Multi-user profiles",
      "Priority support",
      "2M tokens/month",
      "80 messages/day · 400/week",
      "Includes ElevenLabs Starter subscription",
    ],
    maxUsers: 10,
    popular: true,
    badge: "Recommended",
    subtitle: "Full Emma experience",
  },

  enterprise: {
    id: "enterprise",
    lemonVariantId: "REPLACE_WITH_LEMON_VARIANT_ID",
    name: "Enterprise",
    price: null,
    tokenBudgetMonthly: ENTERPRISE_BUDGET,
    ...derive(ENTERPRISE_BUDGET),
    messageLimitDaily: 999999,
    messageLimitWeekly: 999999,
    toolsEnabled: [
      "chat", "tts", "memory", "vision", "emotion_detection", "routines",
      "agent", "webhooks", "api_access", "multi_user", "custom_persona", "elevenlabs",
      "encryption",
    ],
    ttsBackend: "elevenlabs_dedicated",
    byokElevenLabs: true,
    elevenLabsPlan: "ElevenLabs Creator",
    elevenLabsCost: 22,
    features: {
      chat: true,
      memory: true,
      vision: true,
      emotionDetection: true,
      routines: true,
      autonomous: true,
      webhooks: true,
      scheduledTasks: true,
      apiAccess: true,
      multiUser: true,
      customPersona: true,
      elevenlabs: true,
      encryption: true,
      prioritySupport: true,
    },
    autonomy: { actionsPerHour: 9999 },
    featureList: [
      "Everything in Pro",
      "ElevenLabs (dedicated)",
      "Unlimited autonomous actions",
      "Custom integrations",
      "99.9% SLA",
      "Unlimited tokens & messages",
      "White-label + dedicated support",
    ],
    maxUsers: 999999,
    enterprise: true,
    contactSales: true,
    badge: "Custom",
    subtitle: "For organizations",
  },
};

// ─── Extra Pack ───────────────────────────────────────────────────────────────

export const EXTRA_PACK = {
  id: "extra_pack_500",
  name: "Extra Response Pack",
  price: 9,
  tokens: 500_000,
  description: "Add 500K tokens on top of your monthly budget. Never run out mid-conversation.",
};

// ─── In-Persona Limit Messages ───────────────────────────────────────────────

export const LIMIT_WARNING_MESSAGE = "Just so you know, baby — we're running low today.";
export const LIMIT_BLOCK_MESSAGE = "Mmm. You've used me a lot today. Grab some extra time?";

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getPlan(planId: string): Plan {
  return PLANS[planId] ?? PLANS.free;
}

export function getPlanByLemonVariant(variantId: string): Plan | undefined {
  return Object.values(PLANS).find((p) => p.lemonVariantId === variantId);
}

export function inferPlanFromBudget(budget: number): string {
  if (budget >= 100_000_000) return "enterprise";
  if (budget >= PRO_BUDGET) return "pro";
  if (budget >= STARTER_BUDGET) return "starter";
  return "free";
}

export function getMRR(planName: string): number {
  const id = planName.toLowerCase();
  return PLANS[id]?.price ?? 0;
}

export function hasElevenLabs(planId: string): boolean {
  const plan = getPlan(planId);
  return plan.ttsBackend === "elevenlabs" || plan.ttsBackend === "elevenlabs_dedicated";
}

export const FREE_TIER_CONFIG = {
  tokenBudgetMonthly: FREE_BUDGET,
  tokenBudgetWeekly: derive(FREE_BUDGET).tokenBudgetWeekly,
  tokenBudgetDaily: derive(FREE_BUDGET).tokenBudgetDaily,
  messageLimitDaily: 10,
  messageLimitWeekly: 50,
  toolsEnabled: ["chat", "tts"],
};
