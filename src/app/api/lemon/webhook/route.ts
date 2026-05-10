import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as crypto from "crypto";
import { getPlanByLemonVariant, FREE_TIER_CONFIG } from "@/core/pricing";
import { audit } from "@/core/security/audit";
import { getClientIp } from "@/lib/get-client-ip";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * LemonSqueezy Webhook Handler
 *
 * Verifies HMAC signature, then processes subscription lifecycle events.
 *
 * Events handled:
 *   subscription_created  → Activate plan for user
 *   subscription_updated  → Update plan tier (upgrade/downgrade)
 *   subscription_cancelled → Downgrade to free tier
 *   subscription_expired   → Downgrade to free tier
 *   subscription_payment_failed → Grace period (reduce limits)
 *   subscription_resumed   → Re-activate plan
 */
export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "DB not configured" }, { status: 501 });
  }

  // ── Verify webhook signature ───────────────────────────────────────────
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 501 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const hmac = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const hmacBuf = Buffer.from(hmac);
  const sigBuf = Buffer.from(signature);
  if (hmacBuf.length !== sigBuf.length || !crypto.timingSafeEqual(hmacBuf, sigBuf)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // ── Parse event ────────────────────────────────────────────────────────
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventName = event.meta?.event_name;
  const customData = event.meta?.custom_data;
  const userId = customData?.user_id;
  const attrs = event.data?.attributes;
  const variantId = String(attrs?.variant_id || attrs?.first_subscription_item?.variant_id || "");

  if (!userId) {
    console.warn("[Lemon Webhook] No user_id in custom_data");
    return NextResponse.json({ received: true });
  }

  try {
    switch (eventName) {
      // ── Subscription Created / Updated ──────────────────────────────────
      case "subscription_created":
      case "subscription_updated":
      case "subscription_resumed": {
        const status = attrs?.status; // active, on_trial, paused, past_due, cancelled, expired
        const isActive = status === "active" || status === "on_trial";

        const plan = getPlanByLemonVariant(variantId);

        if (plan && isActive) {
          const { data: membership } = await supabase
            .from("client_members")
            .select("client_id")
            .eq("user_id", userId)
            .single();

          if (membership) {
            await supabase
              .from("clients")
              .update({
                token_budget_monthly: plan.tokenBudgetMonthly,
                token_budget_daily: plan.tokenBudgetDaily,
                message_limit_daily: plan.messageLimitDaily,
                tools_enabled: plan.toolsEnabled,
                updated_at: new Date().toISOString(),
              })
              .eq("id", membership.client_id);

            audit({
              userId,
              action: "write",
              resource: "billing",
              reason: `${eventName}: plan activated (variant ${variantId})`,
              ip: getClientIp(req),
            }).catch(() => {});
          }
        }
        break;
      }

      // ── Subscription Cancelled / Expired ────────────────────────────────
      case "subscription_cancelled":
      case "subscription_expired": {
        const { data: membership } = await supabase
          .from("client_members")
          .select("client_id")
          .eq("user_id", userId)
          .single();

        if (membership) {
          await supabase
            .from("clients")
            .update({
              token_budget_monthly: FREE_TIER_CONFIG.tokenBudgetMonthly,
              token_budget_daily: FREE_TIER_CONFIG.tokenBudgetDaily,
              message_limit_daily: FREE_TIER_CONFIG.messageLimitDaily,
              tools_enabled: FREE_TIER_CONFIG.toolsEnabled,
              updated_at: new Date().toISOString(),
            })
            .eq("id", membership.client_id);
        }
        break;
      }

      // ── Payment Failed ──────────────────────────────────────────────────
      case "subscription_payment_failed": {
        const { data: membership } = await supabase
          .from("client_members")
          .select("client_id")
          .eq("user_id", userId)
          .single();

        if (membership) {
          // Grace period: reduce to free daily limit
          await supabase
            .from("clients")
            .update({
              message_limit_daily: FREE_TIER_CONFIG.messageLimitDaily,
              updated_at: new Date().toISOString(),
            })
            .eq("id", membership.client_id);
        }
        break;
      }

      default:
        // Check for extra pack one-time purchase
        if (eventName === "order_created") {
          const orderVariantId = String(event.data?.attributes?.first_order_item?.variant_id || "");
          const extraPackVariantId = process.env.LEMONSQUEEZY_VARIANT_EXTRA_PACK;

          if (
            orderVariantId &&
            extraPackVariantId &&
            orderVariantId === extraPackVariantId &&
            userId
          ) {
            await supabase.from("extra_packs").insert({
              user_id: userId,
              tokens_granted: 500_000,
              tokens_remaining: 500_000,
              valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              purchase_ref: String(event.data?.id || ""),
            });

            audit({
              userId,
              action: "write",
              resource: "extra_pack",
              reason: "Extra Response Pack purchased",
              ip: getClientIp(req),
            }).catch(() => {});
          }
        }
        break;
    }
  } catch (err) {
    console.error("[Lemon Webhook] Processing error:", err);
  }

  return NextResponse.json({ received: true });
}
