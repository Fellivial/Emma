"use client";

import type { EmmaNotification } from "@/types/emma";
import { X } from "lucide-react";

interface NotificationToastProps {
  notifications: EmmaNotification[];
  onAction: (id: string, action: string, value?: string) => void;
  onDismiss: (id: string) => void;
}

const TYPE_STYLES: Record<string, { border: string; bg: string; icon: string }> = {
  auto_action: { border: "border-emerald-400/20", bg: "bg-emerald-400/5", icon: "⚡" },
  suggestion: { border: "border-emma-300/25", bg: "bg-emma-300/5", icon: "💡" },
  alert: { border: "border-amber-400/25", bg: "bg-amber-400/5", icon: "⚠️" },
  anomaly: { border: "border-red-400/20", bg: "bg-red-400/5", icon: "👁️" },
  system: { border: "border-blue-400/20", bg: "bg-blue-400/5", icon: "🔔" },
};

export function NotificationToast({
  notifications,
  onAction,
  onDismiss,
}: NotificationToastProps) {
  const visible = notifications.filter((n) => !n.dismissed).slice(0, 5);

  if (visible.length === 0) return null;

  return (
    <div className="fixed top-16 right-4 z-50 flex flex-col gap-2 w-80">
      {visible.map((notif) => {
        const style = TYPE_STYLES[notif.type] || TYPE_STYLES.system;

        return (
          <div
            key={notif.id}
            className={`animate-slide-up rounded-xl border ${style.border} ${style.bg} backdrop-blur-xl p-3 shadow-lg shadow-black/20`}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs">{style.icon}</span>
                <span className="text-xs font-medium text-emma-200/70">
                  {notif.title}
                </span>
              </div>
              <button
                onClick={() => onDismiss(notif.id)}
                className="text-emma-200/20 hover:text-emma-200/50 transition-colors cursor-pointer"
              >
                <X size={12} />
              </button>
            </div>

            {/* Message */}
            <p className="text-[11px] font-light text-emma-200/45 leading-relaxed mb-2">
              {notif.message}
            </p>

            {/* Tier badge */}
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-emma-200/15 uppercase tracking-wider">
                Tier {notif.tier}
              </span>

              {/* Action buttons */}
              {notif.actions && notif.actions.length > 0 && (
                <div className="flex gap-1.5">
                  {notif.actions.map((act, i) => (
                    <button
                      key={i}
                      onClick={() => onAction(notif.id, act.action, act.value)}
                      className={`text-[10px] px-2 py-0.5 rounded-full border transition-all cursor-pointer ${
                        act.action === "approve"
                          ? "bg-emma-300/15 border-emma-300/25 text-emma-300 hover:bg-emma-300/25"
                          : "bg-surface border-surface-border text-emma-200/40 hover:bg-surface-hover"
                      }`}
                    >
                      {act.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
