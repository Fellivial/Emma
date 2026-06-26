import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { lemonSqueezySetup, createCheckout } from "@lemonsqueezy/lemonsqueezy.js";
import { ensureClientMembership } from "@/core/client-membership";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key);
}

function initLemon() {
  const key = process.env.LEMONSQUEEZY_API_KEY;
  if (!key) return false;
  lemonSqueezySetup({ apiKey: key });
  return true;
}

/**
 * POST /api/lemon/checkout
 * Body: { variantId: "123456" }
 *
 * Creates a LemonSqueezy checkout URL for the given product variant.
 * variantId maps to a specific plan (Starter, Pro, Enterprise, add-ons).
 */
export async function POST(req: NextRequest) {
  if (!initLemon()) {
    return NextResponse.json({ error: "LemonSqueezy not configured" }, { status: 501 });
  }

  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { variantId } = await req.json();
    if (!variantId) {
      return NextResponse.json({ error: "No variantId provided" }, { status: 400 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 501 });
    }
    await ensureClientMembership(supabase, { userId: user.id });
    const storeId = process.env.LEMONSQUEEZY_STORE_ID;
    if (!storeId) {
      return NextResponse.json({ error: "Store ID not configured" }, { status: 501 });
    }

    const origin = req.headers.get("origin") || "http://localhost:3000";

    const { data, error } = await createCheckout(storeId, variantId, {
      checkoutData: {
        email: user.email || undefined,
        custom: {
          user_id: user.id,
        },
      },
      checkoutOptions: {
        embed: false,
      },
      productOptions: {
        redirectUrl: `${origin}/settings/billing?success=true`,
        enabledVariants: [parseInt(variantId, 10)],
      },
    });

    if (error) {
      Sentry.captureMessage(`LemonSqueezy checkout error: ${String(error)}`, { level: "error" });
      console.error("[Lemon] Checkout error:", error);
      return NextResponse.json({ error: String(error) }, { status: 500 });
    }

    const checkoutUrl = data?.data?.attributes?.url;
    if (!checkoutUrl) {
      return NextResponse.json({ error: "No checkout URL returned" }, { status: 500 });
    }

    return NextResponse.json({ url: checkoutUrl });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[Lemon] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
