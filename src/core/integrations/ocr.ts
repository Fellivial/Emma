import { enforceCostGate, recordCostResult, type CostGateInput } from "@/core/cost-gate";

const SUPPORTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/tiff"];
type OcrCostContext = Pick<CostGateInput, "userId" | "clientId" | "planId">;

// Cap scanned PDF page count to keep well within serverless timeout.
// Tesseract ~3-7 s/page × 5 pages = ~35 s worst case; comfortably within maxDuration=90.
const MAX_SCANNED_PAGES = 5;

export async function extractTextFromImage(
  buffer: Buffer,
  mimeType: string,
  context: OcrCostContext
): Promise<{ text: string; confidence: number }> {
  if (!SUPPORTED_IMAGE_TYPES.includes(mimeType)) {
    return { text: "", confidence: 0 };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let worker: any = null;
  const cost = await enforceCostGate({ operation: "ocr", ...context });
  if (!cost.allowed) return { text: "", confidence: 0 };
  try {
    const { createWorker } = await import("tesseract.js");
    worker = await createWorker("eng");
    const { data } = await worker.recognize(buffer);
    await recordCostResult(cost, { units: 1, success: true });
    return {
      text: data.text.replace(/\n{4,}/g, "\n\n").trim(),
      confidence: data.confidence,
    };
  } catch (err) {
    await recordCostResult(cost, { units: 1, success: false });
    const msg = (err as Error)?.message || String(err);
    return { text: `OCR failed: ${msg}`, confidence: 0 };
  } finally {
    if (worker) await worker.terminate().catch(() => {});
  }
}

export async function extractTextFromScannedPdf(
  buffer: Buffer,
  context: OcrCostContext
): Promise<{ text: string; pageCount: number }> {
  let pageCount = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let worker: any = null;
  const cost = await enforceCostGate({ operation: "ocr", ...context });
  if (!cost.allowed) return { text: "", pageCount: 0 };
  try {
    // mupdf is a pure-WASM PDF renderer — no native binaries needed on Vercel.
    const { default: mupdf } = await import("mupdf");
    const { createWorker } = await import("tesseract.js");

    const doc = mupdf.Document.openDocument(buffer, "application/pdf");
    pageCount = doc.countPages();
    const pagesToProcess = Math.min(pageCount, MAX_SCANNED_PAGES);

    // 144 DPI (2× PDF default) gives good Tesseract accuracy without huge memory usage.
    const matrix = mupdf.Matrix.scale(2, 2);

    worker = await createWorker("eng");
    const pageTexts: string[] = [];

    for (let i = 0; i < pagesToProcess; i++) {
      const page = doc.loadPage(i);
      const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false);
      const pngData = pixmap.asPNG();
      const {
        data: { text },
      } = await worker.recognize(Buffer.from(pngData));
      if (text.trim()) pageTexts.push(text.replace(/\n{4,}/g, "\n\n").trim());
    }

    let text = pageTexts.join("\n\n");
    if (pageCount > MAX_SCANNED_PAGES) {
      text += `\n\n[Note: Document has ${pageCount} pages. Only the first ${MAX_SCANNED_PAGES} were processed.]`;
    }

    await recordCostResult(cost, { units: Math.max(1, pageCount), success: true });
    return { text: text.trim(), pageCount };
  } catch (err) {
    await recordCostResult(cost, { units: Math.max(1, pageCount), success: false });
    console.error("[ocr] scanned PDF rasterization failed:", (err as Error)?.message ?? err);
    return { text: "", pageCount };
  } finally {
    if (worker) await worker.terminate().catch(() => {});
  }
}
