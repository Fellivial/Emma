"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { Info, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WindowUsage {
  tokensUsed: number;
  tokensLimit: number;
  messagesUsed: number;
  messagesLimit: number;
  tokenPct: number;
  messagePct: number;
  pct: number;
}

interface ExtraPack {
  id: string;
  tokensGranted: number;
  tokensRemaining: number;
  validUntil: string;
}

interface UsageData {
  windows: { daily: WindowUsage | null };
  extraPacks: { totalTokensRemaining: number; packs: ExtraPack[] };
  planId: string;
  limits: Record<string, { tokens: number; messages: number }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function getWindowResetMs(): number {
  const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
  const windowStart = Math.floor(Date.now() / FIVE_HOURS_MS) * FIVE_HOURS_MS;
  return windowStart + FIVE_HOURS_MS - Date.now();
}

function fmtCountdown(ms: number): string {
  if (ms <= 0) return "now";
  const totalSecs = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  return hrs > 0 ? `${hrs} hr ${mins} min` : `${mins} min`;
}

function fmtExpiryDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtAgoMin(ms: number): string {
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  return `${m} minute${m !== 1 ? "s" : ""} ago`;
}

// ─── MeterRow ─────────────────────────────────────────────────────────────────

function MeterRow({
  label,
  tooltip,
  pct,
  sub,
  dim = false,
  thick = false,
}: {
  label: string;
  tooltip?: string;
  pct: number;
  sub?: string;
  dim?: boolean;
  thick?: boolean;
}) {
  const clamped = Math.min(100, pct);
  const isWarn = pct >= 80 && pct < 100;
  const isBlock = pct >= 100;
  const barColor = isBlock ? "bg-red-400" : isWarn ? "bg-amber-400" : "bg-blue-400";
  const pctColor = isBlock ? "text-red-300" : isWarn ? "text-amber-300" : "text-emma-200/50";

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className={`text-sm ${dim ? "text-emma-200/35" : "text-emma-200/70"}`}>
            {label}
          </span>
          {tooltip && (
            <span title={tooltip}>
              <Info size={12} className="text-emma-200/20 cursor-help" />
            </span>
          )}
        </div>
        <span className={`text-sm ${dim ? "text-emma-200/25" : pctColor}`}>
          {dim ? "—" : `${clamped}% used`}
        </span>
      </div>
      <div
        className={`rounded-full overflow-hidden ${thick ? "h-2" : "h-1.5"} ${dim ? "bg-emma-200/4" : "bg-emma-200/8"}`}
      >
        {!dim && (
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${clamped}%` }}
          />
        )}
      </div>
      {sub && (
        <p className={`text-xs mt-1.5 ${dim ? "text-emma-200/20" : "text-emma-200/25"}`}>{sub}</p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function UsagePage() {
  const supabase = useMemo(() => createClient(), []);

  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState<number>(Date.now());
  const [agentTaskCount, setAgentTaskCount] = useState(0);
  const [now, setNow] = useState<number>(Date.now());

  // Drives countdown + "last updated" re-renders every 30 s
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/emma/usage");
      if (res.ok) setData(await res.json());
      setFetchedAt(Date.now());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();

    const fetchTaskCount = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const { data: tasks } = await supabase
          .from("tasks")
          .select("id")
          .eq("user_id", user.id)
          .gte("created_at", todayStart.toISOString());
        setAgentTaskCount(tasks?.length ?? 0);
      } catch {
        /* graceful */
      }
    };
    fetchTaskCount();
  }, [refresh, supabase]);

  // Derived values
  const win = data?.windows?.daily;
  const planId = data?.planId ?? "free";
  const planLabel = planId.charAt(0).toUpperCase() + planId.slice(1);

  const pct = win?.pct ?? 0;
  const tokenPct = win?.tokenPct ?? 0;
  const messagePct = win?.messagePct ?? 0;
  const tokensUsed = win?.tokensUsed ?? 0;
  const tokensLimit = win?.tokensLimit ?? (data?.limits?.daily?.tokens ?? 0);
  const messagesUsed = win?.messagesUsed ?? 0;
  const messagesLimit = win?.messagesLimit ?? (data?.limits?.daily?.messages ?? 0);

  const extraPacks = data?.extraPacks?.packs ?? [];
  const totalExtraTokens = data?.extraPacks?.totalTokensRemaining ?? 0;
  const showPacks = planId === "free" || planId === "starter";

  // Live-computed from `now` state so they refresh every 30 s
  const resetIn = `Resets in ${fmtCountdown(getWindowResetMs())}`;
  const lastUpdatedLabel = fmtAgoMin(now - fetchedAt);

  const actionsLabel = planId === "starter" ? "3 / hr limit" : planId === "pro" ? "50 / hr limit" : "";

  if (loading && !data) {
    return (
      <div className="max-w-2xl mx-auto px-8 py-10 animate-pulse space-y-4">
        <div className="h-5 w-64 bg-emma-200/5 rounded-lg" />
        <div className="h-2 w-full bg-emma-200/4 rounded-full mt-6" />
        <div className="h-2 w-full bg-emma-200/3 rounded-full mt-5" />
        <div className="h-2 w-full bg-emma-200/3 rounded-full mt-5" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-8 py-8">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-8">
        <h1 className="text-lg font-medium text-emma-100">Plan usage limits</h1>
        <span className="text-xs px-2.5 py-0.5 rounded-full bg-emma-300/10 border border-emma-300/20 text-emma-300 font-medium capitalize">
          {planLabel}
        </span>
      </div>

      {/* ── Current window — main meter ────────────────────────────────── */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-emma-200/80">Current window</span>
          <span
            className={`text-sm ${pct >= 100 ? "text-red-300" : pct >= 80 ? "text-amber-300" : "text-emma-200/50"}`}
          >
            {Math.min(100, pct)}% used
          </span>
        </div>
        <div className="h-2 rounded-full bg-emma-200/8 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              pct >= 100 ? "bg-red-400" : pct >= 80 ? "bg-amber-400" : "bg-blue-400"
            }`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
        <p className="text-xs text-emma-200/30 mt-2">{resetIn}</p>
      </div>

      <Link
        href="/settings/billing"
        className="text-xs text-emma-300/50 hover:text-emma-300/80 transition-colors"
      >
        Learn more about usage limits
      </Link>

      <div className="border-t border-surface-border my-6" />

      {/* ── Sub-metrics ───────────────────────────────────────────────────── */}
      <div className="space-y-5">
        <MeterRow
          label="Chat responses"
          tooltip="Messages sent to Emma this window"
          pct={messagePct}
          sub={
            messagesUsed === 0
              ? "You haven't sent any messages yet"
              : `${messagesUsed} of ${messagesLimit} messages · ${resetIn}`
          }
        />
        <MeterRow
          label="Token budget"
          tooltip="Tokens consumed across all requests this window"
          pct={tokenPct}
          sub={
            tokensUsed === 0
              ? "No token activity yet"
              : `${fmtTokens(tokensUsed)} of ${fmtTokens(tokensLimit)} tokens · ${resetIn}`
          }
        />
      </div>

      {/* Last updated */}
      <div className="flex items-center gap-1.5 mt-6">
        <span className="text-xs text-emma-200/20">Last updated: {lastUpdatedLabel}</span>
        <button
          onClick={refresh}
          disabled={loading}
          className="text-emma-200/20 hover:text-emma-200/50 transition-colors disabled:opacity-30"
        >
          <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="border-t border-surface-border my-6" />

      {/* ── Additional features ───────────────────────────────────────────── */}
      <h2 className="text-sm font-medium text-emma-200/50 mb-5">Additional features</h2>

      {planId === "free" ? (
        <MeterRow
          label="Autonomous runs"
          tooltip="Requires Starter plan or above"
          pct={0}
          dim
          sub="Upgrade to Starter to unlock agent loop & routines."
        />
      ) : (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-emma-200/70">Autonomous runs today</span>
              <span title="Agent tasks triggered by routines or schedules">
                <Info size={12} className="text-emma-200/20 cursor-help" />
              </span>
            </div>
            <span className="text-sm text-emma-200/50">
              {agentTaskCount}
              {actionsLabel && (
                <span className="text-emma-200/25 ml-1 text-xs">· {actionsLabel}</span>
              )}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-emma-200/8 overflow-hidden">
            <div className="h-full rounded-full bg-blue-400 w-0 transition-all duration-500" />
          </div>
          <p className="text-xs text-emma-200/25 mt-1.5">
            {agentTaskCount === 0
              ? "You haven't run any agent tasks today"
              : `${agentTaskCount} task${agentTaskCount !== 1 ? "s" : ""} run today`}
          </p>
        </div>
      )}

      {/* ── Response packs ────────────────────────────────────────────────── */}
      {showPacks && (
        <>
          <div className="border-t border-surface-border my-6" />

          <h2 className="text-sm font-medium text-emma-200/50 mb-1.5">Response packs</h2>
          <p className="text-xs text-emma-200/30 mb-5">
            Extra tokens to keep going when you hit your window limit.
          </p>

          {extraPacks.length > 0 ? (
            <div className="space-y-4 mb-6">
              {extraPacks.map((pack) => {
                const used = pack.tokensGranted - pack.tokensRemaining;
                const usedPct =
                  pack.tokensGranted > 0 ? Math.round((used / pack.tokensGranted) * 100) : 0;
                return (
                  <div key={pack.id}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-emma-200/70">
                        {fmtTokens(pack.tokensRemaining)} remaining
                      </span>
                      <span className="text-sm text-emma-200/50">{usedPct}% used</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-emma-200/8 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-amber-400 transition-all duration-500"
                        style={{ width: `${usedPct}%` }}
                      />
                    </div>
                    <p className="text-xs text-emma-200/25 mt-1.5">
                      Expires {fmtExpiryDate(pack.validUntil)}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-emma-200/40">No active packs</span>
                <span className="text-sm text-emma-200/20">—</span>
              </div>
              <div className="h-1.5 rounded-full bg-emma-200/5 overflow-hidden" />
              <p className="text-xs text-emma-200/20 mt-1.5">500K tokens · valid 30 days</p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-xs text-emma-200/30">
              {totalExtraTokens > 0 ? (
                <>
                  <span className="font-mono text-emma-200/60">{fmtTokens(totalExtraTokens)}</span>{" "}
                  tokens available
                </>
              ) : (
                "No extra tokens"
              )}
            </p>
            <div className="flex items-center gap-3">
              <Link
                href="/settings/billing"
                className="text-xs text-emma-200/30 hover:text-emma-200/60 transition-colors"
              >
                Or upgrade →
              </Link>
              <Link
                href="/settings/billing?addon=extra_pack"
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-emma-300 to-emma-400 text-xs font-medium text-emma-950"
              >
                Buy pack — $9
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
