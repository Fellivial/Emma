import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
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
    if (!clientId) return NextResponse.json({ tasks: [], actions: [], approvals: [], planId: "free" });

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
      result.tasks = data || [];
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
      result.approvals = data || [];
    }

    return NextResponse.json({ ...result, planId });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
