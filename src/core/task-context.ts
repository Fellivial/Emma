/**
 * Task Context — persistent scratchpad for intra-task memory.
 *
 * output_vars survive approval pauses by being persisted to DB after every step.
 * {{variable}} tokens in tool inputs are resolved against the scratchpad.
 */

import { createClient } from "@supabase/supabase-js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StepLogEntry {
  step: number;
  toolName: string;
  outputVar?: string;
  outputSummary: string;
  timestamp: string;
}

export interface TaskContext {
  taskId: string;
  outputVars: Record<string, string>;
  stepLog: StepLogEntry[];
  metadata: Record<string, unknown>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

const MAX_CONTEXT_BYTES = 100 * 1024; // 100 KB guard

function byteSize(obj: unknown): number {
  return new TextEncoder().encode(JSON.stringify(obj)).length;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function initContext(taskId: string, metadata: Record<string, unknown> = {}): TaskContext {
  return { taskId, outputVars: {}, stepLog: [], metadata };
}

/**
 * Stores a tool output under `outputVar` and appends to the step log.
 * If the total context exceeds 100 KB, old step log entries are trimmed first.
 */
export function updateContext(
  ctx: TaskContext,
  step: number,
  toolName: string,
  output: string,
  outputVar?: string
): TaskContext {
  const next = { ...ctx };

  if (outputVar) {
    next.outputVars = { ...ctx.outputVars, [outputVar]: output };
  }

  const entry: StepLogEntry = {
    step,
    toolName,
    outputVar,
    outputSummary: output.slice(0, 500),
    timestamp: new Date().toISOString(),
  };

  next.stepLog = [...ctx.stepLog, entry];

  // Trim if over size limit — drop oldest log entries (keep vars intact)
  while (byteSize(next) > MAX_CONTEXT_BYTES && next.stepLog.length > 1) {
    next.stepLog = next.stepLog.slice(1);
  }

  return next;
}

/**
 * Replaces {{varName}} tokens in a string with values from outputVars.
 * Unknown tokens are left as-is (never throws).
 */
export function resolveVariables(template: string, ctx: TaskContext): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, name) => {
    return ctx.outputVars[name] ?? match;
  });
}

/**
 * Resolves {{variables}} in all string values of a tool input object.
 */
export function resolveInputVariables(
  input: Record<string, unknown>,
  ctx: TaskContext
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    resolved[k] = typeof v === "string" ? resolveVariables(v, ctx) : v;
  }
  return resolved;
}

/**
 * Fire-and-forget: persists context_snapshot to the tasks table.
 */
export function persistContext(ctx: TaskContext): void {
  const supabase = getSupabase();
  if (!supabase) return;

  void supabase.from("tasks").update({ context_snapshot: ctx }).eq("id", ctx.taskId);
}

/**
 * Loads an existing context_snapshot from DB, or returns a fresh context.
 */
export async function loadContext(taskId: string): Promise<TaskContext> {
  const supabase = getSupabase();
  if (!supabase) return initContext(taskId);

  const { data } = await supabase
    .from("tasks")
    .select("context_snapshot")
    .eq("id", taskId)
    .single();

  if (data?.context_snapshot && typeof data.context_snapshot === "object") {
    return data.context_snapshot as TaskContext;
  }

  return initContext(taskId);
}
