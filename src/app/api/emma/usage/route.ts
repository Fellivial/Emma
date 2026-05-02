import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { checkUsage } from "@/core/usage-enforcer";
import { getPlan } from "@/core/pricing";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * GET /api/emma/usage
 * Returns current usage across all three windows + extra packs.
 */
export async function GET() {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return NextResponse.json({ error: "DB not configured" }, { status: 501 });

    // Get user's plan
    const { data: membership } = await supabase
      .from("client_members")
      .select("client_id, clients(plan_id)")
      .eq("user_id", user.id)
      .single();

    const planId = (membership as any)?.clients?.plan_id || "free";
    const plan = getPlan(planId);

    // Check usage (reuses enforcer logic for consistency)
    const result = await checkUsage(user.id, planId);

    const windowMap: Record<string, any> = {};
    for (const w of result.allWindows) {
      windowMap[w.windowType] = w;
    }

    // Get extra packs
    const { data: packs } = await supabase
      .from("extra_packs")
      .select("id, tokens_granted, tokens_remaining, valid_until")
      .eq("user_id", user.id)
      .gt("valid_until", new Date().toISOString())
      .gt("tokens_remaining", 0)
      .order("created_at", { ascending: true });

    const totalExtra = (packs || []).reduce((s: number, p: any) => s + (p.tokens_remaining || 0), 0);

    return NextResponse.json({
      windows: {
        daily: windowMap.daily || null,
        weekly: windowMap.weekly || null,
        monthly: windowMap.monthly || null,
      },
      extraPacks: {
        totalTokensRemaining: totalExtra,
        packs: (packs || []).map((p: any) => ({
          id: p.id,
          tokensGranted: p.tokens_granted,
          tokensRemaining: p.tokens_remaining,
          validUntil: p.valid_until,
        })),
      },
      planId,
      limits: {
        daily: { tokens: plan?.tokenBudgetDaily || 0, messages: plan?.messageLimitDaily || 0 },
        weekly: { tokens: plan?.tokenBudgetWeekly || 0, messages: plan?.messageLimitWeekly || 0 },
        monthly: { tokens: plan?.tokenBudgetMonthly || 0, messages: (plan?.messageLimitDaily || 0) * 30 },
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
