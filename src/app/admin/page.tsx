"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  DollarSign,
  Users,
  Zap,
  TrendingUp,
  Database,
  Search,
  ShieldCheck,
  AlertTriangle,
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

interface WaitlistEntry {
  id: string;
  email: string;
  name: string;
  status: "waiting" | "invited" | "converted";
  created_at: string;
  invited_at?: string;
}

interface FeedbackStats {
  total: number;
  up: number;
  down: number;
}

interface WaitlistStats {
  maxSpots: number;
  activeUsers: number;
  spotsRemaining: number;
  waiting: number;
  invited: number;
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
  const [feedback, setFeedback] = useState<FeedbackStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"clients" | "waitlist" | "diagnostics">("clients");
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [wlStats, setWlStats] = useState<WaitlistStats | null>(null);
  const [capInput, setCapInput] = useState("");
  const [inviting, setInviting] = useState<string | null>(null);
  const [wlLoading, setWlLoading] = useState(false);
  const [capSaving, setCapSaving] = useState(false);
  const [capSaved, setCapSaved] = useState(false);
  const [diagnosticLookupType, setDiagnosticLookupType] = useState<"email" | "userId" | "clientId">(
    "email"
  );
  const [diagnosticLookup, setDiagnosticLookup] = useState("");
  const [diagnostics, setDiagnostics] = useState<Record<string, unknown> | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);

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
        setFeedback(d.feedback || null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  async function fetchWaitlist() {
    setWlLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        fetch("/api/emma/waitlist-manage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "list" }),
        }),
        fetch("/api/emma/waitlist-manage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "stats" }),
        }),
      ]);
      const { entries } = await listRes.json();
      const stats = await statsRes.json();
      setWaitlist(entries || []);
      setWlStats(stats);
      setCapInput((prev) => prev || String(stats.maxSpots ?? ""));
    } finally {
      setWlLoading(false);
    }
  }

  async function fetchDiagnostics() {
    const value = diagnosticLookup.trim();
    if (!value) return;
    setDiagnosticsLoading(true);
    setDiagnosticsError(null);
    try {
      const params = new URLSearchParams({ [diagnosticLookupType]: value });
      const res = await fetch(`/api/admin/diagnostics?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setDiagnostics(null);
        setDiagnosticsError(data.error || `HTTP ${res.status}`);
        return;
      }
      setDiagnostics(data);
    } catch (err) {
      setDiagnostics(null);
      setDiagnosticsError(String(err));
    } finally {
      setDiagnosticsLoading(false);
    }
  }

  async function inviteUser(id: string) {
    setInviting(id);
    try {
      await fetch("/api/emma/waitlist-manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "invite", waitlistId: id }),
      });
      await fetchWaitlist();
    } finally {
      setInviting(null);
    }
  }

  async function saveCap() {
    const n = parseInt(capInput, 10);
    if (!n || n < 1) return;
    setCapSaving(true);
    await fetch("/api/emma/waitlist-manage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_cap", maxUsers: n }),
    });
    await fetchWaitlist();
    setCapSaving(false);
    setCapSaved(true);
    setTimeout(() => setCapSaved(false), 1500);
  }

  const userDiagnostics = asRecord(diagnostics?.userDiagnostics);
  const billingDiagnostics = asRecord(diagnostics?.billingDiagnostics);
  const aiDiagnostics = asRecord(diagnostics?.aiDiagnostics);
  const operationalDiagnostics = asRecord(diagnostics?.operationalDiagnostics);
  const supportSummary = asRecord(diagnostics?.supportSummary);
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
          <Link
            href="/"
            aria-label="Back to home"
            className="w-11 h-11 flex items-center justify-center text-emma-200/30 hover:text-emma-300 transition-colors -ml-2"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-sm font-semibold text-emma-300 tracking-wider">Growth Dashboard</h1>
            <p className="text-[10px] text-emma-200/25">MRR · Churn · Channels · Referrals</p>
          </div>
        </div>
      </div>

      <div className="border-b border-surface-border bg-emma-950/60">
        <div className="max-w-7xl mx-auto px-6 flex">
          {(["clients", "diagnostics", "waitlist"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                if (tab === "waitlist") fetchWaitlist();
              }}
              className={`px-4 py-3 min-h-[44px] text-xs capitalize transition-colors border-b-2 -mb-px ${
                activeTab === tab
                  ? "border-emma-300/50 text-emma-300/80"
                  : "border-transparent text-emma-200/30 hover:text-emma-200/60"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "clients" && loading ? (
        <div className="text-center text-sm text-emma-200/20 py-20">Loading dashboard…</div>
      ) : activeTab === "waitlist" ? (
        <div className="max-w-7xl mx-auto px-6 py-8">
          {/* ── Waitlist Stats ────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-6">
            <MetricCard
              icon={<Users size={14} />}
              label="Waiting"
              value={String(wlStats?.waiting ?? "—")}
            />
            <MetricCard
              icon={<Zap size={14} />}
              label="Invited"
              value={String(wlStats?.invited ?? "—")}
            />
            <MetricCard
              icon={<Users size={14} />}
              label="Active Users"
              value={String(wlStats?.activeUsers ?? "—")}
              highlight
            />
            <MetricCard
              icon={<TrendingUp size={14} />}
              label="Spots Left"
              value={String(wlStats?.spotsRemaining ?? "—")}
            />
            <div className="rounded-xl border border-surface-border bg-surface p-4">
              <div className="text-emma-200/20 mb-1.5">
                <Database size={14} />
              </div>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="number"
                  min={1}
                  value={capInput}
                  onChange={(e) => setCapInput(e.target.value)}
                  className="w-16 bg-emma-950 border border-surface-border rounded px-2 py-1 text-xs text-emma-200/60 focus:outline-none focus:border-emma-300/30"
                />
                <button
                  onClick={saveCap}
                  disabled={capSaving}
                  className="text-[10px] px-2 py-1 rounded bg-emma-300/10 text-emma-300/60 hover:bg-emma-300/20 transition-colors disabled:opacity-40"
                >
                  {capSaving ? "Saving…" : capSaved ? "Saved ✓" : "Set"}
                </button>
              </div>
              <div className="text-[10px] text-emma-200/20 mt-0.5">Seat cap</div>
            </div>
          </div>

          {/* ── Waitlist Table ────────────────────────────────────────────── */}
          {wlLoading ? (
            <div className="text-center text-sm text-emma-200/20 py-12">Loading waitlist…</div>
          ) : (
            <div className="rounded-xl border border-surface-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-surface-border bg-surface">
                    <th className="text-left px-4 py-3 font-medium text-emma-200/30">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-emma-200/30">Email</th>
                    <th className="text-left px-4 py-3 font-medium text-emma-200/30">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-emma-200/30">Joined</th>
                    <th className="text-right px-4 py-3 font-medium text-emma-200/30">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {waitlist.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-8 text-center text-[11px] text-emma-200/20"
                      >
                        No waitlist entries yet
                      </td>
                    </tr>
                  ) : (
                    waitlist.map((entry) => (
                      <tr
                        key={entry.id}
                        className="border-b border-surface-border/50 hover:bg-surface/50 transition-colors"
                      >
                        <td className="px-4 py-3 text-emma-200/60">{entry.name || "—"}</td>
                        <td className="px-4 py-3 text-emma-200/40 font-mono text-[11px]">
                          {entry.email}
                        </td>
                        <td className="px-4 py-3">
                          <WaitlistBadge status={entry.status} />
                        </td>
                        <td className="px-4 py-3 text-right text-emma-200/25">
                          {new Date(entry.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {entry.status === "waiting" && (
                            <button
                              onClick={() => inviteUser(entry.id)}
                              disabled={inviting === entry.id}
                              className="text-[10px] px-3 py-1 rounded-full bg-emma-300/10 text-emma-300/60 hover:bg-emma-300/20 disabled:opacity-40 transition-colors"
                            >
                              {inviting === entry.id ? "Approving…" : "Approve"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : activeTab === "diagnostics" ? (
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="rounded-xl border border-surface-border bg-surface p-5 mb-6">
            <div className="flex items-center gap-2 mb-4 text-emma-300/70">
              <ShieldCheck size={16} />
              <h2 className="text-xs font-medium uppercase tracking-widest">Support Diagnostics</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-[160px_1fr_auto]">
              <select
                value={diagnosticLookupType}
                onChange={(e) =>
                  setDiagnosticLookupType(e.target.value as "email" | "userId" | "clientId")
                }
                className="bg-emma-950 border border-surface-border rounded-md px-3 py-2 text-xs text-emma-200/70 focus:outline-none focus:border-emma-300/40"
              >
                <option value="email">Email</option>
                <option value="userId">User ID</option>
                <option value="clientId">Client ID</option>
              </select>
              <input
                value={diagnosticLookup}
                onChange={(e) => setDiagnosticLookup(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") fetchDiagnostics();
                }}
                placeholder="Lookup value"
                className="bg-emma-950 border border-surface-border rounded-md px-3 py-2 text-xs text-emma-200/70 focus:outline-none focus:border-emma-300/40"
              />
              <button
                onClick={fetchDiagnostics}
                disabled={diagnosticsLoading || !diagnosticLookup.trim()}
                className="min-h-[38px] px-4 rounded-md bg-emma-300/10 text-emma-300/70 hover:bg-emma-300/20 disabled:opacity-40 transition-colors flex items-center justify-center gap-2 text-xs"
              >
                <Search size={14} />
                {diagnosticsLoading ? "Checking" : "Lookup"}
              </button>
            </div>
            {diagnosticsError && (
              <div className="mt-3 flex items-center gap-2 text-xs text-red-300/70">
                <AlertTriangle size={14} />
                {diagnosticsError}
              </div>
            )}
          </div>

          {diagnostics ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <DiagnosticSection title="Support Summary">
                <DiagnosticList label="Why can't use Emma" value={supportSummary.whyCantUseEmma} />
                <DiagnosticList label="Why still Free" value={supportSummary.whyStillFree} />
                <DiagnosticList label="Why tools fail" value={supportSummary.whyCantAccessTools} />
                <DiagnosticLine label="Over budget" value={supportSummary.areTheyOverBudget} />
                <DiagnosticLine label="Billing healthy" value={supportSummary.isBillingHealthy} />
                <DiagnosticLine label="Recent failures" value={supportSummary.hasRecentFailures} />
              </DiagnosticSection>

              <DiagnosticSection title="User Diagnostics">
                <DiagnosticLine label="Account" value={userDiagnostics.accountStatus} />
                <DiagnosticLine label="Waitlist" value={userDiagnostics.waitlistStatus} />
                <DiagnosticLine label="Onboarding" value={userDiagnostics.onboardingComplete} />
                <DiagnosticLine label="Plan" value={userDiagnostics.currentPlan} />
                <DiagnosticLine label="Subscription" value={userDiagnostics.subscriptionStatus} />
                <DiagnosticLine label="Token balance" value={userDiagnostics.tokenBalance} />
                <DiagnosticLine label="Memory enabled" value={userDiagnostics.memoryEnabled} />
              </DiagnosticSection>

              <DiagnosticSection title="Billing Diagnostics">
                <DiagnosticLine label="Lemon customer" value={billingDiagnostics.lemonCustomerId} />
                <DiagnosticLine label="Subscription ID" value={billingDiagnostics.subscriptionId} />
                <DiagnosticLine label="Status" value={billingDiagnostics.subscriptionStatus} />
                <DiagnosticLine label="Renewal" value={billingDiagnostics.renewalDate} />
                <DiagnosticLine label="Cancellation" value={billingDiagnostics.cancellationState} />
                <DiagnosticLine
                  label="Payment recovery"
                  value={billingDiagnostics.paymentRecoveryState}
                />
                <DiagnosticLine
                  label="Extra pack tokens"
                  value={billingDiagnostics.extraPackTokenBalance}
                />
              </DiagnosticSection>

              <DiagnosticSection title="AI Diagnostics">
                <DiagnosticLine
                  label="Conversations"
                  value={aiDiagnostics.recentConversationCount}
                />
                <DiagnosticLine label="Messages" value={aiDiagnostics.recentMessageCount} />
                <DiagnosticLine
                  label="OpenRouter failures"
                  value={arrayLength(aiDiagnostics.recentOpenRouterFailures)}
                />
                <DiagnosticLine
                  label="Approval requests"
                  value={arrayLength(aiDiagnostics.recentToolApprovalRequests)}
                />
                <DiagnosticLine
                  label="Cost-gate blocks"
                  value={aiDiagnostics.recentCostGateBlocks}
                />
              </DiagnosticSection>

              <DiagnosticSection title="Operational Diagnostics">
                <DiagnosticLine label="Last login" value={operationalDiagnostics.lastLogin} />
                <DiagnosticLine label="Last activity" value={operationalDiagnostics.lastActivity} />
                <DiagnosticLine
                  label="Audit entries"
                  value={arrayLength(operationalDiagnostics.recentAuditLogEntries)}
                />
                <DiagnosticLine
                  label="Action entries"
                  value={arrayLength(operationalDiagnostics.recentActionLogEntries)}
                />
                <DiagnosticLine
                  label="MCP enabled"
                  value={asRecord(operationalDiagnostics.mcp).enabled}
                />
                <DiagnosticLine
                  label="WhatsApp linked"
                  value={operationalDiagnostics.whatsappLinked}
                />
              </DiagnosticSection>
            </div>
          ) : (
            <div className="rounded-xl border border-surface-border bg-surface p-10 text-center text-xs text-emma-200/25">
              Look up a beta user to generate a read-only support summary.
            </div>
          )}
        </div>
      ) : (
        <div className="max-w-7xl mx-auto px-6 py-8">
          {/* ── Row 1: Core Metrics ──────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-6">
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

          {/* ── Row 4: Response Quality ──────────────────────────────────── */}
          <div className="rounded-xl border border-surface-border bg-surface p-5 mb-6">
            <h3 className="text-xs font-medium text-emma-200/30 uppercase tracking-widest mb-3">
              Response Quality
            </h3>
            {feedback && feedback.total > 0 ? (
              <div className="flex items-center gap-6">
                <div>
                  <div className="text-2xl font-light text-emma-200/60">{feedback.total}</div>
                  <div className="text-[10px] text-emma-200/20 mt-0.5">total ratings</div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[11px] text-emerald-300/50 w-16">👍 Helpful</span>
                    <div className="flex-1 h-2 rounded-full bg-emma-200/5 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-400/40"
                        style={{ width: `${(feedback.up / feedback.total) * 100}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-emma-200/30 w-10 text-right">
                      {feedback.up} ({Math.round((feedback.up / feedback.total) * 100)}%)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-red-300/40 w-16">👎 Not helpful</span>
                    <div className="flex-1 h-2 rounded-full bg-emma-200/5 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-red-400/30"
                        style={{ width: `${(feedback.down / feedback.total) * 100}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-emma-200/30 w-10 text-right">
                      {feedback.down} ({Math.round((feedback.down / feedback.total) * 100)}%)
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-emma-200/15 py-4 text-center">
                No feedback yet — thumbs up/down appear on Emma messages
              </div>
            )}
          </div>

          {/* ── Row 5: Client Table ───────────────────────────────────────── */}
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

function WaitlistBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    waiting: "bg-amber-400/10 text-amber-300/70 border-amber-400/20",
    invited: "bg-blue-400/10 text-blue-300/70 border-blue-400/20",
    converted: "bg-emerald-400/10 text-emerald-300/70 border-emerald-400/20",
  };
  return (
    <span
      className={`text-[10px] px-2 py-0.5 rounded-full border ${styles[status] || styles.waiting}`}
    >
      {status}
    </span>
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function DiagnosticSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-surface-border bg-surface p-5">
      <h3 className="text-xs font-medium text-emma-200/30 uppercase tracking-widest mb-3">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function DiagnosticLine({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-surface-border/40 pb-2 last:border-0 last:pb-0">
      <span className="text-[11px] text-emma-200/30">{label}</span>
      <span className="max-w-[65%] text-right text-[11px] text-emma-200/65 font-mono break-words">
        {displayValue(value)}
      </span>
    </div>
  );
}

function DiagnosticList({ label, value }: { label: string; value: unknown }) {
  const rows = Array.isArray(value) ? value.map(displayValue) : [];
  return (
    <div className="border-b border-surface-border/40 pb-2 last:border-0 last:pb-0">
      <div className="text-[11px] text-emma-200/30 mb-1">{label}</div>
      {rows.length === 0 ? (
        <div className="text-[11px] text-emma-200/20">-</div>
      ) : (
        <div className="space-y-1">
          {rows.map((row, index) => (
            <div key={`${label}-${index}`} className="text-[11px] text-emma-200/65">
              {row}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}
