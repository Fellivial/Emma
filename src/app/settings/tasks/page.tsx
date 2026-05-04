"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Check, X, AlertTriangle, TrendingUp, ChevronRight, Repeat } from "lucide-react";

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

interface Pattern {
  id: string;
  pattern_type: "daily" | "weekly" | "tool_sequence";
  description: string;
  suggestion: string;
  frequency: number;
  example_goals: string[];
  status: "pending" | "accepted" | "dismissed";
  detected_at: string;
}

interface TaskSummary {
  task_id: string;
  summary: string;
  generated_at: string;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [summaries, setSummaries] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [planId, setPlanId] = useState<string>("free");
  const [tab, setTab] = useState<"approvals" | "tasks" | "actions" | "insights">("approvals");

  const fetchData = useCallback(async () => {
    try {
      const [tasksRes, patternsRes] = await Promise.all([
        fetch("/api/emma/tasks?type=all&limit=30"),
        fetch("/api/emma/patterns?status=pending"),
      ]);
      const tasksData = await tasksRes.json();
      const patternsData = await patternsRes.json();

      setTasks(tasksData.tasks || []);
      setActions(tasksData.actions || []);
      setApprovals(tasksData.approvals || []);
      setPatterns(patternsData.patterns || []);
      setPlanId(tasksData.planId || "free");

      // Build summary map from task rows that have a summary field
      const map = new Map<string, string>();
      for (const t of (tasksData.tasks || []) as Task[]) {
        if (t.summary) map.set(t.id, t.summary);
      }
      setSummaries(map);
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
      fetchData();
    } catch {}
  };

  const handlePattern = async (patternId: string, action: "accept" | "dismiss") => {
    try {
      await fetch("/api/emma/patterns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patternId, action }),
      });
      setPatterns((prev) => prev.filter((p) => p.id !== patternId));
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
        {/* Free-plan gate */}
        {!loading && planId === "free" && (
          <div className="rounded-2xl border border-emma-300/15 bg-emma-300/3 p-8 flex flex-col items-center text-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-full bg-emma-300/10 flex items-center justify-center">
              <Repeat size={20} className="text-emma-300/60" />
            </div>
            <div>
              <h2 className="text-sm font-medium text-emma-200/70 mb-1">Autonomous mode is a Starter feature</h2>
              <p className="text-xs font-light text-emma-200/30 max-w-sm">
                Upgrade to Starter to unlock scheduled tasks, webhooks, and up to 3 autonomous actions per hour.
              </p>
            </div>
            <a
              href="/settings/billing"
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emma-300 to-emma-400 text-sm font-medium text-emma-950 hover:opacity-90 transition-opacity"
            >
              Upgrade to Starter — $29/mo
            </a>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-surface-border">
          {([
            { id: "approvals", label: "Pending Approvals", count: approvals.length },
            { id: "tasks", label: "Tasks", count: tasks.length },
            { id: "actions", label: "Action Log", count: actions.length },
            { id: "insights", label: "Insights", count: patterns.length },
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
                  (t.id === "approvals" || t.id === "insights") && t.count > 0
                    ? "bg-amber-400/15 text-amber-300"
                    : "bg-emma-200/5 text-emma-200/25"
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
                    <Link
                      key={t.id}
                      href={`/settings/tasks/${t.id}`}
                      className="rounded-xl border border-surface-border bg-surface p-4 hover:border-emma-300/20 hover:bg-surface-hover transition-all group"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={t.status} />
                          <span className="text-xs font-light text-emma-200/60">{t.goal}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-emma-200/15">{formatTime(t.created_at)}</span>
                          <ChevronRight size={12} className="text-emma-200/15 group-hover:text-emma-300/40 transition-colors" />
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-emma-200/20">
                        <span>{t.trigger_type}</span>
                        <span>{t.steps_completed} steps</span>
                        <span>{formatTokens(t.total_tokens)} tokens</span>
                      </div>
                      {(summaries.get(t.id) || t.summary) && (
                        <p className="text-[11px] text-emma-200/35 mt-2 font-light line-clamp-2">
                          {summaries.get(t.id) || t.summary}
                        </p>
                      )}
                    </Link>
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

            {/* ── Insights ─────────────────────────────────────────────── */}
            {tab === "insights" && (
              <InsightsTab
                patterns={patterns}
                tasks={tasks}
                summaries={summaries}
                onPattern={handlePattern}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Insights Tab ────────────────────────────────────────────────────────────

function InsightsTab({
  patterns,
  tasks,
  summaries,
  onPattern,
}: {
  patterns: Pattern[];
  tasks: Task[];
  summaries: Map<string, string>;
  onPattern: (id: string, action: "accept" | "dismiss") => void;
}) {
  const completedWithSummary = tasks.filter((t) => summaries.get(t.id));

  return (
    <div className="flex flex-col gap-6">
      {/* Pattern cards */}
      {patterns.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={13} className="text-emma-300" />
            <span className="text-xs font-medium text-emma-300 tracking-wider">Detected Patterns</span>
          </div>
          <div className="flex flex-col gap-3">
            {patterns.map((p) => (
              <PatternCard key={p.id} pattern={p} onAction={onPattern} />
            ))}
          </div>
        </section>
      )}

      {patterns.length === 0 && completedWithSummary.length === 0 && (
        <div className="text-center text-sm text-emma-200/20 py-12">
          Complete a few tasks and I'll start noticing what you do repeatedly.
        </div>
      )}

      {/* Recent task summaries */}
      {completedWithSummary.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Repeat size={13} className="text-emma-200/30" />
            <span className="text-xs font-medium text-emma-200/40 tracking-wider">Recent Task Memories</span>
          </div>
          <div className="flex flex-col gap-2">
            {completedWithSummary.slice(0, 8).map((t) => (
              <Link
                key={t.id}
                href={`/settings/tasks/${t.id}`}
                className="rounded-xl border border-surface-border bg-surface p-3.5 hover:border-emma-300/20 transition-all group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-emma-200/40 font-light truncate mb-1">{t.goal}</p>
                    <p className="text-xs text-emma-200/60 font-light line-clamp-2">{summaries.get(t.id)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[10px] text-emma-200/15">{formatTime(t.created_at)}</span>
                    <ChevronRight size={11} className="text-emma-200/15 group-hover:text-emma-300/40 transition-colors" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function PatternCard({
  pattern,
  onAction,
}: {
  pattern: Pattern;
  onAction: (id: string, action: "accept" | "dismiss") => void;
}) {
  const typeLabel: Record<Pattern["pattern_type"], string> = {
    daily: "Daily habit",
    weekly: "Weekly pattern",
    tool_sequence: "Repeated workflow",
  };

  return (
    <div className="rounded-xl border border-emma-300/15 bg-emma-300/3 p-4">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-7 h-7 rounded-lg bg-emma-300/10 flex items-center justify-center shrink-0 mt-0.5">
          <TrendingUp size={13} className="text-emma-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] text-emma-300/60 font-medium uppercase tracking-widest">
              {typeLabel[pattern.pattern_type]}
            </span>
            <span className="text-[10px] text-emma-200/20">{pattern.frequency}×</span>
          </div>
          <p className="text-sm font-light text-emma-100/80">{pattern.suggestion}</p>
        </div>
      </div>

      {pattern.example_goals.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {pattern.example_goals.slice(0, 3).map((g, i) => (
            <span
              key={i}
              className="text-[10px] text-emma-200/30 bg-emma-200/5 px-2 py-0.5 rounded-full truncate max-w-[200px]"
            >
              {g}
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => onAction(pattern.id, "accept")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emma-300/15 border border-emma-300/20 text-[11px] text-emma-300 cursor-pointer hover:bg-emma-300/20 transition-all"
        >
          <Check size={11} /> Schedule it
        </button>
        <button
          onClick={() => onAction(pattern.id, "dismiss")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-transparent border border-surface-border text-[11px] text-emma-200/30 cursor-pointer hover:text-emma-200/50 transition-all"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

// ─── Shared Helpers ──────────────────────────────────────────────────────────

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
