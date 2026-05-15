import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { encrypt, decrypt } from "@/core/security/encryption";
import { audit } from "@/core/security/audit";
import { getUser } from "@/lib/supabase/server";
import { getClientIp } from "@/lib/get-client-ip";

const ELEVENLABS_API = "https://api.elevenlabs.io/v1";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// ── POST — Connect ElevenLabs key (+ optional voiceId) ──────────────────────

export async function POST(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return NextResponse.json({ error: "DB not configured" }, { status: 501 });

    const { apiKey, voiceId } = (await req.json()) as { apiKey: string; voiceId?: string };

    // Validate key format
    if (!apiKey || typeof apiKey !== "string" || !apiKey.trim().startsWith("sk_")) {
      return NextResponse.json({ error: "Invalid ElevenLabs API key format" }, { status: 400 });
    }

    const trimmedKey = apiKey.trim();

    // Validate voice ID format if provided
    if (voiceId !== undefined && voiceId !== null && voiceId !== "") {
      if (!/^[a-zA-Z0-9]{15,30}$/.test(voiceId)) {
        return NextResponse.json({ error: "Invalid Voice ID format" }, { status: 400 });
      }
    }

    // Test key against ElevenLabs /user endpoint
    const userRes = await fetch(`${ELEVENLABS_API}/user`, {
      headers: { "xi-api-key": trimmedKey },
    });

    if (userRes.status === 401) {
      return NextResponse.json(
        { error: "API key is invalid — check your ElevenLabs dashboard" },
        { status: 400 }
      );
    }
    if (!userRes.ok) {
      return NextResponse.json({ error: "Could not verify key — try again" }, { status: 400 });
    }

    const userInfo = await userRes.json();
    const accountName: string = userInfo.first_name || "ElevenLabs Account";

    // Verify voice ID if provided
    let verifiedVoiceName: string | null = null;
    if (voiceId) {
      const voiceRes = await fetch(`${ELEVENLABS_API}/voices/${voiceId}`, {
        headers: { "xi-api-key": trimmedKey },
      });
      if (voiceRes.status === 401) {
        return NextResponse.json({ error: "API key is invalid" }, { status: 400 });
      }
      if (voiceRes.status === 404) {
        return NextResponse.json(
          { error: "Voice ID not found in your ElevenLabs account" },
          { status: 400 }
        );
      }
      if (!voiceRes.ok) {
        return NextResponse.json({ error: "Could not verify Voice ID" }, { status: 400 });
      }
      const voiceInfo = await voiceRes.json();
      verifiedVoiceName = voiceInfo.name || null;
    }

    const { data: membership } = await supabase
      .from("client_members")
      .select("client_id")
      .eq("user_id", user.id)
      .single();
    if (!membership) return NextResponse.json({ error: "No client" }, { status: 404 });

    await supabase.from("client_integrations").upsert(
      {
        client_id: membership.client_id,
        service: "elevenlabs",
        status: "connected",
        access_token: encrypt(trimmedKey),
        voice_id: voiceId || null,
        account_identifier: accountName,
        metadata: {
          voiceName: verifiedVoiceName || (voiceId ? null : "Rachel (default)"),
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "client_id,service" }
    );

    audit({
      userId: user.id,
      action: "write",
      resource: "voice",
      reason: "elevenlabs connected",
      ip: getClientIp(req),
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      accountName,
      voiceName: verifiedVoiceName || "Rachel (default)",
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ── PATCH — Update voice only (key already connected) ───────────────────────

export async function PATCH(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return NextResponse.json({ error: "DB not configured" }, { status: 501 });

    const { voiceId } = (await req.json()) as { voiceId: string };

    if (!voiceId || !/^[a-zA-Z0-9]{15,30}$/.test(voiceId)) {
      return NextResponse.json({ error: "Invalid Voice ID format" }, { status: 400 });
    }

    const { data: membership } = await supabase
      .from("client_members")
      .select("client_id")
      .eq("user_id", user.id)
      .single();
    if (!membership) return NextResponse.json({ error: "No client" }, { status: 404 });

    // Load existing integration — must be connected
    const { data: integration } = await supabase
      .from("client_integrations")
      .select("access_token, status, metadata")
      .eq("client_id", membership.client_id)
      .eq("service", "elevenlabs")
      .single();

    if (!integration || integration.status !== "connected") {
      return NextResponse.json({ error: "ElevenLabs not connected" }, { status: 400 });
    }

    let apiKey: string;
    try {
      apiKey = decrypt(integration.access_token);
    } catch {
      return NextResponse.json({ error: "Could not load stored key" }, { status: 500 });
    }

    // Verify voice ID against ElevenLabs
    const voiceRes = await fetch(`${ELEVENLABS_API}/voices/${voiceId}`, {
      headers: { "xi-api-key": apiKey },
    });
    if (voiceRes.status === 401) {
      return NextResponse.json({ error: "Stored API key is no longer valid" }, { status: 400 });
    }
    if (voiceRes.status === 404) {
      return NextResponse.json(
        { error: "Voice ID not found in your ElevenLabs account" },
        { status: 400 }
      );
    }
    if (!voiceRes.ok) {
      return NextResponse.json({ error: "Could not verify Voice ID" }, { status: 400 });
    }
    const voiceInfo = await voiceRes.json();
    const verifiedVoiceName: string = voiceInfo.name || voiceId;

    const updatedMetadata = { ...(integration.metadata || {}), voiceName: verifiedVoiceName };

    await supabase
      .from("client_integrations")
      .update({
        voice_id: voiceId,
        metadata: updatedMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq("client_id", membership.client_id)
      .eq("service", "elevenlabs");

    audit({
      userId: user.id,
      action: "write",
      resource: "voice",
      reason: "elevenlabs voice updated",
      ip: getClientIp(req),
    }).catch(() => {});

    return NextResponse.json({ success: true, voiceName: verifiedVoiceName });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
