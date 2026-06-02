import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 60;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Cron: Memory Staleness Pruning — hard-delete stale memories daily.
 * Schedule: daily at 04:00 UTC (vercel.json)
 *
 * Uses service role key to bypass RLS on the memories table.
 * Uses COALESCE(last_accessed, created_at) so un-accessed memories are
 * treated as last accessed at creation time and don't escape pruning.
 *
 * Rules:
 *   1. category = 'context' AND COALESCE(last_accessed, created_at) < now() - 30 days → delete
 *   2. confidence < 0.5 AND COALESCE(last_accessed, created_at) < now() - 90 days → delete
 *   3. confidence < 0.7 AND COALESCE(last_accessed, created_at) < now() - 180 days → delete
 *   4. category = 'constraint' → never delete
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");

  if (process.env.NODE_ENV !== "development") {
    if (!cronSecret) {
      console.error("[memory-prune] CRON_SECRET not set");
      return NextResponse.json({ error: "Cron not configured" }, { status: 500 });
    }
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "DB not configured" }, { status: 501 });
  }

  try {
    const now = new Date();
    const cutoff30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const cutoff90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const cutoff180 = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString();

    // Rule 1: context memories not accessed (or created) in 30+ days
    // COALESCE: treat NULL last_accessed as created_at for comparison
    const { count: c1, error: e1 } = await supabase
      .from("memories")
      .delete({ count: "exact" })
      .eq("category", "context")
      .or(`last_accessed.lt.${cutoff30},and(last_accessed.is.null,created_at.lt.${cutoff30})`);

    if (e1) {
      console.error("[memory-prune] Rule 1 error:", e1);
      return NextResponse.json({ error: e1.message }, { status: 500 });
    }
    const pruned1 = c1 ?? 0;
    console.log(`[memory-prune] Rule 1 (context/30d): deleted ${pruned1}`);

    // Rule 2: confidence < 0.5, not accessed in 90+ days, skip constraints
    const { count: c2, error: e2 } = await supabase
      .from("memories")
      .delete({ count: "exact" })
      .neq("category", "constraint")
      .lt("confidence", 0.5)
      .or(`last_accessed.lt.${cutoff90},and(last_accessed.is.null,created_at.lt.${cutoff90})`);

    if (e2) {
      console.error("[memory-prune] Rule 2 error:", e2);
      return NextResponse.json({ error: e2.message }, { status: 500 });
    }
    const pruned2 = c2 ?? 0;
    console.log(`[memory-prune] Rule 2 (confidence<0.5/90d): deleted ${pruned2}`);

    // Rule 3: confidence < 0.7, not accessed in 180+ days, skip constraints
    const { count: c3, error: e3 } = await supabase
      .from("memories")
      .delete({ count: "exact" })
      .neq("category", "constraint")
      .lt("confidence", 0.7)
      .or(`last_accessed.lt.${cutoff180},and(last_accessed.is.null,created_at.lt.${cutoff180})`);

    if (e3) {
      console.error("[memory-prune] Rule 3 error:", e3);
      return NextResponse.json({ error: e3.message }, { status: 500 });
    }
    const pruned3 = c3 ?? 0;
    console.log(`[memory-prune] Rule 3 (confidence<0.7/180d): deleted ${pruned3}`);

    const total = pruned1 + pruned2 + pruned3;
    console.log(`[memory-prune] Total pruned: ${total}`);

    return NextResponse.json({
      pruned: {
        context: pruned1,
        lowConfidence90: pruned2,
        lowConfidence180: pruned3,
      },
      total,
    });
  } catch (err) {
    console.error("[memory-prune] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
