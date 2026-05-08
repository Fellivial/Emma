"use client";

import { useState } from "react";
import { X, Plus, ChevronDown, Trash2, GripVertical, Zap } from "lucide-react";

type TriggerType = "scheduled" | "webhook" | "manual";
type StepType = "ai_response" | "http_request" | "send_email" | "condition" | "wait";
type FallbackType = "stop" | "notify" | "retry";

interface Step {
  id: string;
  type: StepType;
  config: Record<string, string>;
}

interface Workflow {
  id: string;
  name: string;
  trigger: TriggerType;
  cronExpression: string;
  steps: Step[];
  fallback: FallbackType;
  status: "enabled" | "disabled";
  lastRun: string | null;
}

const STEP_META: Record<
  StepType,
  {
    label: string;
    emoji: string;
    fields: { key: string; label: string; placeholder: string; multiline?: boolean }[];
  }
> = {
  ai_response: {
    label: "AI Response",
    emoji: "🤖",
    fields: [
      {
        key: "prompt",
        label: "Prompt",
        placeholder: "Summarise the latest news about {{topic}}",
        multiline: true,
      },
    ],
  },
  http_request: {
    label: "HTTP Request",
    emoji: "🌐",
    fields: [
      { key: "url", label: "URL", placeholder: "https://api.example.com/data" },
      { key: "method", label: "Method", placeholder: "GET" },
    ],
  },
  send_email: {
    label: "Send Email",
    emoji: "📧",
    fields: [
      { key: "to", label: "To", placeholder: "user@example.com" },
      { key: "subject", label: "Subject", placeholder: "Daily digest — {{date}}" },
      {
        key: "body",
        label: "Body",
        placeholder: "{{ai_response.output}}",
        multiline: true,
      },
    ],
  },
  condition: {
    label: "Condition",
    emoji: "🔀",
    fields: [
      {
        key: "expression",
        label: "Expression",
        placeholder: "{{http_request.status}} == 200",
      },
    ],
  },
  wait: {
    label: "Wait",
    emoji: "⏱",
    fields: [{ key: "minutes", label: "Minutes", placeholder: "5" }],
  },
};

const CRON_PRESETS = [
  { value: "0 9 * * *", label: "Daily at 9:00 AM" },
  { value: "0 8 * * 1", label: "Every Monday at 8:00 AM" },
  { value: "0 * * * *", label: "Every hour" },
  { value: "0 9 * * 1-5", label: "Weekdays at 9:00 AM" },
  { value: "0 0 * * *", label: "Daily at midnight" },
  { value: "custom", label: "Custom expression…" },
];

const MOCK_WORKFLOWS: Workflow[] = [
  {
    id: "1",
    name: "Morning Brief",
    trigger: "scheduled",
    cronExpression: "0 9 * * *",
    steps: [
      {
        id: "s1",
        type: "http_request",
        config: { url: "https://newsapi.org/v2/top-headlines", method: "GET" },
      },
      {
        id: "s2",
        type: "ai_response",
        config: { prompt: "Summarise these top headlines into a 3-bullet brief." },
      },
      {
        id: "s3",
        type: "send_email",
        config: {
          to: "me@example.com",
          subject: "Morning Brief",
          body: "{{ai_response.output}}",
        },
      },
    ],
    fallback: "notify",
    status: "enabled",
    lastRun: "1h ago",
  },
  {
    id: "2",
    name: "Competitor Digest",
    trigger: "scheduled",
    cronExpression: "0 8 * * 1",
    steps: [
      {
        id: "s1",
        type: "http_request",
        config: { url: "https://api.example.com/competitors", method: "GET" },
      },
      {
        id: "s2",
        type: "ai_response",
        config: { prompt: "Analyse competitor activity this week." },
      },
    ],
    fallback: "stop",
    status: "disabled",
    lastRun: "May 7",
  },
  {
    id: "3",
    name: "Lead Follow-up Email",
    trigger: "webhook",
    cronExpression: "",
    steps: [
      {
        id: "s1",
        type: "ai_response",
        config: {
          prompt: "Write a warm follow-up email for {{lead_name}} from {{company}}.",
        },
      },
      {
        id: "s2",
        type: "send_email",
        config: {
          to: "{{lead_email}}",
          subject: "Following up",
          body: "{{ai_response.output}}",
        },
      },
    ],
    fallback: "retry",
    status: "enabled",
    lastRun: "2h ago",
  },
];

function makeStep(type: StepType): Step {
  return { id: Math.random().toString(36).slice(2), type, config: {} };
}

function cronHuman(expr: string): string {
  const match = CRON_PRESETS.find((p) => p.value === expr && p.value !== "custom");
  return match ? match.label : expr;
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>(MOCK_WORKFLOWS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Workflow | null>(null);
  const [cronPreset, setCronPreset] = useState("0 9 * * *");

  const openNew = () => {
    const w: Workflow = {
      id: "new",
      name: "",
      trigger: "scheduled",
      cronExpression: "0 9 * * *",
      steps: [],
      fallback: "notify",
      status: "enabled",
      lastRun: null,
    };
    setDraft(w);
    setCronPreset("0 9 * * *");
    setEditingId("new");
  };

  const openEdit = (w: Workflow) => {
    setDraft({ ...w, steps: w.steps.map((s) => ({ ...s, config: { ...s.config } })) });
    const match = CRON_PRESETS.find((p) => p.value === w.cronExpression);
    setCronPreset(match ? w.cronExpression : "custom");
    setEditingId(w.id);
  };

  const closeEditor = () => {
    setEditingId(null);
    setDraft(null);
  };

  const saveDraft = () => {
    if (!draft || !draft.name.trim()) return;
    if (editingId === "new") {
      setWorkflows((prev) => [
        ...prev,
        { ...draft, id: Math.random().toString(36).slice(2) },
      ]);
    } else {
      setWorkflows((prev) => prev.map((w) => (w.id === editingId ? { ...draft } : w)));
    }
    closeEditor();
  };

  const deleteWorkflow = (id: string) => {
    setWorkflows((prev) => prev.filter((w) => w.id !== id));
    if (editingId === id) closeEditor();
  };

  const toggleEnabled = (id: string) => {
    setWorkflows((prev) =>
      prev.map((w) =>
        w.id === id ? { ...w, status: w.status === "enabled" ? "disabled" : "enabled" } : w
      )
    );
  };

  const addStep = (type: StepType) => {
    if (!draft) return;
    setDraft({ ...draft, steps: [...draft.steps, makeStep(type)] });
  };

  const removeStep = (stepId: string) => {
    if (!draft) return;
    setDraft({ ...draft, steps: draft.steps.filter((s) => s.id !== stepId) });
  };

  const updateStepConfig = (stepId: string, key: string, value: string) => {
    if (!draft) return;
    setDraft({
      ...draft,
      steps: draft.steps.map((s) =>
        s.id === stepId ? { ...s, config: { ...s.config, [key]: value } } : s
      ),
    });
  };

  const updateCron = (preset: string) => {
    setCronPreset(preset);
    if (preset !== "custom" && draft) setDraft({ ...draft, cronExpression: preset });
  };

  return (
    <div className="max-w-4xl mx-auto px-8 py-8">
      {/* Page header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-light text-emma-100">Workflows</h1>
          <p className="text-xs text-emma-300/50 mt-1">
            Automate multi-step tasks triggered by schedule, webhook, or manual run.
          </p>
        </div>
        {editingId === null && (
          <button
            onClick={openNew}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-emma-300 to-emma-400 text-sm font-medium text-emma-950 hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-1.5"
          >
            <Plus size={14} /> New workflow
          </button>
        )}
      </div>

      {/* ── Inline Editor ────────────────────────────────────────────────── */}
      {draft && (
        <div
          className="rounded-2xl border border-emma-300/20 bg-emma-300/3 mb-8 flex flex-col"
          style={{ maxHeight: "calc(100vh - 180px)" }}
        >
          {/* Editor header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-emma-300/10 shrink-0">
            <h2 className="text-sm font-medium text-emma-200/70">
              {editingId === "new" ? "New Workflow" : `Edit — ${draft.name || "Untitled"}`}
            </h2>
            <button
              onClick={closeEditor}
              className="text-emma-200/25 hover:text-emma-200/60 cursor-pointer transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
            {/* Name */}
            <div>
              <label className="text-[10px] text-emma-200/30 uppercase tracking-widest block mb-2">
                Name
              </label>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Morning Brief"
                className="w-full bg-emma-200/3 border border-emma-200/10 rounded-xl px-4 py-2.5 text-sm font-light text-emma-100 placeholder:text-emma-200/15 outline-none focus:border-emma-300/25 transition-colors"
              />
            </div>

            {/* Trigger */}
            <div>
              <label className="text-[10px] text-emma-200/30 uppercase tracking-widest block mb-3">
                Trigger
              </label>
              <div className="flex gap-2 mb-4">
                {(["scheduled", "webhook", "manual"] as TriggerType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setDraft({ ...draft, trigger: t })}
                    className={`px-4 py-2 rounded-xl text-xs font-light transition-all cursor-pointer capitalize ${
                      draft.trigger === t
                        ? "bg-emma-300/15 border border-emma-300/25 text-emma-300"
                        : "bg-emma-200/3 border border-emma-200/8 text-emma-200/40 hover:text-emma-200/60"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {draft.trigger === "scheduled" && (
                <div className="rounded-xl border border-emma-200/8 bg-emma-200/3 p-4 flex flex-col gap-3">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <select
                        value={cronPreset}
                        onChange={(e) => updateCron(e.target.value)}
                        className="w-full bg-transparent border border-emma-200/10 rounded-lg px-3 py-2 text-xs text-emma-200/60 outline-none appearance-none cursor-pointer"
                      >
                        {CRON_PRESETS.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        size={11}
                        className="absolute right-2.5 top-2.5 text-emma-200/20 pointer-events-none"
                      />
                    </div>
                    {cronPreset === "custom" && (
                      <input
                        value={draft.cronExpression}
                        onChange={(e) => setDraft({ ...draft, cronExpression: e.target.value })}
                        placeholder="0 9 * * *"
                        className="flex-1 bg-transparent border border-emma-200/10 rounded-lg px-3 py-2 text-xs font-mono text-emma-200/60 placeholder:text-emma-200/15 outline-none focus:border-emma-300/20"
                      />
                    )}
                  </div>
                  {draft.cronExpression && (
                    <p className="text-[11px] text-emma-200/30">
                      <span className="text-emma-300/50">Runs:</span>{" "}
                      {cronHuman(draft.cronExpression)}
                    </p>
                  )}
                </div>
              )}

              {draft.trigger === "webhook" && (
                <div className="rounded-xl border border-emma-200/8 bg-emma-200/3 p-4">
                  <p className="text-[11px] text-emma-200/30 mb-2">
                    A unique webhook URL will be generated on save. POST any JSON payload to
                    trigger this workflow.
                  </p>
                  <div className="font-mono text-[11px] text-emma-300/40 bg-black/20 rounded-lg px-3 py-2">
                    POST /api/emma/webhook/&#123;workflow-id&#125;
                  </div>
                </div>
              )}
            </div>

            {/* Steps canvas */}
            <div>
              <label className="text-[10px] text-emma-200/30 uppercase tracking-widest block mb-3">
                Steps{draft.steps.length > 0 && ` (${draft.steps.length})`}
              </label>

              {draft.steps.length === 0 && (
                <div className="rounded-xl border border-dashed border-emma-200/10 p-6 text-center mb-3">
                  <p className="text-xs text-emma-200/20">
                    Add steps below to build the workflow
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-2 mb-3">
                {draft.steps.map((step, idx) => {
                  const meta = STEP_META[step.type];
                  return (
                    <div
                      key={step.id}
                      className="rounded-xl border border-emma-200/8 bg-emma-200/3 overflow-hidden"
                    >
                      <div className="flex items-center gap-3 px-4 py-3 border-b border-emma-200/5">
                        <GripVertical size={14} className="text-emma-200/15 cursor-grab" />
                        <span className="text-[11px] text-emma-200/20 w-4 text-center tabular-nums">
                          {idx + 1}
                        </span>
                        <span className="text-base leading-none">{meta.emoji}</span>
                        <span className="text-xs font-medium text-emma-200/60 flex-1">
                          {meta.label}
                        </span>
                        <button
                          onClick={() => removeStep(step.id)}
                          className="text-emma-200/20 hover:text-red-300/60 cursor-pointer transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      <div className="p-4 flex flex-col gap-3">
                        {meta.fields.map((field) =>
                          field.multiline ? (
                            <div key={field.key}>
                              <label className="text-[10px] text-emma-200/25 block mb-1.5">
                                {field.label}
                              </label>
                              <textarea
                                value={step.config[field.key] || ""}
                                onChange={(e) =>
                                  updateStepConfig(step.id, field.key, e.target.value)
                                }
                                placeholder={field.placeholder}
                                className="w-full bg-transparent border border-emma-200/8 rounded-lg px-3 py-2 text-xs text-emma-100 placeholder:text-emma-200/15 outline-none focus:border-emma-300/20 resize-y min-h-[72px] font-light"
                              />
                            </div>
                          ) : (
                            <div key={field.key}>
                              <label className="text-[10px] text-emma-200/25 block mb-1.5">
                                {field.label}
                              </label>
                              <input
                                value={step.config[field.key] || ""}
                                onChange={(e) =>
                                  updateStepConfig(step.id, field.key, e.target.value)
                                }
                                placeholder={field.placeholder}
                                className="w-full bg-transparent border border-emma-200/8 rounded-lg px-3 py-2 text-xs text-emma-100 placeholder:text-emma-200/15 outline-none focus:border-emma-300/20 font-light"
                              />
                            </div>
                          )
                        )}
                        <p className="text-[10px] text-emma-200/15">
                          Reference step outputs with{" "}
                          <code className="font-mono text-emma-300/40">
                            {"{{step_type.output}}"}
                          </code>
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add step row */}
              <div className="flex flex-wrap gap-2">
                {(Object.keys(STEP_META) as StepType[]).map((type) => {
                  const meta = STEP_META[type];
                  return (
                    <button
                      key={type}
                      onClick={() => addStep(type)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emma-200/3 border border-emma-200/8 text-[11px] text-emma-200/40 hover:text-emma-200/70 hover:border-emma-200/15 cursor-pointer transition-all"
                    >
                      <span className="leading-none">{meta.emoji}</span>
                      <Plus size={10} />
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Fallback */}
            <div>
              <label className="text-[10px] text-emma-200/30 uppercase tracking-widest block mb-3">
                On Failure
              </label>
              <div className="flex gap-2">
                {(
                  [
                    { id: "stop", label: "Stop" },
                    { id: "notify", label: "Notify me" },
                    { id: "retry", label: "Retry once" },
                  ] as { id: FallbackType; label: string }[]
                ).map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setDraft({ ...draft, fallback: f.id })}
                    className={`px-4 py-2 rounded-xl text-xs font-light transition-all cursor-pointer ${
                      draft.fallback === f.id
                        ? "bg-emma-300/15 border border-emma-300/25 text-emma-300"
                        : "bg-emma-200/3 border border-emma-200/8 text-emma-200/40 hover:text-emma-200/60"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Action bar — pinned at bottom via flex layout, no sticky needed */}
          <div className="shrink-0 flex items-center justify-between gap-3 px-6 py-4 border-t border-emma-300/10 bg-emma-950/85 backdrop-blur-xl">
            <div className="flex items-center gap-2">
              <button
                onClick={saveDraft}
                disabled={!draft.name.trim() || draft.steps.length === 0}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-emma-300 to-emma-400 text-sm font-medium text-emma-950 hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {editingId === "new" ? "Create Workflow" : "Save Changes"}
              </button>
              <button
                onClick={closeEditor}
                className="px-4 py-2 rounded-xl bg-emma-200/5 border border-emma-200/8 text-xs text-emma-200/40 hover:text-emma-200/60 cursor-pointer transition-all"
              >
                Cancel
              </button>
            </div>
            {editingId !== "new" && editingId !== null && (
              <button
                onClick={() => deleteWorkflow(editingId)}
                className="text-[11px] text-red-300/30 hover:text-red-300/70 cursor-pointer transition-colors flex items-center gap-1.5"
              >
                <Trash2 size={12} /> Delete workflow
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Workflow List ────────────────────────────────────────────────── */}
      {workflows.length === 0 ? (
        <div className="rounded-xl border border-surface-border bg-surface p-12 text-center">
          <p className="text-sm text-emma-200/25">
            No workflows yet. Create one to automate recurring tasks.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-surface-border bg-surface overflow-hidden">
          <div className="grid grid-cols-[1fr_100px_60px_110px_110px_90px] gap-4 px-5 py-3 border-b border-surface-border">
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
              className={`grid grid-cols-[1fr_100px_60px_110px_110px_90px] gap-4 px-5 py-4 items-center transition-colors ${
                i < workflows.length - 1 ? "border-b border-surface-border" : ""
              } ${editingId === w.id ? "bg-emma-300/3" : ""}`}
            >
              <div className="min-w-0">
                <span className="text-sm font-light text-emma-200/70 truncate block">
                  {w.name}
                </span>
                {w.trigger === "scheduled" && w.cronExpression && (
                  <span className="text-[10px] text-emma-200/20 block mt-0.5">
                    {cronHuman(w.cronExpression)}
                  </span>
                )}
              </div>

              <span className="text-xs text-emma-200/30 capitalize">{w.trigger}</span>
              <span className="text-xs text-emma-200/30">{w.steps.length}</span>

              <span>
                <span
                  className={`inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full border ${
                    w.status === "enabled"
                      ? "bg-violet-400/10 border-violet-400/20 text-violet-300"
                      : "bg-emma-200/5 border-emma-200/10 text-emma-200/25"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      w.status === "enabled" ? "bg-violet-400" : "bg-emma-200/20"
                    }`}
                  />
                  {w.status}
                </span>
              </span>

              <span className="text-xs text-emma-200/25">{w.lastRun ?? "—"}</span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleEnabled(w.id)}
                  className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer shrink-0 ${
                    w.status === "enabled" ? "bg-violet-500/60" : "bg-emma-200/10"
                  }`}
                  aria-label={w.status === "enabled" ? "Disable" : "Enable"}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white/90 shadow transition-transform ${
                      w.status === "enabled" ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </button>
                <button
                  onClick={() => (editingId === w.id ? closeEditor() : openEdit(w))}
                  className="text-[11px] text-emma-200/30 hover:text-emma-300 transition-colors cursor-pointer whitespace-nowrap"
                >
                  {editingId === w.id ? "Close" : "Edit →"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 mt-4 text-[11px] text-emma-200/15">
        <Zap size={11} className="text-emma-300/20" />
        Workflows run server-side. Manual trigger and API persistence coming soon.
      </div>
    </div>
  );
}
