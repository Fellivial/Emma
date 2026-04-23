"use client";

import type { ScheduleEntry, DayOfWeek } from "@/types/emma";
import { getAllRoutines } from "@/core/routines-engine";
import { Clock, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";

interface SchedulePanelProps {
  schedules: ScheduleEntry[];
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}

const DAY_LABELS: Record<DayOfWeek, string> = {
  mon: "M", tue: "T", wed: "W", thu: "T", fri: "F", sat: "S", sun: "S",
};

const DAY_ORDER: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export function SchedulePanel({ schedules, onToggle, onRemove }: SchedulePanelProps) {
  const routines = getAllRoutines();

  if (schedules.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-emma-200/15 px-4">
        <Clock size={24} />
        <span className="text-xs font-light">No schedules</span>
        <span className="text-[10px] font-light text-emma-200/10 text-center">
          Routines with time triggers auto-create schedules
        </span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto flex flex-col gap-2 px-3 pb-3">
      {schedules.map((sched) => {
        const routine = routines.find((r) => r.id === sched.routineId);
        if (!routine) return null;

        return (
          <div
            key={sched.id}
            className={`rounded-xl border p-3 transition-all animate-fade-in ${
              sched.enabled
                ? "bg-surface border-surface-border"
                : "bg-transparent border-surface-border opacity-40"
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-base">{routine.icon}</span>
                <div>
                  <span className="text-xs font-medium text-emma-200/60">
                    {routine.name}
                  </span>
                  <div className="text-lg font-light text-emma-100 tracking-tight -mt-0.5">
                    {sched.time}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => onToggle(sched.id)}
                  className="text-emma-200/30 hover:text-emma-300 cursor-pointer transition-colors"
                >
                  {sched.enabled ? (
                    <ToggleRight size={20} className="text-emma-300" />
                  ) : (
                    <ToggleLeft size={20} />
                  )}
                </button>
                <button
                  onClick={() => onRemove(sched.id)}
                  className="text-emma-200/15 hover:text-red-400/60 cursor-pointer transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            {/* Day dots */}
            <div className="flex items-center gap-1">
              {DAY_ORDER.map((day) => {
                const active = sched.days.includes(day);
                return (
                  <span
                    key={day}
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-medium ${
                      active
                        ? "bg-emma-300/15 text-emma-300"
                        : "text-emma-200/10"
                    }`}
                  >
                    {DAY_LABELS[day]}
                  </span>
                );
              })}

              {/* Tier badge */}
              <span className="ml-auto text-[9px] text-emma-200/15 bg-emma-200/3 rounded px-1.5 py-0.5">
                Tier {routine.autonomyTier}
              </span>
            </div>

            {/* Last run */}
            {sched.lastRun && (
              <div className="text-[9px] text-emma-200/12 mt-1.5">
                Last run: {new Date(sched.lastRun).toLocaleTimeString()}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
