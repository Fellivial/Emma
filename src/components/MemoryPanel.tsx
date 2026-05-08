"use client";

import type { MemoryEntry } from "@/types/emma";
import { X } from "lucide-react";

interface MemoryPanelProps {
  memories: MemoryEntry[];
  loading: boolean;
  onRefresh: () => void;
  onDelete: (id: string) => void;
  onExtract: () => void;
  extracting: boolean;
}

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
      <div className="flex flex-col gap-1 px-1">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-7 rounded-lg bg-surface-border/20 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {memories.length === 0 ? (
        <p className="text-[10px] font-light text-emma-200/15 px-1">
          No memories yet — chat with Emma
        </p>
      ) : (
        memories.slice(0, 8).map((entry) => (
          <div
            key={entry.id}
            className="group flex items-center gap-1.5 pl-2 pr-1.5 py-1.5 rounded-lg border border-surface-border/60 bg-surface/60 hover:bg-surface-hover/60 transition-colors"
          >
            <span className="flex-1 text-[11px] font-light text-emma-200/50 leading-snug truncate">
              {entry.value}
            </span>
            <button
              onClick={() => onDelete(entry.id)}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-emma-200/20 hover:text-emma-200/50 transition-all cursor-pointer shrink-0"
            >
              <X size={10} />
            </button>
          </div>
        ))
      )}

      <button
        onClick={onExtract}
        disabled={extracting}
        className="flex items-center gap-1 text-[10px] font-light text-emma-200/20 hover:text-emma-300/60 transition-colors cursor-pointer disabled:opacity-30 px-1 mt-0.5"
      >
        <span className="text-emma-300/40">+</span>
        {extracting ? "Extracting…" : "Extract from conversation"}
      </button>
    </div>
  );
}
