import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decrypt } from "@/core/security/encryption";

const ELEVENLABS_API = "https://api.elevenlabs.io/v1";
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel

export async function POST(req: NextRequest) {
  try {
    const { text, voiceId, clientId } = await req.json();

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    // ── Resolve ElevenLabs API key ──────────────────────────────────────
    // Priority:
    //   1. User's BYOK key from client_integrations (encrypted)
    //   2. No key → 501 → client uses Web Speech

    let apiKey: string | null = null;
    let storedVoiceId: string | null = null;

    if (clientId) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { data } = await supabase
          .from("client_integrations")
          .select("access_token, status, voice_id")
          .eq("client_id", clientId)
          .eq("service", "elevenlabs")
          .eq("status", "connected")
          .single();

        if (data?.access_token) {
          try {
            apiKey = decrypt(data.access_token);
          } catch {
            apiKey = null;
          }
        }
        storedVoiceId = data?.voice_id || null;
      }
    }

    // No key available — signal client to use Web Speech
    if (!apiKey) {
      return NextResponse.json(
        { error: "No ElevenLabs key configured — use Web Speech" },
        { status: 501 }
      );
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
          stability: 1.0,           // sp100 — very consistent
          similarity_boost: 0.5,    // s50
          style: 0.75,              // sb75 — strong expression
          use_speaker_boost: true,  // b
        },
      }),
    });

    if (res.status === 401) {
      // Key is invalid — update integration status
      if (clientId) {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (supabaseUrl && supabaseKey) {
          const supabase = createClient(supabaseUrl, supabaseKey);
          await supabase
            .from("client_integrations")
            .update({
              status: "auth_expired",
              last_error: "API key invalid or revoked",
              updated_at: new Date().toISOString(),
            })
            .eq("client_id", clientId)
            .eq("service", "elevenlabs");
        }
      }
      return NextResponse.json(
        { error: "ElevenLabs key invalid — reconnect in Settings" },
        { status: 501 }
      );
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
