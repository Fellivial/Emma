"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Check, X, Clock, Zap, AlertTriangle, ChevronDown } from "lucide-react";

interface Task {
  id: string;
  goal: string;
  status: string;
  trigger_type: string;
  steps_completed: number;
  total_tokens: number;
  summary: string | null;
  created_at: string;
}

interface Action {
  id: string;
  task_id: string;
  action: string;
  status: string;
  trigger_type: string;
  token_cost: number;
  error: string | null;
  created_at: string;
}

interface Approval {
  id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  reason: string;
  status: string;
  expires_at: string;
  created_at: string;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"tasks" | "actions" | "approvals">("approvals");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/emma/tasks?type=all&limit=30");
      const data = await res.json();
      setTasks(data.tasks || []);
      setActions(data.actions || []);
      setApprovals(data.approvals || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleApproval = async (approvalId: string, decision: "approve" | "reject") => {
    try {
      await fetch("/api/emma/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: decision, approvalId }),
      });
      fetchData(); // Refresh
    } catch {}
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emma-950 via-emma-900 to-emma-950 font-sans text-emma-100">
      {/* Header */}
      <div className="border-b border-surface-border bg-emma-950/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <Link href="/settings" className="text-emma-200/30 hover:text-emma-300 transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-sm font-semibold text-emma-300 tracking-wider">Autonomous Tasks</h1>
            <p className="text-[10px] text-emma-200/25">
              {approvals.length > 0 ? `${approvals.length} pending approval` : "What Emma has done on her own"}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-surface-border">
          {([
            { id: "approvals", label: "Pending Approvals", count: approvals.length },
            { id: "tasks", label: "Tasks", count: tasks.length },
            { id: "actions", label: "Action Log", count: actions.length },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-xs font-light border-b-2 transition-all cursor-pointer ${
                tab === t.id
                  ? "border-emma-300 text-emma-300"
                  : "border-transparent text-emma-200/30 hover:text-emma-200/50"
              }`}
            >
              {t.label}
              {t.count > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${
                  t.id === "approvals" && t.count > 0 ? "bg-amber-400/15 text-amber-300" : "bg-emma-200/5 text-emma-200/25"
                }`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center text-sm text-emma-200/20 py-12">Loading…</div>
        ) : (
          <>
            {/* ── Pending Approvals ─────────────────────────────────────── */}
            {tab === "approvals" && (
              <div className="flex flex-col gap-3">
                {approvals.length === 0 ? (
                  <div className="text-center text-sm text-emma-200/20 py-12">
                    No pending approvals. Emma is behaving.
                  </div>
                ) : (
                  approvals.map((a) => (
                    <div key={a.id} className="rounded-xl border border-amber-400/15 bg-amber-400/3 p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <AlertTriangle size={14} className="text-amber-400" />
                          <span className="text-xs font-medium text-amber-300">{a.tool_name}</span>
                          <span className="text-[10px] text-emma-200/20">{formatTime(a.created_at)}</span>
                        </div>
                        <span className="text-[10px] text-emma-200/15">
                          Expires {formatTime(a.expires_at)}
                        </span>
                      </div>

                      <p className="text-xs font-light text-emma-200/50 mb-2">{a.reason}</p>

                      {/* Show input details */}
                      <div className="bg-black/20 rounded-lg p-3 mb-3 font-mono text-[11px] text-emma-200/30">
                        {Object.entries(a.tool_input).map(([k, v]) => (
                          <div key={k}>
                            <span className="text-emma-300/40">{k}:</span> {String(v)}
                          </div>
                        ))}
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApproval(a.id, "approve")}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-400/15 border border-emerald-400/20 text-xs text-emerald-300 cursor-pointer hover:bg-emerald-400/20 transition-all"
                        >
                          <Check size={12} /> Approve
                        </button>
                        <button
                          onClick={() => handleApproval(a.id, "reject")}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-400/10 border border-red-400/15 text-xs text-red-300/60 cursor-pointer hover:bg-red-400/15 transition-all"
                        >
                          <X size={12} /> Reject
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ── Tasks ────────────────────────────────────────────────── */}
            {tab === "tasks" && (
              <div className="flex flex-col gap-2">
                {tasks.length === 0 ? (
                  <div className="text-center text-sm text-emma-200/20 py-12">
                    No autonomous tasks yet.
                  </div>
                ) : (
                  tasks.map((t) => (
                    <div key={t.id} className="rounded-xl border border-surface-border bg-surface p-4">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={t.status} />
                          <span className="text-xs font-light text-emma-200/60">{t.goal}</span>
                        </div>
                        <span className="text-[10px] text-emma-200/15">{formatTime(t.created_at)}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-emma-200/20">
                        <span>{t.trigger_type}</span>
                        <span>{t.steps_completed} steps</span>
                        <span>{formatTokens(t.total_tokens)} tokens</span>
                      </div>
                      {t.summary && (
                        <p className="text-[11px] text-emma-200/35 mt-2 font-light">{t.summary}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ── Action Log ───────────────────────────────────────────── */}
            {tab === "actions" && (
              <div className="flex flex-col gap-1">
                {actions.length === 0 ? (
                  <div className="text-center text-sm text-emma-200/20 py-12">
                    No actions logged yet.
                  </div>
                ) : (
                  actions.map((a) => (
                    <div key={a.id} className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-surface transition-colors">
                      <StatusDot status={a.status} />
                      <span className="text-xs font-mono text-emma-200/40 w-32 shrink-0">{a.action}</span>
                      <span className="text-[11px] text-emma-200/25 flex-1 truncate">{a.task_id}</span>
                      <span className="text-[10px] text-emma-200/15 w-16 text-right">{formatTokens(a.token_cost)}</span>
                      <span className="text-[10px] text-emma-200/10 w-28 text-right">{formatTime(a.created_at)}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "bg-emerald-400/10 text-emerald-300 border-emerald-400/20",
    running: "bg-blue-400/10 text-blue-300 border-blue-400/20",
    failed: "bg-red-400/10 text-red-300 border-red-400/20",
    awaiting_approval: "bg-amber-400/10 text-amber-300 border-amber-400/20",
    max_steps_reached: "bg-purple-400/10 text-purple-300 border-purple-400/20",
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${styles[status] || styles.failed}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: "bg-emerald-400",
    running: "bg-blue-400",
    failed: "bg-red-400",
    pending: "bg-amber-400",
    awaiting_approval: "bg-amber-400",
    approved: "bg-emerald-400",
    rejected: "bg-red-400",
  };
  return <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${colors[status] || "bg-emma-200/20"}`} />;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return d.toLocaleDateString();
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
