import { NextRequest, NextResponse } from "next/server";

// Default to Rachel voice — warm, expressive female voice
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
const ELEVENLABS_API = "https://api.elevenlabs.io/v1";

export async function POST(req: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY;

  // Graceful fallback: if no key, client will use Web Speech API
  if (!apiKey) {
    return NextResponse.json(
      { error: "ELEVENLABS_API_KEY not set — falling back to Web Speech" },
      { status: 501 }
    );
  }

  try {
    const { text, voiceId } = await req.json();

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    const voice = voiceId || DEFAULT_VOICE_ID;

    const res = await fetch(`${ELEVENLABS_API}/text-to-speech/${voice}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text: text.slice(0, 1000), // Cap at 1000 chars
        model_id: "eleven_turbo_v2_5",
        voice_settings: {
          stability: 0.4,        // Lower = more expressive
          similarity_boost: 0.8,
          style: 0.6,            // Expressiveness
          use_speaker_boost: true,
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[EMMA TTS] ElevenLabs error:", res.status, errText);
      return NextResponse.json(
        { error: `ElevenLabs API ${res.status}` },
        { status: 502 }
      );
    }

    // Stream audio bytes back
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
