"use client";

import { useState } from "react";
import type { TimelineEntry, TimelineEventType, TimelineSource } from "@/types/emma";
import { formatTime } from "@/lib/utils";

interface TimelinePanelProps {
  entries: TimelineEntry[];
}

const TYPE_CONFIG: Record<TimelineEventType, { icon: string; color: string }> = {
  device_command: { icon: "💡", color: "text-emma-300/50" },
  routine_executed: { icon: "⚡", color: "text-amber-300/50" },
  routine_run: { icon: "▶️", color: "text-emma-300/50" },
  workflow_triggered: { icon: "🔄", color: "text-amber-300/50" },
  schedule_triggered: { icon: "⏰", color: "text-blue-300/50" },
  memory_extracted: { icon: "🧠", color: "text-purple-300/50" },
  vision_analysis: { icon: "👁️", color: "text-emerald-300/50" },
  notification_sent: { icon: "🔔", color: "text-yellow-300/50" },
  user_message: { icon: "💬", color: "text-white/30" },
  system_event: { icon: "⚙️", color: "text-gray-300/50" },
  emotion_detected: { icon: "💜", color: "text-emma-300/50" },
  user_switched: { icon: "👤", color: "text-cyan-300/50" },
};

const SOURCE_LABELS: Record<TimelineSource, string> = {
  user: "User",
  scheduler: "Scheduler",
  proactive: "Proactive",
  system: "System",
};

type FilterKey = "all" | TimelineEventType;

const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "routine_run", label: "Workflows" },
  { key: "schedule_triggered", label: "Scheduled" },
  { key: "notification_sent", label: "Notifs" },
  { key: "vision_analysis", label: "Vision" },
  { key: "memory_extracted", label: "Memory" },
  { key: "emotion_detected", label: "Emotion" },
];

export function TimelinePanel({ entries }: TimelinePanelProps) {
  const [filter, setFilter] = useState<FilterKey>("all");

  const filtered = filter === "all" ? entries : entries.filter((e) => e.type === filter);

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Filter bar */}
      <div className="flex gap-1 px-3 pt-1 pb-2 overflow-x-auto shrink-0">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setFilter(opt.key)}
            className={`text-[10px] whitespace-nowrap px-2 py-1 rounded-full border transition-all cursor-pointer ${
              filter === opt.key
                ? "bg-emma-300/12 border-emma-300/20 text-emma-300"
                : "bg-transparent border-transparent text-emma-200/20 hover:text-emma-200/35"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Entries */}
      <div className="flex-1 overflow-auto px-3 pb-3">
        {filtered.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-xs text-emma-200/15 font-light pt-12">
            No timeline events yet
          </div>
        ) : (
          <div className="relative">
            {/* Vertical timeline line */}
            <div className="absolute left-[11px] top-2 bottom-2 w-px bg-surface-border" />

            <div className="flex flex-col gap-0.5">
              {filtered.map((entry) => {
                const config = TYPE_CONFIG[entry.type] || TYPE_CONFIG.system_event;
                return (
                  <div
                    key={entry.id}
                    className="relative flex items-start gap-2.5 pl-0 py-1.5 animate-fade-in"
                  >
                    {/* Dot on timeline */}
                    <div className="relative z-10 w-[23px] h-[23px] flex items-center justify-center shrink-0">
                      <span className="text-[10px]">{config.icon}</span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[11px] font-medium ${config.color}`}>
                          {entry.title}
                        </span>
                        {entry.tier && (
                          <span className="text-[8px] text-emma-200/12 bg-emma-200/3 rounded px-1">
                            T{entry.tier}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] font-light text-emma-200/30 leading-relaxed truncate">
                        {entry.detail}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] font-mono text-emma-200/12">
                          {formatTime(entry.timestamp)}
                        </span>
                        <span className="text-[9px] text-emma-200/10">
                          via {SOURCE_LABELS[entry.source]}
                        </span>
                        {entry.room && (
                          <span className="text-[9px] text-emma-200/10">{entry.room}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
