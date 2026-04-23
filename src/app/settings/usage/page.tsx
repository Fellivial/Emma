"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface DayUsage {
  date: string;
  messages: number;
  tokens: number;
  cost: number;
}

export default function UsagePage() {
  const [days, setDays] = useState<DayUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState({ messages: 0, tokens: 0, cost: 0 });

  useEffect(() => {
    fetch("/api/emma/settings")
      .then((r) => r.json())
      .then((data) => {
        // For now, show current usage from settings endpoint
        const today = new Date().toISOString().split("T")[0];
        if (data.usage) {
          const dayData: DayUsage = {
            date: today,
            messages: data.usage.dailyMessages,
            tokens: data.usage.dailyTokens,
            cost: Math.round((data.usage.dailyTokens / 1_000_000) * 6 * 100) / 100,
          };
          setDays([dayData]);
          setTotals({
            messages: data.usage.dailyMessages,
            tokens: data.usage.monthlyTokens,
            cost: data.usage.monthlyCost,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const maxTokens = Math.max(...days.map((d) => d.tokens), 1);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emma-950 via-emma-900 to-emma-950 font-sans text-emma-100">
      <div className="border-b border-surface-border bg-emma-950/80 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <Link href="/settings" className="text-emma-200/30 hover:text-emma-300 transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-sm font-semibold text-emma-300 tracking-wider">Usage</h1>
            <p className="text-[10px] text-emma-200/25">Token consumption and cost tracking</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Monthly totals */}
        <div className="rounded-xl border border-surface-border bg-surface p-5 mb-6 grid grid-cols-3 gap-6">
          <div>
            <div className="text-[10px] text-emma-200/25 uppercase tracking-wider">Total Messages</div>
            <div className="text-2xl font-light text-emma-200/70 mt-1">{totals.messages.toLocaleString()}</div>
            <div className="text-[10px] text-emma-200/15">this month</div>
          </div>
          <div>
            <div className="text-[10px] text-emma-200/25 uppercase tracking-wider">Total Tokens</div>
            <div className="text-2xl font-light text-emma-200/70 mt-1">{formatTokens(totals.tokens)}</div>
            <div className="text-[10px] text-emma-200/15">input + output</div>
          </div>
          <div>
            <div className="text-[10px] text-emma-200/25 uppercase tracking-wider">Est. Cost</div>
            <div className="text-2xl font-light text-emerald-300/70 mt-1">${totals.cost}</div>
            <div className="text-[10px] text-emma-200/15">this month</div>
          </div>
        </div>

        {/* Daily breakdown */}
        <h2 className="text-xs font-medium text-emma-200/30 uppercase tracking-widest mb-3">Daily Breakdown</h2>

        {loading ? (
          <div className="text-sm text-emma-200/20 py-8 text-center">Loading…</div>
        ) : days.length === 0 ? (
          <div className="text-sm text-emma-200/20 py-8 text-center">No usage data yet</div>
        ) : (
          <div className="flex flex-col gap-2">
            {days.map((day) => (
              <div key={day.date} className="rounded-xl border border-surface-border bg-surface p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono text-emma-200/40">{day.date}</span>
                  <span className="text-[11px] text-emma-200/25">{day.messages} msgs · {formatTokens(day.tokens)} tokens · ${day.cost}</span>
                </div>
                {/* Token bar */}
                <div className="h-2 rounded-full bg-emma-200/5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emma-300/40 transition-all duration-500"
                    style={{ width: `${Math.max(2, (day.tokens / maxTokens) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}
