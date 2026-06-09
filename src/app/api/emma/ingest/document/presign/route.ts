export const runtime = "nodejs";

import { inngest } from "@/inngest/client";
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getPlan } from "@/core/pricing";

// 20 MB — matches the Storage bucket file_size_limit
const ASYNC_MAX_FILE_SIZE = 20 * 1024 * 1024;

const SUPPORTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/tiff",
  "text/plain",
];

async function getPlanId(userId: string): Promise<string> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return "free";
    const { data } = await supabase
      .from("client_members")
      .select("client_id")
      .eq("user_id", userId)
      .single();
    if (!data?.client_id) return "free";
    const { data: client } = await supabase
      .from("clients")
      .select("plan_id")
      .eq("id", data.client_id)
      .single();
    return (client?.plan_id as string) ?? "free";
  } catch {
    return "free";
  }
}

/**
 * GET /api/emma/ingest/document/presign
 *
 * Returns a short-lived Supabase Storage signed upload URL so the client can
 * POST a file > 4 MB directly to Storage (bypassing Vercel's 4.5 MB body limit).
 *
 * Query params:
 *   filename  — original file name (used to build storage_path)
 *   mimeType  — MIME type of the file
 *   size      — file size in bytes
 *   label     — optional display label
 *
 * Response:
 *   { documentId, uploadUrl, storagePath, expiresIn }
 *
 * After uploading, the client must POST to /api/emma/ingest/document/presign
 * with { documentId } to trigger the Inngest processing job.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const planId = await getPlanId(user.id);
    if (!getPlan(planId).features.customPersona) {
      return NextResponse.json(
        { error: "Document ingestion requires a Pro or Enterprise plan" },
        { status: 403 }
      );
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const { searchParams } = new URL(req.url);
    const filename = searchParams.get("filename")?.trim();
    const mimeType = searchParams.get("mimeType")?.trim();
    const size = parseInt(searchParams.get("size") ?? "0", 10);
    const label = searchParams.get("label")?.trim() || filename || "document";

    if (!filename || !mimeType) {
      return NextResponse.json({ error: "Missing filename or mimeType" }, { status: 400 });
    }
    if (!SUPPORTED_TYPES.includes(mimeType)) {
      return NextResponse.json({ error: `Unsupported file type: ${mimeType}` }, { status: 415 });
    }
    if (size > ASYNC_MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File exceeds 20 MB limit" }, { status: 413 });
    }

    // Build a storage path that is unique per user + upload timestamp
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${user.id}/${Date.now()}-${safeFilename}`;

    // Create a placeholder document row in status=pending so the client has a documentId
    const { data: doc, error: docErr } = await supabase
      .from("ingested_documents")
      .insert({
        user_id: user.id,
        label,
        mime_type: mimeType,
        character_count: 0,
        chunk_count: 0,
        status: "pending",
        storage_path: storagePath,
      })
      .select("id")
      .single();

    if (docErr || !doc) {
      return NextResponse.json(
        { error: docErr?.message ?? "Failed to create document record" },
        { status: 500 }
      );
    }

    // Generate a 60-minute signed upload URL — Storage validates MIME + size limits
    const { data: signedData, error: signErr } = await supabase.storage
      .from("document-ingestion")
      .createSignedUploadUrl(storagePath);

    if (signErr || !signedData) {
      // Roll back the placeholder row so the user can retry
      await supabase.from("ingested_documents").delete().eq("id", doc.id);
      return NextResponse.json(
        { error: signErr?.message ?? "Failed to create upload URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      documentId: doc.id,
      uploadUrl: signedData.signedUrl,
      storagePath,
      expiresIn: 3600,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error)?.message ?? String(err) }, { status: 500 });
  }
}

/**
 * POST /api/emma/ingest/document/presign
 *
 * Called by the client after a successful Storage upload to trigger
 * the background Inngest processing job.
 *
 * Body: { documentId: string }
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const { documentId } = (await req.json()) as { documentId?: string };
    if (!documentId) {
      return NextResponse.json({ error: "Missing documentId" }, { status: 400 });
    }

    // Verify ownership + that the document is still pending
    const { data: doc } = await supabase
      .from("ingested_documents")
      .select("id, status")
      .eq("id", documentId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    if (doc.status !== "pending") {
      return NextResponse.json(
        { error: `Document is already in status: ${doc.status}` },
        { status: 409 }
      );
    }

    // Send the Inngest event — the documentProcess function picks it up
    await inngest.send({
      name: "document/process",
      data: { documentId, userId: user.id },
    });

    return NextResponse.json({ ok: true, documentId, status: "queued" });
  } catch (err) {
    return NextResponse.json({ error: (err as Error)?.message ?? String(err) }, { status: 500 });
  }
}
