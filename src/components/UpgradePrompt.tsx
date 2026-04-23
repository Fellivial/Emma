"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Zap, X } from "lucide-react";

interface UpgradePromptProps {
  enabled: boolean;       // Only show for trial users
}

interface TrialStatus {
  hasTrial: boolean;
  canSendMessage: boolean;
  shouldShowUpgrade: boolean;
  upgradeReason: string | null;
  trial: {
    messagesUsed: number;
    messagesLimit: number;
    daysRemaining: number;
    percentUsed: number;
  } | null;
}

export function UpgradePrompt({ enabled }: UpgradePromptProps) {
  const [status, setStatus] = useState<TrialStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [checking, setChecking] = useState(false);

  const checkStatus = useCallback(async () => {
    if (!enabled || checking) return;
    setChecking(true);
    try {
      const res = await fetch("/api/emma/trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check" }),
      });
      const data = await res.json();
      setStatus(data);

      // Log upgrade shown event
      if (data.shouldShowUpgrade && !dismissed) {
        fetch("/api/emma/trial", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "upgrade_shown" }),
        }).catch(() => {});
      }
    } catch {}
    setChecking(false);
  }, [enabled, dismissed, checking]);

  // Check on mount and every 30 seconds
  useEffect(() => {
    if (!enabled) return;
    checkStatus();
    const interval = setInterval(checkStatus, 30_000);
    return () => clearInterval(interval);
  }, [enabled, checkStatus]);

  // Don't show if not a trial user, or dismissed, or no reason to show
  if (!enabled || !status?.hasTrial || !status.shouldShowUpgrade || dismissed) return null;

  const trial = status.trial;
  if (!trial) return null;

  const isBlocked = !status.canSendMessage;
  const isUrgent = trial.daysRemaining <= 2 || trial.percentUsed >= 90;

  const handleUpgradeClick = () => {
    fetch("/api/emma/trial", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "upgrade_clicked" }),
    }).catch(() => {});
  };

  // ── Blocked state (can't send messages) ──────────────────────────────
  if (isBlocked) {
    return (
      <div className="mx-4 mb-3 rounded-xl border border-red-400/20 bg-red-400/5 p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <Zap size={14} className="text-red-300" />
            <span className="text-xs font-medium text-red-300">Trial limit reached</span>
          </div>
        </div>
        <p className="text-[11px] font-light text-emma-200/40 mb-3">{status.upgradeReason}</p>
        <Link
          href="/settings/billing"
          onClick={handleUpgradeClick}
          className="block text-center py-2.5 rounded-lg bg-gradient-to-r from-emma-300 to-emma-400 text-xs font-medium text-emma-950 hover:opacity-90 transition-opacity"
        >
          Upgrade to continue using Emma
        </Link>
      </div>
    );
  }

  // ── Warning state (approaching limits) ───────────────────────────────
  return (
    <div className={`mx-4 mb-3 rounded-xl border p-3 flex items-center justify-between ${
      isUrgent ? "border-amber-400/20 bg-amber-400/5" : "border-emma-300/10 bg-emma-300/3"
    }`}>
      <div className="flex items-center gap-2 flex-1">
        <Zap size={12} className={isUrgent ? "text-amber-300" : "text-emma-300/50"} />
        <span className="text-[11px] font-light text-emma-200/40">{status.upgradeReason}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-3">
        <Link
          href="/settings/billing"
          onClick={handleUpgradeClick}
          className="text-[11px] font-medium text-emma-300 hover:text-emma-300/80 transition-colors"
        >
          Upgrade
        </Link>
        <button onClick={() => setDismissed(true)} className="text-emma-200/15 hover:text-emma-200/30 cursor-pointer transition-colors">
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
