import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { loadClientConfigForUser, type ClientConfig } from "@/core/client-config";
import { createClient } from "@supabase/supabase-js";
import { audit } from "@/core/security/audit";
import { applyVertical, getAllVerticals } from "@/core/verticals/templates";

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET — load current client config
export async function GET() {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const config = await loadClientConfigForUser(user.id);

    // Also load usage stats
    const supabase = getServiceSupabase();
    let usage = { dailyMessages: 0, dailyTokens: 0, monthlyTokens: 0, monthlyCost: 0 };

    if (supabase) {
      const today = new Date().toISOString().split("T")[0];
      const monthStart = new Date();
      monthStart.setDate(1);

      const { data: dailyData } = await supabase
        .from("usage")
        .select("message_count, token_count")
        .eq("user_id", user.id)
        .eq("date", today)
        .single();

      const { data: monthlyData } = await supabase
        .from("usage")
        .select("token_count")
        .eq("user_id", user.id)
        .gte("date", monthStart.toISOString().split("T")[0]);

      usage.dailyMessages = dailyData?.message_count || 0;
      usage.dailyTokens = dailyData?.token_count || 0;
      usage.monthlyTokens = (monthlyData || []).reduce(
        (sum: number, r: any) => sum + (r.token_count || 0),
        0
      );
      // Estimate cost: ~$3/M input + ~$15/M output, rough average $6/M
      usage.monthlyCost = Math.round((usage.monthlyTokens / 1_000_000) * 6 * 100) / 100;
    }

    return NextResponse.json({
      config,
      usage,
      verticals: getAllVerticals().map((v) => ({
        id: v.id,
        name: v.name,
        icon: v.icon,
        description: v.description,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

const VALID_AUTONOMY_TIERS = new Set([1, 2, 3]);

function parseSettingsBody(raw: unknown): {
  name?: string;
  personaName?: string;
  personaPrompt?: string;
  personaGreeting?: string;
  voiceId?: string;
  autonomyTier?: 1 | 2 | 3;
  proactiveVision?: boolean;
  verticalId?: string;
} {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const b = raw as Record<string, unknown>;
  const out: ReturnType<typeof parseSettingsBody> = {};
  if (typeof b.name === "string") out.name = b.name.slice(0, 200);
  if (typeof b.personaName === "string") out.personaName = b.personaName.slice(0, 100);
  if (typeof b.personaPrompt === "string") out.personaPrompt = b.personaPrompt.slice(0, 4000);
  if (typeof b.personaGreeting === "string") out.personaGreeting = b.personaGreeting.slice(0, 500);
  if (typeof b.voiceId === "string") out.voiceId = b.voiceId.slice(0, 100);
  if (typeof b.autonomyTier === "number" && VALID_AUTONOMY_TIERS.has(b.autonomyTier)) {
    out.autonomyTier = b.autonomyTier as 1 | 2 | 3;
  }
  if (typeof b.proactiveVision === "boolean") out.proactiveVision = b.proactiveVision;
  if (typeof b.verticalId === "string") out.verticalId = b.verticalId;
  return out;
}

// POST — update client config
export async function POST(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = getServiceSupabase();
    if (!supabase) return NextResponse.json({ error: "DB not configured" }, { status: 500 });

    const body = parseSettingsBody(await req.json());

    // Find user's client
    const { data: membership } = await supabase
      .from("client_members")
      .select("client_id, role")
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      // No client yet — create one, optionally from a vertical template
      const vertical = body.verticalId ? applyVertical(body.verticalId) : null;

      const { data: newClient, error: createErr } = await supabase
        .from("clients")
        .insert({
          slug: `client-${user.id.slice(0, 8)}`,
          name: body.name || "My Emma",
          owner_id: user.id,
          persona_name: vertical?.persona_name || body.personaName || "Emma",
          persona_prompt: vertical?.persona_prompt || body.personaPrompt || null,
          persona_greeting: vertical?.persona_greeting || body.personaGreeting || null,
          voice_id: body.voiceId || null,
          tools_enabled: vertical?.tools_enabled || undefined,
          autonomy_tier: body.autonomyTier ?? 2,
          proactive_vision: body.proactiveVision ?? false,
        })
        .select("id")
        .single();

      if (createErr || !newClient) {
        return NextResponse.json({ error: "Failed to create client" }, { status: 500 });
      }

      await supabase.from("client_members").insert({
        client_id: newClient.id,
        user_id: user.id,
        role: "owner",
      });

      audit({
        userId: user.id,
        action: "write",
        resource: "client_config",
        resourceId: newClient.id,
        reason: "Initial client creation",
      }).catch((e) => console.error("[audit]", e));
      return NextResponse.json({ success: true, clientId: newClient.id });
    }

    // Check permission (owner or admin)
    if (membership.role !== "owner" && membership.role !== "admin") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    // Update existing client
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.personaName !== undefined) updates.persona_name = body.personaName;
    if (body.personaPrompt !== undefined) updates.persona_prompt = body.personaPrompt;
    if (body.personaGreeting !== undefined) updates.persona_greeting = body.personaGreeting;
    if (body.voiceId !== undefined) updates.voice_id = body.voiceId;
    if (body.autonomyTier !== undefined) updates.autonomy_tier = body.autonomyTier;
    if (body.proactiveVision !== undefined) updates.proactive_vision = body.proactiveVision;

    const { error: updateErr } = await supabase
      .from("clients")
      .update(updates)
      .eq("id", membership.client_id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    audit({
      userId: user.id,
      action: "write",
      resource: "client_config",
      resourceId: membership.client_id,
      reason: `Config update: ${Object.keys(updates)
        .filter((k) => k !== "updated_at")
        .join(", ")}`,
    }).catch((e) => console.error("[audit]", e));
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
