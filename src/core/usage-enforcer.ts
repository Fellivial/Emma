/**
 * Usage Enforcer — multi-window metering for Emma.
 *
 * Checks three windows (daily/weekly/monthly) before every brain call.
 * Returns enforcement status — caller decides response.
 *
 * Rules:
 *   Enterprise → skip entirely (unlimited)
 *   Any window >= 100% → hard block (LIMIT_BLOCK_MESSAGE)
 *   Any window >= 80% and warning not yet sent → warning (LIMIT_WARNING_MESSAGE)
 *   Otherwise → ok
 *
 * Extra Response packs stack on top of monthly token limit.
 * Enforcement MUST fail open — if DB errors, allow the request.
 */

import { createClient } from "@supabase/supabase-js";
import { getPlan, LIMIT_WARNING_MESSAGE, LIMIT_BLOCK_MESSAGE } from "@/core/pricing";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type EnforcementStatus = "ok" | "warning" | "blocked";

export interface WindowUsage {
  windowType: "daily" | "weekly" | "monthly";
  windowStart: string;
  tokensUsed: number;
  tokensLimit: number;
  messagesUsed: number;
  messagesLimit: number;
  tokenPct: number;
  messagePct: number;
  pct: number;
  warningSent: boolean;
}

export interface EnforcementResult {
  status: EnforcementStatus;
  planId: string;
  blockedWindow?: WindowUsage;
  warningWindow?: WindowUsage;
  allWindows: WindowUsage[];
  message?: string;
  upgradeUrl?: string;
}

// ─── Window Boundary Helpers ─────────────────────────────────────────────────

function getDailyStart(tz: string): Date {
  try {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const dateStr = fmt.format(now); // "2026-04-25"
    return new Date(dateStr + "T00:00:00Z");
  } catch {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }
}

function getWeeklyStart(tz: string): Date {
  const daily = getDailyStart(tz);
  const dayOfWeek = daily.getUTCDay(); // 0=Sun, 1=Mon
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  daily.setUTCDate(daily.getUTCDate() - mondayOffset);
  return daily;
}

function getMonthlyStart(anchorDay: number, tz: string): Date {
  const daily = getDailyStart(tz);
  const currentDay = daily.getUTCDate();

  if (currentDay >= anchorDay) {
    daily.setUTCDate(anchorDay);
  } else {
    // Go to previous month
    daily.setUTCMonth(daily.getUTCMonth() - 1);
    const lastDay = new Date(daily.getUTCFullYear(), daily.getUTCMonth() + 1, 0).getUTCDate();
    daily.setUTCDate(Math.min(anchorDay, lastDay));
  }
  return daily;
}

// ─── Extra Pack Helper ───────────────────────────────────────────────────────

async function getExtraTokens(userId: string, supabase: any): Promise<number> {
  const { data } = await supabase
    .from("extra_packs")
    .select("tokens_remaining")
    .eq("user_id", userId)
    .gt("valid_until", new Date().toISOString())
    .gt("tokens_remaining", 0);

  return (data || []).reduce((sum: number, p: any) => sum + (p.tokens_remaining || 0), 0);
}

// ─── Main Check ──────────────────────────────────────────────────────────────

export async function checkUsage(
  userId: string,
  planId: string,
  userTimezone: string = "UTC",
  billingAnchorDay: number = 1
): Promise<EnforcementResult> {
  const plan = getPlan(planId);

  // Enterprise skips metering entirely
  if (!plan || plan.tokenBudgetMonthly >= 999_999_999) {
    return { status: "ok", planId, allWindows: [] };
  }

  const supabase = getSupabase();
  if (!supabase) return { status: "ok", planId, allWindows: [] };

  try {
    const dailyStart = getDailyStart(userTimezone);
    const weeklyStart = getWeeklyStart(userTimezone);
    const monthlyStart = getMonthlyStart(billingAnchorDay, userTimezone);

    // Load all three windows in one query
    const { data: rows } = await supabase
      .from("usage_windows")
      .select("window_type, window_start, tokens_used, messages_used, warning_sent")
      .eq("user_id", userId)
      .or(
        `and(window_type.eq.daily,window_start.eq.${dailyStart.toISOString()}),` +
          `and(window_type.eq.weekly,window_start.eq.${weeklyStart.toISOString()}),` +
          `and(window_type.eq.monthly,window_start.eq.${monthlyStart.toISOString()})`
      );

    // Get extra pack tokens (stacks on monthly limit)
    const extraTokens = await getExtraTokens(userId, supabase);

    // Build window usage objects
    const windowDefs: Array<{
      type: "daily" | "weekly" | "monthly";
      start: Date;
      tokenLimit: number;
      messageLimit: number;
    }> = [
      {
        type: "daily",
        start: dailyStart,
        tokenLimit: plan.tokenBudgetDaily,
        messageLimit: plan.messageLimitDaily,
      },
      {
        type: "weekly",
        start: weeklyStart,
        tokenLimit: plan.tokenBudgetWeekly,
        messageLimit: plan.messageLimitWeekly,
      },
      {
        type: "monthly",
        start: monthlyStart,
        tokenLimit: plan.tokenBudgetMonthly + extraTokens,
        messageLimit: plan.messageLimitDaily * 30,
      },
    ];

    const allWindows: WindowUsage[] = windowDefs.map((def) => {
      const row = (rows || []).find((r: any) => r.window_type === def.type);

      const tokensUsed = row?.tokens_used || 0;
      const messagesUsed = row?.messages_used || 0;
      const tokenPct = def.tokenLimit > 0 ? Math.round((tokensUsed / def.tokenLimit) * 100) : 0;
      const messagePct =
        def.messageLimit > 0 ? Math.round((messagesUsed / def.messageLimit) * 100) : 0;

      return {
        windowType: def.type,
        windowStart: def.start.toISOString(),
        tokensUsed,
        tokensLimit: def.tokenLimit,
        messagesUsed,
        messagesLimit: def.messageLimit,
        tokenPct,
        messagePct,
        pct: Math.max(tokenPct, messagePct),
        warningSent: row?.warning_sent || false,
      };
    });

    // Find most constrained window
    const sorted = [...allWindows].sort((a, b) => b.pct - a.pct);
    const most = sorted[0];

    // Decision
    if (most && most.pct >= 100) {
      return {
        status: "blocked",
        planId,
        blockedWindow: most,
        allWindows,
        message: LIMIT_BLOCK_MESSAGE,
        upgradeUrl: "/settings/billing?addon=extra_pack",
      };
    }

    if (most && most.pct >= 80 && !most.warningSent) {
      return {
        status: "warning",
        planId,
        warningWindow: most,
        allWindows,
        message: LIMIT_WARNING_MESSAGE,
      };
    }

    return { status: "ok", planId, allWindows };
  } catch {
    // Fail open — never block due to metering infra bug
    return { status: "ok", planId, allWindows: [] };
  }
}

// ─── Record Usage ────────────────────────────────────────────────────────────

export async function recordUsage(
  userId: string,
  inputTokens: number,
  outputTokens: number,
  planId: string,
  userTimezone: string = "UTC",
  billingAnchorDay: number = 1
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const total = BigInt(inputTokens + outputTokens);
  const dailyStart = getDailyStart(userTimezone);
  const weeklyStart = getWeeklyStart(userTimezone);
  const monthlyStart = getMonthlyStart(billingAnchorDay, userTimezone);

  const windows: Array<{ type: string; start: Date }> = [
    { type: "daily", start: dailyStart },
    { type: "weekly", start: weeklyStart },
    { type: "monthly", start: monthlyStart },
  ];

  for (const w of windows) {
    try {
      await supabase.rpc("increment_usage_window", {
        p_user_id: userId,
        p_window_type: w.type,
        p_window_start: w.start.toISOString(),
        p_tokens: Number(total),
        p_messages: 1,
      });
    } catch (err) {
      console.error(`[UsageEnforcer] Failed to increment ${w.type}:`, err);
    }
  }

  // Deduct from extra packs if monthly plan tokens exhausted
  try {
    const plan = getPlan(planId);
    if (plan && plan.tokenBudgetMonthly < 999_999_999) {
      const { data: monthRow } = await supabase
        .from("usage_windows")
        .select("tokens_used")
        .eq("user_id", userId)
        .eq("window_type", "monthly")
        .eq("window_start", monthlyStart.toISOString())
        .single();

      if (monthRow && monthRow.tokens_used > plan.tokenBudgetMonthly) {
        const overage = monthRow.tokens_used - plan.tokenBudgetMonthly;
        // Deduct from oldest valid pack
        const { data: packs } = await supabase
          .from("extra_packs")
          .select("id, tokens_remaining")
          .eq("user_id", userId)
          .gt("valid_until", new Date().toISOString())
          .gt("tokens_remaining", 0)
          .order("created_at", { ascending: true })
          .limit(1);

        if (packs && packs.length > 0) {
          const deduct = Math.min(packs[0].tokens_remaining, Number(total));
          await supabase
            .from("extra_packs")
            .update({
              tokens_remaining: Math.max(0, packs[0].tokens_remaining - deduct),
            })
            .eq("id", packs[0].id);
        }
      }
    }
  } catch {}
}

// ─── Mark Warning Sent ───────────────────────────────────────────────────────

export async function markWarningSent(
  userId: string,
  windowType: string,
  windowStart: string
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  try {
    await supabase
      .from("usage_windows")
      .update({ warning_sent: true })
      .eq("user_id", userId)
      .eq("window_type", windowType)
      .eq("window_start", windowStart);
  } catch {}
}
