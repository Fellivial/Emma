/**
 * Document Generation — DOCX and PDF.
 * Outputs to /tmp/{taskId}_{filename} (tmp write access required).
 */

import * as fs from "fs/promises";
import * as path from "path";
import { Document, Paragraph, TextRun, HeadingLevel, Packer } from "docx";
import PDFDocument from "pdfkit";

export interface DocGenResult {
  success: boolean;
  output: string;
  filePath?: string;
}

function safeTmpPath(taskId: string, filename: string, ext: string): string {
  const base = path.basename(filename.replace(/\.[^.]+$/, ""));
  return path.join("/tmp", `${taskId}_${base}${ext}`);
}

export async function generateDocx(
  taskId: string,
  filename: string,
  title: string,
  content: string
): Promise<DocGenResult> {
  const filePath = safeTmpPath(taskId, filename, ".docx");

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

  try {
    const buffer = await Packer.toBuffer(doc);
    await fs.writeFile(filePath, buffer);
    return { success: true, output: `DOCX generated: ${filePath}`, filePath };
  } catch (err: any) {
    return { success: false, output: `DOCX generation failed: ${err.message}` };
  }
}

export async function generatePdf(
  taskId: string,
  filename: string,
  title: string,
  content: string
): Promise<DocGenResult> {
  const filePath = safeTmpPath(taskId, filename, ".pdf");

  return new Promise((resolve) => {
    try {
      const doc = new PDFDocument();
      const chunks: Buffer[] = [];

      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", async () => {
        try {
          await fs.writeFile(filePath, Buffer.concat(chunks));
          resolve({ success: true, output: `PDF generated: ${filePath}`, filePath });
        } catch (err: any) {
          resolve({ success: false, output: `PDF write failed: ${err.message}` });
        }
      });
      doc.on("error", (err: Error) => {
        resolve({ success: false, output: `PDF generation failed: ${err.message}` });
      });

      doc.fontSize(20).text(title, { align: "left" });
      doc.moveDown();
      doc.fontSize(12).text(content);
      doc.end();
    } catch (err: any) {
      resolve({ success: false, output: `PDF setup failed: ${err.message}` });
    }
  });
}
