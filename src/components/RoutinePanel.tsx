"use client";

import { useState } from "react";
import type { Routine } from "@/types/emma";
import { getAllRoutines } from "@/core/routines-engine";
import { Play, Trash2 } from "lucide-react";

interface RoutinePanelProps {
  onActivate: (routineId: string) => void;
  activeRoutineId: string | null;
  onCreate?: (routine: Routine) => void;
  onDelete?: (id: string) => void;
}

export function RoutinePanel({
  onActivate,
  activeRoutineId,
  onDelete,
}: RoutinePanelProps) {
  const routines = getAllRoutines();

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[10px] text-emma-200/25 uppercase tracking-widest px-1">Workflow Routines</h3>
      {routines.map((routine) => {
        const isActive = activeRoutineId === routine.id;
        const voiceTriggers = routine.triggers
          ?.filter((t) => t.type === "voice")
          .map((t) => `"${t.value}"`) || [];

        return (
          <div
            key={routine.id}
            className={`rounded-xl border p-3 transition-all ${
              isActive
                ? "bg-emma-300/10 border-emma-300/25"
                : "bg-surface border-surface-border hover:bg-surface-hover"
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-base">{routine.icon}</span>
                <span className="text-sm font-medium text-emma-200/70">{routine.name}</span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => onActivate(routine.id)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-light border transition-all cursor-pointer ${
                    isActive
                      ? "bg-emma-300/20 border-emma-300/30 text-emma-300"
                      : "bg-surface border-surface-border text-emma-200/40 hover:text-emma-300"
                  }`}
                >
                  <Play size={10} fill="currentColor" />
                  {isActive ? "Active" : "Run"}
                </button>

                {!routine.builtIn && onDelete && (
                  <button
                    onClick={() => onDelete(routine.id)}
                    className="p-1 text-emma-200/15 hover:text-red-400/60 cursor-pointer transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>

            <p className="text-[11px] font-light text-emma-200/35 mb-2">{routine.description}</p>

            {voiceTriggers.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[9px] text-emma-200/15 uppercase tracking-wider">Say:</span>
                {voiceTriggers.map((trigger, i) => (
                  <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-emma-300/6 border border-emma-300/10 text-emma-300/40 font-light">
                    {trigger}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
