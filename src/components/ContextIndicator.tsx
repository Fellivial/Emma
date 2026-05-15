"use client";

import type { ContextStats } from "@/core/context-manager";

interface ContextIndicatorProps {
  stats: ContextStats;
}

export function ContextIndicator({ stats }: ContextIndicatorProps) {
  const { budget } = stats;
  const pct = Math.round(budget.utilization * 100);

  // Color based on utilization
  const barColor =
    budget.utilization > 0.9
      ? "bg-red-400"
      : budget.utilization > 0.7
        ? "bg-amber-400"
        : "bg-emma-300/50";

  const textColor =
    budget.utilization > 0.9
      ? "text-red-300/60"
      : budget.utilization > 0.7
        ? "text-amber-300/40"
        : "text-emma-200/20";

  return (
    <div className="flex items-center gap-2 px-4 py-1 border-t border-surface-border bg-emma-950/40">
      {/* Token bar */}
      <div className="flex-1 h-1 rounded-full bg-emma-200/5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>

      {/* Stats */}
      <div className={`flex items-center gap-2 text-[9px] font-mono ${textColor}`}>
        <span>
          {formatTokens(budget.used)}/{formatTokens(budget.messages)}
        </span>
        <span>•</span>
        <span>{stats.messageCount} msgs</span>
        {stats.summaryExists && (
          <>
            <span>•</span>
            <span className="text-purple-300/30">Σ{stats.summarizationCount}</span>
          </>
        )}
      </div>
    </div>
  );
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
