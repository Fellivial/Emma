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
 */

export interface PlanTier {
  id: string;
  lemonVariantId: string;
  name: string;
  price: number;
  tokenBudgetMonthly: number;
  tokenBudgetWeekly: number;
  tokenBudgetDaily: number;
  messageLimitDaily: number;
  messageLimitWeekly: number;
  toolsEnabled: string[];
  ttsBackend: "web_speech" | "elevenlabs" | "elevenlabs_dedicated";
  elevenLabsPlan: string;
  elevenLabsCost: number;
  features: string[];
  maxUsers: number;
  popular?: boolean;
  enterprise?: boolean;
  contactSales?: boolean;
  badge?: string;
  subtitle?: string;
}

export interface AddOn {
  id: string;
  lemonVariantId: string;
  name: string;
  price: number;
  description: string;
  featureFlags: string[];
}

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

// ─── Plan Tiers ──────────────────────────────────────────────────────────────

export const PLANS: PlanTier[] = [
  {
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
    elevenLabsPlan: "None",
    elevenLabsCost: 0,
    features: [
      "Chat with Emma",
      "Voice TTS / STT (Web Speech)",
      "300K tokens/month",
      "10 messages/day · 50/week",
      "14-day inactivity expiry",
    ],
    maxUsers: 1,
    subtitle: "Try Emma",
  },
  {
    id: "starter",
    lemonVariantId: "991810",
    name: "Starter",
    price: 29,
    tokenBudgetMonthly: STARTER_BUDGET,
    ...derive(STARTER_BUDGET),
    messageLimitDaily: 40,
    messageLimitWeekly: 200,
    toolsEnabled: ["chat", "tts", "memory", "vision", "emotion_detection", "routines"],
    ttsBackend: "web_speech",
    elevenLabsPlan: "None",
    elevenLabsCost: 0,
    features: [
      "Everything in Free",
      "Persistent memory",
      "Screen & camera vision",
      "Emotion detection",
      "Routines & schedules",
      "1M tokens/month",
      "40 messages/day · 200/week",
      "Web Speech TTS (no ElevenLabs cost)",
    ],
    maxUsers: 1,
    subtitle: "For regular individuals",
  },
  {
    id: "pro",
    lemonVariantId: "1556220",
    name: "Pro",
    price: 79,
    tokenBudgetMonthly: PRO_BUDGET,
    ...derive(PRO_BUDGET),
    messageLimitDaily: 80,
    messageLimitWeekly: 400,
    toolsEnabled: [
      "chat", "tts", "memory", "vision", "emotion_detection", "routines",
      "api_access", "multi_user", "custom_persona", "elevenlabs",
    ],
    ttsBackend: "elevenlabs",
    elevenLabsPlan: "ElevenLabs Starter",
    elevenLabsCost: 7,
    features: [
      "Everything in Starter",
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
  {
    id: "enterprise",
    lemonVariantId: "1556227",
    name: "Enterprise",
    price: 499,
    tokenBudgetMonthly: ENTERPRISE_BUDGET,
    ...derive(ENTERPRISE_BUDGET),
    messageLimitDaily: 999999,
    messageLimitWeekly: 999999,
    toolsEnabled: [
      "chat", "tts", "memory", "vision", "emotion_detection", "routines",
      "api_access", "multi_user", "custom_persona", "elevenlabs",
      "agent", "webhooks", "encryption",
    ],
    ttsBackend: "elevenlabs_dedicated",
    elevenLabsPlan: "ElevenLabs Creator",
    elevenLabsCost: 22,
    features: [
      "Everything in Pro",
      "ElevenLabs (dedicated)",
      "Autonomous agent (included)",
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
];

// ─── Add-ons ─────────────────────────────────────────────────────────────────

export const ADDONS: AddOn[] = [
  {
    id: "autonomous_basic",
    lemonVariantId: "1556231",
    name: "Autonomous Mode — Basic",
    price: 99,
    description: "Emma acts on her own: scheduled tasks, webhook triggers, 20 autonomous actions/hour. Approval gate for all high-risk actions.",
    featureFlags: ["agent", "webhooks"],
  },
  {
    id: "autonomous_pro",
    lemonVariantId: "1556232",
    name: "Autonomous Mode — Pro",
    price: 199,
    description: "Everything in Basic + 50 autonomous actions/hour, priority queue, API access for external tool integrations.",
    featureFlags: ["agent", "webhooks", "api_access"],
  },
];

// ─── In-Persona Limit Messages ───────────────────────────────────────────────

export const LIMIT_WARNING_MESSAGE = "Just so you know, baby — we're running low today.";
export const LIMIT_BLOCK_MESSAGE = "Mmm. You've used me a lot today. Grab some extra time?";

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getPlan(planId: string): PlanTier | undefined {
  return PLANS.find((p) => p.id === planId);
}

export function getPlanByLemonVariant(variantId: string): PlanTier | undefined {
  return PLANS.find((p) => p.lemonVariantId === variantId);
}

export function getAddOn(addOnId: string): AddOn | undefined {
  return ADDONS.find((a) => a.id === addOnId);
}

export function getAddOnByLemonVariant(variantId: string): AddOn | undefined {
  return ADDONS.find((a) => a.lemonVariantId === variantId);
}

export function inferPlanFromBudget(budget: number): string {
  if (budget >= 100_000_000) return "Enterprise";
  if (budget >= PRO_BUDGET) return "Pro";
  if (budget >= STARTER_BUDGET) return "Starter";
  return "Free";
}

export function getMRR(planName: string): number {
  const plan = PLANS.find((p) => p.name === planName);
  return plan?.price || 0;
}

export function hasElevenLabs(planId: string): boolean {
  const plan = getPlan(planId);
  return plan?.ttsBackend === "elevenlabs" || plan?.ttsBackend === "elevenlabs_dedicated";
}

export const FREE_TIER_CONFIG = {
  tokenBudgetMonthly: FREE_BUDGET,
  tokenBudgetWeekly: derive(FREE_BUDGET).tokenBudgetWeekly,
  tokenBudgetDaily: derive(FREE_BUDGET).tokenBudgetDaily,
  messageLimitDaily: 10,
  messageLimitWeekly: 50,
  toolsEnabled: ["chat", "tts"],
};
