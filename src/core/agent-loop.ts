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
import { MODEL_BRAIN } from "@/core/models";
import { getTool, getToolsForClaude, type ToolContext, type RiskLevel } from "@/core/tool-registry";
import { createClient } from "@supabase/supabase-js";
import { fetchWithRetry } from "@/lib/errors";
import { getMcpServersForClient } from "@/core/integrations/mcp";
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

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

const AGENT_SYSTEM = `You are EMMA's autonomous agent. You execute tasks independently.

Rules:
- Break the GOAL into steps. Use available tools to accomplish it.
- Call "complete_task" with a summary when done.
- Be efficient — minimum tool calls needed.
- Dangerous actions (emails, bookings, deletions) will be paused for human approval automatically — you don't need to ask, just call the tool.
- If you can't complete the goal, call complete_task explaining why.
- Never loop endlessly — if stuck after 2 attempts, complete with an error summary.`;

// ─── Main Loop ───────────────────────────────────────────────────────────────

export async function runAgentLoop(task: AgentTask): Promise<AgentResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      taskId: task.id,
      status: "failed",
      steps: [],
      summary: "API key not set",
      totalTokens: 0,
    };
  }

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

  const supabase = getSupabase();
  const tools = getToolsForClaude();
  const mcpServers = await getMcpServersForClient(task.clientId);
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

  // Build conversation for the agent
  const messages: Array<{ role: string; content: any }> = [
    {
      role: "user",
      content: `GOAL: ${task.goal}\n\nCONTEXT:\n${task.context || "No additional context."}`,
    },
  ];

  for (let step = 1; step <= task.maxSteps; step++) {
    if (taskCompleted) break;

    const stepStart = Date.now();

    try {
      // ── Call Claude with tools ───────────────────────────────────────
      const res = await fetchWithRetry(
        "https://api.anthropic.com/v1/messages",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: MODEL_BRAIN,
            max_tokens: 1024,
            system: AGENT_SYSTEM,
            messages,
            tools,
            ...(mcpServers.length > 0 && { mcp_servers: mcpServers }),
          }),
        },
        { maxRetries: 2 }
      );

      if (!res.ok) {
        const err = await res.text();
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

      const data = await res.json();
      const inputTokens = data.usage?.input_tokens || 0;
      const outputTokens = data.usage?.output_tokens || 0;
      totalTokens += inputTokens + outputTokens;

      // ── Process response blocks ──────────────────────────────────────
      const contentBlocks = data.content || [];
      let hasToolUse = false;

      for (const block of contentBlocks) {
        if (block.type === "text") {
          // Text block — Claude is thinking/explaining
          continue;
        }

        if (block.type === "tool_use") {
          hasToolUse = true;
          const toolName = block.name;
          const toolInput = block.input || {};
          const toolId = block.id;

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

            messages.push({ role: "assistant", content: contentBlocks });
            messages.push({
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: toolId,
                  content: `Error: Tool "${toolName}" not found`,
                },
              ],
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

            // Update task to awaiting_approval
            if (supabase) {
              await supabase
                .from("tasks")
                .update({
                  status: "awaiting_approval",
                  steps_taken: step,
                  token_cost: totalTokens,
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
          const outputVar: string | undefined = (toolResult as any).outputVar ?? undefined;

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
            break;
          }

          // Feed result back to Claude for next iteration
          messages.push({ role: "assistant", content: contentBlocks });
          messages.push({
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: toolId,
                content: toolResult.output,
              },
            ],
          });
        }
      }

      // If Claude returned only text (no tool use), it's done thinking
      if (!hasToolUse && data.stop_reason === "end_turn") {
        const textOutput = contentBlocks
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text)
          .join("");

        taskCompleted = true;
        taskSummary = textOutput || "Task completed (no tool calls needed)";
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
  supabase: any,
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

async function logAction(supabase: any, taskId: string, step: AgentStepResult): Promise<void> {
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
