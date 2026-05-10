"use client";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ProvenanceChain, ProvenanceStep } from "@/core/provenance";

interface ChainRow {
  id: string;
  task_id: string;
  goal: string;
  status: string;
  chain: unknown;
  started_at: string;
  completed_at: string | null;
}

function ProvenancePage() {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const preselectedTaskId = searchParams.get("taskId");

  const [chains, setChains] = useState<ChainRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchChains = useCallback(async () => {
    if (!supabase) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("provenance_chains")
      .select("id, task_id, goal, status, chain, started_at, completed_at")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(20);

    const rows = data ?? [];
    setChains(rows);

    if (preselectedTaskId) {
      const match = rows.find((r) => r.task_id === preselectedTaskId);
      if (match) setSelectedId(match.id);
    } else if (rows.length > 0) {
      setSelectedId((prev) => prev ?? rows[0].id);
    }

    setLoading(false);
  }, [supabase, preselectedTaskId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchChains();
  }, [fetchChains]);

  const selectedChain = chains.find((c) => c.id === selectedId) ?? null;

  const parsedChain = useMemo((): ProvenanceChain | null => {
    if (!selectedChain?.chain) return null;
    try {
      if (typeof selectedChain.chain === "object") return selectedChain.chain as ProvenanceChain;
      return JSON.parse(String(selectedChain.chain)) as ProvenanceChain;
    } catch {
      return null;
    }
  }, [selectedChain]);

  return (
    <div className="max-w-6xl mx-auto px-8 py-8">
      <div className="mb-8">
        <h1 className="text-xl font-light text-emma-100">Audit Trail</h1>
        <p className="text-xs text-emma-300/50 mt-1">
          Step-by-step provenance for every autonomous task Emma has run.
        </p>
      </div>

      {loading ? (
        <div className="text-center text-sm text-emma-200/20 py-12">Loading…</div>
      ) : chains.length === 0 ? (
        <div className="rounded-xl border border-surface-border bg-surface p-12 text-center">
          <p className="text-sm text-emma-200/20">No tasks recorded yet.</p>
          <p className="text-[11px] text-emma-200/15 mt-1">
            Autonomous tasks will appear here once Emma starts running them.
          </p>
        </div>
      ) : (
        <div className="flex gap-6">
          {/* ── Chain list ──────────────────────────────────────────── */}
          <div className="w-72 shrink-0 flex flex-col gap-1.5">
            {chains.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`w-full text-left px-4 py-3 rounded-xl border transition-all cursor-pointer ${
                  selectedId === c.id
                    ? "border-emma-300/20 bg-emma-300/8"
                    : "border-surface-border bg-surface hover:bg-surface-hover"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <StatusBadge status={c.status} />
                  <span className="text-[10px] text-emma-200/15 shrink-0">
                    {fmtRelative(c.started_at)}
                  </span>
                </div>
                <p className="text-[11px] font-light text-emma-200/60 leading-snug line-clamp-2">
                  {c.goal.length > 60 ? c.goal.slice(0, 60) + "…" : c.goal}
                </p>
              </button>
            ))}
          </div>

          {/* ── Chain detail ─────────────────────────────────────────── */}
          <div className="flex-1 min-w-0">
            {!selectedChain ? (
              <div className="rounded-xl border border-surface-border bg-surface p-8 text-center">
                <p className="text-sm text-emma-200/20">Select a task to view its audit trail.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-surface-border bg-surface p-6">
                {/* Header */}
                <div className="mb-6 pb-5 border-b border-surface-border">
                  <div className="flex items-center gap-2 mb-2">
                    <StatusBadge status={selectedChain.status} />
                  </div>
                  <h2 className="text-sm font-medium text-emma-200/80 leading-snug mb-2">
                    {selectedChain.goal}
                  </h2>
                  <div className="flex items-center gap-4 text-[11px] text-emma-200/20">
                    <span>Started {fmtRelative(selectedChain.started_at)}</span>
                    {selectedChain.completed_at && (
                      <span>Completed {fmtRelative(selectedChain.completed_at)}</span>
                    )}
                    <span className="font-mono text-emma-200/15">{selectedChain.task_id}</span>
                  </div>
                </div>

                {/* Steps */}
                {!parsedChain ? (
                  <p className="text-sm text-emma-200/20">Chain data unavailable.</p>
                ) : parsedChain.steps.length === 0 ? (
                  <p className="text-sm text-emma-200/20">No steps recorded.</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {parsedChain.steps.map((step) => (
                      <StepCard key={step.stepNumber} step={step} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Step card with expandable I/O ─────────────────────────────────────────────

function StepCard({ step }: { step: ProvenanceStep }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-surface-border bg-surface/50 overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer hover:bg-surface transition-colors"
      >
        <span className="w-6 h-6 rounded-full border border-emma-200/15 flex items-center justify-center text-[10px] text-emma-200/30 shrink-0 font-mono">
          {step.stepNumber}
        </span>

        <span className="text-xs font-mono text-emma-200/60 flex-1 truncate">{step.action}</span>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full border ${
              step.source === "human_approved"
                ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                : "border-emma-200/10 bg-emma-200/5 text-emma-200/30"
            }`}
          >
            {step.source.replace(/_/g, " ")}
          </span>

          <span
            className={`text-[10px] ${step.verified ? "text-emerald-300/60" : "text-red-300/40"}`}
          >
            {step.verified ? "✓" : "✗"}
          </span>

          <span className="text-[10px] text-emma-200/15">{step.durationMs}ms</span>

          <span
            className={`text-emma-200/20 transition-transform text-xs ${expanded ? "rotate-180" : ""}`}
          >
            ▾
          </span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-surface-border pt-3 flex flex-col gap-3">
          <div>
            <span className="text-[10px] text-emma-200/20 uppercase tracking-widest block mb-1.5">
              Input
            </span>
            <pre className="bg-black/20 rounded-lg px-3 py-2 text-[11px] text-emma-200/40 font-mono overflow-x-auto whitespace-pre-wrap break-all">
              {JSON.stringify(step.input, null, 2)}
            </pre>
          </div>
          <div>
            <span className="text-[10px] text-emma-200/20 uppercase tracking-widest block mb-1.5">
              Output
            </span>
            <div className="bg-black/20 rounded-lg px-3 py-2 text-[11px] text-emma-200/40 whitespace-pre-wrap break-words">
              {step.output || <span className="text-emma-200/15 italic">No output</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "bg-emerald-400/10 text-emerald-300 border-emerald-400/20",
    failed: "bg-red-400/10 text-red-300 border-red-400/20",
    awaiting_approval: "bg-amber-400/10 text-amber-300 border-amber-400/20",
    running: "bg-blue-400/10 text-blue-300 border-blue-400/20",
  };
  return (
    <span
      className={`text-[10px] px-2 py-0.5 rounded-full border ${styles[status] ?? styles.failed}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function fmtRelative(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return d.toLocaleDateString();
}

export default function ProvenancePageWrapper() {
  return (
    <Suspense fallback={<div className="text-center text-sm text-emma-200/20 py-12">Loading…</div>}>
      <ProvenancePage />
    </Suspense>
  );
}
