/**
 * GET  /api/emma/patterns — returns top unseen pattern suggestion (quiet-hours
 *                           + daily-cap aware). Marks it shown_at on return.
 * POST /api/emma/patterns — accept or dismiss a pattern by id.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const MAX_DAILY = 3;

function quietNow(
  start: string | null | undefined,
  end: string | null | undefined,
  tz: string | null | undefined
): boolean {
  if (!start || !end) return false;
  try {
    const localTime = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz || "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());
    const [h, m] = localTime.split(":").map(Number);
    const cur = h * 60 + m;
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const s = sh * 60 + sm;
    const e = eh * 60 + em;
    return s <= e ? cur >= s && cur < e : cur >= s || cur < e;
  } catch {
    return false;
  }
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ pattern: null });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ pattern: null });

  // Quiet hours check
  const { data: profile } = await supabase
    .from("profiles")
    .select("quiet_hours_start, quiet_hours_end, quiet_hours_tz")
    .eq("id", user.id)
    .single();

  if (
    quietNow(
      profile?.quiet_hours_start as string | null,
      profile?.quiet_hours_end as string | null,
      profile?.quiet_hours_tz as string | null
    )
  ) {
    return NextResponse.json({ pattern: null, reason: "quiet_hours" });
  }

  // Daily cap: count patterns already shown today (UTC day boundary)
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { count: shownToday } = await supabase
    .from("pattern_detections")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("shown_at", todayStart.toISOString());

  if ((shownToday ?? 0) >= MAX_DAILY) {
    return NextResponse.json({ pattern: null, reason: "daily_cap" });
  }

  // Fetch top unseen pattern
  const { data: row } = await supabase
    .from("pattern_detections")
    .select("id, suggestion, suggestion_text, pattern_type")
    .eq("user_id", user.id)
    .is("shown_at", null)
    .not("status", "eq", "dismissed")
    .not("status", "eq", "accepted")
    .order("detected_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (!row) return NextResponse.json({ pattern: null });

  const text = (
    (row.suggestion as string | null) || (row.suggestion_text as string | null)
  )?.trim();
  if (!text) return NextResponse.json({ pattern: null });

  // Mark shown + status = suggested
  await supabase
    .from("pattern_detections")
    .update({ shown_at: new Date().toISOString(), status: "suggested" })
    .eq("id", row.id as string);

  return NextResponse.json({
    pattern: {
      id: row.id as string,
      suggestion: text,
      patternType: row.pattern_type as string,
    },
  });
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "No DB" }, { status: 500 });

  let body: { id?: string; patternId?: string; action?: string };
  try {
    body = (await req.json()) as { id?: string; patternId?: string; action?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = body.id || body.patternId;
  const { action } = body;
  if (!id || (action !== "dismiss" && action !== "accept")) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  await supabase
    .from("pattern_detections")
    .update({ status: action === "accept" ? "accepted" : "dismissed" })
    .eq("id", id)
    .eq("user_id", user.id);

  return NextResponse.json({ ok: true });
}
