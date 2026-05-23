import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getUser } from "@/lib/supabase/server";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ messages: [] });

  const { data } = await supabase
    .from("chat_messages")
    .select("id, role, content, display, expression, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(50);

  return NextResponse.json({ messages: data || [] });
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ ok: true });

  const body = await req.json();
  const msgs: Array<{
    id: string;
    role: string;
    content: string;
    display: string;
    expression?: string;
    timestamp?: number;
  }> = Array.isArray(body) ? body : [body];

  const rows = msgs.map((m) => ({
    id: m.id,
    user_id: user.id,
    role: m.role,
    content: m.content,
    display: m.display,
    expression: m.expression ?? null,
    created_at: m.timestamp ? new Date(m.timestamp).toISOString() : undefined,
  }));

  await supabase.from("chat_messages").upsert(rows, { onConflict: "id" });
  return NextResponse.json({ ok: true });
}
