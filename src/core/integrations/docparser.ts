import mammoth from "mammoth";

// Cached at module level — dynamic import handles CJS/ESM interop under moduleResolution:bundler
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _pdfParse: ((buf: Buffer) => Promise<{ text: string; numpages: number }>) | null = null;
async function getPdfParse() {
  if (!_pdfParse) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import("pdf-parse");
    _pdfParse = typeof mod.default === "function" ? mod.default : mod;
  }
  return _pdfParse!;
}

export async function parsePdf(buffer: Buffer): Promise<{ text: string; pageCount: number }> {
  try {
    const fn = await getPdfParse();
    const data = await fn(buffer);
    const text = data.text
      .replace(/[ \t]{3,}/g, "  ")
      .replace(/\n{4,}/g, "\n\n")
      .trim();
    return { text, pageCount: data.numpages };
  } catch {
    return { text: "", pageCount: 0 };
  }
}

export async function parseDocx(buffer: Buffer): Promise<{ text: string }> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value.replace(/\n{4,}/g, "\n\n").trim();
    return { text };
  } catch {
    return { text: "" };
  }
}

export async function parseDocument(
  buffer: Buffer,
  mimeType: string
): Promise<{ text: string; pageCount?: number; mimeType: string; characterCount: number }> {
  if (mimeType === "application/pdf") {
    const { text, pageCount } = await parsePdf(buffer);
    return { text, pageCount, mimeType, characterCount: text.length };
  }
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const { text } = await parseDocx(buffer);
    return { text, mimeType, characterCount: text.length };
  }
  return { text: "", characterCount: 0, mimeType };
}
