"use client";

import type { MemoryEntry, MemoryCategory } from "@/types/emma";
import { Brain, Trash2, RefreshCw } from "lucide-react";

interface MemoryPanelProps {
  memories: MemoryEntry[];
  loading: boolean;
  onRefresh: () => void;
  onDelete: (id: string) => void;
  onExtract: () => void;
  extracting: boolean;
}

const CATEGORY_CONFIG: Record<MemoryCategory, { icon: string; color: string }> = {
  preference: { icon: "💜", color: "text-purple-300/60" },
  routine: { icon: "🔄", color: "text-blue-300/60" },
  personal: { icon: "👤", color: "text-emma-300/60" },
  episodic: { icon: "📖", color: "text-amber-300/60" },
  environment: { icon: "🏠", color: "text-emerald-300/60" },
};

export function MemoryPanel({
  memories,
  loading,
  onRefresh,
  onDelete,
  onExtract,
  extracting,
}: MemoryPanelProps) {
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-emma-200/20 font-light">
        Loading memories…
      </div>
    );
  }

  // Group by category
  const grouped = memories.reduce<Record<string, MemoryEntry[]>>((acc, entry) => {
    if (!acc[entry.category]) acc[entry.category] = [];
    acc[entry.category].push(entry);
    return acc;
  }, {});

  return (
    <div className="flex-1 overflow-auto flex flex-col gap-2 px-3 pb-3">
      {/* Controls */}
      <div className="flex gap-2">
        <button
          onClick={onRefresh}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-light border bg-surface border-surface-border text-emma-200/40 hover:bg-surface-hover transition-all cursor-pointer"
        >
          <RefreshCw size={12} />
          Refresh
        </button>
        <button
          onClick={onExtract}
          disabled={extracting}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-light border bg-emma-300/10 border-emma-300/20 text-emma-300 hover:bg-emma-300/15 transition-all cursor-pointer disabled:opacity-30"
        >
          <Brain size={12} />
          {extracting ? "Extracting…" : "Extract from Chat"}
        </button>
      </div>

      {memories.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-emma-200/15">
          <Brain size={28} />
          <span className="text-xs font-light">No memories yet</span>
          <span className="text-[10px] font-light text-emma-200/10">
            Chat with Emma — she'll remember what matters
          </span>
        </div>
      ) : (
        Object.entries(grouped).map(([category, entries]) => {
          const config = CATEGORY_CONFIG[category as MemoryCategory] || {
            icon: "📝",
            color: "text-emma-200/40",
          };

          return (
            <div key={category} className="animate-fade-in">
              {/* Category header */}
              <div className="flex items-center gap-1.5 mb-1.5 px-1">
                <span className="text-xs">{config.icon}</span>
                <span className="text-[10px] font-medium text-emma-200/25 uppercase tracking-widest">
                  {category}
                </span>
                <span className="text-[10px] text-emma-200/15">({entries.length})</span>
              </div>

              {/* Entries */}
              <div className="flex flex-col gap-1">
                {entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="group flex items-start gap-2 px-2.5 py-2 rounded-lg border border-surface-border bg-surface hover:bg-surface-hover transition-all"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium text-emma-200/50 truncate">
                        {entry.key.replace(/_/g, " ")}
                      </div>
                      <div className="text-[11px] font-light text-emma-200/35 leading-relaxed">
                        {entry.value}
                      </div>
                      {/* Confidence bar */}
                      <div className="flex items-center gap-1.5 mt-1">
                        <div className="w-12 h-0.5 rounded-full bg-emma-200/5 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emma-300/40"
                            style={{ width: `${entry.confidence * 100}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-emma-200/15">
                          {Math.round(entry.confidence * 100)}%
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => onDelete(entry.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-emma-200/20 hover:text-red-400/60 transition-all cursor-pointer"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
