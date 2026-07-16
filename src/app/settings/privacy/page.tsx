"use client";

import { useState } from "react";
import { Download, Trash2 } from "lucide-react";

type Status = { type: "success" | "error"; message: string } | null;

export default function PrivacySettingsPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState<"export" | "delete" | null>(null);
  const [status, setStatus] = useState<Status>(null);

  const exportData = async () => {
    setLoading("export");
    setStatus(null);
    try {
      const res = await fetch("/api/emma/gdpr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "export" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Export failed");

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `emma-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setStatus({ type: "success", message: "Export downloaded." });
    } catch (err) {
      setStatus({
        type: "error",
        message: err instanceof Error ? err.message : "Export failed. Please try again.",
      });
    }
    setLoading(null);
  };

  const requestDeletion = async () => {
    if (!email.trim()) {
      setStatus({ type: "error", message: "Enter your account email to confirm deletion." });
      return;
    }

    setLoading("delete");
    setStatus(null);
    try {
      const res = await fetch("/api/emma/gdpr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", confirmEmail: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Deletion request failed");

      if (data.success) {
        setStatus({
          type: "success",
          message:
            "Your Emma data was deleted. Login credentials are preserved for account access.",
        });
      } else if (data.status === "retry_pending") {
        setStatus({
          type: "error",
          message:
            "Deletion is in progress and will retry automatically. Please check back shortly.",
        });
      } else {
        setStatus({
          type: "error",
          message: "Deletion could not be completed. Please contact support.",
        });
      }
    } catch (err) {
      setStatus({
        type: "error",
        message: err instanceof Error ? err.message : "Deletion request failed. Please try again.",
      });
    }
    setLoading(null);
  };

  return (
    <div className="max-w-3xl mx-auto px-8 py-8">
      <div className="mb-8">
        <h1 className="text-xl font-light text-emma-100">Data & Privacy</h1>
        <p className="text-xs text-emma-300/50 mt-1">
          Download your Emma data or delete user-owned app data.
        </p>
      </div>

      <div className="grid gap-4">
        <section className="rounded-2xl border border-surface-border bg-surface p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-medium text-emma-200/70">Export data</h2>
              <p className="text-[11px] text-emma-200/30 mt-1 leading-relaxed">
                Download conversations, memories, tasks, usage, and account settings as JSON.
              </p>
            </div>
            <button
              onClick={exportData}
              disabled={loading !== null}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface border border-surface-border text-xs text-emma-200/60 hover:bg-surface-hover disabled:opacity-50"
            >
              <Download size={14} />
              {loading === "export" ? "Exporting..." : "Export"}
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-red-400/15 bg-red-400/3 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h2 className="text-sm font-medium text-red-200/80">Delete Emma data</h2>
              <p className="text-[11px] text-red-100/35 mt-1 leading-relaxed">
                This removes directly user-owned Emma data. Your auth login is preserved so support
                can still help with account access.
              </p>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Confirm your account email"
                className="mt-4 w-full max-w-sm bg-emma-950 border border-red-400/15 rounded-xl px-4 py-2.5 text-sm font-light text-emma-100 placeholder:text-red-100/20 outline-none focus:border-red-300/35"
              />
            </div>
            <button
              onClick={requestDeletion}
              disabled={loading !== null || !email.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-400/10 border border-red-400/20 text-xs text-red-200/80 hover:bg-red-400/15 disabled:opacity-50"
            >
              <Trash2 size={14} />
              {loading === "delete" ? "Deleting..." : "Delete"}
            </button>
          </div>
        </section>
      </div>

      {status && (
        <p
          className={`mt-4 text-xs ${
            status.type === "success" ? "text-emerald-300/70" : "text-red-300/70"
          }`}
        >
          {status.message}
        </p>
      )}
    </div>
  );
}
