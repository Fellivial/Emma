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

function generateCode(userId: string): string {
  const hash = crypto.createHash("sha256").update(userId + Date.now()).digest("hex");
  return `emma-${hash.slice(0, 8)}`;
}

/**
 * Referral System API
 *
 * POST /api/emma/referral
 *   { action: "generate" }          → Generate a unique referral code for the current user
 *   { action: "list" }              → List all referrals made by current user
 *   { action: "track", code, email } → Track a signup from a referral link (called at signup)
 *   { action: "convert", code }     → Mark referral as converted (called when referred user pays)
 *   { action: "reward", referralId } → Apply reward to referrer (1 month free)
 */
export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "DB not configured" }, { status: 501 });

  try {
    const body = await req.json();
    const { action } = body;

    // ── Generate referral code ───────────────────────────────────────────
    if (action === "generate") {
      const user = await getUser();
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

      // Check if user already has a code
      const { data: existing } = await supabase
        .from("referrals")
        .select("referral_code")
        .eq("referrer_id", user.id)
        .is("referred_email", null)
        .limit(1)
        .single();

      if (existing) {
        return NextResponse.json({ code: existing.referral_code });
      }

      // Find user's client
      const { data: membership } = await supabase
        .from("client_members")
        .select("client_id")
        .eq("user_id", user.id)
        .single();

      const code = generateCode(user.id);

      await supabase.from("referrals").insert({
        referrer_id: user.id,
        referrer_client_id: membership?.client_id || null,
        referral_code: code,
        status: "pending",
      });

      audit({ userId: user.id, action: "write", resource: "profile", reason: "Generated referral code" }).catch(() => {});

      return NextResponse.json({
        code,
        link: `${req.headers.get("origin") || "https://emma.ai"}/landing?ref=${code}`,
      });
    }

    // ── List user's referrals ────────────────────────────────────────────
    if (action === "list") {
      const user = await getUser();
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

      const { data: referrals } = await supabase
        .from("referrals")
        .select("*")
        .eq("referrer_id", user.id)
        .order("created_at", { ascending: false });

      const stats = {
        total: referrals?.length || 0,
        signedUp: referrals?.filter((r) => r.status !== "pending").length || 0,
        converted: referrals?.filter((r) => r.status === "converted" || r.status === "rewarded").length || 0,
        rewarded: referrals?.filter((r) => r.status === "rewarded").length || 0,
      };

      return NextResponse.json({ referrals: referrals || [], stats });
    }

    // ── Track a signup from referral ─────────────────────────────────────
    if (action === "track") {
      const { code, email } = body;
      if (!code || !email) {
        return NextResponse.json({ error: "code and email required" }, { status: 400 });
      }

      // Find the referral code
      const { data: referral } = await supabase
        .from("referrals")
        .select("id, referrer_id")
        .eq("referral_code", code)
        .single();

      if (!referral) {
        return NextResponse.json({ error: "Invalid referral code" }, { status: 404 });
      }

      // Create a new referral entry for this specific person
      await supabase.from("referrals").insert({
        referrer_id: referral.referrer_id,
        referral_code: code,
        referred_email: email.toLowerCase(),
        status: "signed_up",
      });

      return NextResponse.json({ tracked: true });
    }

    // ── Mark referral as converted (when referred user subscribes) ───────
    if (action === "convert") {
      const { code, userId: referredUserId } = body;
      if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });

      const { error } = await supabase
        .from("referrals")
        .update({
          status: "converted",
          referred_user_id: referredUserId || null,
          converted_at: new Date().toISOString(),
        })
        .eq("referral_code", code)
        .eq("status", "signed_up");

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ converted: true });
    }

    // ── Apply reward (1 month free to referrer) ──────────────────────────
    if (action === "reward") {
      const user = await getUser();
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

      const { referralId } = body;
      if (!referralId) return NextResponse.json({ error: "referralId required" }, { status: 400 });

      // Only admin or system can apply rewards
      const adminEmails = (process.env.EMMA_ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase());
      if (!adminEmails.includes(user.email?.toLowerCase() || "")) {
        return NextResponse.json({ error: "Admin only" }, { status: 403 });
      }

      await supabase.from("referrals").update({
        status: "rewarded",
        reward_applied: true,
        rewarded_at: new Date().toISOString(),
      }).eq("id", referralId);

      // TODO: Extend referrer's subscription by 1 month via LemonSqueezy API
      // await updateSubscription(subId, { pause: null, trialEndsAt: currentEnd + 30 days })

      audit({ userId: user.id, action: "write", resource: "billing", resourceId: referralId, reason: "Referral reward applied (1 month free)" }).catch(() => {});

      return NextResponse.json({ rewarded: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
