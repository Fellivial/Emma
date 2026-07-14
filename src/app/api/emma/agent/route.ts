import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { runAgentLoop, type AgentTask } from "@/core/agent-loop";
import { getTool } from "@/core/tool-registry";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { audit } from "@/core/security/audit";
import { getClientIp } from "@/lib/get-client-ip";
import { checkAutonomousAccess } from "@/core/addon-enforcer";
import { loadClientConfigForUser } from "@/core/client-config";
import { parseAgentRequest } from "@/core/request-validation";
import { enforceCostGate, costGateResponse } from "@/core/cost-gate";
import { checkDistributedRateLimit } from "@/lib/ratelimit";
import { EmmaError } from "@/lib/errors";

export async function POST(req: NextRequest) {
  try {
    let userId: string | null = null;
    try {
      const user = await getUser();
      userId = user?.id || null;
    } catch {}
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rawBody = await req.json().catch(() => null);
    const parsedBody = parseAgentRequest(rawBody);
    if (!parsedBody.ok) {
      return NextResponse.json({ error: parsedBody.error }, { status: 400 });
    }
    const body = parsedBody.value;
    const supabase = getSupabaseAdmin();

    // Resolve clientId for task queries — scheduled tasks have user_id="system" but a
    // valid client_id, so querying by client_id makes all tasks visible regardless of origin.
    let clientId: string | null = null;
    if (supabase) {
      const { data: membership } = await supabase
        .from("client_members")
        .select("client_id")
        .eq("user_id", userId)
        .single();
      clientId = membership?.client_id ?? null;
    }

    switch (body.action) {
      // ── Create + run a new task ──────────────────────────────────────
      case "create": {
        if (!body.goal) {
          return NextResponse.json({ error: "No goal provided" }, { status: 400 });
        }

        // Plan-tier gate — loadClientConfigForUser always returns (falls back to DEFAULT_CONFIG)
        // so no try/catch needed; let checkAutonomousAccess errors surface as 500.
        const config = await loadClientConfigForUser(userId);
        const access = await checkAutonomousAccess(config.id, config.planId, "autonomous");
        if (!access.allowed) {
          return NextResponse.json({ error: access.reason }, { status: 403 });
        }

        // Per-user guard: 5 creates / 60 s (each create may run up to 5 LLM calls).
        const agentRl = await checkDistributedRateLimit({
          key: userId,
          namespace: "req:agent",
          limit: 5,
          windowSeconds: 60,
        });
        if (!agentRl.allowed) {
          return NextResponse.json(
            { error: "Too many agent requests. Please try again later." },
            {
              status: 429,
              headers: {
                "Retry-After": String(Math.ceil((agentRl.resetAt - Date.now()) / 1000)),
              },
            }
          );
        }

        const cost = await enforceCostGate({
          operation: "agent",
          userId,
          clientId,
          planId: config.planId,
        });
        if (!cost.allowed) return costGateResponse(cost);

        // Create task record
        let taskId = `task-${Date.now()}`;
        if (supabase) {
          const { data: taskRow } = await supabase
            .from("tasks")
            .insert({
              user_id: userId,
              trigger_type: "manual",
              trigger_source: body.triggerSource || "user_request",
              goal: body.goal,
              status: "pending",
              max_steps: 5,
            })
            .select("id")
            .single();

          if (taskRow) taskId = taskRow.id;
        }

        // Run the agent loop
        const task: AgentTask = {
          id: taskId,
          goal: body.goal,
          context: body.context || "",
          userId,
          clientId: clientId ?? undefined,
          maxSteps: 5,
          triggerType: "manual",
          triggerSource: body.triggerSource || "user_request",
        };

        const result = await runAgentLoop(task);
        return NextResponse.json(result);
      }

      // ── Approve a pending action ─────────────────────────────────────
      case "approve": {
        if (!body.approvalId || !supabase) {
          return NextResponse.json({ error: "Missing approvalId or DB" }, { status: 400 });
        }

        // Plan-tier re-check: user's plan may have been downgraded since task creation.
        const approveConfig = await loadClientConfigForUser(userId);
        const approveAccess = await checkAutonomousAccess(
          approveConfig.id,
          approveConfig.planId,
          "autonomous"
        );
        if (!approveAccess.allowed) {
          return NextResponse.json({ error: approveAccess.reason }, { status: 403 });
        }

        // Atomic claim: update status='approved' WHERE status='pending' and return the row.
        // Only one concurrent request can win this UPDATE; the loser gets null back.
        // Always scope to the owning user. system exemption: scheduled tasks carry
        // user_id="system" with a valid client_id — allow those through the or() path.
        let updateQuery = supabase
          .from("approvals")
          .update({
            status: "approved",
            decided_by: userId,
            decided_at: new Date().toISOString(),
          })
          .eq("id", body.approvalId)
          .eq("status", "pending")
          .select("*, action_log(*), tasks(*, step_transcript)");
        if (clientId) {
          updateQuery = updateQuery
            .eq("client_id", clientId)
            .or(`user_id.eq.${userId},user_id.eq.system`);
        } else {
          updateQuery = updateQuery.eq("user_id", userId);
        }
        const { data: approval } = await updateQuery.single();

        if (!approval) {
          return NextResponse.json(
            { error: "Approval not found or already decided" },
            { status: 404 }
          );
        }

        audit({
          userId,
          action: "approve",
          resource: "approval",
          resourceId: body.approvalId,
          reason: "User approved agent action",
          ip: getClientIp(req),
        }).catch(() => {});

        // Execute the tool
        const toolDef = getTool(approval.action);
        if (toolDef) {
          const task = approval.tasks;
          if (!task) {
            return NextResponse.json({ error: "Approval task not found" }, { status: 500 });
          }
          const result = await toolDef.handler(approval.input, {
            userId,
            taskId: approval.task_id,
            clientId: task.client_id,
          });

          // Update action log
          await supabase
            .from("action_log")
            .update({
              status: "completed",
              output: { text: result.output },
              completed_at: new Date().toISOString(),
            })
            .eq("id", approval.action_log_id);

          // Resume the agent loop from where it paused
          if (task && task.status === "awaiting_approval") {
            // Build resume messages: load persisted transcript and inject the tool result.
            // Use the proper OpenAI tool-result format (role:"tool" + tool_call_id) so the
            // model receives the outcome in the same slot it expected, rather than as a
            // synthetic user message. Extract tool_call_id from the last assistant message
            // in the transcript that references this tool.
            const priorMessages = (task.step_transcript || []) as Array<Record<string, unknown>>;
            let resumeMessages: Array<Record<string, unknown>> | undefined;
            if (priorMessages.length > 0) {
              let toolCallId: string | undefined;
              for (let i = priorMessages.length - 1; i >= 0; i--) {
                const msg = priorMessages[i];
                if (msg.role === "assistant" && Array.isArray(msg.tool_calls)) {
                  const match = (
                    msg.tool_calls as Array<{ id: string; function: { name: string } }>
                  ).find((tc) => tc.function.name === approval.action);
                  if (match) {
                    toolCallId = match.id;
                    break;
                  }
                }
              }

              resumeMessages = [
                ...priorMessages,
                toolCallId
                  ? { role: "tool" as const, tool_call_id: toolCallId, content: result.output }
                  : {
                      role: "user" as const,
                      content: `The tool "${approval.action}" was approved and executed. Result: ${result.output}. Continue from where you left off.`,
                    },
              ];
            }

            // Re-run agent loop to continue from the next step
            const agentTask: AgentTask = {
              id: task.id,
              goal: task.goal,
              context: task.context || "",
              userId,
              clientId: task.client_id ?? undefined,
              maxSteps: task.max_steps - task.steps_taken,
              triggerType: task.trigger_type,
              triggerSource: task.trigger_source,
              resumeMessages,
            };

            const agentResult = await runAgentLoop(agentTask);
            return NextResponse.json({ approval: "approved", agentResult });
          }

          return NextResponse.json({ approval: "approved", result: result.output });
        }

        return NextResponse.json({ approval: "approved" });
      }

      // ── Reject a pending action ──────────────────────────────────────
      case "reject": {
        if (!body.approvalId || !supabase) {
          return NextResponse.json({ error: "Missing approvalId or DB" }, { status: 400 });
        }

        // Fetch approval first to get action_log_id and task_id for downstream updates.
        // Always scope to the owning user; system exemption for scheduled tasks (see approve).
        let rejectFetch = supabase
          .from("approvals")
          .select("action_log_id, task_id")
          .eq("id", body.approvalId);
        if (clientId) {
          rejectFetch = rejectFetch
            .eq("client_id", clientId)
            .or(`user_id.eq.${userId},user_id.eq.system`);
        } else {
          rejectFetch = rejectFetch.eq("user_id", userId);
        }
        const { data: approval } = await rejectFetch.single();

        let rejectUpdate = supabase
          .from("approvals")
          .update({
            status: "rejected",
            decided_by: userId,
            decided_at: new Date().toISOString(),
          })
          .eq("id", body.approvalId);
        if (clientId) {
          rejectUpdate = rejectUpdate
            .eq("client_id", clientId)
            .or(`user_id.eq.${userId},user_id.eq.system`);
        } else {
          rejectUpdate = rejectUpdate.eq("user_id", userId);
        }
        await rejectUpdate;

        audit({
          userId,
          action: "reject",
          resource: "approval",
          resourceId: body.approvalId,
          reason: "User rejected agent action",
          ip: getClientIp(req),
        }).catch(() => {});

        if (approval?.action_log_id) {
          await supabase
            .from("action_log")
            .update({
              status: "rejected",
              completed_at: new Date().toISOString(),
            })
            .eq("id", approval.action_log_id);
        }

        if (approval) {
          await supabase
            .from("tasks")
            .update({
              status: "cancelled",
              result: "Task cancelled — action was rejected by user",
              completed_at: new Date().toISOString(),
            })
            .eq("id", approval.task_id);
        }

        return NextResponse.json({ approval: "rejected" });
      }

      // ── Get task status ──────────────────────────────────────────────
      case "status": {
        if (!body.taskId || !supabase) {
          return NextResponse.json({ error: "Missing taskId" }, { status: 400 });
        }

        const taskQuery = supabase.from("tasks").select("*, action_log(*)").eq("id", body.taskId);
        // Prefer client_id so scheduled tasks (user_id="system") are visible;
        // fall back to user_id when clientId is not yet resolved.
        const { data: task } = await (
          clientId ? taskQuery.eq("client_id", clientId) : taskQuery.eq("user_id", userId)
        ).single();

        return NextResponse.json({ task });
      }

      // ── Get task history ─────────────────────────────────────────────
      case "history": {
        if (!supabase) {
          return NextResponse.json({ tasks: [] });
        }

        const limit = body.limit || 20;
        const tasksBase = supabase
          .from("tasks")
          .select(
            "id, trigger_type, trigger_source, goal, status, result, steps_taken, token_cost, created_at, completed_at"
          );
        // Prefer client_id so scheduled tasks (user_id="system") are visible;
        // fall back to user_id when clientId is not yet resolved.
        const { data: tasks } = await (
          clientId ? tasksBase.eq("client_id", clientId) : tasksBase.eq("user_id", userId)
        )
          .order("created_at", { ascending: false })
          .limit(limit);

        // Get pending approvals — same client_id-first logic
        const approvalsBase = supabase
          .from("approvals")
          .select("id, task_id, action, input, risk_level, reason, created_at, expires_at")
          .eq("status", "pending");
        const { data: approvals } = await (
          clientId ? approvalsBase.eq("client_id", clientId) : approvalsBase.eq("user_id", userId)
        ).order("created_at", { ascending: false });

        return NextResponse.json({ tasks: tasks || [], approvals: approvals || [] });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    Sentry.captureException(err);
    console.error("[Agent API] Error:", err);
    const status = err instanceof EmmaError ? err.status : 500;
    return NextResponse.json({ error: "Agent operation failed" }, { status });
  }
}
