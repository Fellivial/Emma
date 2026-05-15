"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  DollarSign,
  Users,
  Zap,
  TrendingUp,
  BarChart3,
  Gift,
  Database,
} from "lucide-react";

interface Client {
  id: string;
  slug: string;
  name: string;
  plan: string;
  memberCount: number;
  tokenBudget: number;
  monthlyTokens: number;
  monthlyMessages: number;
  budgetUsed: number;
  estimatedCost: number;
  createdAt: string;
}

interface Overview {
  mrr: number;
  mrrPrev: number;
  mrrGrowth: number;
  totalClients: number;
  paidClients: number;
  freeClients: number;
  churnRate: number;
  waitlistCount: number;
  totalMembers: number;
  totalTokens: number;
  totalCost: number;
}

interface Channel {
  channel: string;
  signups: number;
}

export default function AdminPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [referrals, setReferrals] = useState({ total: 0, converted: 0 });
  const [affiliates, setAffiliates] = useState({
    active: 0,
    totalReferrals: 0,
    totalCommissions: 0,
  });
  const [planDist, setPlanDist] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin")
      .then(async (r) => {
        if (!r.ok) {
          setError((await r.json()).error || `HTTP ${r.status}`);
          return;
        }
        const d = await r.json();
        setClients(d.clients || []);
        setOverview(d.overview || null);
        setChannels(d.channels || []);
        setReferrals(d.referrals || { total: 0, converted: 0 });
        setAffiliates(d.affiliates || { active: 0, totalReferrals: 0, totalCommissions: 0 });
        setPlanDist(d.planDistribution || {});
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emma-950 via-emma-900 to-emma-950 font-sans">
        <div className="text-center">
          <div className="text-2xl mb-2">🔒</div>
          <p className="text-sm text-red-300/60">{error}</p>
          <Link href="/" className="text-xs text-emma-300/40 mt-4 block hover:text-emma-300">
            ← Back
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emma-950 via-emma-900 to-emma-950 font-sans text-emma-100">
      <div className="border-b border-surface-border bg-emma-950/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-3">
          <Link href="/" className="text-emma-200/30 hover:text-emma-300 transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-sm font-semibold text-emma-300 tracking-wider">Growth Dashboard</h1>
            <p className="text-[10px] text-emma-200/25">MRR · Churn · Channels · Referrals</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-sm text-emma-200/20 py-20">Loading dashboard…</div>
      ) : (
        <div className="max-w-7xl mx-auto px-6 py-8">
          {/* ── Row 1: Core Metrics ──────────────────────────────────────── */}
          <div className="grid grid-cols-5 gap-3 mb-6">
            <MetricCard
              icon={<DollarSign size={14} />}
              label="MRR"
              value={`$${overview?.mrr?.toLocaleString() || 0}`}
              sub={
                overview?.mrrGrowth
                  ? `${overview.mrrGrowth > 0 ? "+" : ""}${overview.mrrGrowth}% vs last month`
                  : undefined
              }
              highlight
            />
            <MetricCard
              icon={<Users size={14} />}
              label="Paid Clients"
              value={String(overview?.paidClients || 0)}
              sub={`${overview?.freeClients || 0} free`}
            />
            <MetricCard
              icon={<TrendingUp size={14} />}
              label="Churn Rate"
              value={`${overview?.churnRate || 0}%`}
              sub="monthly"
              warn={overview?.churnRate ? overview.churnRate > 10 : false}
            />
            <MetricCard
              icon={<Database size={14} />}
              label="API Cost"
              value={`$${(overview?.totalCost || 0).toFixed(2)}`}
              sub={`${fmtTokens(overview?.totalTokens || 0)} tokens`}
            />
            <MetricCard
              icon={<Users size={14} />}
              label="Waitlist"
              value={String(overview?.waitlistCount || 0)}
            />
          </div>

          {/* ── Row 2: Channels + Referrals ──────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            {/* Channel Breakdown */}
            <div className="rounded-xl border border-surface-border bg-surface p-5">
              <h3 className="text-xs font-medium text-emma-200/30 uppercase tracking-widest mb-3">
                Top Channels
              </h3>
              {channels.length === 0 ? (
                <div className="text-[11px] text-emma-200/15 py-4 text-center">
                  No channel data yet
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {channels.slice(0, 6).map((ch) => {
                    const maxSignups = channels[0]?.signups || 1;
                    return (
                      <div key={ch.channel} className="flex items-center gap-3">
                        <span className="text-[11px] text-emma-200/50 w-20 truncate">
                          {ch.channel}
                        </span>
                        <div className="flex-1 h-2 rounded-full bg-emma-200/5 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emma-300/40"
                            style={{ width: `${(ch.signups / maxSignups) * 100}%` }}
                          />
                        </div>
                        <span className="text-[11px] text-emma-200/30 w-8 text-right">
                          {ch.signups}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Referrals + Affiliates */}
            <div className="rounded-xl border border-surface-border bg-surface p-5">
              <h3 className="text-xs font-medium text-emma-200/30 uppercase tracking-widest mb-3">
                Referrals & Affiliates
              </h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <MiniStat label="Referrals Sent" value={referrals.total} />
                <MiniStat label="Converted" value={referrals.converted} />
                <MiniStat label="Active Affiliates" value={affiliates.active} />
                <MiniStat label="Aff. Referrals" value={affiliates.totalReferrals} />
              </div>
              {affiliates.totalCommissions > 0 && (
                <div className="text-[10px] text-emma-200/20 border-t border-surface-border pt-2 mt-1">
                  Total commissions paid:{" "}
                  <span className="text-amber-300/50">
                    ${affiliates.totalCommissions.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ── Row 3: Plan Distribution ──────────────────────────────────── */}
          <div className="rounded-xl border border-surface-border bg-surface p-5 mb-6">
            <h3 className="text-xs font-medium text-emma-200/30 uppercase tracking-widest mb-3">
              Plan Distribution
            </h3>
            <div className="flex items-end gap-2 h-24">
              {["Free", "Starter", "Pro", "Enterprise"].map((plan) => {
                const count = planDist[plan] || 0;
                const max = Math.max(...Object.values(planDist), 1);
                const colors: Record<string, string> = {
                  Free: "bg-emma-200/15",
                  Starter: "bg-emerald-400/40",
                  Pro: "bg-blue-400/40",
                  Enterprise: "bg-emma-300/50",
                };
                return (
                  <div key={plan} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs text-emma-200/40">{count}</span>
                    <div
                      className="w-full rounded-t-md"
                      style={{ height: `${Math.max(4, (count / max) * 80)}px` }}
                    >
                      <div
                        className={`w-full h-full rounded-t-md ${colors[plan] || "bg-emma-200/10"}`}
                      />
                    </div>
                    <span className="text-[10px] text-emma-200/20">{plan}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Row 4: Client Table ───────────────────────────────────────── */}
          <h3 className="text-xs font-medium text-emma-200/30 uppercase tracking-widest mb-3">
            All Clients
          </h3>
          <div className="rounded-xl border border-surface-border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-surface-border bg-surface">
                  <th className="text-left px-4 py-3 font-medium text-emma-200/30">Client</th>
                  <th className="text-left px-4 py-3 font-medium text-emma-200/30">Plan</th>
                  <th className="text-right px-4 py-3 font-medium text-emma-200/30">Users</th>
                  <th className="text-right px-4 py-3 font-medium text-emma-200/30">Tokens</th>
                  <th className="text-right px-4 py-3 font-medium text-emma-200/30">Budget</th>
                  <th className="text-right px-4 py-3 font-medium text-emma-200/30">Cost</th>
                  <th className="text-right px-4 py-3 font-medium text-emma-200/30">Joined</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-surface-border/50 hover:bg-surface/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-emma-200/60">{c.name}</div>
                      <div className="text-[10px] text-emma-200/20">{c.slug}</div>
                    </td>
                    <td className="px-4 py-3">
                      <PlanBadge plan={c.plan} />
                    </td>
                    <td className="px-4 py-3 text-right text-emma-200/40">{c.memberCount}</td>
                    <td className="px-4 py-3 text-right text-emma-200/40 font-mono">
                      {fmtTokens(c.monthlyTokens)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <BudgetBar used={c.budgetUsed} />
                    </td>
                    <td className="px-4 py-3 text-right text-emma-200/40">${c.estimatedCost}</td>
                    <td className="px-4 py-3 text-right text-emma-200/25">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function MetricCard({
  icon,
  label,
  value,
  sub,
  highlight,
  warn,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        highlight
          ? "border-emerald-400/20 bg-emerald-400/3"
          : warn
            ? "border-red-400/15 bg-red-400/3"
            : "border-surface-border bg-surface"
      }`}
    >
      <div
        className={`mb-1.5 ${highlight ? "text-emerald-300/50" : warn ? "text-red-300/50" : "text-emma-200/20"}`}
      >
        {icon}
      </div>
      <div
        className={`text-xl font-light ${highlight ? "text-emerald-300" : warn ? "text-red-300" : "text-emma-200/60"}`}
      >
        {value}
      </div>
      <div className="text-[10px] text-emma-200/20 mt-0.5">{label}</div>
      {sub && <div className="text-[9px] text-emma-200/15 mt-0.5">{sub}</div>}
    </div>
  );
}

function FunnelRow({
  label,
  value,
  pct,
  color,
}: {
  label: string;
  value: number;
  pct: number;
  color?: string;
}) {
  return (
    <div>
      <div className="flex justify-between text-[11px] mb-1">
        <span className="text-emma-200/40">{label}</span>
        <span className="text-emma-200/30">
          {value} ({pct}%)
        </span>
      </div>
      <div className="h-2 rounded-full bg-emma-200/5 overflow-hidden">
        <div
          className={`h-full rounded-full ${color === "emerald" ? "bg-emerald-400/50" : "bg-emma-300/30"}`}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-lg font-light text-emma-200/50">{value}</div>
      <div className="text-[10px] text-emma-200/20">{label}</div>
    </div>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  const colors: Record<string, string> = {
    Enterprise: "bg-emma-300/10 text-emma-300 border-emma-300/20",
    Pro: "bg-blue-400/10 text-blue-300 border-blue-400/20",
    Starter: "bg-emerald-400/10 text-emerald-300 border-emerald-400/20",
    Free: "bg-emma-200/5 text-emma-200/25 border-emma-200/10",
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${colors[plan] || colors.Free}`}>
      {plan}
    </span>
  );
}

function BudgetBar({ used }: { used: number }) {
  const color = used > 90 ? "bg-red-400" : used > 70 ? "bg-amber-400" : "bg-emma-300/50";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-emma-200/5 overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.min(100, used)}%` }}
        />
      </div>
      <span className="text-[10px] text-emma-200/25 w-8 text-right">{used}%</span>
    </div>
  );
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}
