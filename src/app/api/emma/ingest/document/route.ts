import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getUser } from "@/lib/supabase/server";
import { parseDocument } from "@/core/integrations/docparser";
import { extractTextFromImage, extractTextFromScannedPdf } from "@/core/integrations/ocr";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const SUPPORTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/tiff",
];

export async function POST(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const userId = user.id;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const label = (formData.get("label") as string | null) || "";

    if (!file) {
      return NextResponse.json(
        { success: false, error: "Missing required field: file" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: "File exceeds 10 MB limit" },
        { status: 413 }
      );
    }

    const mimeType = file.type;
    if (!SUPPORTED_TYPES.includes(mimeType)) {
      return NextResponse.json(
        { success: false, error: `Unsupported file type: ${mimeType}` },
        { status: 415 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let text = "";
    let pageCount: number | undefined;
    let ocrRequired = false;

    if (mimeType === "application/pdf") {
      const parsed = await parseDocument(buffer, mimeType);
      text = parsed.text;
      pageCount = parsed.pageCount;
      if (text.length < 100) {
        ocrRequired = true;
        const ocr = await extractTextFromScannedPdf(buffer);
        text = ocr.text;
        pageCount = ocr.pageCount;
      }
    } else if (
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const parsed = await parseDocument(buffer, mimeType);
      text = parsed.text;
    } else {
      const { text: ocrText } = await extractTextFromImage(buffer, mimeType);
      text = ocrText;
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: "Database not configured" },
        { status: 503 }
      );
    }

    const { data, error } = await supabase
      .from("ingested_documents")
      .insert({
        user_id: userId,
        label: label || file.name,
        mime_type: mimeType,
        character_count: text.length,
        extracted_text: text,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (ocrRequired) {
      return NextResponse.json({
        success: true,
        documentId: data.id,
        characterCount: text.length,
        ocrRequired: true,
        message: "Scanned PDF detected — OCR pipeline needed",
        preview: text.slice(0, 500),
      });
    }

    return NextResponse.json({
      success: true,
      documentId: data.id,
      characterCount: text.length,
      preview: text.slice(0, 500),
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
