import webpush from "web-push";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
}

function initVapid() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const contact = process.env.EMAIL_FROM
    ? `mailto:${process.env.EMAIL_FROM}`
    : process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}`
      : "mailto:admin@emma.app";

  if (!pub || !priv) return false;

  try {
    webpush.setVapidDetails(contact, pub, priv);
  } catch (err) {
    console.error("[push-notify] Failed to initialise VAPID — check key format:", err);
    return false;
  }
  return true;
}

let vapidInitialised = false;

export async function pushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!vapidInitialised) {
    vapidInitialised = initVapid();
  }
  if (!vapidInitialised) return;

  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, subscription")
    .eq("user_id", userId);

  if (!subs || subs.length === 0) return;

  await Promise.allSettled(
    subs.map(async ({ id, subscription }) => {
      try {
        await webpush.sendNotification(
          subscription as webpush.PushSubscription,
          JSON.stringify(payload)
        );
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 410 || status === 404) {
          // Subscription is gone — clean it up
          await supabase.from("push_subscriptions").delete().eq("id", id);
        } else {
          // Log unexpected errors (e.g. 429 rate limit, 400 bad request, network failure)
          // so operators can detect push delivery issues in production logs.
          console.error(
            `[push-notify] sendNotification failed (status=${status ?? "network"}):`,
            err
          );
        }
      }
    })
  );
}
