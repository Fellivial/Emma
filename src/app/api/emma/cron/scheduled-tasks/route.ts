import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runAgentLoop, type AgentTask } from "@/core/agent-loop";
import { checkRateLimit, consumeRateLimit } from "@/core/rate-limiter";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Cron: Scheduled Task Executor
 * Schedule: every 1 minute (vercel.json)
 *
 * Reads scheduled_tasks rows where:
 *   enabled = true AND next_run_at <= now()
 *
 * For each:
 *   1. Check rate limit for the client
 *   2. Run the agent loop with the scheduled workflow as goal
 *   3. Update last_run_at and calculate next_run_at from cron expression
 *   4. Track rate limit consumption
 */
export async function GET(req: NextRequest) {
  // ── Cron authentication ───────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const isLocalhost =
    req.headers.get("host")?.includes("localhost") ||
    req.headers.get("host")?.includes("127.0.0.1");

  if (!isLocalhost) {
    if (!cronSecret) {
      console.error("[CRON] CRON_SECRET is not set — rejecting request");
      return NextResponse.json({ error: "Cron not configured" }, { status: 500 });
    }
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  // ─────────────────────────────────────────────────────────────────

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "DB not configured" }, { status: 501 });
  }

  try {
    const now = new Date().toISOString();

    // Fetch due tasks (batch of 10 — limit to prevent timeout)
    const { data: dueTasks, error: fetchErr } = await supabase
      .from("scheduled_tasks")
      .select("*")
      .eq("enabled", true)
      .lte("next_run_at", now)
      .order("next_run_at", { ascending: true })
      .limit(10);

    if (fetchErr || !dueTasks || dueTasks.length === 0) {
      return NextResponse.json({ processed: 0 });
    }

    let executed = 0;
    let skipped = 0;
    let failed = 0;

    for (const scheduled of dueTasks) {
      try {
        // Check rate limit
        const rateCheck = await checkRateLimit(scheduled.client_id);
        if (!rateCheck.allowed) {
          console.log(`[Cron:Scheduled] Rate limited for client ${scheduled.client_id}`);
          skipped++;
          continue;
        }

        // Build agent task
        const taskId = `cron-${scheduled.id}-${Date.now()}`;
        const task: AgentTask = {
          id: taskId,
          goal: `Execute scheduled workflow: ${scheduled.name}. ${scheduled.description || ""}`.trim(),
          context: `Scheduled task (cron: ${scheduled.cron_expression}). Workflow: ${scheduled.workflow}. Input: ${JSON.stringify(scheduled.workflow_input || {})}`,
          userId: "system",
          clientId: scheduled.client_id,
          maxSteps: 5,
          triggerType: "cron",
          triggerSource: `scheduled:${scheduled.id}`,
        };

        // Run agent loop
        const result = await runAgentLoop(task);

        // Track consumption
        await consumeRateLimit(scheduled.client_id, 1, result.totalTokens);

        // Update last_run_at (next_run_at calculation requires a cron parser —
        // for now set it to null so it doesn't re-fire until manually reset
        // or a cron parser library is added)
        await supabase
          .from("scheduled_tasks")
          .update({
            last_run_at: new Date().toISOString(),
            next_run_at: calculateNextRun(scheduled.cron_expression),
          })
          .eq("id", scheduled.id);

        executed++;
      } catch (err) {
        console.error(`[Cron:Scheduled] Failed task ${scheduled.id}:`, err);
        failed++;
      }
    }

    return NextResponse.json({ processed: executed + skipped + failed, executed, skipped, failed });
  } catch (err) {
    console.error("[Cron:Scheduled] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * Simple next-run calculator for common cron patterns.
 * For production, use a library like `cron-parser`.
 */
function calculateNextRun(cronExpression: string): string {
  const now = new Date();

  // Parse simple patterns: "0 8 * * *" = daily at 8am
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) {
    // Unknown format — default to 1 hour from now
    return new Date(now.getTime() + 3_600_000).toISOString();
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Every minute: "* * * * *"
  if (minute === "*" && hour === "*") {
    return new Date(now.getTime() + 60_000).toISOString();
  }

  // Every N minutes: "*/N * * * *"
  if (minute.startsWith("*/") && hour === "*") {
    const interval = parseInt(minute.slice(2), 10) || 5;
    return new Date(now.getTime() + interval * 60_000).toISOString();
  }

  // Daily at specific time: "M H * * *"
  if (dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    const targetHour = parseInt(hour, 10);
    const targetMinute = parseInt(minute, 10);
    const next = new Date(now);
    next.setHours(targetHour, targetMinute, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next.toISOString();
  }

  // Fallback — 1 hour from now
  return new Date(now.getTime() + 3_600_000).toISOString();
}
