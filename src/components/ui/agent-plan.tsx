"use client";

import { useState } from "react";
import { CheckCircle2, Circle, CircleAlert, CircleDotDashed, CircleX } from "lucide-react";
import { motion, AnimatePresence, LayoutGroup } from "motion/react";

export interface AgentSubtask {
  id: string;
  title: string;
  description: string;
  status: "completed" | "in-progress" | "pending" | "need-help" | "failed";
  tools?: string[];
}

export interface AgentTask {
  id: string;
  title: string;
  description: string;
  status: "completed" | "in-progress" | "pending" | "need-help" | "failed";
  dependencies: string[];
  subtasks: AgentSubtask[];
}

interface AgentPlanProps {
  tasks: AgentTask[];
}

const prefersReduced =
  typeof window !== "undefined"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

const subtaskListVariants = {
  hidden: { opacity: 0, height: 0, overflow: "hidden" as const },
  visible: {
    height: "auto",
    opacity: 1,
    overflow: "visible" as const,
    transition: {
      duration: prefersReduced ? 0 : 0.22,
      staggerChildren: prefersReduced ? 0 : 0.04,
      when: "beforeChildren" as const,
      ease: "easeOut" as const,
    },
  },
  exit: {
    height: 0,
    opacity: 0,
    overflow: "hidden" as const,
    transition: { duration: prefersReduced ? 0 : 0.18, ease: "easeIn" as const },
  },
};

const subtaskVariants = {
  hidden: { opacity: 0, x: prefersReduced ? 0 : -8 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: "spring" as const, stiffness: 500, damping: 25 },
  },
  exit: { opacity: 0, x: prefersReduced ? 0 : -8, transition: { duration: 0.12 } },
};

function StatusIcon({ status, size = 4 }: { status: AgentTask["status"]; size?: number }) {
  const cls = `h-${size} w-${size}`;
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={status}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{ duration: 0.15 }}
      >
        {status === "completed" ? (
          <CheckCircle2 className={`${cls} text-emerald-400`} />
        ) : status === "in-progress" ? (
          <CircleDotDashed className={`${cls} text-emma-300/80`} />
        ) : status === "need-help" ? (
          <CircleAlert className={`${cls} text-amber-400`} />
        ) : status === "failed" ? (
          <CircleX className={`${cls} text-red-400`} />
        ) : (
          <Circle className={`${cls} text-emma-200/25`} />
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function StatusBadge({ status }: { status: AgentTask["status"] }) {
  const color =
    status === "completed"
      ? "bg-emerald-400/10 text-emerald-400/80"
      : status === "in-progress"
        ? "bg-emma-300/10 text-emma-300/70"
        : status === "need-help"
          ? "bg-amber-400/10 text-amber-400/80"
          : status === "failed"
            ? "bg-red-400/10 text-red-400/80"
            : "bg-emma-200/8 text-emma-200/30";

  return (
    <motion.span
      key={status}
      className={`rounded px-1.5 py-0.5 text-[10px] font-light ${color}`}
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      {status}
    </motion.span>
  );
}

export function AgentPlan({ tasks }: AgentPlanProps) {
  const [expandedTasks, setExpandedTasks] = useState<string[]>(
    tasks.filter((t) => t.status === "in-progress").map((t) => t.id)
  );
  const [expandedSubtasks, setExpandedSubtasks] = useState<Record<string, boolean>>({});

  const toggleTask = (id: string) =>
    setExpandedTasks((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const toggleSubtask = (taskId: string, subId: string) => {
    const key = `${taskId}-${subId}`;
    setExpandedSubtasks((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="w-full overflow-hidden rounded-2xl rounded-bl-sm border border-surface-border bg-surface">
      <LayoutGroup>
        <div className="p-3 space-y-0.5">
          {tasks.map((task, index) => {
            const isExpanded = expandedTasks.includes(task.id);

            return (
              <motion.div
                key={task.id}
                className={index !== 0 ? "pt-2 border-t border-surface-border/40" : ""}
                layout
              >
                {/* Task row */}
                <div
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-emma-300/4 transition-colors"
                  onClick={() => toggleTask(task.id)}
                >
                  <div className="shrink-0">
                    <StatusIcon status={task.status} size={4} />
                  </div>

                  <span
                    className={`flex-1 text-sm font-light truncate ${
                      task.status === "completed"
                        ? "line-through text-emma-200/30"
                        : "text-emma-100/90"
                    }`}
                  >
                    {task.title}
                  </span>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {task.dependencies.length > 0 && (
                      <div className="flex gap-1">
                        {task.dependencies.map((dep) => (
                          <span
                            key={dep}
                            className="bg-emma-200/8 text-emma-200/40 rounded px-1.5 py-0.5 text-[10px]"
                          >
                            {dep}
                          </span>
                        ))}
                      </div>
                    )}
                    <StatusBadge status={task.status} />
                  </div>
                </div>

                {/* Subtasks */}
                <AnimatePresence mode="wait">
                  {isExpanded && task.subtasks.length > 0 && (
                    <motion.div
                      className="relative overflow-hidden"
                      variants={subtaskListVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      layout
                    >
                      {/* Connecting line */}
                      <div className="absolute top-0 bottom-0 left-[18px] border-l border-dashed border-emma-300/15" />

                      <ul className="mt-0.5 mb-1 ml-2 mr-1 space-y-0.5">
                        {task.subtasks.map((sub) => {
                          const key = `${task.id}-${sub.id}`;
                          const subExpanded = expandedSubtasks[key];

                          return (
                            <motion.li
                              key={sub.id}
                              className="pl-5"
                              variants={subtaskVariants}
                              layout
                            >
                              <div
                                className="flex items-center gap-2 px-2 py-1 rounded-md cursor-pointer hover:bg-emma-300/4 transition-colors"
                                onClick={() => toggleSubtask(task.id, sub.id)}
                              >
                                <div className="shrink-0">
                                  <StatusIcon status={sub.status} size={3} />
                                </div>
                                <span
                                  className={`text-xs font-light ${
                                    sub.status === "completed"
                                      ? "line-through text-emma-200/25"
                                      : "text-emma-200/70"
                                  }`}
                                >
                                  {sub.title}
                                </span>
                              </div>

                              <AnimatePresence>
                                {subExpanded && (
                                  <motion.div
                                    className="ml-6 mt-0.5 mb-1 pl-3 border-l border-dashed border-emma-300/10 overflow-hidden"
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                  >
                                    <p className="text-[11px] font-light text-emma-200/40 py-1">
                                      {sub.description}
                                    </p>
                                    {sub.tools && sub.tools.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mb-1">
                                        {sub.tools.map((tool) => (
                                          <span
                                            key={tool}
                                            className="bg-emma-200/8 text-emma-200/35 rounded px-1.5 py-0.5 text-[10px]"
                                          >
                                            {tool}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </motion.li>
                          );
                        })}
                      </ul>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </LayoutGroup>
    </div>
  );
}
