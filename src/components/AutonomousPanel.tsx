"use client";

import type { EmmaNotification, TimelineEntry } from "@/types/emma";
import { AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";

interface AutonomousTask {
  id: string;
  title: string;
  steps?: number;
  badge?: string;
  badgeVariant: "approval" | "tool" | "compose" | "completed" | "warning";
  done?: boolean;
}

interface AutonomousPanelProps {
  notifications: EmmaNotification[];
  timelineEntries: TimelineEntry[];
}

const DEMO_ACTIVE: AutonomousTask[] = [
  {
    id: "d1",
    title: "Send Priya the revised Q3 proposal",
    steps: 4,
    badge: "Needs approval",
    badgeVariant: "approval",
  },
  {
    id: "d2",
    title: "Pull last week's analytics into a digest",
    steps: 2,
    badge: "fetch_analytics",
    badgeVariant: "tool",
  },
  {
    id: "d3",
    title: "Draft a response to the Acme intro...",
    steps: 3,
    badge: "compose_draft",
    badgeVariant: "compose",
  },
];

const DEMO_DONE: AutonomousTask[] = [
  { id: "c1", title: "Reorganize Notion pages by project", badgeVariant: "completed", done: true },
  {
    id: "c2",
    title: "Find any unanswered DMs from yesterday",
    badgeVariant: "completed",
    done: true,
  },
  { id: "c3", title: "Compile weekly time-tracking report", badgeVariant: "warning", done: true },
];

export function AutonomousPanel({ notifications, timelineEntries }: AutonomousPanelProps) {
  const fromNotifs: AutonomousTask[] = notifications
    .filter((n) => !n.dismissed && n.actions?.some((a) => a.action === "approve"))
    .slice(0, 3)
    .map((n) => ({
      id: n.id,
      title: n.message,
      badge: "Needs approval",
      badgeVariant: "approval" as const,
    }));

  const fromTimeline: AutonomousTask[] = timelineEntries
    .filter((e) => e.type === "routine_run" || e.type === "schedule_triggered")
    .slice(0, 3)
    .map((e) => ({
      id: e.id,
      title: e.title,
      badgeVariant: "completed" as const,
      done: true,
    }));

  const activeTasks = fromNotifs.length > 0 ? fromNotifs : DEMO_ACTIVE;
  const doneTasks = fromTimeline.length > 0 ? fromTimeline : DEMO_DONE;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 px-1 mb-1">
        <span className="text-[10px] font-medium text-emma-200/30 uppercase tracking-[0.15em]">
          Autonomous
        </span>
        <span className="text-[9px] text-emma-200/25 bg-emma-300/8 border border-emma-300/10 rounded-full px-1.5 py-px font-light">
          {activeTasks.length}
        </span>
      </div>

      <div className="flex flex-col gap-0.5">
        {activeTasks.map((task) => (
          <div
            key={task.id}
            role="button"
            tabIndex={0}
            aria-label={`View task: ${task.title.slice(0, 60)}`}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") e.preventDefault();
            }}
            className="flex items-start gap-2 py-1.5 pl-1 pr-2 rounded-lg hover:bg-surface-hover/60 transition-colors cursor-pointer"
          >
            <div className="mt-0.5 shrink-0 w-3">
              {task.badgeVariant === "approval" ? (
                <AlertTriangle size={11} className="text-amber-400/70" />
              ) : task.badgeVariant === "compose" ? (
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400/70 mt-0.5 block" />
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/70 mt-0.5 block" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-light text-emma-200/60 leading-snug line-clamp-1">
                {task.title}
              </p>
              {task.badge && (
                <span
                  className={`inline-block mt-0.5 text-[9px] px-1.5 py-px rounded font-medium leading-normal ${
                    task.badgeVariant === "approval"
                      ? "bg-amber-400/10 text-amber-400/75 border border-amber-400/15"
                      : task.badgeVariant === "compose"
                        ? "bg-purple-400/8 text-purple-300/65 border border-purple-400/12"
                        : "bg-emma-300/8 text-emma-300/55 border border-emma-300/10"
                  }`}
                >
                  {task.badge}
                </span>
              )}
            </div>

            {task.steps && (
              <span className="text-[9px] text-emma-200/15 shrink-0 mt-0.5 tabular-nums">
                {task.steps} steps
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-surface-border/40 my-0.5" />

      <div className="flex flex-col gap-px opacity-45">
        {doneTasks.map((task) => (
          <div key={task.id} className="flex items-center gap-2 py-0.5 pl-1 pr-2">
            {task.badgeVariant === "warning" ? (
              <AlertTriangle size={10} className="text-amber-400/60 shrink-0" />
            ) : (
              <CheckCircle2 size={10} className="text-emerald-400/60 shrink-0" />
            )}
            <p className="text-[10px] font-light text-emma-200/45 truncate">{task.title}</p>
          </div>
        ))}
      </div>

      <a
        href="/settings/tasks"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-0.5 text-[10px] text-emma-200/20 hover:text-emma-300/60 transition-colors pl-1 mt-0.5 group"
        style={{ textDecoration: "none" }}
      >
        View all
        <ChevronRight size={10} className="group-hover:translate-x-0.5 transition-transform" />
      </a>
    </div>
  );
}
