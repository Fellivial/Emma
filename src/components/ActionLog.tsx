"use client";

import type { ActionLogEntry } from "@/types/emma";

interface ActionLogProps {
  entries: ActionLogEntry[];
}

export function ActionLog({ entries }: ActionLogProps) {
  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-emma-200/20 font-light">
        No actions yet
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto flex flex-col gap-1 px-3 pb-3">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="flex gap-2 text-[11px] font-light px-2 py-1.5 rounded-md border border-surface-border bg-surface animate-fade-in"
        >
          <span className="text-emma-200/20 font-mono text-[10px] shrink-0">
            {entry.time}
          </span>
          <span className="text-emma-200/50">{entry.text}</span>
        </div>
      ))}
    </div>
  );
}
