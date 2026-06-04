"use client";

import { useState, useEffect, useRef } from "react";
import { getPlan } from "@/core/pricing";

interface IngestedDocument {
  id: string;
  label: string;
  mime_type: string;
  character_count: number;
  chunk_count: number;
  created_at: string;
}

function UpgradeGate() {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-8 text-center gap-6">
      <div className="w-12 h-12 rounded-2xl bg-emma-300/10 border border-emma-300/20 flex items-center justify-center">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path
            d="M10 3v9M6 8l4-5 4 5M4 14h12a1 1 0 010 2H4a1 1 0 010-2z"
            stroke="#e8a0bf"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="space-y-2">
        <h2 className="text-base font-semibold text-emma-200/90">Document Ingestion</h2>
        <p className="text-sm text-emma-200/45 max-w-xs leading-relaxed">
          Upload PDFs, DOCX files, and images. Emma will reference them in conversation via semantic
          search. Available on Pro and Enterprise plans.
        </p>
      </div>
      <a
        href="/settings/billing"
        className="px-4 py-2 rounded-xl bg-emma-300/10 border border-emma-300/20 text-sm text-emma-300 hover:bg-emma-300/15 transition-colors"
      >
        Upgrade to Pro
      </a>
    </div>
  );
}

function mimeLabel(mime: string): string {
  if (mime === "application/pdf") return "PDF";
  if (mime.includes("wordprocessingml")) return "DOCX";
  if (mime === "text/plain") return "TXT";
  if (mime.startsWith("image/")) return mime.replace("image/", "").toUpperCase();
  return mime.split("/")[1]?.toUpperCase() ?? mime;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function DocumentsPage() {
  const [planId, setPlanId] = useState<string | null>(null);
  const [docs, setDocs] = useState<IngestedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const labelRef = useRef<HTMLInputElement>(null);

  const fetchDocs = async () => {
    try {
      const res = await fetch("/api/emma/ingest/document");
      const data = (await res.json()) as { documents?: IngestedDocument[] };
      setDocs(data.documents ?? []);
    } catch {
      /* continue */
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const usageRes = await fetch("/api/emma/usage");
        const usage = await usageRes.json();
        if (usage.planId) setPlanId(usage.planId as string);
        await fetchDocs();
      } catch {
        /* continue */
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, []);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    setStatus(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const label = labelRef.current?.value.trim();
      if (label) form.append("label", label);

      const res = await fetch("/api/emma/ingest/document", { method: "POST", body: form });
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        chunkCount?: number;
      };

      if (data.success) {
        setStatus({ ok: true, msg: `Ingested — ${data.chunkCount ?? 0} chunks indexed.` });
        if (fileRef.current) fileRef.current.value = "";
        if (labelRef.current) labelRef.current.value = "";
        await fetchDocs();
      } else {
        setStatus({ ok: false, msg: data.error ?? "Upload failed." });
      }
    } catch {
      setStatus({ ok: false, msg: "Network error." });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/emma/ingest/document?id=${id}`, { method: "DELETE" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (data.ok) {
        setDocs((prev) => prev.filter((d) => d.id !== id));
      } else {
        setStatus({ ok: false, msg: data.error ?? "Delete failed." });
      }
    } catch {
      setStatus({ ok: false, msg: "Network error." });
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="w-5 h-5 rounded-full border-2 border-emma-300/30 border-t-emma-300 animate-spin" />
      </div>
    );
  }

  const hasPlan = planId !== null && getPlan(planId).features.customPersona;
  if (!hasPlan) return <UpgradeGate />;

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
      <div>
        <h1 className="text-base font-semibold text-emma-200/90">Documents</h1>
        <p className="text-sm text-emma-200/40 mt-1">
          Upload files for Emma to reference in conversation via semantic search.
        </p>
      </div>

      {/* Upload panel */}
      <div className="space-y-3 p-4 bg-emma-950/60 border border-surface-border rounded-2xl">
        <div className="space-y-2">
          <label className="text-xs font-medium text-emma-200/50 uppercase tracking-widest">
            Label (optional)
          </label>
          <input
            ref={labelRef}
            type="text"
            placeholder="e.g. Q1 Contract, Meeting Notes"
            className="w-full bg-transparent border border-surface-border rounded-xl px-4 py-2.5 text-sm text-emma-200/80 placeholder:text-emma-200/20 focus:outline-none focus:border-emma-300/30 transition-colors"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-emma-200/50 uppercase tracking-widest">
            File
          </label>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp,.tiff"
            className="w-full text-sm text-emma-200/50 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-emma-300/20 file:bg-emma-300/10 file:text-emma-300 file:text-xs file:cursor-pointer hover:file:bg-emma-300/15 transition-colors"
          />
          <p className="text-[10px] text-emma-200/25">PDF, DOCX, TXT, PNG, JPG — max 4 MB</p>
        </div>

        <div className="flex items-center gap-4 pt-1">
          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading}
            className="px-5 py-2 rounded-xl bg-emma-300/10 border border-emma-300/20 text-sm text-emma-300 hover:bg-emma-300/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {uploading ? "Uploading…" : "Upload & index"}
          </button>
          {status && (
            <p className={`text-xs ${status.ok ? "text-emma-300/70" : "text-red-400/70"}`}>
              {status.msg}
            </p>
          )}
        </div>
      </div>

      {/* Document list */}
      {docs.length === 0 ? (
        <p className="text-sm text-emma-200/25 text-center py-8">No documents uploaded yet.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-medium text-emma-200/35 uppercase tracking-widest">
            Uploaded documents
          </p>
          {docs.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-3 px-4 py-3 bg-emma-950/40 border border-surface-border rounded-xl"
            >
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emma-300/10 text-emma-300/70 shrink-0">
                {mimeLabel(doc.mime_type)}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-emma-200/75 truncate">{doc.label}</p>
                <p className="text-[10px] text-emma-200/30">
                  {doc.chunk_count} chunks · {(doc.character_count / 1000).toFixed(1)}k chars ·{" "}
                  {formatDate(doc.created_at)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(doc.id)}
                disabled={deletingId === doc.id}
                className="text-emma-200/20 hover:text-red-400/60 transition-colors disabled:opacity-40 shrink-0 text-xs"
                aria-label="Delete document"
              >
                {deletingId === doc.id ? "…" : "✕"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
