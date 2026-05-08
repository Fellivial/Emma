"use client";

import type { Routine } from "@/types/emma";
import { getAllRoutines } from "@/core/routines-engine";

interface RoutinePanelProps {
  onActivate: (routineId: string) => void;
  activeRoutineId: string | null;
  onCreate?: (routine: Routine) => void;
  onDelete?: (id: string) => void;
}

export function RoutinePanel({ onActivate, activeRoutineId, onDelete }: RoutinePanelProps) {
  const routines = getAllRoutines();

  return (
    <div className="flex flex-col gap-px">
      {routines.map((routine) => {
        const isActive = activeRoutineId === routine.id;
        return (
          <button
            key={routine.id}
            onClick={() => onActivate(routine.id)}
            className={`flex items-center gap-2.5 px-1 py-1.5 rounded-lg text-left w-full transition-colors cursor-pointer group ${
              isActive ? "bg-emma-300/10" : "hover:bg-surface-hover/60"
            }`}
          >
            <span
              className={`text-sm shrink-0 transition-opacity ${isActive ? "opacity-100" : "opacity-50 group-hover:opacity-70"}`}
            >
              {routine.icon}
            </span>
            <span
              className={`text-[11px] font-light transition-colors truncate ${
                isActive ? "text-emma-300/90" : "text-emma-200/45 group-hover:text-emma-200/65"
              }`}
            >
              {routine.name}
            </span>
            {isActive && (
              <span className="ml-auto shrink-0 w-1.5 h-1.5 rounded-full bg-emma-300/60" />
            )}
          </button>
        );
      })}
    </div>
  );
}
