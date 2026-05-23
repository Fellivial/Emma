import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerSupabase();
  if (!supabase) return NextResponse.json({ messages: [] });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, role, content, display, expression, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) console.error("[/api/emma/history GET]", error.message);
  return NextResponse.json({ messages: data || [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  if (!supabase) return NextResponse.json({ ok: true });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  const { error } = await supabase.from("chat_messages").upsert(rows, { onConflict: "id" });
  if (error) console.error("[/api/emma/history POST]", error.message);
  return NextResponse.json({ ok: true });
}
