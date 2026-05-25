import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decrypt } from "@/core/security/encryption";
import { getUser } from "@/lib/supabase/server";

const ELEVENLABS_API = "https://api.elevenlabs.io/v1";
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel

// Short-lived cache so repeated TTS calls don't re-query Supabase on every message.
interface TtsCacheEntry { apiKey: string; voiceId: string | null; clientId: string; ts: number }
const ttsCache = new Map<string, TtsCacheEntry>();
const TTS_CACHE_TTL = 60_000; // 60 s

export async function POST(req: NextRequest) {
  const sessionUser = await getUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { text, voiceId } = await req.json();

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    // ── Resolve ElevenLabs API key via session user ─────────────────────
    // Look up the client's ElevenLabs integration using the authenticated session.
    // No clientId needed from the request body — session cookie is sufficient.

    let apiKey: string | null = null;
    let storedVoiceId: string | null = null;
    let resolvedClientId: string | null = null;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Check cache first to avoid repeated Supabase round-trips on every TTS call
    const cached = ttsCache.get(sessionUser.id);
    if (cached && Date.now() - cached.ts < TTS_CACHE_TTL) {
      apiKey = cached.apiKey;
      storedVoiceId = cached.voiceId;
      resolvedClientId = cached.clientId;
    } else if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data: membership } = await supabase
        .from("client_members")
        .select("client_id")
        .eq("user_id", sessionUser.id)
        .single();

      if (membership?.client_id) {
        resolvedClientId = membership.client_id;

        const { data } = await supabase
          .from("client_integrations")
          .select("access_token, status, metadata")
          .eq("client_id", resolvedClientId)
          .eq("service", "elevenlabs")
          .eq("status", "connected")
          .single();

        if (data?.access_token) {
          const decrypted = decrypt(data.access_token);
          if (decrypted && !decrypted.startsWith("[")) {
            apiKey = decrypted;
            storedVoiceId = (data?.metadata?.voiceId as string | null) || null;
            ttsCache.set(sessionUser.id, { apiKey: decrypted, voiceId: storedVoiceId, clientId: resolvedClientId!, ts: Date.now() });
          }
        }
      }
    }

    // No key available — signal client to use Web Speech (204 = silent, not an error)
    if (!apiKey) {
      return new NextResponse(null, { status: 204 });
    }

    // ── Call ElevenLabs ─────────────────────────────────────────────────
    // Priority: request voiceId → stored voice_id → Rachel default
    const voice = voiceId || storedVoiceId || DEFAULT_VOICE_ID;

    const res = await fetch(`${ELEVENLABS_API}/text-to-speech/${voice}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text: text.slice(0, 1000),
        model_id: "eleven_turbo_v2_5",
        voice_settings: {
          stability: 1.0, // sp100 — very consistent
          similarity_boost: 0.5, // s50
          style: 0.75, // sb75 — strong expression
          use_speaker_boost: true, // b
        },
      }),
    });

    if (res.status === 401) {
      ttsCache.delete(sessionUser.id);
      if (resolvedClientId && supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey);
        await supabase
          .from("client_integrations")
          .update({
            status: "auth_expired",
            last_error: "API key invalid or revoked",
            updated_at: new Date().toISOString(),
          })
          .eq("client_id", resolvedClientId)
          .eq("service", "elevenlabs");
      }
      return new NextResponse(null, { status: 204 });
    }

    if (!res.ok) {
      const errText = await res.text();
      console.error("[EMMA TTS] ElevenLabs error:", res.status, errText);
      return NextResponse.json({ error: `ElevenLabs API ${res.status}` }, { status: 502 });
    }

    const audioBuffer = await res.arrayBuffer();

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.byteLength.toString(),
      },
    });
  } catch (err) {
    console.error("[EMMA TTS] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
