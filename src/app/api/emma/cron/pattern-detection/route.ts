/**
 * Daily cron: 02:00 UTC
 * Scans completed tasks for recurring patterns and persists suggestions.
 *
 * Protected by CRON_SECRET header (set in Vercel env vars).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  detectPatterns,
  persistPatterns,
  generateSuggestionsViaBatch,
  type DetectedPattern,
} from "@/core/pattern-detector";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(req: NextRequest) {
  // ── Cron authentication ───────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");

  if (process.env.NODE_ENV !== "development") {
    if (!cronSecret) {
      console.error("[CRON] CRON_SECRET is not set — rejecting request");
      return NextResponse.json({ error: "Cron not configured" }, { status: 500 });
    }
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  // ─────────────────────────────────────────────────────────────────

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "No DB connection" }, { status: 500 });
  }

  // Get all distinct user IDs that have completed tasks in last 30 days
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: userRows } = await supabase
    .from("tasks")
    .select("user_id")
    .eq("status", "completed")
    .gte("created_at", since);

  if (!userRows) {
    return NextResponse.json({ processed: 0 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userIds = [...new Set(userRows.map((r: any) => r.user_id as string))];

  // ── Phase 1: Detect patterns (no API calls) ───────────────────────────────
  const allPatterns: DetectedPattern[] = [];
  for (const userId of userIds) {
    try {
      const patterns = await detectPatterns(userId, true); // skip per-pattern API calls
      allPatterns.push(...patterns);
    } catch {
      // Continue processing other users on failure
    }
  }

  if (allPatterns.length === 0) {
    return NextResponse.json({
      processed: userIds.length,
      patternsFound: 0,
      suggestionsGenerated: 0,
      ranAt: new Date().toISOString(),
    });
  }

  // ── Phase 2: Generate suggestions sequentially ───────────────────────────
  let suggestionsGenerated = 0;
  const batchInputs = allPatterns.map((p, i) => ({
    id: `p${i}`,
    patternType: p.patternType,
    description: p.description,
    exampleGoals: p.exampleGoals,
  }));

  const suggestions = await generateSuggestionsViaBatch("", batchInputs);

  for (let i = 0; i < allPatterns.length; i++) {
    const text = suggestions.get(`p${i}`);
    if (text) {
      allPatterns[i].suggestion = text;
      suggestionsGenerated++;
    }
  }

  // ── Phase 3: Persist all patterns ─────────────────────────────────────────
  await persistPatterns(allPatterns);

  return NextResponse.json({
    processed: userIds.length,
    patternsFound: allPatterns.length,
    suggestionsGenerated,
    ranAt: new Date().toISOString(),
  });
}
