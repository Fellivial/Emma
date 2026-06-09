export const runtime = "nodejs";
// 90 s: scanned PDFs with up to 5 pages can take ~35 s for mupdf rasterization + Tesseract OCR.
export const maxDuration = 90;

import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { parseDocument } from "@/core/integrations/docparser";
import { extractTextFromImage, extractTextFromScannedPdf } from "@/core/integrations/ocr";
import { recursiveCharacterSplit } from "@/core/text-splitter";
import { embedBatch } from "@/lib/embeddings";
import { getPlan } from "@/core/pricing";

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4 MB — Vercel body limit is 4.5 MB

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

// ─── POST — upload, extract, chunk, embed, store ──────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const planId = await getPlanId(user.id);
    if (!getPlan(planId).features.customPersona) {
      return NextResponse.json(
        { success: false, error: "Document ingestion requires a Pro or Enterprise plan" },
        { status: 403 }
      );
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: "Database not configured" },
        { status: 503 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const label = (formData.get("label") as string | null)?.trim() || "";

    if (!file) {
      return NextResponse.json({ success: false, error: "Missing field: file" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: "File exceeds 4 MB limit",
          asyncRequired: true,
          hint: "Use GET /api/emma/ingest/document/presign to upload files up to 20 MB asynchronously",
        },
        { status: 413 }
      );
    }
    if (!SUPPORTED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: `Unsupported file type: ${file.type}` },
        { status: 415 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type;

    // ── Deduplication guard ──────────────────────────────────────────────────
    // Hash the raw bytes before doing any expensive OCR/parsing work.
    // If this user already has a document with the same hash, return it.
    const contentHash = createHash("sha256").update(buffer).digest("hex");
    const { data: existingDoc } = await supabase
      .from("ingested_documents")
      .select("id, label, character_count, chunk_count")
      .eq("user_id", user.id)
      .eq("content_hash", contentHash)
      .maybeSingle();

    if (existingDoc) {
      return NextResponse.json({
        success: true,
        duplicate: true,
        documentId: existingDoc.id,
        characterCount: existingDoc.character_count,
        chunkCount: existingDoc.chunk_count,
        message: `Duplicate of existing document "${existingDoc.label}" (id: ${existingDoc.id})`,
      });
    }
    // ────────────────────────────────────────────────────────────────────────

    let extractedText = "";

    if (mimeType === "application/pdf") {
      const parsed = await parseDocument(buffer, mimeType);
      extractedText = parsed.text;
      if (extractedText.length < 100) {
        const ocr = await extractTextFromScannedPdf(buffer);
        extractedText = ocr.text;
      }
    } else if (
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const parsed = await parseDocument(buffer, mimeType);
      extractedText = parsed.text;
    } else if (mimeType === "text/plain") {
      extractedText = buffer.toString("utf-8");
    } else {
      const { text } = await extractTextFromImage(buffer, mimeType);
      extractedText = text;
    }

    if (!extractedText.trim()) {
      return NextResponse.json(
        { success: false, error: "Could not extract text from document" },
        { status: 422 }
      );
    }

    const chunks = recursiveCharacterSplit(extractedText, 1000, 150);

    // Embed all chunks in one batch — fail-open (store without embeddings if API errors)
    let embeddings: number[][] = [];
    try {
      embeddings = await embedBatch(chunks);
    } catch (e) {
      console.error("[ingest] embedding error:", (e as Error).message);
    }

    const { data: doc, error: docErr } = await supabase
      .from("ingested_documents")
      .insert({
        user_id: user.id,
        label: label || file.name,
        mime_type: mimeType,
        character_count: extractedText.length,
        chunk_count: chunks.length,
        extracted_text: extractedText,
        content_hash: contentHash,
      })
      .select("id")
      .single();

    if (docErr || !doc) {
      return NextResponse.json(
        { success: false, error: docErr?.message ?? "Insert failed" },
        { status: 500 }
      );
    }

    // Insert chunks in batches of 100 to avoid request-size limits
    const rows = chunks.map((chunk_text, i) => ({
      user_id: user.id,
      doc_id: doc.id as string,
      chunk_index: i,
      chunk_text,
      // pgvector expects a literal array string: '[0.1, 0.2, ...]'
      embedding: embeddings[i] ? `[${embeddings[i].join(",")}]` : null,
    }));

    for (let i = 0; i < rows.length; i += 100) {
      const { error: chunkErr } = await supabase
        .from("document_chunks")
        .insert(rows.slice(i, i + 100));
      if (chunkErr) console.error("[ingest] chunk insert error:", chunkErr.message);
    }

    return NextResponse.json({
      success: true,
      documentId: doc.id,
      characterCount: extractedText.length,
      chunkCount: chunks.length,
      embeddingsGenerated: embeddings.length > 0,
      preview: extractedText.slice(0, 300),
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: (err as Error)?.message ?? String(err) },
      { status: 500 }
    );
  }
}

// ─── GET — list user's ingested documents ────────────────────────────────────

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ documents: [] });

  const { data, error } = await supabase
    .from("ingested_documents")
    .select("id, label, mime_type, character_count, chunk_count, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ documents: data ?? [] });
}

// ─── DELETE — remove document and its chunks (CASCADE) ───────────────────────

export async function DELETE(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const docId = new URL(req.url).searchParams.get("id");
  if (!docId) return NextResponse.json({ error: "Missing ?id=" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "No DB" }, { status: 500 });

  const { error } = await supabase
    .from("ingested_documents")
    .delete()
    .eq("id", docId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
