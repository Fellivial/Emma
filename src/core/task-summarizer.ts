/**
 * Task Summarizer — generates a compact human-readable summary of a completed
 * task using Haiku, then stores it in agent_task_summaries.
 */

import { createClient } from "@supabase/supabase-js";
import type { TaskContext } from "@/core/task-context";
import { brainChat } from "@/core/brain/gateway";
import { enforceCostGate, recordCostResult } from "@/core/cost-gate";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

const SUMMARIZER_SYSTEM = `You are a concise task summarizer for an AI assistant called Emma.
Given a completed task's goal, steps, and outputs, write a 2-4 sentence plain-English summary.
Focus on: what was accomplished, any key outputs or decisions, and any notable issues.
Be factual. No filler phrases. No markdown.`;

/**
 * Generates and persists a summary for a completed task.
 * Fire-and-forget safe — never throws; returns summary string or empty string.
 */
export async function summarizeTask(
  taskId: string,
  goal: string,
  ctx: TaskContext,
  finalStatus: string,
  userId?: string,
  clientId?: string,
  planId?: string
): Promise<string> {
  try {
    const cost = await enforceCostGate({ operation: "summarize", userId, clientId, planId });
    if (!cost.allowed) return "";
    const stepsText = ctx.stepLog
      .map(
        (e) =>
          `Step ${e.step} [${e.toolName}]${e.outputVar ? ` → $${e.outputVar}` : ""}: ${e.outputSummary}`
      )
      .join("\n");

    const varsText = Object.entries(ctx.outputVars)
      .map(([k, v]) => `${k} = ${v.slice(0, 200)}`)
      .join("\n");

    const prompt = [
      `GOAL: ${goal}`,
      `STATUS: ${finalStatus}`,
      stepsText ? `\nSTEPS TAKEN:\n${stepsText}` : "",
      varsText ? `\nKEY OUTPUT VARIABLES:\n${varsText}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const result = await brainChat({
      task: "utility",
      maxTokens: 256,
      maxRetries: 1,
      messages: [
        { role: "system", content: SUMMARIZER_SYSTEM },
        { role: "user", content: prompt },
      ],
    });

    if (!result.ok) {
      await recordCostResult(cost, { success: false });
      return "";
    }

    await recordCostResult(cost, { ...result.usage, success: true });
    const summary: string = result.text.trim();

    if (summary) {
      await persistSummary(taskId, summary, ctx);
    }

    return summary;
  } catch {
    return "";
  }
}

async function persistSummary(taskId: string, summary: string, ctx: TaskContext): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  await supabase.from("agent_task_summaries").upsert(
    {
      task_id: taskId,
      summary,
      output_vars: ctx.outputVars,
      step_count: ctx.stepLog.length,
      generated_at: new Date().toISOString(),
    },
    { onConflict: "task_id" }
  );
}
