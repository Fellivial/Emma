import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import {
  createTrial,
  getActiveTrial,
  checkTrial,
  incrementTrialMessages,
  trackActivation,
  convertTrial,
  getTrialAnalytics,
  type ActivationMilestone,
} from "@/core/trial-engine";

/**
 * Trial API
 *
 * POST /api/emma/trial
 *   { action: "start", email, source?, referralCode?, affiliateCode? }  → Start 14-day trial
 *   { action: "check" }                                                  → Check trial status + limits
 *   { action: "message" }                                                → Increment message count
 *   { action: "activate", milestone }                                    → Track activation milestone
 *   { action: "convert" }                                                → Mark trial as converted
 *   { action: "upgrade_shown" }                                          → Log upgrade prompt shown
 *   { action: "upgrade_clicked" }                                        → Log upgrade click
 *   { action: "analytics" }                                              → Trial analytics (admin)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    // ── Start trial ──────────────────────────────────────────────────────
    if (action === "start") {
      const user = await getUser();
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

      const trial = await createTrial(user.id, user.email || "", {
        source: body.source,
        referralCode: body.referralCode,
        affiliateCode: body.affiliateCode,
      });

      if (!trial) return NextResponse.json({ error: "Could not create trial" }, { status: 500 });
      return NextResponse.json({ trial });
    }

    // ── Check trial status ───────────────────────────────────────────────
    if (action === "check") {
      const user = await getUser();
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

      const result = await checkTrial(user.id);
      return NextResponse.json(result);
    }

    // ── Increment message count ──────────────────────────────────────────
    if (action === "message") {
      const user = await getUser();
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

      await incrementTrialMessages(user.id);
      return NextResponse.json({ ok: true });
    }

    // ── Track activation milestone ───────────────────────────────────────
    if (action === "activate") {
      const user = await getUser();
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

      const { milestone } = body;
      const valid: ActivationMilestone[] = ["first_message", "first_voice", "first_memory", "first_routine"];
      if (!valid.includes(milestone)) {
        return NextResponse.json({ error: "Invalid milestone" }, { status: 400 });
      }

      await trackActivation(user.id, milestone);
      return NextResponse.json({ tracked: true });
    }

    // ── Convert trial ────────────────────────────────────────────────────
    if (action === "convert") {
      const user = await getUser();
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

      const success = await convertTrial(user.id);
      return NextResponse.json({ converted: success });
    }

    // ── Log upgrade prompt events ────────────────────────────────────────
    if (action === "upgrade_shown" || action === "upgrade_clicked") {
      const user = await getUser();
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

      const trial = await getActiveTrial(user.id);
      if (trial) {
        const { createClient } = await import("@supabase/supabase-js");
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (url && key) {
          const supabase = createClient(url, key);
          await supabase.from("trial_events").insert({
            trial_id: trial.id,
            user_id: user.id,
            event: action,
          });
        }
      }
      return NextResponse.json({ logged: true });
    }

    // ── Analytics (admin) ────────────────────────────────────────────────
    if (action === "analytics") {
      const user = await getUser();
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

      const adminEmails = (process.env.EMMA_ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase());
      if (!adminEmails.includes(user.email?.toLowerCase() || "")) {
        return NextResponse.json({ error: "Admin only" }, { status: 403 });
      }

      const analytics = await getTrialAnalytics();
      return NextResponse.json(analytics);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
