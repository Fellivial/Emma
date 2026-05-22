import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

const ANTHROPIC_FILES_URL = "https://api.anthropic.com/v1/files";
const ANTHROPIC_BETA = "files-api-2025-04-14";
const MAX_FILE_BYTES = 500 * 1024 * 1024; // 500 MB per Anthropic limit

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function anthropicHeaders() {
  return {
    "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
    "anthropic-version": "2023-06-01",
    "anthropic-beta": ANTHROPIC_BETA,
  };
}

// GET /api/emma/files — list the authenticated user's uploaded files
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const { data, error } = await supabase
    .from("user_files")
    .select("id, file_id, name, media_type, size_bytes, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ files: data ?? [] });
}

// POST /api/emma/files — upload a file to Anthropic and store metadata
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data" }, { status: 400 });
  }

  const fileEntry = formData.get("file");
  if (!fileEntry || typeof fileEntry === "string") {
    return NextResponse.json({ error: "No file field in form data" }, { status: 400 });
  }

  const file = fileEntry as File;
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File exceeds 500 MB limit" }, { status: 413 });
  }

  // Forward to Anthropic Files API
  const upstream = new FormData();
  upstream.append("file", file, file.name);

  const anthropicRes = await fetch(ANTHROPIC_FILES_URL, {
    method: "POST",
    headers: anthropicHeaders(),
    body: upstream,
  });

  if (!anthropicRes.ok) {
    const body = await anthropicRes.text();
    return NextResponse.json(
      { error: `Anthropic Files API error ${anthropicRes.status}: ${body}` },
      { status: 502 }
    );
  }

  const uploaded = await anthropicRes.json();
  const fileId: string = uploaded.id;

  // Persist metadata in Supabase
  const { error: dbErr } = await supabase.from("user_files").insert({
    user_id: user.id,
    file_id: fileId,
    name: file.name,
    media_type: file.type || "application/octet-stream",
    size_bytes: file.size,
  });

  if (dbErr) {
    // Best-effort cleanup: delete from Anthropic if we can't record it
    await fetch(`${ANTHROPIC_FILES_URL}/${fileId}`, {
      method: "DELETE",
      headers: anthropicHeaders(),
    }).catch(() => {});
    return NextResponse.json({ error: "Failed to store file metadata" }, { status: 500 });
  }

  return NextResponse.json({
    file_id: fileId,
    name: file.name,
    media_type: file.type || "application/octet-stream",
    size_bytes: file.size,
  });
}
