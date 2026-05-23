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
 * GET /api/emma/usage/history?days=7
 * Returns per-day token + message usage for the last N days.
 */
export async function GET(req: NextRequest) {
  const daysParam = req.nextUrl.searchParams.get("days");
  const days = Math.min(Math.max(parseInt(daysParam || "7", 10), 1), 90);

  try {
    const user = await getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase)
      return NextResponse.json({ error: "Database not configured" }, { status: 501 });

    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data, error } = await supabase
      .from("usage_windows")
      .select("window_start, tokens_used, messages_used")
      .eq("user_id", user.id)
      .eq("window_type", "daily")
      .gte("window_start", since.toISOString())
      .order("window_start", { ascending: true });

    if (error) throw error;

    const history = (data || []).map((row) => ({
      day: new Date(row.window_start).toISOString().split("T")[0],
      tokens: row.tokens_used,
      messages: row.messages_used,
    }));

    return NextResponse.json({ history });
  } catch (err) {
    console.error("[/api/emma/usage/history]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
