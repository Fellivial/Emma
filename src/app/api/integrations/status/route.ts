import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

const ALL_SERVICES = [
  "elevenlabs",
  "gmail",
  "google_calendar",
  "google_drive",
  "hubspot",
  "slack",
  "notion",
];

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

    const integrations: Record<string, any> = {};

    for (const svc of ALL_SERVICES) {
      integrations[svc] = {
        status: "disconnected",
        accountIdentifier: null,
        lastUsedAt: null,
        lastError: null,
      };
    }

    if (membership) {
      const { data: rows } = await supabase
        .from("client_integrations")
        .select("service, status, account_identifier, last_used_at, last_error, voice_id, metadata")
        .eq("client_id", membership.client_id);

      for (const row of rows || []) {
        const entry: Record<string, any> = {
          status: row.status,
          accountIdentifier: row.account_identifier,
          lastUsedAt: row.last_used_at,
          lastError: row.last_error,
        };
        // ElevenLabs: include voice info
        if (row.service === "elevenlabs") {
          entry.voiceId = row.voice_id || null;
          entry.voiceName = row.metadata?.voiceName || "Rachel (default)";
        }
        integrations[row.service] = entry;
      }
    }

    return NextResponse.json({ integrations });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
