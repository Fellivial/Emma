"use client";

import type { AutonomousTask } from "@/types/emma";

interface AutonomousTasksPanelProps {
  tasks: AutonomousTask[];
  onViewTask: (taskId: string) => void;
}

const STATUS_COLORS: Record<AutonomousTask["status"], string> = {
  running: "#22c55e",
  awaiting_approval: "#d97706",
  awaiting_suggestion: "#7c3aed",
  completed: "#22c55e",
  failed: "#dc2626",
  max_steps_reached: "#d97706",
};

const PULSE_STATUSES: AutonomousTask["status"][] = ["running", "awaiting_approval", "awaiting_suggestion"];

function StatusDot({ status }: { status: AutonomousTask["status"] }) {
  const color = STATUS_COLORS[status];
  const pulse = PULSE_STATUSES.includes(status);
  return (
    <div
      className={pulse ? "animate-pulse" : undefined}
      style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }}
    />
  );
}

function RecentIcon({ status }: { status: AutonomousTask["status"] }) {
  if (status === "completed") return <span style={{ color: "#22c55e", fontSize: 9 }}>✓</span>;
  if (status === "failed") return <span style={{ color: "#dc2626", fontSize: 9 }}>✕</span>;
  return <span style={{ color: "#d97706", fontSize: 9 }}>⚠</span>;
}

export function AutonomousTasksPanel({ tasks, onViewTask }: AutonomousTasksPanelProps) {
  const active = tasks.filter((t) =>
    t.status === "running" || t.status === "awaiting_approval" || t.status === "awaiting_suggestion"
  );
  const recent = [...tasks]
    .filter((t) => t.status === "completed" || t.status === "failed" || t.status === "max_steps_reached")
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
    .slice(0, 3);

  const activeCount = active.length;
  const visibleCount = Math.min(active.length, 3) + recent.length;

  return (
    <div className="flex flex-col gap-1.5">
      {/* Header */}
      <div className="flex items-center gap-1.5 px-1 mb-1">
        <span className="text-[10px] font-medium text-emma-200/30 uppercase tracking-[0.15em]">Autonomous</span>
        {activeCount > 0 ? (
          <span style={{ fontSize: 9, color: "rgba(217,119,6,0.7)", background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.15)", borderRadius: 9999, padding: "0 6px", lineHeight: "18px", display: "inline-block" }}>
            {activeCount}
          </span>
        ) : (
          <span className="text-[9px] text-emma-200/20 bg-emma-300/8 border border-emma-300/10 rounded-full px-1.5 py-px font-light">
            {tasks.length}
          </span>
        )}
      </div>

      {tasks.length === 0 ? (
        <p style={{ fontSize: 10, color: "rgba(244,193,221,0.2)", padding: "4px 4px 0" }}>No tasks running~</p>
      ) : (
        <>
          {/* Active */}
          {active.slice(0, 3).map((task) => (
            <div
              key={task.id}
              onClick={() => onViewTask(task.id)}
              style={{ background: "rgba(232,160,191,0.02)", border: "1px solid rgba(232,160,191,0.08)", borderRadius: 8, padding: "8px 10px", marginBottom: 2, cursor: "pointer" }}
              className="hover:bg-emma-300/5 transition-colors"
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <StatusDot status={task.status} />
                <span style={{ flex: 1, fontSize: 11, color: "rgba(244,193,221,0.6)", fontWeight: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {task.goal}
                </span>
                <span style={{ fontSize: 9, color: "rgba(244,193,221,0.2)", fontFamily: "monospace", flexShrink: 0 }}>
                  {task.stepsTaken} steps
                </span>
              </div>
              {task.status === "awaiting_approval" ? (
                <span style={{ fontSize: 9, background: "rgba(217,119,6,0.06)", border: "1px solid rgba(217,119,6,0.15)", borderRadius: 9999, padding: "2px 8px", color: "rgba(217,119,6,0.7)", fontFamily: "monospace" }}>
                  ⚠ Needs approval
                </span>
              ) : (task.currentTool || task.status === "running") ? (
                <span style={{ fontSize: 9, background: "rgba(232,160,191,0.04)", border: "1px solid rgba(232,160,191,0.08)", borderRadius: 9999, padding: "2px 8px", color: "rgba(232,160,191,0.4)", fontFamily: "monospace" }}>
                  {task.currentTool ?? "thinking…"}
                </span>
              ) : null}
            </div>
          ))}

          {active.length > 0 && recent.length > 0 && (
            <div style={{ borderTop: "1px solid rgba(232,160,191,0.06)", margin: "2px 0" }} />
          )}

          {/* Recent */}
          {recent.map((task) => (
            <div key={task.id} style={{ display: "flex", gap: 6, alignItems: "center", padding: "5px 2px", borderBottom: "1px solid rgba(232,160,191,0.05)" }}>
              <RecentIcon status={task.status} />
              <span style={{ flex: 1, fontSize: 10, color: "rgba(244,193,221,0.3)", fontWeight: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {task.goal}
              </span>
              <span style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(244,193,221,0.15)", flexShrink: 0 }}>
                {task.totalTokens}t
              </span>
            </div>
          ))}

          {tasks.length > visibleCount && (
            <button
              onClick={() => onViewTask("")}
              style={{ fontSize: 9, color: "rgba(232,160,191,0.3)", cursor: "pointer", background: "none", border: "none", padding: "2px 0", textAlign: "left" }}
              className="hover:text-emma-300/60 transition-colors"
            >
              View all →
            </button>
          )}
        </>
      )}
    </div>
  );
}
