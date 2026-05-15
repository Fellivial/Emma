/**
 * GET /api/emma/tasks/[id]
 *
 * Returns full task detail:
 *   - task row
 *   - action_log steps (ordered)
 *   - agent_task_summaries (Emma's Haiku summary + output_vars)
 *   - approvals for this task
 *   - context_snapshot (scratchpad)
 *   - related pattern_detections (matching example goals)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getUser } from "@/lib/supabase/server";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "No DB" }, { status: 500 });

  const { id: taskId } = await params;

  const { data: task, error: taskErr } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .eq("user_id", user.id)
    .single();

  if (taskErr || !task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const { data: steps } = await supabase
    .from("action_log")
    .select("*")
    .eq("task_id", taskId)
    .order("step_number", { ascending: true });

  const { data: summaryRow } = await supabase
    .from("agent_task_summaries")
    .select("*")
    .eq("task_id", taskId)
    .single();

  const { data: approvals } = await supabase
    .from("approvals")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });

  const { data: patterns } = await supabase
    .from("pattern_detections")
    .select("id, pattern_type, description, suggestion, frequency, status")
    .eq("user_id", user.id)
    .contains("example_goals", [task.goal])
    .limit(3);

  return NextResponse.json({
    task,
    steps: steps || [],
    summary: summaryRow || null,
    approvals: approvals || [],
    patterns: patterns || [],
  });
}
