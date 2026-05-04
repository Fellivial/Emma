/**
 * GET  /api/emma/patterns       — list pending/accepted patterns for the user
 * POST /api/emma/patterns       — accept or dismiss a pattern
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

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ patterns: [] });

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "pending";

  const { data, error } = await supabase
    .from("pattern_detections")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", status)
    .order("detected_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ patterns: [] });

  return NextResponse.json({ patterns: data || [] });
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "No DB" }, { status: 500 });

  const body = await req.json();
  const { patternId, action } = body as { patternId: string; action: "accept" | "dismiss" };

  if (!patternId || !["accept", "dismiss"].includes(action)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const newStatus = action === "accept" ? "accepted" : "dismissed";

  const { error } = await supabase
    .from("pattern_detections")
    .update({ status: newStatus, responded_at: new Date().toISOString() })
    .eq("id", patternId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: "Update failed" }, { status: 500 });

  return NextResponse.json({ ok: true, status: newStatus });
}
