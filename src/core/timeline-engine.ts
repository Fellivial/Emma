"use client";

import { useState, useCallback } from "react";
import type { TimelineEntry, TimelineEventType, TimelineSource } from "@/types/emma";
import { uid, formatTime } from "@/lib/utils";

interface UseTimelineReturn {
  entries: TimelineEntry[];
  log: (entry: Omit<TimelineEntry, "id" | "timestamp">) => void;
  filter: (opts: TimelineFilterOpts) => TimelineEntry[];
  clear: () => void;
}

export interface TimelineFilterOpts {
  types?: TimelineEventType[];
  sources?: TimelineSource[];
  room?: string;
  since?: number; // timestamp
}

export function useTimeline(): UseTimelineReturn {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);

  const log = useCallback((entry: Omit<TimelineEntry, "id" | "timestamp">) => {
    const full: TimelineEntry = {
      ...entry,
      id: uid(),
      timestamp: Date.now(),
    };
    setEntries((prev) => [full, ...prev].slice(0, 500)); // Cap at 500 entries
  }, []);

  const filter = useCallback(
    (opts: TimelineFilterOpts): TimelineEntry[] => {
      return entries.filter((e) => {
        if (opts.types && !opts.types.includes(e.type)) return false;
        if (opts.sources && !opts.sources.includes(e.source)) return false;
        if (opts.room && e.room !== opts.room) return false;
        if (opts.since && e.timestamp < opts.since) return false;
        return true;
      });
    },
    [entries]
  );

  const clear = useCallback(() => setEntries([]), []);

  return { entries, log, filter, clear };
}
