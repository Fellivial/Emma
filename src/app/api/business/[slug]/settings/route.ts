import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

async function getServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) =>
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  );
}

async function resolveClient(slug: string, userId: string) {
  const supabase = await getServerSupabase();

  const { data: client } = await supabase
    .from("clients")
    .select("id, owner_email, sheets_id")
    .eq("slug", slug)
    .single();

  if (!client) return null;

  const { data: membership } = await supabase
    .from("client_members")
    .select("id")
    .eq("client_id", client.id)
    .eq("user_id", userId)
    .single();

  if (!membership) return null;

  return { supabase, client };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const resolved = await resolveClient(slug, user.id);
  if (!resolved) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    ownerEmail: resolved.client.owner_email ?? "",
    sheetsId: resolved.client.sheets_id ?? "",
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const resolved = await resolveClient(slug, user.id);
  if (!resolved) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const update: Record<string, string> = {};

  if (typeof body.ownerEmail === "string") update.owner_email = body.ownerEmail.trim();
  if (typeof body.sheetsId === "string") update.sheets_id = body.sheetsId.trim();

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { error } = await resolved.supabase
    .from("clients")
    .update(update)
    .eq("id", resolved.client.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
