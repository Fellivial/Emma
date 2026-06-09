import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decrypt } from "@/core/security/encryption";
import { getUser } from "@/lib/supabase/server";

const ELEVENLABS_API = "https://api.elevenlabs.io/v1";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export interface VoiceOption {
  voiceId: string;
  name: string;
  category: "cloned" | "generated" | "premade" | "professional";
  previewUrl: string | null;
}

export async function GET() {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return NextResponse.json({ error: "DB not configured" }, { status: 501 });

    const { data: membership } = await supabase
      .from("client_members")
      .select("client_id")
      .eq("user_id", user.id)
      .single();
    if (!membership) {
      console.error("[elevenlabs/voices] no client_members row for user", user.id);
      return NextResponse.json({ error: "No client" }, { status: 404 });
    }

    const { data: integration, error: intErr } = await supabase
      .from("client_integrations")
      .select("access_token, status, metadata")
      .eq("client_id", membership.client_id)
      .eq("service", "elevenlabs")
      .single();

    if (intErr || !integration) {
      console.error("[elevenlabs/voices] no integration row:", intErr?.message);
      return NextResponse.json({ error: "ElevenLabs not connected" }, { status: 404 });
    }

    if (integration.status !== "connected") {
      console.error(
        "[elevenlabs/voices] integration status is",
        integration.status,
        "(not connected)"
      );
      return NextResponse.json(
        { error: `ElevenLabs integration status: ${integration.status}` },
        { status: 400 }
      );
    }

    const apiKey = decrypt(integration.access_token);
    if (!apiKey || apiKey.startsWith("[")) {
      console.error("[elevenlabs/voices] decryption failed:", apiKey);
      return NextResponse.json(
        { error: "Could not decrypt stored key — reconnect ElevenLabs" },
        { status: 500 }
      );
    }

    const voicesRes = await fetch(`${ELEVENLABS_API}/voices`, {
      headers: { "xi-api-key": apiKey },
    });

    if (voicesRes.status === 401) {
      // Don't write auth_expired here — the TTS route is the authoritative usage path.
      // A background voices fetch should not silently break TTS on a transient ElevenLabs 401.
      return NextResponse.json(
        { error: "API key invalid — reconnect ElevenLabs in Settings" },
        { status: 401 }
      );
    }
    if (!voicesRes.ok) {
      return NextResponse.json({ error: "ElevenLabs API error" }, { status: 502 });
    }

    const voicesData = await voicesRes.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawVoices: any[] = voicesData.voices || [];

    const voices: VoiceOption[] = rawVoices.map((v) => ({
      voiceId: v.voice_id,
      name: v.name,
      category: v.category || "premade",
      previewUrl: v.preview_url || null,
    }));

    // Sort: cloned/generated first, premade/professional last
    voices.sort((a, b) => {
      const rank = (cat: string) =>
        cat === "cloned" ? 0 : cat === "generated" ? 1 : cat === "professional" ? 2 : 3;
      return rank(a.category) - rank(b.category);
    });

    return NextResponse.json({
      voices,
      currentVoiceId: integration.metadata?.voiceId || null,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
