"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { ScheduleEntry, DayOfWeek, Routine } from "@/types/emma";
import { uid } from "@/lib/utils";

// ─── Day Mapping ─────────────────────────────────────────────────────────────

const DAY_MAP: Record<number, DayOfWeek> = {
  0: "sun",
  1: "mon",
  2: "tue",
  3: "wed",
  4: "thu",
  5: "fri",
  6: "sat",
};

function getCurrentDay(): DayOfWeek {
  return DAY_MAP[new Date().getDay()];
}

function getCurrentHHMM(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

// ─── Default Schedules (from built-in routine time triggers) ─────────────────

export function buildDefaultSchedules(routines: Routine[]): ScheduleEntry[] {
  const schedules: ScheduleEntry[] = [];

  for (const routine of routines) {
    if (!routine.triggers) continue;

    for (const trigger of routine.triggers) {
      if (trigger.type === "time") {
        schedules.push({
          id: `sched-${routine.id}-${trigger.value}`,
          routineId: routine.id,
          time: trigger.value,
          days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
          enabled: true,
        });
      }
    }
  }

  return schedules;
}

// ─── Scheduler Hook ──────────────────────────────────────────────────────────

interface UseSchedulerReturn {
  schedules: ScheduleEntry[];
  addSchedule: (entry: Omit<ScheduleEntry, "id">) => void;
  removeSchedule: (id: string) => void;
  toggleSchedule: (id: string) => void;
  updateSchedule: (id: string, updates: Partial<ScheduleEntry>) => void;
}

/**
 * Client-side scheduler that checks every 30s if any schedule should fire.
 *
 * Uses a 60s debounce window per schedule to prevent double-firing.
 *
 * @param onTrigger - callback when a schedule fires (receives routineId)
 * @param initialSchedules - seed schedules (from built-in routines)
 */
export function useScheduler(
  onTrigger: (routineId: string, scheduleId: string) => void,
  initialSchedules: ScheduleEntry[]
): UseSchedulerReturn {
  const [schedules, setSchedules] = useState<ScheduleEntry[]>(initialSchedules);
  const firedRef = useRef<Set<string>>(new Set()); // Track fired schedule-minutes to debounce

  // ── Tick: check every 30 seconds ───────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const currentDay = getCurrentDay();
      const currentTime = getCurrentHHMM();
      const minuteKey = `${currentTime}-${now.getDate()}`; // Unique per day-minute

      setSchedules((prev) => {
        let changed = false;
        const updated = prev.map((sched) => {
          if (!sched.enabled) return sched;
          if (!sched.days.includes(currentDay)) return sched;
          if (sched.time !== currentTime) return sched;

          // Debounce: don't fire same schedule twice in same minute
          const fireKey = `${sched.id}-${minuteKey}`;
          if (firedRef.current.has(fireKey)) return sched;

          firedRef.current.add(fireKey);
          onTrigger(sched.routineId, sched.id);
          changed = true;

          return { ...sched, lastRun: now.getTime() };
        });

        return changed ? updated : prev;
      });

      // Cleanup old fired keys (keep last 100)
      if (firedRef.current.size > 100) {
        const arr = Array.from(firedRef.current);
        firedRef.current = new Set(arr.slice(-50));
      }
    };

    const interval = setInterval(tick, 30_000);
    tick(); // Run immediately on mount

    return () => clearInterval(interval);
  }, [onTrigger]);

  // ── CRUD ───────────────────────────────────────────────────────────────────

  const addSchedule = useCallback((entry: Omit<ScheduleEntry, "id">) => {
    setSchedules((prev) => [...prev, { ...entry, id: uid() }]);
  }, []);

  const removeSchedule = useCallback((id: string) => {
    setSchedules((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const toggleSchedule = useCallback((id: string) => {
    setSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)));
  }, []);

  const updateSchedule = useCallback((id: string, updates: Partial<ScheduleEntry>) => {
    setSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  }, []);

  return { schedules, addSchedule, removeSchedule, toggleSchedule, updateSchedule };
}
