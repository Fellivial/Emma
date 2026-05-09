/**
 * Document Generation — DOCX and PDF.
 * Uploads to Supabase Storage bucket "task-documents" (returns signed URL).
 * Falls back to /tmp/{taskId}_{filename} if storage is unavailable.
 *
 * Requires bucket "task-documents" in Supabase Storage with authenticated access.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import { Document, Paragraph, TextRun, HeadingLevel, Packer } from "docx";
import PDFDocument from "pdfkit";

export interface DocGenResult {
  success: boolean;
  output: string;
  filePath?: string;
  url?: string;
}

function getStorageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function uploadToStorage(
  buffer: Buffer,
  userId: string,
  storagePath: string,
  contentType: string
): Promise<string | null> {
  const supabase = getStorageClient();
  if (!supabase) return null;

  const { error } = await supabase.storage
    .from("task-documents")
    .upload(storagePath, buffer, { upsert: true, contentType });

  if (error) return null;

  const { data } = await supabase.storage
    .from("task-documents")
    .createSignedUrl(storagePath, 3600);

  return data?.signedUrl ?? null;
}

function safeName(filename: string, ext: string): string {
  return path.basename(filename.replace(/\.[^.]+$/, "")) + ext;
}

export async function generateDocx(
  taskId: string,
  filename: string,
  title: string,
  content: string,
  userId?: string
): Promise<DocGenResult> {
  const name = safeName(filename, ".docx");

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
          ...content
            .split("\n")
            .map((line) => new Paragraph({ children: [new TextRun(line)] })),
        ],
      },
    ],
  });

  let buffer: Buffer;
  try {
    buffer = await Packer.toBuffer(doc);
  } catch (err: any) {
    return { success: false, output: `DOCX generation failed: ${err.message}` };
  }

  if (userId) {
    const storagePath = `${userId}/${taskId}_${name}`;
    const url = await uploadToStorage(buffer, userId, storagePath, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    if (url) {
      return { success: true, output: `DOCX ready — download link (1h): ${url}`, url };
    }
  }

  // Fallback: write to /tmp
  const filePath = path.join("/tmp", `${taskId}_${name}`);
  try {
    await fs.writeFile(filePath, buffer);
    return { success: true, output: `DOCX generated: ${filePath}`, filePath };
  } catch (err: any) {
    return { success: false, output: `DOCX write failed: ${err.message}` };
  }
}

export async function generatePdf(
  taskId: string,
  filename: string,
  title: string,
  content: string,
  userId?: string
): Promise<DocGenResult> {
  const name = safeName(filename, ".pdf");

  const buffer = await new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument();
      const chunks: Buffer[] = [];

      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.fontSize(20).text(title, { align: "left" });
      doc.moveDown();
      doc.fontSize(12).text(content);
      doc.end();
    } catch (err) {
      reject(err);
    }
  }).catch((err: any) => {
    throw new Error(`PDF generation failed: ${err.message}`);
  });

  if (userId) {
    const storagePath = `${userId}/${taskId}_${name}`;
    const url = await uploadToStorage(buffer, userId, storagePath, "application/pdf");
    if (url) {
      return { success: true, output: `PDF ready — download link (1h): ${url}`, url };
    }
  }

  // Fallback: write to /tmp
  const filePath = path.join("/tmp", `${taskId}_${name}`);
  try {
    await fs.writeFile(filePath, buffer);
    return { success: true, output: `PDF generated: ${filePath}`, filePath };
  } catch (err: any) {
    return { success: false, output: `PDF write failed: ${err.message}` };
  }
}
