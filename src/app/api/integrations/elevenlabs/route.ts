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

    if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
      return NextResponse.json({ error: "API key is required" }, { status: 400 });
    }

    const trimmedKey = apiKey.trim();

    // Validate voice ID format if provided
    if (voiceId !== undefined && voiceId !== null && voiceId !== "") {
      if (!/^[a-zA-Z0-9_-]{10,40}$/.test(voiceId)) {
        return NextResponse.json({ error: "Invalid Voice ID format" }, { status: 400 });
      }
    }

    // Validate key by fetching voices (works on all ElevenLabs plans)
    const validationRes = await fetch(`${ELEVENLABS_API}/voices`, {
      headers: { "xi-api-key": trimmedKey },
    });

    if (validationRes.status === 401) {
      const body = await validationRes.text().catch(() => "");
      console.error("[elevenlabs] key rejected by ElevenLabs (401):", body);
      let parsed: { detail?: { status?: string } } = {};
      try {
        parsed = JSON.parse(body);
      } catch {
        /* non-JSON body */
      }
      if (parsed?.detail?.status === "missing_permissions") {
        return NextResponse.json(
          {
            error:
              "API key is missing required permissions — create a key with Text to Speech, Voices, and User scopes enabled at elevenlabs.io/app/settings/api-keys",
          },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: "API key is invalid — check your ElevenLabs dashboard" },
        { status: 400 }
      );
    }
    if (!validationRes.ok) {
      const errBody = await validationRes.text().catch(() => "");
      console.error(`[elevenlabs] ElevenLabs /voices returned ${validationRes.status}:`, errBody);
      return NextResponse.json({ error: "Could not verify key — try again" }, { status: 400 });
    }

    // Verify TTS scope — a key with only Voices scope passes /voices but fails on generation.
    // Rachel (21m00Tcm4TlvDq8ikWAM) is available on all plans; "ok" minimises character use.
    const ttsCheckRes = await fetch(`${ELEVENLABS_API}/text-to-speech/21m00Tcm4TlvDq8ikWAM`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": trimmedKey },
      body: JSON.stringify({ text: "ok", model_id: "eleven_turbo_v2_5" }),
    });
    if (ttsCheckRes.status === 401) {
      const ttsBody = await ttsCheckRes.text().catch(() => "");
      console.error("[elevenlabs] TTS scope check failed (401):", ttsBody);
      let ttsParsed: { detail?: { status?: string } } = {};
      try {
        ttsParsed = JSON.parse(ttsBody);
      } catch {}
      const missingScope = ttsParsed?.detail?.status === "missing_permissions";
      return NextResponse.json(
        {
          error: missingScope
            ? "API key is missing the Text to Speech scope — enable it at elevenlabs.io/app/settings/api-keys"
            : "API key was rejected for TTS generation — check your ElevenLabs dashboard",
        },
        { status: 400 }
      );
    }
    if (!ttsCheckRes.ok && ttsCheckRes.status !== 429) {
      // 429 = quota exhausted but key is valid — allow connect so user can see quota state
      const ttsErrBody = await ttsCheckRes.text().catch(() => "");
      console.error(`[elevenlabs] TTS check returned ${ttsCheckRes.status}:`, ttsErrBody);
      return NextResponse.json(
        { error: "Could not verify TTS access — try again" },
        { status: 400 }
      );
    }
    // Discard the audio response body to free the connection
    await ttsCheckRes.body?.cancel().catch(() => {});

    // Best-effort: fetch subscription quota for usage bar visibility.
    // Requires "User" scope; silently skipped if unavailable.
    const subscriptionMeta: Record<string, unknown> = {};
    const subRes = await fetch(`${ELEVENLABS_API}/user/subscription`, {
      headers: { "xi-api-key": trimmedKey },
    }).catch(() => null);
    if (subRes?.ok) {
      const sub = await subRes.json().catch(() => ({}));
      subscriptionMeta.tier = sub.tier ?? null;
      subscriptionMeta.characterCount = sub.character_count ?? null;
      subscriptionMeta.characterLimit = sub.character_limit ?? null;
      subscriptionMeta.resetUnix = sub.next_character_count_reset_unix ?? null;
    }

    const accountName = "ElevenLabs Account";

    // Verify voice ID if provided
    let verifiedVoiceName: string | null = null;
    if (voiceId) {
      const voiceRes = await fetch(`${ELEVENLABS_API}/voices/${voiceId}`, {
        headers: { "xi-api-key": trimmedKey },
      });
      if (voiceRes.status === 401) {
        console.error("[elevenlabs] voice check: key rejected (401)");
        return NextResponse.json({ error: "API key is invalid" }, { status: 400 });
      }
      if (voiceRes.status === 404) {
        return NextResponse.json(
          { error: "Voice ID not found in your ElevenLabs account" },
          { status: 400 }
        );
      }
      if (!voiceRes.ok) {
        const errBody = await voiceRes.text().catch(() => "");
        console.error(`[elevenlabs] voice check returned ${voiceRes.status}:`, errBody);
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

    const { error: upsertErr } = await supabase.from("client_integrations").upsert(
      {
        client_id: membership.client_id,
        service: "elevenlabs",
        status: "connected",
        access_token: encrypt(trimmedKey),
        account_identifier: accountName,
        metadata: {
          voiceId: voiceId || null,
          voiceName: verifiedVoiceName || (voiceId ? null : "Rachel (default)"),
          ...subscriptionMeta,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "client_id,service" }
    );
    if (upsertErr) {
      console.error("[elevenlabs] upsert failed:", upsertErr.message);
      return NextResponse.json({ error: "Failed to save integration" }, { status: 500 });
    }

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

    if (!integration) {
      console.error("[elevenlabs PATCH] no integration row for client", membership.client_id);
      return NextResponse.json({ error: "ElevenLabs not connected" }, { status: 400 });
    }
    if (integration.status !== "connected") {
      console.error("[elevenlabs PATCH] integration status is", integration.status);
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

    // Verify voice is usable for TTS on this plan before saving.
    // GET /voices/{id} succeeds even for plan-restricted voices; TTS is the true gate.
    const ttsPatchCheck = await fetch(`${ELEVENLABS_API}/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
      body: JSON.stringify({ text: "ok", model_id: "eleven_turbo_v2_5" }),
    });
    if (!ttsPatchCheck.ok && ttsPatchCheck.status !== 429) {
      const ttsErr = await ttsPatchCheck.text().catch(() => "");
      let ttsErrMsg = "This voice cannot be used for TTS on your current ElevenLabs plan";
      try {
        const p = JSON.parse(ttsErr) as { detail?: { message?: string } };
        if (p?.detail?.message) ttsErrMsg = p.detail.message;
      } catch {}
      return NextResponse.json({ error: ttsErrMsg }, { status: 400 });
    }
    await ttsPatchCheck.body?.cancel().catch(() => {});

    const updatedMetadata = {
      ...(integration.metadata || {}),
      voiceId,
      voiceName: verifiedVoiceName,
    };

    await supabase
      .from("client_integrations")
      .update({
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
