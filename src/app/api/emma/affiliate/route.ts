import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { audit } from "@/core/security/audit";
import * as crypto from "crypto";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function generateAffiliateCode(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 10);
  const rand = crypto.randomBytes(3).toString("hex");
  return `${slug}-${rand}`;
}

/**
 * Affiliate System API
 *
 * POST /api/emma/affiliate
 *   { action: "register", name, email }           → Register new affiliate (admin only)
 *   { action: "list" }                             → List all affiliates (admin only)
 *   { action: "dashboard" }                        → Affiliate's own dashboard
 *   { action: "track", affiliateCode, email }      → Track a referral from affiliate link
 *   { action: "convert", affiliateCode, email, planId, monthlyRevenue } → Mark as converted
 */
export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "DB not configured" }, { status: 501 });

  try {
    const body = await req.json();
    const { action } = body;

    // ── Register new affiliate (admin only) ──────────────────────────────
    if (action === "register") {
      const user = await getUser();
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

      const adminEmails = (process.env.EMMA_ADMIN_EMAILS || "")
        .split(",")
        .map((e) => e.trim().toLowerCase());
      if (!adminEmails.includes(user.email?.toLowerCase() || "")) {
        return NextResponse.json({ error: "Admin only" }, { status: 403 });
      }

      const { name, email, commissionRate = 0.2, commissionMonths = 3 } = body;
      if (!name || !email) {
        return NextResponse.json({ error: "name and email required" }, { status: 400 });
      }

      const code = generateAffiliateCode(name);

      const { data, error } = await supabase
        .from("affiliates")
        .insert({
          name,
          email: email.toLowerCase(),
          affiliate_code: code,
          commission_rate: commissionRate,
          commission_months: commissionMonths,
        })
        .select("id, affiliate_code")
        .single();

      if (error) {
        if (error.code === "23505")
          return NextResponse.json({ error: "Email already registered" }, { status: 409 });
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      audit({
        userId: user.id,
        action: "write",
        resource: "profile",
        reason: `Registered affiliate: ${name} (${email})`,
      }).catch(() => {});

      return NextResponse.json({
        affiliate: data,
        link: `${req.headers.get("origin") || "https://emma.ai"}/landing?aff=${code}`,
      });
    }

    // ── List all affiliates (admin only) ─────────────────────────────────
    if (action === "list") {
      const user = await getUser();
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

      const adminEmails = (process.env.EMMA_ADMIN_EMAILS || "")
        .split(",")
        .map((e) => e.trim().toLowerCase());
      if (!adminEmails.includes(user.email?.toLowerCase() || "")) {
        return NextResponse.json({ error: "Admin only" }, { status: 403 });
      }

      const { data: affiliates } = await supabase
        .from("affiliates")
        .select("*, affiliate_referrals(*)")
        .order("created_at", { ascending: false });

      return NextResponse.json({ affiliates: affiliates || [] });
    }

    // ── Affiliate's own dashboard ────────────────────────────────────────
    if (action === "dashboard") {
      const user = await getUser();
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

      const { data: affiliate } = await supabase
        .from("affiliates")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (!affiliate) {
        // Check by email
        const { data: byEmail } = await supabase
          .from("affiliates")
          .select("*")
          .eq("email", user.email?.toLowerCase())
          .single();

        if (!byEmail) return NextResponse.json({ error: "Not an affiliate" }, { status: 404 });

        // Link user_id
        await supabase.from("affiliates").update({ user_id: user.id }).eq("id", byEmail.id);

        const { data: referrals } = await supabase
          .from("affiliate_referrals")
          .select("*")
          .eq("affiliate_id", byEmail.id)
          .order("created_at", { ascending: false });

        return NextResponse.json({
          affiliate: byEmail,
          referrals: referrals || [],
          link: `${req.headers.get("origin") || "https://emma.ai"}/landing?aff=${byEmail.affiliate_code}`,
        });
      }

      const { data: referrals } = await supabase
        .from("affiliate_referrals")
        .select("*")
        .eq("affiliate_id", affiliate.id)
        .order("created_at", { ascending: false });

      return NextResponse.json({
        affiliate,
        referrals: referrals || [],
        link: `${req.headers.get("origin") || "https://emma.ai"}/landing?aff=${affiliate.affiliate_code}`,
      });
    }

    // ── Track referral from affiliate link ───────────────────────────────
    if (action === "track") {
      const { affiliateCode, email } = body;
      if (!affiliateCode || !email) {
        return NextResponse.json({ error: "affiliateCode and email required" }, { status: 400 });
      }

      const { data: affiliate } = await supabase
        .from("affiliates")
        .select("id")
        .eq("affiliate_code", affiliateCode)
        .eq("status", "active")
        .single();

      if (!affiliate)
        return NextResponse.json({ error: "Invalid affiliate code" }, { status: 404 });

      await supabase.from("affiliate_referrals").insert({
        affiliate_id: affiliate.id,
        referred_email: email.toLowerCase(),
        status: "pending",
      });

      // Increment total referrals count
      const { data: currentAff } = await supabase
        .from("affiliates")
        .select("total_referrals")
        .eq("id", affiliate.id)
        .single();

      await supabase
        .from("affiliates")
        .update({
          total_referrals: ((currentAff as any)?.total_referrals || 0) + 1,
        })
        .eq("id", affiliate.id);

      return NextResponse.json({ tracked: true });
    }

    // ── Convert affiliate referral ───────────────────────────────────────
    if (action === "convert") {
      const { affiliateCode, email, planId, monthlyRevenue } = body;
      if (!affiliateCode || !email) {
        return NextResponse.json({ error: "affiliateCode and email required" }, { status: 400 });
      }

      const { data: affiliate } = await supabase
        .from("affiliates")
        .select("id, commission_rate")
        .eq("affiliate_code", affiliateCode)
        .single();

      if (!affiliate) return NextResponse.json({ error: "Invalid affiliate" }, { status: 404 });

      const commission = (monthlyRevenue || 0) * (affiliate.commission_rate || 0.2);

      await supabase
        .from("affiliate_referrals")
        .update({
          status: "converted",
          plan_id: planId,
          monthly_revenue: monthlyRevenue || 0,
          commission_paid: commission,
          converted_at: new Date().toISOString(),
        })
        .eq("affiliate_id", affiliate.id)
        .eq("referred_email", email.toLowerCase());

      // Update total earned
      await supabase
        .from("affiliates")
        .update({
          total_earned: (affiliate as any).total_earned + commission,
        })
        .eq("id", affiliate.id);

      return NextResponse.json({ converted: true, commission });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
