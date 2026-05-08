"use client";

import { useState } from "react";

interface Workflow {
  id: string;
  name: string;
  trigger: "scheduled" | "webhook" | "manual";
  steps: number;
  status: "enabled" | "disabled";
  lastRun: string | null;
}

const MOCK_WORKFLOWS: Workflow[] = [
  {
    id: "1",
    name: "Morning Brief",
    trigger: "scheduled",
    steps: 3,
    status: "enabled",
    lastRun: "1h ago",
  },
  {
    id: "2",
    name: "Competitor Digest",
    trigger: "scheduled",
    steps: 5,
    status: "disabled",
    lastRun: "May 7",
  },
  {
    id: "3",
    name: "Lead Follow-up Email",
    trigger: "webhook",
    steps: 2,
    status: "enabled",
    lastRun: "2h ago",
  },
];

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>(MOCK_WORKFLOWS);

  const toggle = (id: string) => {
    setWorkflows((prev) =>
      prev.map((w) =>
        w.id === id ? { ...w, status: w.status === "enabled" ? "disabled" : "enabled" } : w
      )
    );
  };

  return (
    <div className="max-w-4xl mx-auto px-8 py-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-light text-emma-100">Workflows</h1>
          <p className="text-xs text-emma-300/50 mt-1">
            Automate multi-step tasks with sequences of tools.
          </p>
        </div>
        <button className="px-4 py-2 rounded-xl bg-gradient-to-r from-emma-300 to-emma-400 text-sm font-medium text-emma-950 hover:opacity-90 transition-opacity cursor-pointer">
          + New workflow
        </button>
      </div>

      {workflows.length === 0 ? (
        <div className="rounded-xl border border-surface-border bg-surface p-12 text-center">
          <p className="text-sm text-emma-200/25">
            No workflows yet. Create one to automate recurring tasks.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-surface-border bg-surface overflow-hidden">
          <div className="grid grid-cols-[1fr_100px_60px_110px_110px_80px] gap-4 px-5 py-3 border-b border-surface-border">
            {["NAME", "TRIGGER", "STEPS", "STATUS", "LAST RUN", ""].map((col) => (
              <span
                key={col}
                className="text-[10px] font-medium text-emma-200/25 uppercase tracking-wider"
              >
                {col}
              </span>
            ))}
          </div>

          {workflows.map((w, i) => (
            <div
              key={w.id}
              className={`grid grid-cols-[1fr_100px_60px_110px_110px_80px] gap-4 px-5 py-4 items-center ${
                i < workflows.length - 1 ? "border-b border-surface-border" : ""
              }`}
            >
              <span className="text-sm font-light text-emma-200/70">{w.name}</span>

              <span className="text-xs text-emma-200/30">{w.trigger}</span>

              <span className="text-xs text-emma-200/30">{w.steps}</span>

              <span>
                <span
                  className={`inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full border ${
                    w.status === "enabled"
                      ? "bg-violet-400/10 border-violet-400/20 text-violet-300"
                      : "bg-emma-200/5 border-emma-200/10 text-emma-200/25"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${w.status === "enabled" ? "bg-violet-400" : "bg-emma-200/20"}`}
                  />
                  {w.status}
                </span>
              </span>

              <span className="text-xs text-emma-200/25">{w.lastRun ?? "—"}</span>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggle(w.id)}
                  className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer shrink-0 ${
                    w.status === "enabled" ? "bg-violet-500/60" : "bg-emma-200/10"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white/90 shadow transition-transform ${
                      w.status === "enabled" ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </button>
                <button className="text-[11px] text-emma-200/30 hover:text-emma-300 transition-colors cursor-pointer whitespace-nowrap">
                  Edit →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
