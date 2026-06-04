import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** GET — returns whether the caller has any active push subscriptions */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ subscribed: false });

  const { count } = await supabase
    .from("push_subscriptions")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  return NextResponse.json({ subscribed: (count ?? 0) > 0 });
}

/** POST — saves a new PushSubscription for the authenticated user */
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "No DB" }, { status: 503 });

  let subscription: object;
  try {
    subscription = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userAgent = req.headers.get("user-agent") ?? undefined;

  const { error } = await supabase.from("push_subscriptions").insert({
    user_id: user.id,
    subscription,
    user_agent: userAgent,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

/** DELETE — removes push subscription(s) for the authenticated user */
export async function DELETE(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "No DB" }, { status: 503 });

  // Match by endpoint to remove only this device's subscription
  let endpoint: string | null = null;
  try {
    const body = await req.json();
    endpoint = body?.endpoint ?? null;
  } catch {
    /* no body — delete all */
  }

  let query = supabase.from("push_subscriptions").delete().eq("user_id", user.id);

  if (endpoint) {
    query = query.filter("subscription->>'endpoint'", "eq", endpoint);
  }

  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
