"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

interface DayBucket {
  day: string;
  tokens: number;
  messages: number;
}

function WeeklyChart({ data }: { data: DayBucket[] }) {
  if (!data.length) return null;
  const maxTokens = Math.max(...data.map((d) => d.tokens), 1);
  const W = 280;
  const H = 64;
  const BAR_W = 28;
  const GAP = (W - data.length * BAR_W) / (data.length + 1);
  const TODAY = new Date().toLocaleDateString("en-US", { weekday: "short" });

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
          const isToday = d.day.slice(0, 3) === TODAY.slice(0, 3);
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
                {d.day.slice(0, 3)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
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
  const [data, setData] = useState<UsageData | null>(null);
  const [history, setHistory] = useState<DayBucket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/emma/usage")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));

    // 7-day history — gracefully ignored if endpoint not present
    fetch("/api/emma/usage/history?days=7")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.history) setHistory(d.history);
      })
      .catch(() => {});
  }, []);

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
          <WeeklyChart data={history} />

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
