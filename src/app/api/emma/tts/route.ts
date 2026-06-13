import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decrypt } from "@/core/security/encryption";
import { getUser } from "@/lib/supabase/server";
import type { AvatarExpression } from "@/types/emma";

const ELEVENLABS_API = "https://api.elevenlabs.io/v1";
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel

const EXPRESSION_VOICE_SETTINGS: Record<
  AvatarExpression,
  { stability: number; similarity_boost: number; style: number; speed: number }
> = {
  neutral: { stability: 0.55, similarity_boost: 0.75, style: 0.0, speed: 1.0 },
  warm: { stability: 0.4, similarity_boost: 0.75, style: 0.2, speed: 0.9 },
  flirty: { stability: 0.2, similarity_boost: 0.75, style: 0.5, speed: 0.82 },
  amused: { stability: 0.25, similarity_boost: 0.75, style: 0.3, speed: 0.95 },
  smirk: { stability: 0.25, similarity_boost: 0.75, style: 0.3, speed: 0.95 },
  concerned: { stability: 0.45, similarity_boost: 0.75, style: 0.1, speed: 0.88 },
  sad: { stability: 0.3, similarity_boost: 0.75, style: 0.1, speed: 0.8 },
  skeptical: { stability: 0.5, similarity_boost: 0.75, style: 0.1, speed: 1.0 },
  listening: { stability: 0.55, similarity_boost: 0.75, style: 0.0, speed: 0.92 },
  idle_bored: { stability: 0.3, similarity_boost: 0.75, style: 0.0, speed: 0.78 },
};

// Short-lived cache so repeated TTS calls don't re-query Supabase on every message.
interface TtsCacheEntry {
  apiKey: string;
  voiceId: string | null; // from client_integrations.metadata.voiceId (global default)
  personaVoiceId: string | null; // from personas.voice_id (per-persona override, higher priority)
  clientId: string;
  ts: number;
}
const ttsCache = new Map<string, TtsCacheEntry>();
const TTS_CACHE_TTL = 60_000; // 60 s

export async function POST(req: NextRequest) {
  const sessionUser = await getUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { text, voiceId, expression } = await req.json();

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    // ── Resolve ElevenLabs API key via session user ─────────────────────
    // Look up the client's ElevenLabs integration using the authenticated session.
    // No clientId needed from the request body — session cookie is sufficient.

    let apiKey: string | null = null;
    let storedVoiceId: string | null = null;
    let personaVoiceId: string | null = null;
    let resolvedClientId: string | null = null;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Check cache first to avoid repeated Supabase round-trips on every TTS call
    const cached = ttsCache.get(sessionUser.id);
    if (cached && Date.now() - cached.ts < TTS_CACHE_TTL) {
      apiKey = cached.apiKey;
      storedVoiceId = cached.voiceId;
      personaVoiceId = cached.personaVoiceId;
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

            // Load per-persona voice override (higher priority than integration default).
            const { data: personaRow } = await supabase
              .from("personas")
              .select("voice_id")
              .eq("user_id", sessionUser.id)
              .maybeSingle();
            if (personaRow?.voice_id) {
              try {
                const dec = decrypt(personaRow.voice_id as string);
                if (dec && !dec.startsWith("[")) personaVoiceId = dec;
              } catch {}
            }

            ttsCache.set(sessionUser.id, {
              apiKey: decrypted,
              voiceId: storedVoiceId,
              personaVoiceId,
              clientId: resolvedClientId!,
              ts: Date.now(),
            });
          } else if (decrypted?.startsWith("[")) {
            console.error("[EMMA TTS] ElevenLabs key decrypt error for user", sessionUser.id);
          }
        }
      }
    }

    // No key available — signal client to use Web Speech (204 = silent, not an error)
    if (!apiKey) {
      return new NextResponse(null, { status: 204 });
    }

    // ── Call ElevenLabs ─────────────────────────────────────────────────
    // Priority: request voiceId → persona voice_id → integration default → Rachel
    const voice = voiceId || personaVoiceId || storedVoiceId || DEFAULT_VOICE_ID;
    const voiceSettings =
      EXPRESSION_VOICE_SETTINGS[(expression as AvatarExpression) ?? "neutral"] ??
      EXPRESSION_VOICE_SETTINGS.neutral;

    const res = await fetch(`${ELEVENLABS_API}/text-to-speech/${voice}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text: text.slice(0, 1000),
        model_id: "eleven_turbo_v2_5",
        voice_settings: { ...voiceSettings, use_speaker_boost: true },
      }),
    });

    if (res.status === 401) {
      ttsCache.delete(sessionUser.id);
      const errBody = await res.text().catch(() => "");
      console.error("[EMMA TTS] ElevenLabs 401 body:", errBody || "(empty)");
      let elErrDetail = "API key invalid or revoked";
      let isPlanRestriction = false;
      try {
        const parsed = JSON.parse(errBody) as { detail?: { status?: string; message?: string } };
        if (parsed?.detail?.status === "missing_permissions") {
          elErrDetail =
            "API key is missing the text_to_speech scope — reconnect with a key that has Text to Speech scope enabled";
        } else if (parsed?.detail?.message) {
          elErrDetail = parsed.detail.message;
          const msg = elErrDetail.toLowerCase();
          // Plan/subscription restrictions affect the voice, not the API key itself.
          if (
            msg.includes("not available on your current plan") ||
            msg.includes("upgrade your subscription") ||
            msg.includes("cloned voices") ||
            msg.includes("professional voices")
          ) {
            isPlanRestriction = true;
          }
        }
      } catch {}

      if (isPlanRestriction && voice !== DEFAULT_VOICE_ID) {
        // The API key is valid — only this voice requires a higher plan.
        // Fall back to Rachel rather than disconnecting the integration.
        console.warn(`[EMMA TTS] Voice ${voice} plan-restricted, falling back to Rachel`);
        // Best-effort: clear the stored voiceId so future calls use Rachel directly.
        if (resolvedClientId && supabaseUrl && supabaseKey) {
          const supabase = createClient(supabaseUrl, supabaseKey);
          // Wrap in Promise.resolve so .catch() is available (PromiseLike → Promise)
          void Promise.resolve(
            supabase
              .from("client_integrations")
              .select("metadata")
              .eq("client_id", resolvedClientId)
              .eq("service", "elevenlabs")
              .single()
          )
            .then(({ data: ci }) => {
              if (!ci?.metadata) return;
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const {
                voiceId: _v,
                voiceName: _n,
                ...rest
              } = ci.metadata as Record<string, unknown>;
              return supabase
                .from("client_integrations")
                .update({
                  metadata: { ...rest, voiceName: "Rachel (default)" },
                  updated_at: new Date().toISOString(),
                })
                .eq("client_id", resolvedClientId!)
                .eq("service", "elevenlabs");
            })
            .catch(() => {});
        }
        const fallbackRes = await fetch(`${ELEVENLABS_API}/text-to-speech/${DEFAULT_VOICE_ID}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
          body: JSON.stringify({
            text: text.slice(0, 1000),
            model_id: "eleven_turbo_v2_5",
            voice_settings: { ...voiceSettings, use_speaker_boost: true },
          }),
        });
        if (fallbackRes.ok) {
          const fallbackBuffer = await fallbackRes.arrayBuffer();
          return new NextResponse(fallbackBuffer, {
            status: 200,
            headers: {
              "Content-Type": "audio/mpeg",
              "Content-Length": fallbackBuffer.byteLength.toString(),
            },
          });
        }
        return new NextResponse(null, { status: 204 });
      }

      if (resolvedClientId && supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey);
        await supabase
          .from("client_integrations")
          .update({
            status: "auth_expired",
            last_error: elErrDetail,
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

    // Read concurrency headers for throttle awareness (ElevenLabs BYOK plan limits)
    const currentConcurrent = res.headers.get("current-concurrent-requests");
    const maxConcurrent = res.headers.get("maximum-concurrent-requests");
    if (currentConcurrent && maxConcurrent) {
      const cur = Number(currentConcurrent);
      const max = Number(maxConcurrent);
      if (!isNaN(cur) && !isNaN(max) && max > 0 && cur / max >= 0.8) {
        console.warn(
          `[EMMA TTS] ElevenLabs concurrency at ${cur}/${max} — approaching limit for user ${sessionUser.id}`
        );
      }
    }

    const audioBuffer = await res.arrayBuffer();

    const responseHeaders: Record<string, string> = {
      "Content-Type": "audio/mpeg",
      "Content-Length": audioBuffer.byteLength.toString(),
    };
    if (currentConcurrent) responseHeaders["x-el-concurrent"] = currentConcurrent;
    if (maxConcurrent) responseHeaders["x-el-concurrent-max"] = maxConcurrent;

    return new NextResponse(audioBuffer, { status: 200, headers: responseHeaders });
  } catch (err) {
    console.error("[EMMA TTS] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
