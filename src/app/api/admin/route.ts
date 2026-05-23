import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { inferPlanFromBudget, getMRR } from "@/core/pricing";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function isAdmin(email: string | undefined): boolean {
  const adminEmails = (process.env.EMMA_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase());
  return adminEmails.includes(email?.toLowerCase() || "");
}

/**
 * Admin Growth Dashboard API
 *
 * GET /api/admin — full growth dashboard: clients, MRR, churn, trials, channels, referrals
 */
export async function GET() {
  try {
    const user = await getUser();
    if (!user)
      return NextResponse.json(
        { error: "Unauthorized", hint: "Sign in at /login" },
        { status: 401 }
      );
    if (!isAdmin(user.email))
      return NextResponse.json(
        { error: "Forbidden", hint: "Add your email to EMMA_ADMIN_EMAILS in .env.local" },
        { status: 403 }
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

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const monthStartStr = monthStart.toISOString().split("T")[0];
    const prevMonthStartStr = prevMonthStart.toISOString().split("T")[0];

    // ── Clients ──────────────────────────────────────────────────────────
    const { data: clients } = await supabase
      .from("clients")
      .select("*, client_members(user_id)")
      .order("created_at", { ascending: false });

    // Build a map from user_id → client_id to avoid N+1 queries
    const userToClient = new Map<string, string>();
    for (const client of clients || []) {
      for (const m of client.client_members || []) {
        userToClient.set(m.user_id, client.id);
      }
    }

    // Single query for all usage this month across all members
    const allMemberIds = Array.from(userToClient.keys());
    const usageByClient = new Map<string, { tokens: number; messages: number }>();
    if (allMemberIds.length > 0) {
      const { data: usageRows } = await supabase
        .from("usage")
        .select("user_id, token_count, message_count")
        .in("user_id", allMemberIds)
        .gte("date", monthStartStr);
      for (const row of usageRows || []) {
        const clientId = userToClient.get(row.user_id);
        if (!clientId) continue;
        const acc = usageByClient.get(clientId) || { tokens: 0, messages: 0 };
        acc.tokens += row.token_count || 0;
        acc.messages += row.message_count || 0;
        usageByClient.set(clientId, acc);
      }
    }

    const enrichedClients = (clients || []).map((client) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const memberIds = (client.client_members || []).map((m: any) => m.user_id);
      const usage = usageByClient.get(client.id) || { tokens: 0, messages: 0 };
      const monthlyTokens = usage.tokens;
      const monthlyMessages = usage.messages;
      const plan = inferPlanFromBudget(client.token_budget_monthly || 0);
      return {
        id: client.id,
        slug: client.slug,
        name: client.name,
        plan,
        memberCount: memberIds.length,
        tokenBudget: client.token_budget_monthly,
        monthlyTokens,
        monthlyMessages,
        budgetUsed:
          client.token_budget_monthly > 0
            ? Math.round((monthlyTokens / client.token_budget_monthly) * 100)
            : 0,
        estimatedCost: Math.round((monthlyTokens / 1_000_000) * 6 * 100) / 100,
        createdAt: client.created_at,
      };
    });

    // ── MRR ───────────────────────────────────────────────────────────────
    const currentMRR = enrichedClients.reduce((s, c) => s + getMRR(c.plan), 0);

    // Previous month MRR (clients that existed before this month)
    const prevMonthClients = enrichedClients.filter((c) => new Date(c.createdAt) < monthStart);
    const prevMRR = prevMonthClients.reduce((s, c) => s + getMRR(c.plan), 0);
    const mrrGrowth = prevMRR > 0 ? Math.round(((currentMRR - prevMRR) / prevMRR) * 100) : 0;

    // ── Churn ─────────────────────────────────────────────────────────────
    // Churn = clients on Free tier who were previously on a paid plan
    // Simplified: count clients on Free with created_at > 30 days ago
    const paidClients = enrichedClients.filter((c) => c.plan !== "Free").length;
    const totalClients = enrichedClients.length;
    const freeClients = totalClients - paidClients;
    const oldFreeClients = enrichedClients.filter(
      (c) => c.plan === "Free" && new Date(c.createdAt) < prevMonthStart
    ).length;
    const churnRate =
      prevMonthClients.length > 0
        ? Math.round((oldFreeClients / prevMonthClients.length) * 100)
        : 0;

    // ── Referrals ─────────────────────────────────────────────────────────
    const { data: referrals } = await supabase
      .from("referrals")
      .select("status, created_at")
      .gte("created_at", prevMonthStartStr);
    const referralStats = {
      total: referrals?.length || 0,
      converted:
        referrals?.filter((r) => r.status === "converted" || r.status === "rewarded").length || 0,
    };

    // ── Affiliates ────────────────────────────────────────────────────────
    const { data: affiliates } = await supabase
      .from("affiliates")
      .select("total_referrals, total_earned, status");
    const affiliateStats = {
      active: affiliates?.filter((a) => a.status === "active").length || 0,
      totalReferrals: affiliates?.reduce((s, a) => s + (a.total_referrals || 0), 0) || 0,
      totalCommissions: affiliates?.reduce((s, a) => s + parseFloat(a.total_earned || 0), 0) || 0,
    };

    // ── Channel Breakdown ─────────────────────────────────────────────────
    const { data: waitlistSources } = await supabase.from("waitlist").select("email");
    const channels: Array<{ channel: string; signups: number }> = [];

    // ── Waitlist ──────────────────────────────────────────────────────────
    const waitlistCount = waitlistSources?.length || 0;

    // ── Plan Distribution ─────────────────────────────────────────────────
    const planDist: Record<string, number> = {};
    for (const c of enrichedClients) {
      planDist[c.plan] = (planDist[c.plan] || 0) + 1;
    }

    // ── Message Feedback ──────────────────────────────────────────────────
    const { data: feedbackRows } = await supabase
      .from("message_feedback")
      .select("rating");
    const feedbackStats = {
      total: feedbackRows?.length || 0,
      up: (feedbackRows || []).filter((r) => r.rating === "up").length,
      down: (feedbackRows || []).filter((r) => r.rating === "down").length,
    };

    return NextResponse.json({
      clients: enrichedClients,
      overview: {
        mrr: currentMRR,
        mrrPrev: prevMRR,
        mrrGrowth,
        totalClients,
        paidClients,
        freeClients,
        churnRate,
        waitlistCount,
        totalMembers: enrichedClients.reduce((s, c) => s + c.memberCount, 0),
        totalTokens: enrichedClients.reduce((s, c) => s + c.monthlyTokens, 0),
        totalCost: enrichedClients.reduce((s, c) => s + c.estimatedCost, 0),
      },
      referrals: referralStats,
      affiliates: affiliateStats,
      channels,
      planDistribution: planDist,
      feedback: feedbackStats,
    });
  } catch (err) {
    console.error("[/api/admin]", err);
    return NextResponse.json(
      { error: "Failed to load admin dashboard", detail: String(err) },
      { status: 500 }
    );
  }
}
