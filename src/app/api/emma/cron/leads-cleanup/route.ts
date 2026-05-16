import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Cron: PII Retention — delete leads older than 90 days.
 * Schedule: daily at 03:00 UTC (vercel.json)
 *
 * Uses service role key to bypass RLS on the leads table.
 * Retention window is hardcoded at 90 days (GDPR default).
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");

  // Skip auth only in local development — never use Host header (client-controlled, spoofable)
  if (process.env.NODE_ENV !== "development") {
    if (!cronSecret) {
      console.error("[leads-cleanup] CRON_SECRET not set");
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

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  const { count, error } = await supabase
    .from("leads")
    .delete({ count: "exact" })
    .lt("created_at", cutoff.toISOString());

  if (error) {
    console.error("[leads-cleanup] Delete error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(`[leads-cleanup] Deleted ${count ?? 0} leads older than 90 days`);
  return NextResponse.json({ deleted: count ?? 0, cutoff: cutoff.toISOString() });
}
