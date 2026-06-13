/**
 * Inngest durable functions — mirrors existing Vercel cron jobs.
 *
 * Each function calls the corresponding cron endpoint via step.run(), which gives:
 * - Automatic retry on failure (configurable per function)
 * - Observability via Inngest dashboard (step timeline, logs, replay)
 * - Step-level memoization: if the function is interrupted and retried, completed
 *   steps are skipped (state replay) — eliminating double-processing.
 *
 * To enable Inngest in production:
 * 1. Set INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY env vars (from inngest.com dashboard)
 * 2. Optionally remove the matching Vercel cron entries from vercel.json once Inngest
 *    is confirmed stable (running both simultaneously is safe — idempotent routes handle it)
 *
 * For per-task step isolation on scheduled-tasks (maximum durability), refactor
 * scheduled-tasks/route.ts to expose a task-list endpoint and loop over tasks with
 * individual step.run() calls — see background-workers-research.md §5.
 */

import { inngest } from "./client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { parseDocument } from "@/core/integrations/docparser";
import { extractTextFromImage, extractTextFromScannedPdf } from "@/core/integrations/ocr";
import { recursiveCharacterSplit } from "@/core/text-splitter";
import { embedBatch } from "@/lib/embeddings";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

async function callCron(path: string): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET not set");
  const res = await fetch(`${APP_URL}${path}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Cron ${path} responded ${res.status}: ${body.slice(0, 200)}`);
  }
}

export const scheduledTasks = inngest.createFunction(
  { id: "emma-scheduled-tasks", retries: 2, triggers: [{ cron: "* * * * *" }] },
  async ({ step }) => {
    await step.run("run-pending-agent-tasks", () => callCron("/api/emma/cron/scheduled-tasks"));
  }
);

export const heartbeat = inngest.createFunction(
  { id: "emma-heartbeat", retries: 1, triggers: [{ cron: "*/30 * * * *" }] },
  async ({ step }) => {
    await step.run("heartbeat", () => callCron("/api/emma/cron/heartbeat"));
  }
);

export const connectionHealth = inngest.createFunction(
  { id: "emma-connection-health", retries: 1, triggers: [{ cron: "0 * * * *" }] },
  async ({ step }) => {
    await step.run("check-connection-health", () => callCron("/api/emma/cron/connection-health"));
  }
);

export const emailSequences = inngest.createFunction(
  { id: "emma-email-sequences", retries: 2, triggers: [{ cron: "*/15 * * * *" }] },
  async ({ step }) => {
    await step.run("process-email-sequences", () => callCron("/api/emma/cron/email-sequences"));
  }
);

export const approvalsExpiry = inngest.createFunction(
  { id: "emma-approvals-expiry", retries: 1, triggers: [{ cron: "*/5 * * * *" }] },
  async ({ step }) => {
    await step.run("expire-stale-approvals", () => callCron("/api/emma/cron/approvals-expiry"));
  }
);

export const patternDetection = inngest.createFunction(
  { id: "emma-pattern-detection", retries: 2, triggers: [{ cron: "TZ=UTC 0 2 * * *" }] },
  async ({ step }) => {
    await step.run("detect-patterns", () => callCron("/api/emma/cron/pattern-detection"));
  }
);

export const memoryPrune = inngest.createFunction(
  { id: "emma-memory-prune", retries: 1, triggers: [{ cron: "TZ=UTC 0 4 * * *" }] },
  async ({ step }) => {
    await step.run("prune-memories", () => callCron("/api/emma/cron/memory-prune"));
  }
);

export const reflection = inngest.createFunction(
  { id: "emma-reflection", retries: 2, triggers: [{ cron: "TZ=UTC 30 3 * * *" }] },
  async ({ step }) => {
    await step.run("memory-reflection", () => callCron("/api/emma/cron/reflection"));
  }
);

// ── Background document ingestion ─────────────────────────────────────────────
// Triggered by the presign endpoint after the client uploads the file to Storage.
// Handles files > 4 MB that exceed Vercel's body limit, running the full
// parse → chunk → embed → store pipeline as a durable Inngest job.

export const documentProcess = inngest.createFunction(
  {
    id: "emma-document-process",
    retries: 2,
    // Each event carries a unique document id; concurrency key prevents duplicate
    // runs if the client fires the event twice for the same document.
    concurrency: { key: "event.data.documentId", limit: 1 },
    triggers: [{ event: "document/process" }],
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async ({ event, step }: { event: any; step: any }) => {
    const { documentId, userId } = event.data as { documentId: string; userId: string };

    const supabase = getSupabaseAdmin();
    if (!supabase) throw new Error("Supabase not configured");

    // ── 1. Mark as processing ────────────────────────────────────────────────
    await step.run("mark-processing", async () => {
      await supabase
        .from("ingested_documents")
        .update({ status: "processing" })
        .eq("id", documentId)
        .eq("user_id", userId);
    });

    // ── 2. Fetch doc metadata + download from Storage ────────────────────────
    const { mimeType, storagePath } = await step.run("fetch-metadata", async () => {
      const { data, error } = await supabase
        .from("ingested_documents")
        .select("mime_type, storage_path")
        .eq("id", documentId)
        .eq("user_id", userId)
        .single();
      if (error || !data) throw new Error(`Document not found: ${documentId}`);
      if (!data.storage_path) throw new Error(`No storage_path on document ${documentId}`);
      return {
        mimeType: data.mime_type as string,
        storagePath: data.storage_path as string,
      };
    });

    const buffer = await step.run("download-file", async () => {
      const { data, error } = await supabase.storage
        .from("document-ingestion")
        .download(storagePath);
      if (error || !data) throw new Error(`Storage download failed: ${error?.message}`);
      return Buffer.from(await data.arrayBuffer());
    });

    // ── 3. Extract text ──────────────────────────────────────────────────────
    const extractedText = await step.run("extract-text", async () => {
      if (mimeType === "application/pdf") {
        const parsed = await parseDocument(buffer, mimeType);
        const text = parsed.text;
        if (text.length < 100) {
          const ocr = await extractTextFromScannedPdf(buffer);
          return ocr.text;
        }
        return text;
      }
      if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        const parsed = await parseDocument(buffer, mimeType);
        return parsed.text;
      }
      if (mimeType === "text/plain") {
        return buffer.toString("utf-8");
      }
      const { text } = await extractTextFromImage(buffer, mimeType);
      return text;
    });

    if (!extractedText.trim()) {
      await supabase
        .from("ingested_documents")
        .update({ status: "failed", processing_error: "Could not extract text from document" })
        .eq("id", documentId);
      return { ok: false, reason: "empty-text" };
    }

    // ── 4. Chunk + embed ─────────────────────────────────────────────────────
    const chunks = await step.run("chunk", () =>
      Promise.resolve(recursiveCharacterSplit(extractedText, 1000, 150))
    );

    let embeddings: number[][] = [];
    try {
      embeddings = await step.run("embed", () => embedBatch(chunks));
    } catch (e) {
      console.error("[document-process] embedding error:", (e as Error).message);
    }

    // ── 5. Persist chunks + update document status ───────────────────────────
    await step.run("persist", async () => {
      const rows = (chunks as string[]).map((chunk_text: string, i: number) => ({
        user_id: userId,
        doc_id: documentId,
        chunk_index: i,
        chunk_text,
        embedding: embeddings[i] ? `[${embeddings[i].join(",")}]` : null,
      }));

      for (let i = 0; i < rows.length; i += 100) {
        const { error } = await supabase.from("document_chunks").insert(rows.slice(i, i + 100));
        if (error) console.error("[document-process] chunk insert error:", error.message);
      }

      await supabase
        .from("ingested_documents")
        .update({
          status: "ready",
          character_count: extractedText.length,
          chunk_count: chunks.length,
          extracted_text: extractedText,
        })
        .eq("id", documentId);
    });

    // ── 6. Clean up Storage object ───────────────────────────────────────────
    await step.run("cleanup-storage", async () => {
      await supabase.storage.from("document-ingestion").remove([storagePath]);
    });

    return {
      ok: true,
      documentId,
      chunkCount: chunks.length,
      characterCount: extractedText.length,
    };
  }
);
