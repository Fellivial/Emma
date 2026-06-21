/**
 * Usage Enforcer — 5-hour rolling window metering for Emma.
 *
 * Checks a single 5-hour UTC-aligned window before every brain call.
 * Returns enforcement status — caller decides response.
 *
 * Rules:
 *   Enterprise → skip entirely (unlimited)
 *   Window >= 100% → hard block (LIMIT_BLOCK_MESSAGE)
 *   Window >= 80% and warning not yet sent → warning (LIMIT_WARNING_MESSAGE)
 *   Otherwise → ok
 *
 * Extra Response packs stack on top of the per-window token limit.
 * Production enforcement fails closed when metering is unavailable.
 * Development and tests remain fail-open without database infrastructure.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
  infrastructureFailure?: boolean;
}

function meteringUnavailable(planId: string): EnforcementResult {
  if (process.env.NODE_ENV !== "production") {
    return { status: "ok", planId, allWindows: [] };
  }
  return {
    status: "blocked",
    planId,
    allWindows: [],
    infrastructureFailure: true,
    message: "Usage metering is temporarily unavailable.",
  };
}

// ─── Window Boundary Helper ──────────────────────────────────────────────────

// Returns the start of the current 5-hour UTC-aligned block.
// Blocks: 00:00–04:59, 05:00–09:59, 10:00–14:59, 15:00–19:59, 20:00–24:59 UTC.
function get5HourStart(): Date {
  const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
  return new Date(Math.floor(Date.now() / FIVE_HOURS_MS) * FIVE_HOURS_MS);
}

// ─── Extra Pack Helper ───────────────────────────────────────────────────────

async function getExtraTokens(userId: string, supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase
    .from("extra_packs")
    .select("tokens_remaining")
    .eq("user_id", userId)
    .gt("valid_until", new Date().toISOString())
    .gt("tokens_remaining", 0);

  if (error) throw error;

  return (data || []).reduce(
    (sum: number, p: Record<string, unknown>) => sum + ((p.tokens_remaining as number) || 0),
    0
  );
}

// ─── Main Check ──────────────────────────────────────────────────────────────

export async function checkUsage(
  userId: string | null,
  planId: string,
  _userTimezone: string = "UTC",
  _billingAnchorDay: number = 1,
  clientId?: string
): Promise<EnforcementResult> {
  const plan = getPlan(planId);

  // Enterprise skips metering entirely
  if (!plan || plan.tokenBudgetMonthly >= 999_999_999) {
    return { status: "ok", planId, allWindows: [] };
  }

  const supabase = getSupabase();
  if (!supabase) return meteringUnavailable(planId);

  const effectiveId = clientId ? `client:${clientId}` : (userId ?? "");

  try {
    const windowStart = get5HourStart();

    // Load the single 5-hour window
    const { data: rows, error: rowsError } = await supabase
      .from("usage_windows")
      .select("window_type, window_start, tokens_used, messages_used, warning_sent")
      .eq("user_id", effectiveId)
      .eq("window_type", "daily")
      .eq("window_start", windowStart.toISOString());

    if (rowsError) throw rowsError;

    // Extra pack tokens stack on the per-window token limit
    const extraTokens = clientId ? 0 : await getExtraTokens(effectiveId, supabase);

    const windowDefs: Array<{
      type: "daily" | "weekly" | "monthly";
      start: Date;
      tokenLimit: number;
      messageLimit: number;
    }> = [
      {
        type: "daily",
        start: windowStart,
        tokenLimit: plan.tokenBudgetDaily + extraTokens,
        messageLimit: plan.messageLimitDaily,
      },
    ];

    const allWindows: WindowUsage[] = windowDefs.map((def) => {
      const row = (rows || []).find((r: Record<string, unknown>) => r.window_type === def.type);

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
    return meteringUnavailable(planId);
  }
}

// ─── Record Usage ────────────────────────────────────────────────────────────

export type UsagePersistenceResult =
  | { success: true }
  | { success: false; reason: "unavailable" | "rpc_error" };

export async function recordUsage(
  userId: string | null,
  inputTokens: number,
  outputTokens: number,
  planId: string,
  _userTimezone: string = "UTC",
  _billingAnchorDay: number = 1,
  clientId?: string,
  messages: number = 1
): Promise<UsagePersistenceResult> {
  const supabase = getSupabase();
  if (!supabase) return { success: false, reason: "unavailable" };

  const effectiveId = clientId ? `client:${clientId}` : (userId ?? "");
  const total = BigInt(inputTokens + outputTokens);
  const windowStart = get5HourStart();

  try {
    const { error } = await supabase.rpc("increment_usage_window", {
      p_user_id: effectiveId,
      p_window_type: "daily",
      p_window_start: windowStart.toISOString(),
      p_tokens: Number(total),
      p_messages: Math.max(0, messages),
    });
    if (error) {
      console.error("[UsageEnforcer] usage persistence failed", {
        stage: "increment_usage_window",
        code: error.code ?? "unknown",
      });
      return { success: false, reason: "rpc_error" };
    }
  } catch {
    console.error("[UsageEnforcer] usage persistence failed", {
      stage: "increment_usage_window",
      code: "exception",
    });
    return { success: false, reason: "rpc_error" };
  }

  if (total === BigInt(0) && messages === 0) return { success: true };

  // Deduct from extra packs if window token limit exhausted
  try {
    const plan = getPlan(planId);
    if (!clientId && plan && plan.tokenBudgetMonthly < 999_999_999) {
      const { data: windowRow, error: windowError } = await supabase
        .from("usage_windows")
        .select("tokens_used")
        .eq("user_id", effectiveId)
        .eq("window_type", "daily")
        .eq("window_start", windowStart.toISOString())
        .single();

      if (windowError) return { success: false, reason: "rpc_error" };

      if (windowRow && windowRow.tokens_used > plan.tokenBudgetDaily) {
        const { error: deductError } = await supabase.rpc("deduct_extra_pack_tokens", {
          p_user_id: effectiveId,
          p_deduct: Number(total),
        });

        if (deductError) {
          console.error("[UsageEnforcer] usage persistence failed", {
            stage: "deduct_extra_pack_tokens",
            code: deductError.code ?? "unknown",
          });
          return { success: false, reason: "rpc_error" };
        }
      }
    }
  } catch {
    return { success: false, reason: "rpc_error" };
  }

  return { success: true };
}

// ─── Mark Warning Sent ───────────────────────────────────────────────────────

export async function markWarningSent(
  userId: string | null,
  windowType: string,
  windowStart: string,
  clientId?: string
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const effectiveId = clientId ? `client:${clientId}` : (userId ?? "");
  try {
    await supabase
      .from("usage_windows")
      .update({ warning_sent: true })
      .eq("user_id", effectiveId)
      .eq("window_type", windowType)
      .eq("window_start", windowStart);
  } catch {}
}
