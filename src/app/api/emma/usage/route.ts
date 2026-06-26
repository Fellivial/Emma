import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { normaliseBillingState, type LemonBillingMeta } from "@/core/billing-state";
import { ensureClientMembership } from "@/core/client-membership";
import { getPlan } from "@/core/pricing";
import { checkUsage } from "@/core/usage-enforcer";

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
    if (!user)
      return NextResponse.json(
        { error: "Unauthorized", hint: "Sign in at /login" },
        { status: 401 }
      );

    const supabase = getSupabase();
    if (!supabase)
      return NextResponse.json(
        {
          error: "Database not configured",
          hint: "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local",
        },
        { status: 501 }
      );

    // Ensure billing and usage always have a client row to read from.
    const membership = await ensureClientMembership(supabase, { userId: user.id });
    const { data: client } = await supabase
      .from("clients")
      .select("plan_id, lemon_meta")
      .eq("id", membership.clientId)
      .single();

    const planId = client?.plan_id || "free";
    const plan = getPlan(planId);
    const billing = normaliseBillingState(planId, client?.lemon_meta as LemonBillingMeta | null);
    // Run usage check and pack detail query in parallel — both are independent of each other
    const [result, { data: packs }] = await Promise.all([
      checkUsage(user.id, planId),
      supabase
        .from("extra_packs")
        .select("id, tokens_granted, tokens_remaining, valid_until")
        .eq("user_id", user.id)
        .gt("valid_until", new Date().toISOString())
        .gt("tokens_remaining", 0)
        .order("created_at", { ascending: true }),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const windowMap: Record<string, any> = {};
    for (const w of result.allWindows) {
      windowMap[w.windowType] = w;
    }

    const totalExtra = (packs || []).reduce(
      (s: number, p: Record<string, unknown>) => s + ((p.tokens_remaining as number) || 0),
      0
    );

    return NextResponse.json({
      windows: {
        daily: windowMap.daily || null,
        weekly: windowMap.weekly || null,
        monthly: windowMap.monthly || null,
      },
      extraPacks: {
        totalTokensRemaining: totalExtra,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        packs: (packs || []).map((p: any) => ({
          id: p.id,
          tokensGranted: p.tokens_granted,
          tokensRemaining: p.tokens_remaining,
          validUntil: p.valid_until,
        })),
      },
      planId,
      billing,
      limits: {
        daily: { tokens: plan?.tokenBudgetDaily || 0, messages: plan?.messageLimitDaily || 0 },
        weekly: { tokens: plan?.tokenBudgetWeekly || 0, messages: plan?.messageLimitWeekly || 0 },
        monthly: {
          tokens: plan?.tokenBudgetMonthly || 0,
          messages: (plan?.messageLimitDaily || 0) * 30,
        },
      },
    });
  } catch (err) {
    console.error("[/api/emma/usage]", err);
    return NextResponse.json({ error: "Failed to load usage data" }, { status: 500 });
  }
}
