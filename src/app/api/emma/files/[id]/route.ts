import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

const ANTHROPIC_FILES_URL = "https://api.anthropic.com/v1/files";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// DELETE /api/emma/files/[id] — delete a file from Anthropic and Supabase
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const rowId = params.id;

  // Fetch the row to verify ownership and get the Anthropic file_id
  const { data: row, error: fetchErr } = await supabase
    .from("user_files")
    .select("file_id")
    .eq("id", rowId)
    .eq("user_id", user.id)
    .single();

  if (fetchErr || !row) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  // Delete from Anthropic (best-effort — don't fail if already gone)
  await fetch(`${ANTHROPIC_FILES_URL}/${row.file_id}`, {
    method: "DELETE",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "files-api-2025-04-14",
    },
  }).catch(() => {});

  // Delete from Supabase
  const { error: delErr } = await supabase
    .from("user_files")
    .delete()
    .eq("id", rowId)
    .eq("user_id", user.id);

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  return NextResponse.json({ deleted: true });
}
