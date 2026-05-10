import { parsePdf } from "./docparser";

const SUPPORTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/tiff"];

export async function extractTextFromImage(
  buffer: Buffer,
  mimeType: string
): Promise<{ text: string; confidence: number }> {
  if (!SUPPORTED_IMAGE_TYPES.includes(mimeType)) {
    return { text: "", confidence: 0 };
  }
  let worker: any = null;
  try {
    const { createWorker } = await import("tesseract.js");
    worker = await createWorker("eng");
    const { data } = await worker.recognize(buffer);
    return {
      text: data.text.replace(/\n{4,}/g, "\n\n").trim(),
      confidence: data.confidence,
    };
  } catch (err: any) {
    const msg = err?.message || String(err);
    return { text: `OCR failed: ${msg}`, confidence: 0 };
  } finally {
    if (worker) await worker.terminate().catch(() => {});
  }
}

export async function extractTextFromScannedPdf(
  buffer: Buffer
): Promise<{ text: string; pageCount: number }> {
  try {
    const { text, pageCount } = await parsePdf(buffer);
    if (text.length >= 100) {
      return { text, pageCount };
    }
    // Scanned/image-based PDF — full OCR requires pdf-to-image conversion
    return {
      text: "Document appears to be a scanned PDF. For full OCR, configure a pdf-to-image service.",
      pageCount,
    };
  } catch {
    return { text: "", pageCount: 0 };
  }
}
