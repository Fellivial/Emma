/**
 * Rate Limiter — DB-backed per-client hourly counter.
 *
 * Uses Supabase as the persistent store so counters survive
 * across Vercel serverless invocations (each request is a
 * fresh process — in-memory Maps don't persist).
 *
 * When DB is unavailable (local dev, tests), falls back to an
 * in-memory counter so the rate-limit logic still functions.
 */

import { createClient } from "@supabase/supabase-js";

const DEFAULT_MAX_TASKS_PER_HOUR = 20;
const DEFAULT_MAX_TOKENS_PER_HOUR = 100_000;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function getCurrentHourWindow(): string {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  return now.toISOString();
}

// ─── In-memory fallback (for tests + local dev without DB) ────────────────

const memCounters: Map<string, { tasks: number; tokens: number; resetAt: number }> = new Map();

function getMemCounter(clientId: string) {
  const now = Date.now();
  const existing = memCounters.get(clientId);
  if (existing && existing.resetAt > now) return existing;
  const counter = { tasks: 0, tokens: 0, resetAt: now + 3_600_000 };
  memCounters.set(clientId, counter);
  return counter;
}

// ─── Types ────────────────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  reason?: "task_limit" | "token_limit";
  current: { tasks: number; tokens: number };
  limits: { tasks: number; tokens: number };
  resetsAt: number;
}

// ─── Check ────────────────────────────────────────────────────────────────

export async function checkRateLimit(
  clientId: string,
  maxTasks: number = DEFAULT_MAX_TASKS_PER_HOUR,
  maxTokens: number = DEFAULT_MAX_TOKENS_PER_HOUR
): Promise<RateLimitResult> {
  const supabase = getSupabase();
  const hourWindow = getCurrentHourWindow();
  const resetsAt = new Date(hourWindow).getTime() + 3_600_000;

  let taskCount = 0;
  let tokenCount = 0;

  if (supabase) {
    // ── DB path (production) ──────────────────────────────────────────
    try {
      const { data } = await supabase
        .from("rate_limit_counters")
        .select("task_count, token_count")
        .eq("client_id", clientId)
        .eq("hour_window", hourWindow)
        .single();

      taskCount = data?.task_count || 0;
      tokenCount = data?.token_count || 0;
    } catch {
      // DB error — fall through to in-memory
      const mem = getMemCounter(clientId);
      taskCount = mem.tasks;
      tokenCount = mem.tokens;
    }
  } else {
    // ── In-memory path (tests / local dev) ────────────────────────────
    const mem = getMemCounter(clientId);
    taskCount = mem.tasks;
    tokenCount = mem.tokens;
  }

  if (taskCount >= maxTasks) {
    return {
      allowed: false,
      reason: "task_limit",
      current: { tasks: taskCount, tokens: tokenCount },
      limits: { tasks: maxTasks, tokens: maxTokens },
      resetsAt,
    };
  }

  if (tokenCount >= maxTokens) {
    return {
      allowed: false,
      reason: "token_limit",
      current: { tasks: taskCount, tokens: tokenCount },
      limits: { tasks: maxTasks, tokens: maxTokens },
      resetsAt,
    };
  }

  return {
    allowed: true,
    current: { tasks: taskCount, tokens: tokenCount },
    limits: { tasks: maxTasks, tokens: maxTokens },
    resetsAt,
  };
}

// ─── Consume ─────────────────────────────────────────────────────────────

export async function consumeRateLimit(
  clientId: string,
  tasks: number = 1,
  tokens: number = 0
): Promise<void> {
  const supabase = getSupabase();

  if (supabase) {
    // ── DB path ───────────────────────────────────────────────────────
    const hourWindow = getCurrentHourWindow();
    try {
      await supabase.rpc("increment_rate_limit", {
        p_client_id: clientId,
        p_hour_window: hourWindow,
        p_tasks: tasks,
        p_tokens: tokens,
      });
    } catch (err) {
      console.error("[RateLimit] consumeRateLimit failed:", err);
      // Fallback to in-memory
      const mem = getMemCounter(clientId);
      mem.tasks += tasks;
      mem.tokens += tokens;
    }
  } else {
    // ── In-memory path ────────────────────────────────────────────────
    const mem = getMemCounter(clientId);
    mem.tasks += tasks;
    mem.tokens += tokens;
  }
}
