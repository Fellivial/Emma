"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Check, Gift, Users, DollarSign } from "lucide-react";

interface Referral {
  id: string;
  referral_code: string;
  referred_email: string | null;
  status: string;
  created_at: string;
  converted_at: string | null;
  rewarded_at: string | null;
}

interface Stats {
  total: number;
  signedUp: number;
  converted: number;
  rewarded: number;
}

export default function ReferPage() {
  const [code, setCode] = useState<string | null>(null);
  const [link, setLink] = useState<string>("");
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, signedUp: 0, converted: 0, rewarded: 0 });
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      // Generate or get existing code
      const genRes = await fetch("/api/emma/referral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate" }),
      });
      const genData = await genRes.json();
      if (genData.code) {
        setCode(genData.code);
        setLink(genData.link || `${window.location.origin}/landing?ref=${genData.code}`);
      }

      // Load referral list
      const listRes = await fetch("/api/emma/referral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list" }),
      });
      const listData = await listRes.json();
      setReferrals(listData.referrals || []);
      if (listData.stats) setStats(listData.stats);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCopy = () => {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const activeReferrals = referrals.filter((r) => r.referred_email);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emma-950 via-emma-900 to-emma-950 font-sans text-emma-100">
      <div className="border-b border-surface-border bg-emma-950/80 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <Link href="/settings" className="text-emma-200/30 hover:text-emma-300 transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-sm font-semibold text-emma-300 tracking-wider">Refer & Earn</h1>
            <p className="text-[10px] text-emma-200/25">
              Share Emma — get 1 month free for every friend who subscribes
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* How it works */}
        <div className="rounded-xl border border-emma-300/10 bg-emma-300/3 p-5 mb-6">
          <h2 className="text-sm font-medium text-emma-200/70 mb-3">How it works</h2>
          <div className="grid grid-cols-3 gap-4">
            <Step num={1} text="Share your unique link with friends or colleagues" />
            <Step num={2} text="They sign up and subscribe to any paid plan" />
            <Step num={3} text="You get 1 month free on your current plan" />
          </div>
        </div>

        {/* Referral link */}
        {loading ? (
          <div className="text-center text-sm text-emma-200/20 py-8">
            Loading your referral link…
          </div>
        ) : (
          <div className="rounded-xl border border-surface-border bg-surface p-5 mb-6">
            <label className="text-[10px] text-emma-200/25 uppercase tracking-widest mb-2 block">
              Your referral link
            </label>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={link}
                className="flex-1 bg-emma-200/3 border border-emma-200/8 rounded-lg px-3 py-2.5 text-sm font-mono text-emma-200/60 outline-none"
              />
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-gradient-to-r from-emma-300 to-emma-400 text-sm font-medium text-emma-950 cursor-pointer hover:opacity-90 transition-opacity"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="text-[11px] text-emma-200/20 mt-2">
              Code: <span className="font-mono text-emma-300/40">{code}</span>
            </p>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <StatCard icon={<Users size={14} />} label="Shared" value={stats.total} />
          <StatCard icon={<Users size={14} />} label="Signed Up" value={stats.signedUp} />
          <StatCard icon={<DollarSign size={14} />} label="Converted" value={stats.converted} />
          <StatCard icon={<Gift size={14} />} label="Rewards" value={stats.rewarded} />
        </div>

        {/* Referral history */}
        <h2 className="text-xs font-medium text-emma-200/30 uppercase tracking-widest mb-3">
          Referral History
        </h2>
        {activeReferrals.length === 0 ? (
          <div className="text-center text-sm text-emma-200/20 py-8 rounded-xl border border-surface-border bg-surface">
            No referrals yet. Share your link to get started.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {activeReferrals.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between py-3 px-4 rounded-xl border border-surface-border bg-surface"
              >
                <div>
                  <div className="text-sm font-light text-emma-200/60">{r.referred_email}</div>
                  <div className="text-[10px] text-emma-200/20">
                    {new Date(r.created_at).toLocaleDateString()}
                  </div>
                </div>
                <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        )}

        {/* Affiliate pitch */}
        <div className="mt-8 rounded-xl border border-amber-400/10 bg-amber-400/3 p-5">
          <h3 className="text-sm font-medium text-amber-300/70 mb-1">
            Are you a consultant or agency?
          </h3>
          <p className="text-xs font-light text-emma-200/30 mb-3">
            Earn 20% commission on every client you refer for the first 3 months. Contact us to join
            the affiliate program.
          </p>
          <a
            href="mailto:affiliate@emma.ai"
            className="text-xs text-emma-300 hover:text-emma-300/80 transition-colors"
          >
            Apply for affiliate access →
          </a>
        </div>
      </div>
    </div>
  );
}

function Step({ num, text }: { num: number; text: string }) {
  return (
    <div className="flex gap-2.5">
      <div className="w-6 h-6 rounded-full bg-emma-300/15 flex items-center justify-center text-[11px] font-medium text-emma-300 shrink-0">
        {num}
      </div>
      <p className="text-[11px] font-light text-emma-200/40 leading-relaxed">{text}</p>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface p-3">
      <div className="text-emma-200/20 mb-1">{icon}</div>
      <div className="text-lg font-light text-emma-200/60">{value}</div>
      <div className="text-[10px] text-emma-200/20">{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-emma-200/5 text-emma-200/25 border-emma-200/10",
    signed_up: "bg-blue-400/10 text-blue-300 border-blue-400/20",
    converted: "bg-emerald-400/10 text-emerald-300 border-emerald-400/20",
    rewarded: "bg-amber-400/10 text-amber-300 border-amber-400/20",
  };
  return (
    <span
      className={`text-[10px] px-2 py-0.5 rounded-full border ${styles[status] || styles.pending}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}
