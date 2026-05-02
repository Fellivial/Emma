import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Cron: Approval Expiry
 * Schedule: every 5 minutes (vercel.json)
 *
 * Finds approvals where:
 *   status = 'pending' AND expires_at <= now()
 *
 * For each:
 *   1. Set approval status to 'expired'
 *   2. Set the parent action_log entry to 'rejected'
 *   3. Look up the parent task — if it's 'awaiting_approval', fail it
 */
export async function GET() {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "DB not configured" }, { status: 501 });
  }

  try {
    const now = new Date().toISOString();

    // Find expired approvals
    const { data: expired, error: fetchErr } = await supabase
      .from("approvals")
      .select("id, action_log_id")
      .eq("status", "pending")
      .lte("expires_at", now)
      .limit(100);

    if (fetchErr || !expired || expired.length === 0) {
      return NextResponse.json({ expired: 0 });
    }

    let processed = 0;

    for (const approval of expired) {
      try {
        // 1. Expire the approval
        await supabase
          .from("approvals")
          .update({ status: "expired", decided_at: now })
          .eq("id", approval.id);

        // 2. Reject the action log entry
        await supabase
          .from("action_log")
          .update({ status: "rejected", completed_at: now })
          .eq("id", approval.action_log_id);

        // 3. Find and fail the parent task
        const { data: action } = await supabase
          .from("action_log")
          .select("task_id")
          .eq("id", approval.action_log_id)
          .single();

        if (action?.task_id) {
          // Only fail the task if it's still awaiting approval
          await supabase
            .from("tasks")
            .update({
              status: "failed",
              summary: "Approval expired — action was not approved within the time limit.",
              completed_at: now,
            })
            .eq("id", action.task_id)
            .eq("status", "awaiting_approval");
        }

        processed++;
      } catch (err) {
        console.error(`[Cron:Expiry] Failed to expire approval ${approval.id}:`, err);
      }
    }

    return NextResponse.json({ expired: processed });
  } catch (err) {
    console.error("[Cron:Expiry] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
