import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const maxDuration = 30;

const OPENAI_STT_URL = "https://api.openai.com/v1/audio/transcriptions";

function mimeToExtension(mimeType: string): string {
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Plan gate: server-side STT is Starter+ only
  const supabase = getSupabaseAdmin();
  let planId = "free";
  if (supabase) {
    const { data: membership } = await supabase
      .from("client_members")
      .select("client_id, clients(plan_id)")
      .eq("user_id", user.id)
      .limit(1)
      .single();
    planId = (membership as { clients?: { plan_id?: string } } | null)?.clients?.plan_id ?? "free";
  }

  if (planId === "free") {
    return NextResponse.json(
      { error: "Server-side STT requires Starter plan or above" },
      { status: 403 }
    );
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return NextResponse.json({ error: "Server-side STT not configured" }, { status: 501 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const audio = formData.get("audio") as File | null;
  const mimeType = (formData.get("mimeType") as string | null) || "audio/webm";

  if (!audio || audio.size === 0) {
    return NextResponse.json({ error: "No audio provided" }, { status: 400 });
  }

  // Starter → cheaper model; Pro/Enterprise → higher accuracy model
  const model = planId === "starter" ? "gpt-4o-mini-transcribe" : "gpt-4o-transcribe";
  const ext = mimeToExtension(mimeType);

  const outForm = new FormData();
  outForm.append("file", audio, `audio.${ext}`);
  outForm.append("model", model);

  let res: Response;
  try {
    res = await fetch(OPENAI_STT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: outForm,
    });
  } catch (err) {
    console.error("[STT] Network error calling OpenAI:", err);
    return NextResponse.json({ error: "Transcription service unreachable" }, { status: 502 });
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(`[STT] OpenAI error ${res.status}:`, errText.slice(0, 200));
    return NextResponse.json({ error: "Transcription failed" }, { status: 502 });
  }

  const data = (await res.json()) as { text?: string };
  return NextResponse.json({ transcript: data.text ?? "" });
}
