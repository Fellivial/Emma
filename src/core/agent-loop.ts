/**
 * Agent Loop — the autonomous core of EMMA.
 *
 * ReAct-style loop:
 *   1. Give Claude a goal + available tools + context
 *   2. Claude plans and chooses a tool call
 *   3. Check risk level → dangerous = PAUSE for approval
 *   4. Feed result back to Claude
 *   5. Repeat until complete or max steps
 *
 * Server-side only — runs in API routes.
 */

import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MODEL_BRAIN } from "@/core/models";
import { getTool, getToolsForClaude, type ToolContext, type RiskLevel } from "@/core/tool-registry";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchWithRetry } from "@/lib/errors";
import { OPENROUTER_URL, openRouterHeaders } from "@/lib/openrouter";
import { checkRateLimit, consumeRateLimit } from "@/core/rate-limiter";
import {
  startChain,
  addStep,
  completeChain,
  persistChain,
  type ProvenanceChain,
} from "@/core/provenance";
import {
  type TaskContext,
  updateContext,
  resolveInputVariables,
  persistContext,
  loadContext,
} from "@/core/task-context";
import { summarizeTask } from "@/core/task-summarizer";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AgentTask {
  id: string;
  goal: string;
  context: string;
  userId: string;
  clientId?: string;
  maxSteps: number;
  triggerType: "cron" | "webhook" | "manual" | "event";
  triggerSource: string;
  resumeMessages?: Array<Record<string, unknown>>;
}

export interface AgentStepResult {
  step: number;
  toolName: string;
  input: Record<string, unknown>;
  output: string;
  riskLevel: RiskLevel;
  status: "completed" | "failed" | "awaiting_approval";
  tokenCost: number;
  durationMs: number;
}

export interface AgentResult {
  taskId: string;
  status: "completed" | "failed" | "awaiting_approval" | "max_steps_reached";
  steps: AgentStepResult[];
  summary: string;
  totalTokens: number;
  contextSnapshot?: TaskContext;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const AGENT_SYSTEM = `You are EMMA's autonomous agent. You execute tasks independently.

Rules:
- Break the GOAL into steps. Use available tools to accomplish it.
- Call "complete_task" with a summary when done.
- Be efficient — minimum tool calls needed.
- Dangerous actions (emails, bookings, deletions) will be paused for human approval automatically — you don't need to ask, just call the tool.
- If you can't complete the goal, call complete_task explaining why.
- Never loop endlessly — if stuck after 2 attempts, complete with an error summary.`;

// ─── Memory Tool Handler ─────────────────────────────────────────────────────

// Executes memory_20250818 file operations against an in-session Map.
// Scoped to the agent task lifetime — not persisted after the task ends.
function handleMemoryOp(files: Map<string, string>, input: Record<string, unknown>): string {
  const command = input.command as string;
  const path = input.path as string;
  if (!command || !path) return "Error: command and path required";

  switch (command) {
    case "view": {
      const content = files.get(path);
      if (content !== undefined) return content;
      const prefix = path.endsWith("/") ? path : path + "/";
      const entries = [...files.keys()].filter((k) => k.startsWith(prefix));
      return entries.length > 0 ? entries.join("\n") : `No file found at ${path}`;
    }
    case "create": {
      if (files.has(path)) return `Error: ${path} already exists`;
      files.set(path, (input.content as string) || "");
      return `Created ${path}`;
    }
    case "str_replace": {
      const text = files.get(path);
      if (text === undefined) return `Error: ${path} not found`;
      const oldStr = input.old_str as string;
      if (!oldStr || !text.includes(oldStr)) return `Error: old_str not found in ${path}`;
      files.set(path, text.replace(oldStr, (input.new_str as string) || ""));
      return `Updated ${path}`;
    }
    case "insert": {
      const text = files.get(path);
      if (text === undefined) return `Error: ${path} not found`;
      const lines = text.split("\n");
      const at = Math.min((input.insert_line as number) ?? lines.length, lines.length);
      lines.splice(at, 0, (input.content as string) || "");
      files.set(path, lines.join("\n"));
      return `Inserted at line ${at} in ${path}`;
    }
    case "delete": {
      if (!files.has(path)) return `Error: ${path} not found`;
      files.delete(path);
      return `Deleted ${path}`;
    }
    case "rename": {
      const text = files.get(path);
      if (text === undefined) return `Error: ${path} not found`;
      const newPath = input.new_path as string;
      if (!newPath) return "Error: new_path required for rename";
      files.set(newPath, text);
      files.delete(path);
      return `Renamed ${path} to ${newPath}`;
    }
    default:
      return `Unknown memory command: ${command}`;
  }
}

function buildStateSummary(completedSteps: AgentStepResult[]): string {
  if (completedSteps.length === 0) return "No steps completed yet.";
  return completedSteps
    .map(
      (s) =>
        `- step ${s.step} [${s.toolName}]: ${s.output.slice(0, 120)}${s.output.length > 120 ? "…" : ""}`
    )
    .join("\n");
}

// ─── Main Loop ───────────────────────────────────────────────────────────────

export async function runAgentLoop(task: AgentTask): Promise<AgentResult> {
  // ── Per-client rate limit check ──────────────────────────────────────────
  const rateLimitKey = task.clientId || task.userId;
  const rateLimit = await checkRateLimit(rateLimitKey);
  if (!rateLimit.allowed) {
    return {
      taskId: task.id,
      status: "failed",
      steps: [],
      summary: `Rate limit exceeded (${rateLimit.reason === "token_limit" ? "token" : "task"} limit). Resets at ${new Date(rateLimit.resetsAt).toISOString()}.`,
      totalTokens: 0,
    };
  }

  const supabase = getSupabaseAdmin();

  // Load connected integrations to filter the tool list Claude sees
  let connectedIntegrations: Set<string> | undefined;
  if (task.clientId && supabase) {
    const { data: integrationRows } = await supabase
      .from("client_integrations")
      .select("service")
      .eq("client_id", task.clientId)
      .eq("status", "connected");
    if (integrationRows) {
      connectedIntegrations = new Set(integrationRows.map((r: { service: string }) => r.service));
    }
  }

  const tools = getToolsForClaude(connectedIntegrations);
  let provChain: ProvenanceChain = startChain(task.id, task.goal);
  const steps: AgentStepResult[] = [];
  let totalTokens = 0;
  let taskCompleted = false;
  let taskSummary = "";

  // Load or initialize intra-task context (survives approval pauses)
  let ctx: TaskContext = await loadContext(task.id);

  // Update task status to running
  if (supabase) {
    await supabase
      .from("tasks")
      .update({
        status: "running",
        started_at: new Date().toISOString(),
      })
      .eq("id", task.id);
  }

  // In-session scratchpad for the memory_20250818 tool.
  // Files exist only for the duration of this task — not persisted to DB.
  const memoryFiles = new Map<string, string>();

  // Build conversation — seed from persisted transcript if resuming after approval
  const messages: Array<Record<string, unknown>> = task.resumeMessages
    ? [...task.resumeMessages]
    : [
        {
          role: "user",
          content: `GOAL: ${task.goal}\n\nCONTEXT:\n${task.context || "No additional context."}`,
        },
      ];

  for (let step = 1; step <= task.maxSteps; step++) {
    if (taskCompleted) break;

    const stepStart = Date.now();

    try {
      // ── Call OpenRouter with tools ───────────────────────────────────
      const res = await fetchWithRetry(
        OPENROUTER_URL,
        {
          method: "POST",
          headers: openRouterHeaders(),
          body: JSON.stringify({
            model: MODEL_BRAIN,
            max_tokens: step < task.maxSteps ? 512 : 1024,
            messages: [{ role: "system", content: AGENT_SYSTEM }, ...messages],
            tools,
          }),
        },
        { maxRetries: 2 }
      );

      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        console.error(`[EMMA Agent] API error ${res.status}:`, errBody.slice(0, 200));
        steps.push({
          step,
          toolName: "error",
          input: {},
          output: `API error: ${res.status}`,
          riskLevel: "safe",
          status: "failed",
          tokenCost: 0,
          durationMs: Date.now() - stepStart,
        });
        break;
      }

      type OpenRouterData = {
        choices: Array<{
          message: {
            content?: string | null;
            tool_calls?: Array<{
              id: string;
              type: "function";
              function: { name: string; arguments: string };
            }>;
          };
          finish_reason: string;
        }>;
        usage?: { prompt_tokens: number; completion_tokens: number };
      };
      const data = (await res.json()) as OpenRouterData;
      const inputTokens = data.usage?.prompt_tokens || 0;
      const outputTokens = data.usage?.completion_tokens || 0;
      totalTokens += inputTokens + outputTokens;

      const choice = data.choices?.[0];
      const assistantMessage = choice?.message;
      const toolCalls = assistantMessage?.tool_calls ?? [];
      const finishReason = choice?.finish_reason;
      let hasToolUse = false;

      // Push the assistant turn once — OpenRouter requires exactly one assistant
      // message per group of tool results, not one per tool call.
      if (toolCalls.length > 0) {
        messages.push({
          role: "assistant",
          content: assistantMessage?.content ?? null,
          tool_calls: toolCalls,
        });
      }

      for (const toolCall of toolCalls) {
        if (toolCall.type === "function") {
          hasToolUse = true;
          const toolName = toolCall.function.name;
          let toolInput: Record<string, unknown> = {};
          try {
            toolInput = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
          } catch {
            /* leave empty */
          }
          const toolId = toolCall.id;

          // Handle the native memory tool before the registry lookup.
          // Operations run against the in-session scratchpad Map.
          if (toolName === "memory") {
            const memOut = handleMemoryOp(memoryFiles, toolInput);
            messages.push({ role: "tool", tool_call_id: toolId, content: memOut });
            steps.push({
              step,
              toolName: "memory",
              input: toolInput,
              output: memOut,
              riskLevel: "safe",
              status: "completed",
              tokenCost: inputTokens + outputTokens,
              durationMs: Date.now() - stepStart,
            });
            continue;
          }

          const toolDef = getTool(toolName);
          if (!toolDef) {
            // Unknown tool
            const stepResult: AgentStepResult = {
              step,
              toolName,
              input: toolInput,
              output: `Tool "${toolName}" not found`,
              riskLevel: "safe",
              status: "failed",
              tokenCost: inputTokens + outputTokens,
              durationMs: Date.now() - stepStart,
            };
            steps.push(stepResult);

            messages.push({
              role: "tool",
              tool_call_id: toolId,
              content: `Error: Tool "${toolName}" not found`,
            });
            continue;
          }

          // Resolve {{variables}} before risk checks so approval path logs resolved values
          const resolvedInput = resolveInputVariables(toolInput, ctx);

          // ── Check risk level → approval gate ──────────────────────────

          // Moderate tools: log prominently but execute immediately.
          // Future: add per-user tier config to require approval here.
          if (toolDef.riskLevel === "moderate") {
            if (supabase) {
              await supabase.from("action_log").insert({
                task_id: task.id,
                step_number: step,
                action: toolName,
                input: toolInput,
                status: "moderate_auto_approved",
                risk_level: "moderate",
                reason: `Moderate tool "${toolName}" auto-approved`,
              });
            }
            // Falls through to execution below — no pause
          }

          if (toolDef.riskLevel === "dangerous") {
            // Create approval record and pause
            const approvalId = await createApproval(
              supabase,
              task,
              step,
              toolName,
              toolInput,
              toolDef.riskLevel
            );

            const stepResult: AgentStepResult = {
              step,
              toolName,
              input: toolInput,
              output: `Awaiting approval (${approvalId || "no-db"})`,
              riskLevel: toolDef.riskLevel,
              status: "awaiting_approval",
              tokenCost: inputTokens + outputTokens,
              durationMs: Date.now() - stepStart,
            };
            steps.push(stepResult);
            await logAction(supabase, task.id, stepResult);

            // Update task to awaiting_approval and persist transcript so resume has full context
            if (supabase) {
              await supabase
                .from("tasks")
                .update({
                  status: "awaiting_approval",
                  steps_taken: step,
                  token_cost: totalTokens,
                  step_transcript: messages,
                })
                .eq("id", task.id);
            }

            // Record the paused step in provenance before early return
            provChain = addStep(provChain, {
              stepNumber: step,
              action: toolName,
              input: resolvedInput,
              output: stepResult.output,
              source: "human_approved",
              verified: false,
              timestamp: Date.now(),
              durationMs: stepResult.durationMs,
            });

            // Persist provenance at pause point (fire-and-forget)
            persistChain(
              completeChain(provChain, "awaiting_approval"),
              task.userId,
              task.clientId
            ).catch(() => {});

            // Count this paused run against the rate limit
            consumeRateLimit(rateLimitKey, 1, totalTokens).catch(() => {});

            return {
              taskId: task.id,
              status: "awaiting_approval",
              steps,
              summary: `Paused at step ${step}: "${toolName}" requires approval`,
              totalTokens,
              contextSnapshot: ctx,
            };
          }

          // ── Execute tool ──────────────────────────────────────────────
          const toolContext: ToolContext = {
            userId: task.userId,
            clientId: task.clientId,
            taskId: task.id,
          };

          let toolResult;
          try {
            toolResult = await toolDef.handler(resolvedInput, toolContext);
          } catch (err) {
            toolResult = { success: false, output: `Tool error: ${String(err)}` };
          }

          // Detect output_var convention: tool may return { outputVar, output }
          const outputVar = toolResult.outputVar;

          // Update intra-task scratchpad and persist (fire-and-forget)
          ctx = updateContext(ctx, step, toolName, toolResult.output, outputVar);
          persistContext(ctx);

          const stepResult: AgentStepResult = {
            step,
            toolName,
            input: resolvedInput,
            output: toolResult.output,
            riskLevel: toolDef.riskLevel,
            status: toolResult.success ? "completed" : "failed",
            tokenCost: inputTokens + outputTokens,
            durationMs: Date.now() - stepStart,
          };
          steps.push(stepResult);
          await logAction(supabase, task.id, stepResult);

          // Append to provenance chain (dangerous case already returned above; always "automated" here)
          provChain = addStep(provChain, {
            stepNumber: step,
            action: toolName,
            input: resolvedInput,
            output: toolResult.output,
            source: "automated",
            verified: stepResult.status === "completed",
            timestamp: Date.now(),
            durationMs: stepResult.durationMs,
          });

          // Check if task is complete
          if (toolName === "complete_task") {
            taskCompleted = true;
            taskSummary = toolResult.output;
            // Push the tool result before breaking so step_transcript is complete.
            messages.push({ role: "tool", tool_call_id: toolId, content: toolResult.output });
            break;
          }

          // Feed result back for next iteration
          messages.push({ role: "tool", tool_call_id: toolId, content: toolResult.output });

          // Compress history: replace everything except the last exchange with a
          // state summary so input tokens stay bounded across steps.
          if (messages.length >= 5) {
            const lastTwo = messages.slice(-2);
            messages.splice(
              0,
              messages.length,
              {
                role: "user",
                content: `GOAL: ${task.goal}\n\nState:\n${buildStateSummary(steps)}`,
              },
              ...lastTwo
            );
          }
        }
      }

      // If model returned only text (no tool calls), it's done thinking
      if (!hasToolUse && finishReason === "stop") {
        taskCompleted = true;
        taskSummary = assistantMessage?.content || "Task completed (no tool calls needed)";
      }
    } catch (err) {
      Sentry.captureException(err, { extra: { taskId: task.id, step } });
      steps.push({
        step,
        toolName: "error",
        input: {},
        output: `Loop error: ${String(err)}`,
        riskLevel: "safe",
        status: "failed",
        tokenCost: 0,
        durationMs: Date.now() - stepStart,
      });
      break;
    }
  }

  // ── Finalize task ────────────────────────────────────────────────────────
  const finalStatus = taskCompleted
    ? "completed"
    : steps.length >= task.maxSteps
      ? "max_steps_reached"
      : "failed";
  const finalSummary =
    taskSummary ||
    (steps.length >= task.maxSteps
      ? `Max steps (${task.maxSteps}) reached without completion`
      : "Task ended without completion");

  if (supabase) {
    await supabase
      .from("tasks")
      .update({
        status: finalStatus,
        result: finalSummary,
        steps_taken: steps.length,
        token_cost: totalTokens,
        completed_at: new Date().toISOString(),
      })
      .eq("id", task.id);
  }

  // Record this task run against the rate limit counter
  consumeRateLimit(rateLimitKey, 1, totalTokens).catch(() => {});

  // Fire-and-forget: generate Haiku summary and persist to agent_task_summaries
  summarizeTask(task.id, task.goal, ctx, finalStatus).catch(() => {});

  // Fire-and-forget: finalize and persist provenance chain
  // "max_steps_reached" maps to "failed" for provenance (provenance_chains status doesn't include it)
  const provStatus = (
    finalStatus === "max_steps_reached" ? "failed" : finalStatus
  ) as ProvenanceChain["status"];
  provChain = completeChain(provChain, provStatus);
  persistChain(provChain, task.userId, task.clientId).catch(() => {});

  return {
    taskId: task.id,
    status: finalStatus,
    steps,
    summary: finalSummary,
    totalTokens,
    contextSnapshot: ctx,
  };
}

// ─── Approval Gate ───────────────────────────────────────────────────────────

async function createApproval(
  supabase: SupabaseClient | null,
  task: AgentTask,
  step: number,
  toolName: string,
  toolInput: Record<string, unknown>,
  riskLevel: RiskLevel
): Promise<string | null> {
  if (!supabase) return null;

  // Create action log entry first
  const { data: logEntry } = await supabase
    .from("action_log")
    .insert({
      task_id: task.id,
      step_number: step,
      action: toolName,
      input: toolInput,
      status: "awaiting_approval",
      risk_level: riskLevel,
    })
    .select("id")
    .single();

  if (!logEntry) return null;

  // Create approval record
  const { data: approval } = await supabase
    .from("approvals")
    .insert({
      task_id: task.id,
      action_log_id: logEntry.id,
      user_id: task.userId,
      action: toolName,
      input: toolInput,
      risk_level: riskLevel,
      reason: `Autonomous action "${toolName}" requires your approval before execution`,
    })
    .select("id")
    .single();

  return approval?.id || null;
}

// ─── Action Logging ──────────────────────────────────────────────────────────

async function logAction(
  supabase: SupabaseClient | null,
  taskId: string,
  step: AgentStepResult
): Promise<void> {
  if (!supabase) return;

  await supabase.from("action_log").insert({
    task_id: taskId,
    step_number: step.step,
    action: step.toolName,
    input: step.input,
    output: { text: step.output },
    status: step.status,
    risk_level: step.riskLevel,
    token_cost: step.tokenCost,
    duration_ms: step.durationMs,
    completed_at: step.status !== "awaiting_approval" ? new Date().toISOString() : null,
  });
}
