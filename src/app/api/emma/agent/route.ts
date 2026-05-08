import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { runAgentLoop, type AgentTask } from "@/core/agent-loop";
import { getTool } from "@/core/tool-registry";
import { createClient } from "@supabase/supabase-js";
import { audit } from "@/core/security/audit";
import { getClientIp } from "@/lib/get-client-ip";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

interface AgentRequest {
  action: "create" | "approve" | "reject" | "status" | "history";
  goal?: string;
  context?: string;
  triggerSource?: string;
  approvalId?: string;
  taskId?: string;
  limit?: number;
}

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

    const body = (await req.json()) as AgentRequest;
    const supabase = getSupabase();

    switch (body.action) {
      // ── Create + run a new task ──────────────────────────────────────
      case "create": {
        if (!body.goal) {
          return NextResponse.json({ error: "No goal provided" }, { status: 400 });
        }

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
              max_steps: 10,
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
          maxSteps: 10,
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

        // Get approval record
        const { data: approval } = await supabase
          .from("approvals")
          .select("*, action_log(*), tasks(*)")
          .eq("id", body.approvalId)
          .eq("user_id", userId)
          .single();

        if (!approval || approval.status !== "pending") {
          return NextResponse.json(
            { error: "Approval not found or already decided" },
            { status: 404 }
          );
        }

        // Mark as approved
        await supabase
          .from("approvals")
          .update({
            status: "approved",
            decided_by: userId,
            decided_at: new Date().toISOString(),
          })
          .eq("id", body.approvalId);

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
          const result = await toolDef.handler(approval.input, {
            userId,
            taskId: approval.task_id,
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
          const task = approval.tasks;
          if (task && task.status === "awaiting_approval") {
            // Re-run agent loop to continue from the next step
            const agentTask: AgentTask = {
              id: task.id,
              goal: task.goal,
              context: `Previous steps completed. The tool "${approval.action}" was approved and executed with result: ${result.output}. Continue from where you left off.`,
              userId,
              clientId: task.client_id ?? undefined,
              maxSteps: task.max_steps - task.steps_taken,
              triggerType: task.trigger_type,
              triggerSource: task.trigger_source,
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

        await supabase
          .from("approvals")
          .update({
            status: "rejected",
            decided_by: userId,
            decided_at: new Date().toISOString(),
          })
          .eq("id", body.approvalId);

        audit({
          userId,
          action: "reject",
          resource: "approval",
          resourceId: body.approvalId,
          reason: "User rejected agent action",
          ip: getClientIp(req),
        }).catch(() => {});

        await supabase
          .from("action_log")
          .update({
            status: "rejected",
            completed_at: new Date().toISOString(),
          })
          .eq("id", body.approvalId);

        // Mark task as cancelled
        const { data: approval } = await supabase
          .from("approvals")
          .select("task_id")
          .eq("id", body.approvalId)
          .single();

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

        const { data: task } = await supabase
          .from("tasks")
          .select("*, action_log(*))")
          .eq("id", body.taskId)
          .eq("user_id", userId)
          .single();

        return NextResponse.json({ task });
      }

      // ── Get task history ─────────────────────────────────────────────
      case "history": {
        if (!supabase) {
          return NextResponse.json({ tasks: [] });
        }

        const limit = body.limit || 20;
        const { data: tasks } = await supabase
          .from("tasks")
          .select(
            "id, trigger_type, trigger_source, goal, status, result, steps_taken, token_cost, created_at, completed_at"
          )
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(limit);

        // Get pending approvals
        const { data: approvals } = await supabase
          .from("approvals")
          .select("id, task_id, action, input, risk_level, reason, created_at, expires_at")
          .eq("user_id", userId)
          .eq("status", "pending")
          .order("created_at", { ascending: false });

        return NextResponse.json({ tasks: tasks || [], approvals: approvals || [] });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    Sentry.captureException(err);
    console.error("[Agent API] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
