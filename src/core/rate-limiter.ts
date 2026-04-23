/**
 * Rate Limiter — prevents runaway autonomous task costs.
 *
 * Enforces: max N autonomous tasks per client per hour.
 * Uses in-memory counter with hourly reset.
 * Falls back to DB check for persistence across restarts.
 */

import { createClient } from "@supabase/supabase-js";

const DEFAULT_MAX_TASKS_PER_HOUR = 20;
const DEFAULT_MAX_TOKENS_PER_HOUR = 100_000;

// In-memory counters (fast path)
const counters: Map<string, { tasks: number; tokens: number; resetAt: number }> = new Map();

function getCounterKey(clientId: string): string {
  return clientId;
}

function getOrCreateCounter(clientId: string) {
  const key = getCounterKey(clientId);
  const now = Date.now();
  const existing = counters.get(key);

  if (existing && existing.resetAt > now) {
    return existing;
  }

  // Reset — new hour window
  const counter = { tasks: 0, tokens: 0, resetAt: now + 3600_000 };
  counters.set(key, counter);
  return counter;
}

// ─── Check ───────────────────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  reason?: "task_limit" | "token_limit";
  current: { tasks: number; tokens: number };
  limits: { tasks: number; tokens: number };
  resetsAt: number;
}

export function checkRateLimit(
  clientId: string,
  maxTasks: number = DEFAULT_MAX_TASKS_PER_HOUR,
  maxTokens: number = DEFAULT_MAX_TOKENS_PER_HOUR
): RateLimitResult {
  const counter = getOrCreateCounter(clientId);

  if (counter.tasks >= maxTasks) {
    return {
      allowed: false,
      reason: "task_limit",
      current: { tasks: counter.tasks, tokens: counter.tokens },
      limits: { tasks: maxTasks, tokens: maxTokens },
      resetsAt: counter.resetAt,
    };
  }

  if (counter.tokens >= maxTokens) {
    return {
      allowed: false,
      reason: "token_limit",
      current: { tasks: counter.tasks, tokens: counter.tokens },
      limits: { tasks: maxTasks, tokens: maxTokens },
      resetsAt: counter.resetAt,
    };
  }

  return {
    allowed: true,
    current: { tasks: counter.tasks, tokens: counter.tokens },
    limits: { tasks: maxTasks, tokens: maxTokens },
    resetsAt: counter.resetAt,
  };
}

// ─── Consume ─────────────────────────────────────────────────────────────────

export function consumeRateLimit(clientId: string, tasks: number = 1, tokens: number = 0): void {
  const counter = getOrCreateCounter(clientId);
  counter.tasks += tasks;
  counter.tokens += tokens;
}

// ─── DB-backed check (for persistence across restarts) ───────────────────────

export async function checkRateLimitFromDb(clientId: string): Promise<RateLimitResult> {
  const supabase = (() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  })();

  if (!supabase) return checkRateLimit(clientId);

  try {
    const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();

    const { data, error } = await supabase
      .from("action_log")
      .select("id, token_cost")
      .eq("client_id", clientId)
      .gte("created_at", oneHourAgo)
      .in("trigger_type", ["scheduled", "webhook", "agent"]);

    if (error || !data) return checkRateLimit(clientId);

    const taskCount = data.length;
    const tokenCount = data.reduce((sum, row) => sum + (row.token_cost || 0), 0);

    // Sync memory counter with DB
    const counter = getOrCreateCounter(clientId);
    counter.tasks = Math.max(counter.tasks, taskCount);
    counter.tokens = Math.max(counter.tokens, tokenCount);

    return checkRateLimit(clientId);
  } catch {
    return checkRateLimit(clientId);
  }
}
