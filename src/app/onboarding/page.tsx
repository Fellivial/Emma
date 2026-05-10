"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getAllVerticals, applyVertical } from "@/core/verticals/templates";
import type { IntakeQuestion, VerticalConfig } from "@/core/verticals/templates";

type Step = "intro" | "name" | "vibe" | "vertical" | "intake" | "confirm";

const VIBE_OPTIONS = [
  {
    id: "playful",
    icon: "😏",
    label: "Playful & teasing",
    desc: "The full Emma experience — flirty, confident, pays attention",
  },
  {
    id: "warm",
    icon: "🥰",
    label: "Warm & caring",
    desc: "Less teasing, more warmth — supportive and present",
  },
  {
    id: "balanced",
    icon: "😌",
    label: "Balanced",
    desc: "A mix of both — reads the room and adjusts",
  },
];

const PLAN_BADGE: Record<string, string> = {
  starter: "Starter",
  pro: "Pro",
  scale: "Scale",
};

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>("intro");
  const [name, setName] = useState("");
  const [vibe, setVibe] = useState<string | null>(null);
  const [selectedVerticalId, setSelectedVerticalId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const verticals = useMemo(() => getAllVerticals(), []);
  const selectedVertical = useMemo(
    () => verticals.find((v) => v.id === selectedVerticalId) ?? null,
    [verticals, selectedVerticalId]
  );

  const intakeQuestions = useMemo<IntakeQuestion[]>(() => {
    if (!selectedVerticalId) return [];
    const result = applyVertical(selectedVerticalId);
    return result?.intake_questions ?? [];
  }, [selectedVerticalId]);

  const intakeComplete = useMemo(() => {
    return intakeQuestions
      .filter((q) => q.required)
      .every((q) => {
        const ans = answers[q.id];
        if (!ans) return false;
        if (Array.isArray(ans)) return ans.length > 0;
        return String(ans).trim().length > 0;
      });
  }, [intakeQuestions, answers]);

  const STEPS: Step[] = ["intro", "name", "vibe", "vertical", "intake", "confirm"];
  const stepIndex = STEPS.indexOf(step);

  const setAnswer = (id: string, value: string | string[]) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const toggleMulti = (id: string, option: string) => {
    const current = (answers[id] as string[] | undefined) ?? [];
    const updated = current.includes(option)
      ? current.filter((v) => v !== option)
      : [...current, option];
    setAnswer(id, updated);
  };

  const finish = async () => {
    if (!supabase || !selectedVerticalId) return;
    setSaving(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      await supabase
        .from("profiles")
        .update({
          name: name.trim() || "Baby",
          onboarded: true,
        })
        .eq("id", user.id);

      if (vibe) {
        await supabase.from("memories").upsert({
          id: `mem-onboard-vibe-${user.id}`,
          user_id: user.id,
          category: "preference",
          key: "interaction_vibe",
          value: vibe,
          confidence: 1.0,
          source: "explicit",
        });
      }

      const verticalConfig = applyVertical(selectedVerticalId);
      if (verticalConfig) {
        const { data: clientRow } = await supabase
          .from("clients")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (clientRow) {
          await supabase
            .from("clients")
            .update({
              vertical_id: selectedVerticalId,
              persona_name: verticalConfig.persona_name,
              persona_prompt: verticalConfig.persona_prompt,
              persona_greeting: verticalConfig.persona_greeting,
              tools_enabled: verticalConfig.tools_enabled,
            })
            .eq("id", clientRow.id);
        }
      }

      const memoryUpserts = intakeQuestions
        .filter((q) => {
          const ans = answers[q.id];
          return ans !== undefined && ans !== "" && !(Array.isArray(ans) && ans.length === 0);
        })
        .map((q) => {
          const raw = answers[q.id];
          const value = Array.isArray(raw) ? raw.join(", ") : String(raw);
          return {
            id: `mem-onboard-${q.savesTo}-${user.id}`,
            user_id: user.id,
            category: "preference" as const,
            key: q.savesTo,
            value,
            confidence: 1.0,
            source: "explicit",
          };
        });

      if (memoryUpserts.length > 0) {
        await supabase.from("memories").upsert(memoryUpserts);
      }

      router.push("/app");
    } catch {
      setError("Something went wrong. Please try again.");
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emma-950 via-emma-900 to-emma-950 font-sans px-4">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="flex gap-1.5 mb-8 px-8">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`flex-1 h-0.5 rounded-full transition-all duration-500 ${
                i <= stepIndex ? "bg-emma-300" : "bg-emma-200/10"
              }`}
            />
          ))}
        </div>

        <div className="rounded-2xl border border-surface-border bg-emma-950/60 backdrop-blur-xl p-8">
          {/* ── intro ───────────────────────────────────────────── */}
          {step === "intro" && (
            <div className="text-center animate-fade-in">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emma-300 to-emma-400 flex items-center justify-center mx-auto mb-6">
                <span className="font-display text-4xl italic text-emma-950">E</span>
              </div>
              <h1 className="text-lg font-medium text-emma-200/80 mb-2">Hey. I'm Emma.</h1>
              <p className="text-sm font-light text-emma-200/40 leading-relaxed mb-6">
                I manage your environment, I remember everything, and I pay attention. Let me get to
                know you real quick.
              </p>
              <button
                onClick={() => setStep("name")}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-emma-300 to-emma-400 text-sm font-medium text-emma-950 cursor-pointer hover:opacity-90 transition-opacity"
              >
                Let's go
              </button>
            </div>
          )}

          {/* ── name ────────────────────────────────────────────── */}
          {step === "name" && (
            <div className="animate-fade-in">
              <p className="text-sm text-emma-200/50 font-light mb-1">Mmm. First things first.</p>
              <h2 className="text-lg font-medium text-emma-200/80 mb-6">What should I call you?</h2>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && name.trim() && setStep("vibe")}
                placeholder="Your name (or a nickname)"
                autoFocus
                className="w-full bg-surface border border-surface-border rounded-xl px-4 py-3 text-sm font-light text-emma-100 placeholder:text-emma-200/15 outline-none focus:border-emma-300/25 transition-colors mb-4"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setStep("intro")}
                  className="flex-1 py-2.5 rounded-xl border border-surface-border text-sm font-light text-emma-200/30 cursor-pointer hover:text-emma-200/50 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep("vibe")}
                  disabled={!name.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emma-300 to-emma-400 text-sm font-medium text-emma-950 cursor-pointer disabled:opacity-30"
                >
                  Next
                </button>
              </div>
              <button
                onClick={() => {
                  setName("Baby");
                  setStep("vibe");
                }}
                className="w-full mt-2 text-xs text-emma-300/30 hover:text-emma-300/50 cursor-pointer transition-colors"
              >
                Just call me "baby"
              </button>
            </div>
          )}

          {/* ── vibe ────────────────────────────────────────────── */}
          {step === "vibe" && (
            <div className="animate-fade-in">
              <p className="text-sm text-emma-200/50 font-light mb-1">
                Nice to meet you, {name || "baby"}.
              </p>
              <h2 className="text-lg font-medium text-emma-200/80 mb-6">
                How do you want this to feel?
              </h2>
              <div className="flex flex-col gap-2 mb-4">
                {VIBE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setVibe(opt.id)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all cursor-pointer ${
                      vibe === opt.id
                        ? "border-emma-300/30 bg-emma-300/8"
                        : "border-surface-border bg-surface hover:bg-surface-hover"
                    }`}
                  >
                    <span className="text-lg">{opt.icon}</span>
                    <div>
                      <div className="text-xs font-medium text-emma-200/60">{opt.label}</div>
                      <div className="text-[11px] font-light text-emma-200/25">{opt.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setStep("name")}
                  className="flex-1 py-2.5 rounded-xl border border-surface-border text-sm font-light text-emma-200/30 cursor-pointer hover:text-emma-200/50"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep("vertical")}
                  disabled={!vibe}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emma-300 to-emma-400 text-sm font-medium text-emma-950 cursor-pointer disabled:opacity-30"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* ── vertical ────────────────────────────────────────── */}
          {step === "vertical" && (
            <div className="animate-fade-in">
              <p className="text-sm text-emma-200/50 font-light mb-1">Almost there.</p>
              <h2 className="text-lg font-medium text-emma-200/80 mb-6">
                What will you use Emma for?
              </h2>
              <div className="flex flex-col gap-2 mb-4 max-h-72 overflow-y-auto pr-1">
                {verticals.map((v) => (
                  <VerticalCard
                    key={v.id}
                    vertical={v}
                    selected={selectedVerticalId === v.id}
                    onSelect={() => setSelectedVerticalId(v.id)}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setStep("vibe")}
                  className="flex-1 py-2.5 rounded-xl border border-surface-border text-sm font-light text-emma-200/30 cursor-pointer hover:text-emma-200/50"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep("intake")}
                  disabled={!selectedVerticalId}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emma-300 to-emma-400 text-sm font-medium text-emma-950 cursor-pointer disabled:opacity-30"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* ── intake ──────────────────────────────────────────── */}
          {step === "intake" && selectedVertical && (
            <div className="animate-fade-in">
              <div className="flex items-center gap-2 mb-1">
                <span>{selectedVertical.icon}</span>
                <p className="text-sm text-emma-200/50 font-light">{selectedVertical.name}</p>
              </div>
              <h2 className="text-lg font-medium text-emma-200/80 mb-6">A few quick questions.</h2>
              <div className="flex flex-col gap-4 mb-4 max-h-80 overflow-y-auto pr-1">
                {intakeQuestions.map((q) => (
                  <IntakeField
                    key={q.id}
                    question={q}
                    value={answers[q.id]}
                    onChange={(val) => setAnswer(q.id, val)}
                    onToggle={(opt) => toggleMulti(q.id, opt)}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setStep("vertical")}
                  className="flex-1 py-2.5 rounded-xl border border-surface-border text-sm font-light text-emma-200/30 cursor-pointer hover:text-emma-200/50"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep("confirm")}
                  disabled={!intakeComplete}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emma-300 to-emma-400 text-sm font-medium text-emma-950 cursor-pointer disabled:opacity-30"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* ── confirm ─────────────────────────────────────────── */}
          {step === "confirm" && selectedVertical && (
            <div className="animate-fade-in">
              <div className="text-4xl mb-4 text-center">😏</div>
              <h2 className="text-lg font-medium text-emma-200/80 mb-2 text-center">
                Perfect, {name || "baby"}.
              </h2>
              <p className="text-sm font-light text-emma-200/40 leading-relaxed mb-6 text-center">
                I'll remember everything from here. Let's get started.
              </p>

              <div className="rounded-xl border border-surface-border bg-surface p-4 mb-6">
                <div className="flex items-center gap-3 mb-4 pb-3 border-b border-surface-border">
                  <span className="text-2xl">{selectedVertical.icon}</span>
                  <div>
                    <div className="text-xs font-medium text-emma-200/60">
                      {selectedVertical.name}
                    </div>
                    <div className="text-[11px] font-light text-emma-200/25">
                      {selectedVertical.description}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {intakeQuestions
                    .filter((q) => answers[q.id] && answers[q.id] !== "")
                    .map((q) => {
                      const ans = answers[q.id];
                      const display = Array.isArray(ans) ? ans.join(", ") : String(ans);
                      return (
                        <div
                          key={q.id}
                          className="flex items-center justify-between gap-3 text-[11px]"
                        >
                          <span className="text-emma-200/25 truncate">{q.question}</span>
                          <span className="text-emma-200/60 font-medium shrink-0 max-w-[45%] truncate text-right">
                            {display}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>

              {error && <p className="text-[11px] text-red-300/60 mb-3 text-center">{error}</p>}

              <button
                onClick={finish}
                disabled={saving}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-emma-300 to-emma-400 text-sm font-medium text-emma-950 cursor-pointer disabled:opacity-50"
              >
                {saving ? "Setting up…" : "Launch Emma →"}
              </button>
              <button
                onClick={() => setStep("intake")}
                className="w-full mt-2 text-xs text-emma-200/20 hover:text-emma-200/40 cursor-pointer transition-colors"
              >
                ← Edit answers
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Vertical card ─────────────────────────────────────────────────────────────

function VerticalCard({
  vertical,
  selected,
  onSelect,
}: {
  vertical: VerticalConfig;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all cursor-pointer ${
        selected
          ? "border-emma-300/30 bg-emma-300/8"
          : "border-surface-border bg-surface hover:bg-surface-hover"
      }`}
    >
      <span className="text-2xl shrink-0">{vertical.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-emma-200/70">{vertical.name}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-emma-300/15 text-emma-300/50">
            {PLAN_BADGE[vertical.suggestedPlan] ?? vertical.suggestedPlan}
          </span>
        </div>
        <p className="text-[11px] font-light text-emma-200/25 truncate">{vertical.description}</p>
      </div>
      {selected && (
        <span className="w-4 h-4 rounded-full bg-emma-300 flex items-center justify-center shrink-0">
          <span className="text-emma-950 text-[10px] font-bold">✓</span>
        </span>
      )}
    </button>
  );
}

// ── Intake field ──────────────────────────────────────────────────────────────

function IntakeField({
  question,
  value,
  onChange,
  onToggle,
}: {
  question: IntakeQuestion;
  value: string | string[] | undefined;
  onChange: (val: string) => void;
  onToggle: (opt: string) => void;
}) {
  const selectedArr = Array.isArray(value) ? value : [];
  const strVal = typeof value === "string" ? value : "";

  return (
    <div>
      <label className="text-[11px] text-emma-200/40 block mb-1.5">
        {question.question}
        {question.required && <span className="text-emma-300/50 ml-1">*</span>}
      </label>

      {question.type === "text" && (
        <input
          type="text"
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-surface border border-surface-border rounded-xl px-4 py-2.5 text-sm font-light text-emma-100 placeholder:text-emma-200/15 outline-none focus:border-emma-300/25 transition-colors"
        />
      )}

      {question.type === "select" && question.options && (
        <select
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-surface border border-surface-border rounded-xl px-4 py-2.5 text-sm font-light text-emma-100 outline-none focus:border-emma-300/25 transition-colors appearance-none cursor-pointer"
        >
          <option value="">Select…</option>
          {question.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      )}

      {question.type === "multi_select" && question.options && (
        <div className="flex flex-wrap gap-2">
          {question.options.map((opt) => {
            const checked = selectedArr.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onToggle(opt)}
                className={`px-3 py-1.5 rounded-lg border text-[11px] cursor-pointer transition-all ${
                  checked
                    ? "border-emma-300/30 bg-emma-300/10 text-emma-300"
                    : "border-surface-border bg-surface text-emma-200/35 hover:text-emma-200/55"
                }`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
