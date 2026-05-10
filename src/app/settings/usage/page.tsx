"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface DayBucket {
  day: string;
  tokens: number;
  messages: number;
}

function WeeklyChart({ data, loading }: { data: DayBucket[]; loading: boolean }) {
  if (!loading && !data.length) return null;
  const W = 280;
  const H = 64;
  const BAR_W = 28;
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  if (loading) {
    const GAP = (W - 7 * BAR_W) / 8;
    return (
      <div className="rounded-xl border border-surface-border bg-surface p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-medium text-emma-200/40 tracking-wider">Last 7 Days</span>
          <span className="text-[10px] text-emma-200/20">tokens per day</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H + 20}`} className="w-full" style={{ maxHeight: 88 }}>
          {DAYS.map((day, i) => {
            const x = GAP + i * (BAR_W + GAP);
            const barH = 12 + ((i * 7 + 3) % 5) * 8; // varied ghost heights
            return (
              <g key={day}>
                <rect
                  x={x}
                  y={H - barH}
                  width={BAR_W}
                  height={barH}
                  rx={5}
                  fill="rgba(232,160,191,0.04)"
                />
                <text
                  x={x + BAR_W / 2}
                  y={H + 14}
                  textAnchor="middle"
                  fontSize={9}
                  fill="rgba(232,160,191,0.1)"
                  fontFamily="Outfit, sans-serif"
                >
                  {day}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    );
  }

  const maxTokens = Math.max(...data.map((d) => d.tokens), 1);
  const GAP = (W - data.length * BAR_W) / (data.length + 1);
  const todayISO = new Date().toISOString().split("T")[0];

  return (
    <div className="rounded-xl border border-surface-border bg-surface p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-medium text-emma-200/40 tracking-wider">Last 7 Days</span>
        <span className="text-[10px] text-emma-200/20">tokens per day</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 20}`} className="w-full" style={{ maxHeight: 88 }}>
        {data.map((d, i) => {
          const x = GAP + i * (BAR_W + GAP);
          const barH = Math.max(3, (d.tokens / maxTokens) * H);
          const y = H - barH;
          const isToday = d.day === todayISO;
          const label = new Date(d.day + "T00:00:00").toLocaleDateString("en-US", {
            weekday: "short",
          });
          return (
            <g key={d.day}>
              <rect
                x={x}
                y={y}
                width={BAR_W}
                height={barH}
                rx={5}
                fill={
                  isToday
                    ? "rgba(232,160,191,0.5)"
                    : d.tokens === 0
                      ? "rgba(232,160,191,0.04)"
                      : "rgba(232,160,191,0.18)"
                }
              />
              <text
                x={x + BAR_W / 2}
                y={H + 14}
                textAnchor="middle"
                fontSize={9}
                fill={isToday ? "rgba(232,160,191,0.6)" : "rgba(232,160,191,0.2)"}
                fontFamily="Outfit, sans-serif"
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

interface MonthBucket {
  date: string;
  token_count: number;
  message_count: number;
}

interface AgentTask {
  id: string;
  goal: string;
  status: string;
  steps_taken: number;
  token_cost: number;
  trigger_type: string;
  created_at: string;
}

interface WindowUsage {
  windowType: string;
  tokensUsed: number;
  tokensLimit: number;
  messagesUsed: number;
  messagesLimit: number;
  tokenPct: number;
  messagePct: number;
  pct: number;
}

interface UsageData {
  windows: { daily: WindowUsage | null; weekly: WindowUsage | null; monthly: WindowUsage | null };
  extraPacks: { totalTokensRemaining: number; packs: any[] };
  planId: string;
  limits: Record<string, { tokens: number; messages: number }>;
}

export default function UsagePage() {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<UsageData | null>(null);
  const [history, setHistory] = useState<DayBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [monthHistory, setMonthHistory] = useState<MonthBucket[]>([]);
  const [agentTasks, setAgentTasks] = useState<AgentTask[]>([]);
  const [agentLoading, setAgentLoading] = useState(true);

  useEffect(() => {
    fetch("/api/emma/usage")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {
        /* graceful degradation */
      })
      .finally(() => setLoading(false));

    // 7-day history
    fetch("/api/emma/usage/history?days=7")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.history) setHistory(d.history);
      })
      .catch(() => {
        /* graceful degradation */
      })
      .finally(() => setHistoryLoading(false));

    // 30-day token history + last 20 agent tasks from Supabase
    const fetchAgentData = async () => {
      try {
        if (!supabase) return;
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const [{ data: usageRows }, { data: taskRows }] = await Promise.all([
          supabase
            .from("usage")
            .select("date, token_count, message_count")
            .eq("user_id", user.id)
            .gte("date", thirtyDaysAgo.toISOString().split("T")[0])
            .order("date", { ascending: true }),
          supabase
            .from("tasks")
            .select("id, goal, status, steps_taken, token_cost, trigger_type, created_at")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(20),
        ]);

        setMonthHistory(usageRows ?? []);
        setAgentTasks(taskRows ?? []);
      } catch {
        // graceful degradation
      } finally {
        setAgentLoading(false);
      }
    };
    fetchAgentData();
  }, [supabase]);

  const windows = data
    ? [
        {
          key: "daily",
          label: "Today",
          reset: "Resets at midnight",
          w: data.windows.daily,
          lim: data.limits.daily,
        },
        {
          key: "weekly",
          label: "This Week",
          reset: "Resets Monday",
          w: data.windows.weekly,
          lim: data.limits.weekly,
        },
        {
          key: "monthly",
          label: "This Month",
          reset: `Resets ${fmtAnchor()}`,
          w: data.windows.monthly,
          lim: data.limits.monthly,
        },
      ]
    : [];

  const mostConstrained = windows.reduce(
    (max, w) => ((w.w?.pct || 0) > (max?.w?.pct || 0) ? w : max),
    windows[0]
  );
  const showExtraPack = data && (data.planId === "free" || data.planId === "starter");

  return (
    <div className="max-w-3xl mx-auto px-8 py-8">
      <div className="mb-8">
        <h1 className="text-xl font-light text-emma-100">Usage</h1>
        <p className="text-xs text-emma-300/50 mt-1">Token consumption across all windows.</p>
      </div>
      {loading ? (
        <div className="text-center text-sm text-emma-200/20 py-12">Loading usage…</div>
      ) : (
        <>
          {/* Three window meters */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {windows.map((win) => {
              const w = win.w;
              const pct = w?.pct || 0;
              const isMost = win.key === mostConstrained?.key && pct > 0;
              const isWarning = pct >= 80 && pct < 100;
              const isBlocked = pct >= 100;

              return (
                <div
                  key={win.key}
                  className={`rounded-xl border p-4 ${
                    isMost && pct > 50 ? "border-emma-300/25" : "border-surface-border"
                  } bg-surface`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-emma-200/50">{win.label}</span>
                    {isWarning && <span className="text-[10px] text-amber-300">Running low</span>}
                    {isBlocked && <span className="text-[10px] text-red-300">Limit reached</span>}
                  </div>

                  {/* Progress bar */}
                  <div className="h-2.5 rounded-full bg-emma-200/5 overflow-hidden mb-3">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isBlocked ? "bg-red-500" : isWarning ? "bg-amber-500" : "bg-violet-500/70"
                      }`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>

                  {/* Token fraction */}
                  <div className="text-[11px] text-emma-200/40 mb-1">
                    <span className="font-mono">{fmtTokens(w?.tokensUsed || 0)}</span>
                    <span className="text-emma-200/15">
                      {" "}
                      / {fmtTokens(win.lim?.tokens || 0)} tokens
                    </span>
                  </div>

                  {/* Message fraction */}
                  <div className="text-[11px] text-emma-200/40 mb-2">
                    <span className="font-mono">{w?.messagesUsed || 0}</span>
                    <span className="text-emma-200/15"> / {win.lim?.messages || 0} messages</span>
                  </div>

                  {/* Percentage */}
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-lg font-light ${
                        isBlocked
                          ? "text-red-300"
                          : isWarning
                            ? "text-amber-300"
                            : "text-emma-200/50"
                      }`}
                    >
                      {pct}%
                    </span>
                    <span className="text-[10px] text-emma-200/15">{win.reset}</span>
                  </div>

                  {isBlocked && (
                    <Link
                      href="/settings/billing?addon=extra_pack"
                      className="block mt-3 text-center py-2 rounded-lg bg-emma-300/10 border border-emma-300/15 text-[11px] text-emma-300"
                    >
                      Get Extra Time →
                    </Link>
                  )}
                </div>
              );
            })}
          </div>

          {/* 7-day bar chart */}
          <WeeklyChart data={history} loading={historyLoading} />

          {/* Extra Pack section */}
          {showExtraPack && (
            <div className="rounded-xl border border-surface-border bg-surface p-5 mb-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-medium text-emma-200/60 mb-1">Need more today?</h3>
                  {data.extraPacks.totalTokensRemaining > 0 ? (
                    <p className="text-[11px] text-emma-200/30">
                      You have{" "}
                      <span className="text-emma-300 font-mono">
                        {fmtTokens(data.extraPacks.totalTokensRemaining)}
                      </span>{" "}
                      extra tokens remaining
                    </p>
                  ) : (
                    <p className="text-[11px] text-emma-200/25">
                      500 extra messages, valid for 30 days
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href="/settings/billing?addon=extra_pack"
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-emma-300 to-emma-400 text-xs font-medium text-emma-950"
                  >
                    Buy Extra Pack — $9
                  </Link>
                  <Link
                    href="/settings/billing"
                    className="text-[11px] text-emma-300/40 hover:text-emma-300/60"
                  >
                    Or upgrade →
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Upgrade nudge if consistently hitting limits */}
          {windows.some((w) => (w.w?.pct || 0) >= 80) &&
            data?.planId !== "pro" &&
            data?.planId !== "enterprise" && (
              <div className="rounded-xl border border-amber-400/10 bg-amber-400/3 p-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-amber-300/50" />
                  <span className="text-[11px] text-emma-200/35">
                    You're consistently hitting your limit. Pro gives you 2× the monthly budget.
                  </span>
                </div>
                <Link href="/settings/billing" className="text-[11px] text-emma-300 shrink-0 ml-3">
                  See Pro Plan →
                </Link>
              </div>
            )}

          {/* ── 30-day token chart ────────────────────────────────── */}
          {monthHistory.length > 0 && (
            <MonthChart data={monthHistory} monthlyBudget={data?.limits?.monthly?.tokens ?? 0} />
          )}

          {/* ── Agent activity summary + task history ─────────────── */}
          {!agentLoading && (
            <>
              <AgentSummary tasks={agentTasks} />
              <TaskHistory tasks={agentTasks} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function fmtAnchor(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// ── 30-day token bar chart ────────────────────────────────────────────────────

function MonthChart({ data, monthlyBudget }: { data: MonthBucket[]; monthlyBudget: number }) {
  const totalTokens = data.reduce((s, d) => s + d.token_count, 0);
  const maxTokens = Math.max(...data.map((d) => d.token_count), 1);
  const pct =
    monthlyBudget > 0 ? Math.min(100, Math.round((totalTokens / monthlyBudget) * 100)) : 0;
  const barColor = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-violet-500/70";

  const W = 560;
  const H = 64;
  const barW = Math.max(4, Math.floor((W - (data.length + 1) * 2) / data.length));
  const gap = Math.floor((W - data.length * barW) / (data.length + 1));

  return (
    <div className="rounded-xl border border-surface-border bg-surface p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-medium text-emma-200/40 tracking-wider">Last 30 Days</span>
        <span className="text-[10px] text-emma-200/20">tokens per day</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H + 20}`} className="w-full" style={{ maxHeight: 88 }}>
        {data.map((d, i) => {
          const x = gap + i * (barW + gap);
          const bh = Math.max(3, (d.token_count / maxTokens) * H);
          const isWeekend = [0, 6].includes(new Date(d.date).getDay());
          return (
            <g key={d.date}>
              <rect
                x={x}
                y={H - bh}
                width={barW}
                height={bh}
                rx={2}
                fill={
                  d.token_count === 0
                    ? "rgba(232,160,191,0.04)"
                    : isWeekend
                      ? "rgba(232,160,191,0.12)"
                      : "rgba(232,160,191,0.22)"
                }
              />
              {/* show day label every 5 bars */}
              {i % 5 === 0 && (
                <text
                  x={x + barW / 2}
                  y={H + 14}
                  textAnchor="middle"
                  fontSize={8}
                  fill="rgba(232,160,191,0.18)"
                  fontFamily="Outfit, sans-serif"
                >
                  {new Date(d.date).toLocaleDateString("en-US", {
                    month: "numeric",
                    day: "numeric",
                  })}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {monthlyBudget > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px] mb-1.5">
            <span className="text-emma-200/30">
              <span className="font-mono text-emma-200/60">{fmtTokens(totalTokens)}</span> /{" "}
              {fmtTokens(monthlyBudget)} tokens this month
            </span>
            <span
              className={`font-mono ${pct >= 90 ? "text-red-300" : pct >= 70 ? "text-amber-300" : "text-emma-200/40"}`}
            >
              {pct}%
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-emma-200/5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${barColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Agent activity summary cards ──────────────────────────────────────────────

function AgentSummary({ tasks }: { tasks: AgentTask[] }) {
  if (tasks.length === 0) return null;

  const thisMonth = new Date();
  thisMonth.setDate(1);
  thisMonth.setHours(0, 0, 0, 0);

  const monthTasks = tasks.filter((t) => new Date(t.created_at) >= thisMonth);
  const completed = tasks.filter((t) => t.status === "completed").length;
  const successRate = tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0;
  const avgSteps =
    tasks.length > 0
      ? (tasks.reduce((s, t) => s + (t.steps_taken ?? 0), 0) / tasks.length).toFixed(1)
      : "0";
  const totalAgentTokens = tasks.reduce((s, t) => s + (t.token_cost ?? 0), 0);

  const stats = [
    { label: "Tasks this month", value: String(monthTasks.length) },
    { label: "Success rate", value: `${successRate}%` },
    { label: "Avg steps / task", value: avgSteps },
    { label: "Agent tokens", value: fmtTokens(totalAgentTokens) },
  ];

  return (
    <div className="mb-6">
      <h2 className="text-[10px] font-medium text-emma-200/20 uppercase tracking-[0.2em] mb-3">
        Agent Activity
      </h2>
      <div className="grid grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-surface-border bg-surface p-4">
            <div className="text-xl font-light text-emma-200/70 font-mono mb-1">{s.value}</div>
            <div className="text-[10px] text-emma-200/25">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Task history table ────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-emerald-400/10 text-emerald-300 border-emerald-400/20",
  failed: "bg-red-400/10 text-red-300 border-red-400/20",
  awaiting_approval: "bg-amber-400/10 text-amber-300 border-amber-400/20",
  running: "bg-blue-400/10 text-blue-300 border-blue-400/20",
  max_steps_reached: "bg-purple-400/10 text-purple-300 border-purple-400/20",
};

function TaskHistory({ tasks }: { tasks: AgentTask[] }) {
  if (tasks.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="text-[10px] font-medium text-emma-200/20 uppercase tracking-[0.2em] mb-3">
        Task History
      </h2>
      <div className="flex flex-col gap-1.5">
        {tasks.map((t) => (
          <Link
            key={t.id}
            href={`/settings/provenance?taskId=${t.id}`}
            className="rounded-xl border border-surface-border bg-surface p-4 hover:border-emma-300/20 hover:bg-surface-hover transition-all group"
          >
            <div className="flex items-center justify-between gap-3 mb-1">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${STATUS_STYLES[t.status] ?? STATUS_STYLES.failed}`}
                >
                  {t.status.replace(/_/g, " ")}
                </span>
                <span className="text-xs font-light text-emma-200/60 truncate">{t.goal}</span>
              </div>
              <span className="text-[10px] text-emma-200/15 shrink-0">
                {fmtRelative(t.created_at)}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-emma-200/20">
              <span className="capitalize">{t.trigger_type}</span>
              <span>{t.steps_taken ?? 0} steps</span>
              <span>{fmtTokens(t.token_cost ?? 0)} tokens</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
