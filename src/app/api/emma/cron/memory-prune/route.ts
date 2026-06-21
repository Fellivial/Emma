import * as Sentry from "@sentry/nextjs";
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
 * Cron: Memory Staleness Pruning + Confidence Decay — runs daily.
 * Schedule: daily at 04:00 UTC (vercel.json)
 *
 * Rules (active memories only — superseded rows handled separately):
 *   1. category = 'context' AND last_accessed < now() - 30 days → delete
 *   2. confidence < 0.5 AND last_accessed < now() - 90 days → delete (skip constraint + explicit)
 *   3. confidence < 0.7 AND last_accessed < now() - 180 days → delete (skip constraint + explicit)
 *   4. category = 'constraint' → never delete (skipped in rules 2, 3, 6)
 *   4b. source = 'explicit' → never decay or prune (skipped in rules 2, 3, 6)
 *       Explicit memories are intentional user config (persona vibe, name) and must survive
 *       long periods of inactivity — a returning user must get their chosen persona back.
 *   5. status = 'superseded' AND updated_at < now() - 90 days → delete (tombstone cleanup)
 *   6. active, non-constraint, non-explicit, not accessed in 7+ days → decay by 3%/week (floor: 0.1)
 *      Processes up to 1 000 memories per run — covers all users progressively over multiple days.
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
    // Rule 1: active context memories not accessed in 30+ days
    const { count: c1, error: e1 } = await supabase
      .from("memories")
      .delete({ count: "exact" })
      .eq("status", "active")
      .eq("category", "context")
      .or(`last_accessed.lt.${cutoff30},and(last_accessed.is.null,created_at.lt.${cutoff30})`);

    if (e1) {
      Sentry.captureException(new Error(e1.message), { extra: { rule: 1 } });
      console.error("[memory-prune] Rule 1 error:", e1);
      return NextResponse.json({ error: e1.message }, { status: 500 });
    }
    const pruned1 = c1 ?? 0;
    console.warn(`[memory-prune] Rule 1 (context/30d): deleted ${pruned1}`);

    // Rule 2: active, confidence < 0.5, not accessed in 90+ days, skip constraints + explicit.
    // Explicit memories (onboarding vibe, name) are intentional config and must not be pruned
    // due to inactivity — a returning user after months away must get their chosen persona back.
    const { count: c2, error: e2 } = await supabase
      .from("memories")
      .delete({ count: "exact" })
      .eq("status", "active")
      .neq("category", "constraint")
      .neq("source", "explicit")
      .lt("confidence", 0.5)
      .or(`last_accessed.lt.${cutoff90},and(last_accessed.is.null,created_at.lt.${cutoff90})`);

    if (e2) {
      Sentry.captureException(new Error(e2.message), { extra: { rule: 2 } });
      console.error("[memory-prune] Rule 2 error:", e2);
      return NextResponse.json({ error: e2.message }, { status: 500 });
    }
    const pruned2 = c2 ?? 0;
    console.warn(`[memory-prune] Rule 2 (confidence<0.5/90d): deleted ${pruned2}`);

    // Rule 3: active, confidence < 0.7, not accessed in 180+ days, skip constraints + explicit.
    const { count: c3, error: e3 } = await supabase
      .from("memories")
      .delete({ count: "exact" })
      .eq("status", "active")
      .neq("category", "constraint")
      .neq("source", "explicit")
      .lt("confidence", 0.7)
      .or(`last_accessed.lt.${cutoff180},and(last_accessed.is.null,created_at.lt.${cutoff180})`);

    if (e3) {
      Sentry.captureException(new Error(e3.message), { extra: { rule: 3 } });
      console.error("[memory-prune] Rule 3 error:", e3);
      return NextResponse.json({ error: e3.message }, { status: 500 });
    }
    const pruned3 = c3 ?? 0;
    console.warn(`[memory-prune] Rule 3 (confidence<0.7/180d): deleted ${pruned3}`);

    // Rule 5: hard-delete superseded tombstones older than 90 days
    const { count: c5, error: e5 } = await supabase
      .from("memories")
      .delete({ count: "exact" })
      .eq("status", "superseded")
      .lt("updated_at", cutoff90);

    if (e5) {
      Sentry.captureException(new Error(e5.message), { extra: { rule: 5 } });
      console.error("[memory-prune] Rule 5 error:", e5);
      return NextResponse.json({ error: e5.message }, { status: 500 });
    }
    const pruned5 = c5 ?? 0;
    console.warn(`[memory-prune] Rule 5 (superseded/90d): deleted ${pruned5}`);

    const totalPruned = pruned1 + pruned2 + pruned3 + pruned5;
    console.warn(`[memory-prune] Total pruned: ${totalPruned}`);

    // ── Rule 6: Confidence Decay ───────────────────────────────────────────────
    // Apply 3% weekly decay to active non-constraint memories not accessed in 7+ days.
    // Memories at or below the floor (0.1) are skipped — the prune rules handle removal.
    const DECAY_FACTOR = 0.97;
    const CONFIDENCE_FLOOR = 0.1;
    const DECAY_BATCH_LIMIT = 1000;
    const DECAY_CHUNK = 50;

    const cutoff7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: staleMemories, error: decayFetchErr } = await supabase
      .from("memories")
      .select("id, confidence")
      .eq("status", "active")
      .neq("category", "constraint")
      .neq("source", "explicit")
      .gt("confidence", CONFIDENCE_FLOOR)
      .or(`last_accessed.lt.${cutoff7d},and(last_accessed.is.null,created_at.lt.${cutoff7d})`)
      .limit(DECAY_BATCH_LIMIT);

    if (decayFetchErr) {
      console.error("[memory-prune] Rule 6 fetch error:", decayFetchErr);
    }

    let decayed6 = 0;
    if (staleMemories && staleMemories.length > 0) {
      const updatedAt = now.toISOString();
      for (let i = 0; i < staleMemories.length; i += DECAY_CHUNK) {
        const chunk = staleMemories.slice(i, i + DECAY_CHUNK);
        await Promise.all(
          chunk.map((m) =>
            supabase
              .from("memories")
              .update({
                confidence: Math.max((m.confidence as number) * DECAY_FACTOR, CONFIDENCE_FLOOR),
                updated_at: updatedAt,
              })
              .eq("id", m.id)
              .eq("status", "active")
          )
        );
      }
      decayed6 = staleMemories.length;
      console.warn(`[memory-prune] Rule 6 (decay): applied to ${decayed6} memories`);
    }

    return NextResponse.json({
      pruned: {
        context: pruned1,
        lowConfidence90: pruned2,
        lowConfidence180: pruned3,
        superseded: pruned5,
      },
      decayed: decayed6,
      total: totalPruned,
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[memory-prune] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
