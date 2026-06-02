/**
 * Memory reflection cron — daily 03:30 UTC.
 *
 * For each active user, pulls memories older than 7 days and asks Emma
 * to surface any unresolved commitments. Creates pattern_detection rows
 * (pattern_type = 'memory_reflection') that are surfaced at next page mount.
 *
 * Protected by CRON_SECRET header.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { UTILITY_MODELS } from "@/core/models";
import { OPENROUTER_URL, openRouterHeaders, extractText } from "@/lib/openrouter";
import { decrypt } from "@/core/security/encryption";

const REFLECTION_SYSTEM =
  "You are Emma. Review these memories and identify any unresolved commitments or forgotten follow-ups. " +
  "Return a single short sentence (max 20 words) in first person that Emma would say to surface the most important one. " +
  "If nothing stands out, reply with exactly: NONE";

function authOk(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === "development") return true;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authOk(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "No DB connection" }, { status: 500 });
  }

  // Find users with memories older than 7 days
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: userRows } = await supabase
    .from("memories")
    .select("user_id")
    .eq("status", "active")
    .lte("created_at", cutoff);

  if (!userRows || userRows.length === 0) {
    return NextResponse.json({ processed: 0, reflections: 0 });
  }

  const userIds = [...new Set(userRows.map((r: { user_id: string }) => r.user_id))];
  let reflections = 0;

  for (const userId of userIds) {
    try {
      // Skip if we already created a reflection for this user today
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const { count: alreadyRan } = await supabase
        .from("pattern_detections")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("pattern_type", "memory_reflection")
        .gte("detected_at", todayStart.toISOString());

      if ((alreadyRan ?? 0) > 0) continue;

      // Load up to 30 old active memories
      const { data: memories } = await supabase
        .from("memories")
        .select("key, value, category")
        .eq("user_id", userId)
        .eq("status", "active")
        .lte("created_at", cutoff)
        .order("created_at", { ascending: false })
        .limit(30);

      if (!memories || memories.length === 0) continue;

      const memoryText = memories
        .map((m: { key: string; value: string; category: string }) => {
          try {
            return `- [${m.category}] ${m.key}: ${decrypt(m.value)}`;
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .join("\n");

      if (!memoryText) continue;

      const llmRes = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: openRouterHeaders(),
        body: JSON.stringify({
          models: UTILITY_MODELS,
          max_tokens: 60,
          messages: [
            { role: "system", content: REFLECTION_SYSTEM },
            { role: "user", content: memoryText },
          ],
        }),
      });

      if (!llmRes.ok) continue;

      const suggestion = extractText(await llmRes.json()).trim();
      if (!suggestion || suggestion === "NONE" || suggestion.length < 5) continue;

      await supabase.from("pattern_detections").insert({
        user_id: userId,
        pattern_type: "memory_reflection",
        description: "Memory reflection: unresolved commitment",
        suggestion,
        frequency: 1,
        status: "pending",
        detected_at: new Date().toISOString(),
      });

      reflections++;
    } catch (err) {
      console.error(`[Reflection cron] user ${userId}:`, err);
    }
  }

  return NextResponse.json({
    processed: userIds.length,
    reflections,
    ranAt: new Date().toISOString(),
  });
}
