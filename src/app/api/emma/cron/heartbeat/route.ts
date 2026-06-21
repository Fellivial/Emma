/**
 * Heartbeat cron — every 30 minutes.
 *
 * For each user with active tasks or unsurfaced patterns:
 *   1. Check for tasks due in the next 30 minutes → create a nudge suggestion
 *   2. Log stale unsurfaced pattern count for monitoring
 *
 * Suggestions created here are surfaced at next page mount via GET /api/emma/patterns.
 * The 3/day cap is enforced by that route, not here.
 * Protected by CRON_SECRET header.
 */

import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function authOk(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === "development") return true;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authOk(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "No DB connection" }, { status: 500 });
  }

  return Sentry.withMonitor(
    "emma-heartbeat",
    async () => {
      const now = new Date();
      const in30 = new Date(now.getTime() + 30 * 60 * 1000);
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      let nudgesCreated = 0;

      // Find tasks due in the next 30 minutes
      const { data: upcomingTasks } = await supabase
        .from("tasks")
        .select("id, user_id, goal, scheduled_for")
        .eq("status", "pending")
        .gte("scheduled_for", now.toISOString())
        .lte("scheduled_for", in30.toISOString());

      for (const task of (upcomingTasks ?? []) as Array<{
        id: string;
        user_id: string;
        goal: string;
        scheduled_for: string;
      }>) {
        // Skip if we already created a nudge for this task today
        const { count: alreadyNudged } = await supabase
          .from("pattern_detections")
          .select("*", { count: "exact", head: true })
          .eq("user_id", task.user_id)
          .eq("description", `task_due:${task.id}`)
          .gte("detected_at", todayStart.toISOString());

        if ((alreadyNudged ?? 0) > 0) continue;

        const dueIn = Math.round((new Date(task.scheduled_for).getTime() - now.getTime()) / 60_000);
        const suggestion = `"${task.goal.slice(0, 60)}" is scheduled in ${dueIn} minute${dueIn === 1 ? "" : "s"} — want me to proceed?`;

        await supabase.from("pattern_detections").insert({
          user_id: task.user_id,
          pattern_type: "memory_reflection",
          description: `task_due:${task.id}`,
          suggestion,
          frequency: 1,
          status: "pending",
          detected_at: now.toISOString(),
        });

        nudgesCreated++;
      }

      // Count stale unsurfaced patterns for monitoring (no action needed — page mount handles surfacing)
      const staleThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const { count: staleCount } = await supabase
        .from("pattern_detections")
        .select("*", { count: "exact", head: true })
        .is("shown_at", null)
        .not("status", "eq", "dismissed")
        .lte("detected_at", staleThreshold);

      return NextResponse.json({
        nudgesCreated,
        staleUnsurfaced: staleCount ?? 0,
        ranAt: now.toISOString(),
      });
    },
    {
      schedule: { type: "crontab", value: "*/30 * * * *" },
      checkinMargin: 2,
      maxRuntime: 1,
      timezone: "UTC",
    }
  );
}
