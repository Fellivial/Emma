"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ChevronDown, ChevronRight, TrendingUp, Check, X } from "lucide-react";

interface TaskDetail {
  id: string;
  goal: string;
  status: string;
  trigger_type: string;
  steps_taken: number;
  token_cost: number;
  result: string | null;
  context_snapshot: Record<string, unknown> | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface Step {
  id: string;
  step_number: number;
  action: string;
  input: Record<string, unknown>;
  output: string;
  status: string;
  risk_level: string;
  token_cost: number;
  duration_ms: number;
  created_at: string;
}

interface Summary {
  task_id: string;
  summary: string;
  output_vars: Record<string, string>;
  step_count: number;
  generated_at: string;
}

interface Pattern {
  id: string;
  pattern_type: string;
  description: string;
  suggestion: string;
  frequency: number;
  status: string;
}

interface Approval {
  id: string;
  action: string;
  input: Record<string, unknown>;
  status: string;
  created_at: string;
}

interface TaskDetailData {
  task: TaskDetail;
  steps: Step[];
  summary: Summary | null;
  approvals: Approval[];
  patterns: Pattern[];
}

export default function TaskDetailPage() {
  const params = useParams();
  const taskId = params.id as string;

  const [data, setData] = useState<TaskDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [showMemory, setShowMemory] = useState(false);

  useEffect(() => {
    fetch(`/api/emma/tasks/${taskId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.task) setData(d);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [taskId]);

  const toggleStep = (n: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      next.has(n) ? next.delete(n) : next.add(n);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emma-950 via-emma-900 to-emma-950 font-sans text-emma-100 flex items-center justify-center">
        <span className="text-sm text-emma-200/20">Loading…</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emma-950 via-emma-900 to-emma-950 font-sans text-emma-100 flex flex-col items-center justify-center gap-3">
        <span className="text-sm text-emma-200/30">Task not found.</span>
        <Link href="/settings/tasks" className="text-xs text-emma-300 hover:underline">
          ← Back to tasks
        </Link>
      </div>
    );
  }

  const { task, steps, summary, approvals, patterns } = data;
  const ctx = task.context_snapshot as { outputVars?: Record<string, string> } | null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-emma-950 via-emma-900 to-emma-950 font-sans text-emma-100">
      {/* Header */}
      <div className="border-b border-surface-border bg-emma-950/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <Link
            href="/settings/tasks"
            className="text-emma-200/30 hover:text-emma-300 transition-colors"
          >
            <ArrowLeft size={18} />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-light text-emma-100/80 truncate">{task.goal}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <StatusBadge status={task.status} />
              <span className="text-[10px] text-emma-200/20">{formatTime(task.created_at)}</span>
              <span className="text-[10px] text-emma-200/15">{task.trigger_type}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-6 flex flex-col gap-6">
        {/* Emma's summary */}
        {summary && (
          <section className="rounded-xl border border-emma-300/15 bg-emma-300/3 p-4">
            <div className="flex items-center gap-2 mb-2.5">
              <div className="w-5 h-5 rounded-full bg-emma-300/20 flex items-center justify-center">
                <span className="text-[9px] text-emma-300 font-semibold">E</span>
              </div>
              <span className="text-[10px] text-emma-300/60 font-medium tracking-widest uppercase">
                Emma's notes
              </span>
              <span className="text-[10px] text-emma-200/15">
                {formatTime(summary.generated_at)}
              </span>
            </div>
            <p className="text-sm font-light text-emma-100/75 leading-relaxed">{summary.summary}</p>
          </section>
        )}

        {/* Step timeline */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-emma-200/40 tracking-wider">
              Step Timeline
            </span>
            <span className="text-[10px] text-emma-200/20">
              {steps.length} steps · {formatTokens(task.token_cost)} tokens
            </span>
          </div>

          {steps.length === 0 ? (
            <p className="text-sm text-emma-200/20">No step log recorded.</p>
          ) : (
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-3.5 top-4 bottom-4 w-px bg-emma-300/8" />

              <div className="flex flex-col gap-1">
                {steps.map((s) => {
                  const expanded = expandedSteps.has(s.step_number);
                  return (
                    <div key={s.id} className="relative pl-9">
                      {/* Node */}
                      <div
                        className={`absolute left-2 top-3 w-3 h-3 rounded-full border ${stepNodeStyle(s.status, s.risk_level)}`}
                      />

                      <button
                        onClick={() => toggleStep(s.step_number)}
                        className="w-full text-left rounded-lg px-3 py-2.5 hover:bg-surface transition-colors group"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-emma-200/20 w-5 shrink-0">
                              {s.step_number}
                            </span>
                            <span className="text-xs font-mono text-emma-200/50">{s.action}</span>
                            {s.risk_level === "dangerous" && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-400/10 text-red-300/60 border border-red-400/15">
                                dangerous
                              </span>
                            )}
                            {s.risk_level === "moderate" && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-400/10 text-amber-300/60 border border-amber-400/15">
                                moderate
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-emma-200/15">{s.duration_ms}ms</span>
                            <ChevronDown
                              size={12}
                              className={`text-emma-200/15 transition-transform ${expanded ? "rotate-180" : ""}`}
                            />
                          </div>
                        </div>

                        {!expanded && (
                          <p className="text-[11px] text-emma-200/30 mt-1 truncate font-light">
                            {s.output}
                          </p>
                        )}
                      </button>

                      {expanded && (
                        <div className="mx-3 mb-2 rounded-lg border border-surface-border bg-black/20 overflow-hidden">
                          {/* Input */}
                          {Object.keys(s.input).length > 0 && (
                            <div className="p-3 border-b border-surface-border">
                              <p className="text-[10px] text-emma-200/25 mb-1.5 uppercase tracking-widest">
                                Input
                              </p>
                              <div className="font-mono text-[11px] text-emma-200/35">
                                {Object.entries(s.input).map(([k, v]) => (
                                  <div key={k}>
                                    <span className="text-emma-300/40">{k}:</span> {String(v)}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {/* Output */}
                          <div className="p-3">
                            <p className="text-[10px] text-emma-200/25 mb-1.5 uppercase tracking-widest">
                              Output
                            </p>
                            <p className="text-[11px] text-emma-200/50 font-light whitespace-pre-wrap break-words">
                              {s.output}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Task memory (output vars) */}
        {ctx?.outputVars && Object.keys(ctx.outputVars).length > 0 && (
          <section>
            <button
              onClick={() => setShowMemory((v) => !v)}
              className="flex items-center gap-2 mb-3 cursor-pointer group"
            >
              <span className="text-xs font-medium text-emma-200/40 tracking-wider">
                Task Memory
              </span>
              <ChevronRight
                size={12}
                className={`text-emma-200/25 transition-transform ${showMemory ? "rotate-90" : ""}`}
              />
              <span className="text-[10px] text-emma-200/20">
                {Object.keys(ctx.outputVars).length} variable
                {Object.keys(ctx.outputVars).length !== 1 ? "s" : ""}
              </span>
            </button>

            {showMemory && (
              <div className="rounded-xl border border-surface-border bg-black/20 divide-y divide-surface-border overflow-hidden">
                {Object.entries(ctx.outputVars).map(([k, v]) => (
                  <div key={k} className="p-3">
                    <p className="text-[10px] text-emma-300/50 font-mono mb-1">{`{{${k}}}`}</p>
                    <p className="text-[11px] text-emma-200/50 font-light whitespace-pre-wrap break-words line-clamp-4">
                      {v}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Approvals */}
        {approvals.length > 0 && (
          <section>
            <p className="text-xs font-medium text-emma-200/40 tracking-wider mb-3">Approvals</p>
            <div className="flex flex-col gap-2">
              {approvals.map((a) => (
                <div key={a.id} className="rounded-xl border border-surface-border bg-surface p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono text-emma-200/50">{a.action}</span>
                    <StatusBadge status={a.status} />
                  </div>
                  <span className="text-[10px] text-emma-200/15">{formatTime(a.created_at)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Related patterns */}
        {patterns.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={13} className="text-emma-300/60" />
              <span className="text-xs font-medium text-emma-200/40 tracking-wider">
                Related Patterns
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {patterns.map((p) => (
                <div key={p.id} className="rounded-xl border border-emma-300/10 bg-emma-300/2 p-3">
                  <p className="text-[11px] text-emma-100/60 font-light mb-1">{p.suggestion}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-emma-200/20 capitalize">
                      {p.pattern_type.replace("_", " ")}
                    </span>
                    <span className="text-[10px] text-emma-200/15">{p.frequency}×</span>
                    <span
                      className={`text-[10px] ${p.status === "accepted" ? "text-emerald-300/60" : p.status === "dismissed" ? "text-emma-200/15" : "text-amber-300/60"}`}
                    >
                      {p.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stepNodeStyle(status: string, riskLevel: string): string {
  if (status === "awaiting_approval") return "bg-amber-400/30 border-amber-400/60";
  if (status === "failed") return "bg-red-400/30 border-red-400/60";
  if (riskLevel === "dangerous") return "bg-red-400/20 border-red-400/40";
  if (riskLevel === "moderate") return "bg-amber-400/20 border-amber-400/40";
  return "bg-emerald-400/20 border-emerald-400/40";
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "bg-emerald-400/10 text-emerald-300 border-emerald-400/20",
    running: "bg-blue-400/10 text-blue-300 border-blue-400/20",
    failed: "bg-red-400/10 text-red-300 border-red-400/20",
    awaiting_approval: "bg-amber-400/10 text-amber-300 border-amber-400/20",
    max_steps_reached: "bg-purple-400/10 text-purple-300 border-purple-400/20",
    approved: "bg-emerald-400/10 text-emerald-300 border-emerald-400/20",
    rejected: "bg-red-400/10 text-red-300 border-red-400/20",
    pending: "bg-amber-400/10 text-amber-300 border-amber-400/20",
  };
  return (
    <span
      className={`text-[10px] px-2 py-0.5 rounded-full border ${styles[status] || styles.failed}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function formatTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return d.toLocaleDateString();
}

function formatTokens(n: number): string {
  if (!n) return "0";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
