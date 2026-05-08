import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

type DbRow = Record<string, unknown>;

function mapTask(row: DbRow) {
  return {
    id: row.id,
    goal: row.goal,
    status: row.status,
    triggerType: row.trigger_type,
    stepsTaken: row.steps_taken ?? 0,
    totalTokens: row.token_cost ?? 0,
    createdAt: row.created_at ? new Date(row.created_at as string).getTime() : 0,
    completedAt: row.completed_at ? new Date(row.completed_at as string).getTime() : undefined,
    currentTool: row.current_tool ?? undefined,
  };
}

function mapApproval(row: DbRow) {
  return {
    approvalId: row.id,
    taskId: row.task_id,
    tool: row.action,
    riskLevel: "dangerous" as const,
    inputs: (row.input as Record<string, string>) ?? {},
    reason: (row.reason as string) ?? "",
    expiresAt: row.expires_at
      ? new Date(row.expires_at as string).getTime()
      : Date.now() + 3_600_000,
  };
}

/**
 * GET /api/emma/tasks?type=tasks|actions|approvals&limit=20
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return NextResponse.json({ error: "DB not configured" }, { status: 501 });

    // Find user's client
    const { data: membership } = await supabase
      .from("client_members")
      .select("client_id")
      .eq("user_id", user.id)
      .single();

    const clientId = membership?.client_id;
    if (!clientId)
      return NextResponse.json({ tasks: [], actions: [], approvals: [], planId: "free" });

    // Fetch plan_id for gating checks
    const { data: clientRow } = await supabase
      .from("clients")
      .select("plan_id")
      .eq("id", clientId)
      .single();
    const planId: string = clientRow?.plan_id || "free";

    const type = req.nextUrl.searchParams.get("type") || "all";
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "20", 10);

    const result: Record<string, unknown[]> = {};

    // Tasks
    if (type === "all" || type === "tasks") {
      const { data } = await supabase
        .from("tasks")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(limit);
      result.tasks = (data || []).map(mapTask);
    }

    // Action log
    if (type === "all" || type === "actions") {
      const { data } = await supabase
        .from("action_log")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(limit);
      result.actions = data || [];
    }

    // Pending approvals
    if (type === "all" || type === "approvals") {
      const { data } = await supabase
        .from("approvals")
        .select("*")
        .eq("client_id", clientId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(limit);
      result.approvals = (data || []).map(mapApproval);
    }

    return NextResponse.json({ ...result, planId });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
