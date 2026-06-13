"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Step = "intro" | "name" | "vibe" | "confirm";

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

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>("intro");
  const [name, setName] = useState("");
  const [vibe, setVibe] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiDisclosureAcknowledged, setAiDisclosureAcknowledged] = useState(false);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const STEPS: Step[] = ["intro", "name", "vibe", "confirm"];
  const stepIndex = STEPS.indexOf(step);

  const STEP_LABELS: Record<Step, string> = {
    intro: "Intro",
    name: "Your name",
    vibe: "Your vibe",
    confirm: "All set",
  };

  const finish = async () => {
    if (!supabase) return;
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

      // Save name to memories so greeting engine + proactive speech can personalise.
      // Skip "Baby" — it's the placeholder shortcut, not a real name, and the
      // mommy persona already uses "baby" naturally without a memory reference.
      const trimmedName = name.trim();
      if (trimmedName && trimmedName.toLowerCase() !== "baby") {
        await supabase.from("memories").upsert({
          id: `mem-onboard-name-${user.id}`,
          user_id: user.id,
          category: "personal",
          key: "user_name",
          value: trimmedName,
          confidence: 1.0,
          source: "explicit",
        });
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
        <div
          role="progressbar"
          aria-valuenow={stepIndex + 1}
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-label={`Step ${stepIndex + 1} of ${STEPS.length} — ${STEP_LABELS[step]}`}
          className="flex gap-1.5 px-8"
        >
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`flex-1 h-0.5 rounded-full transition-all duration-500 ${
                i <= stepIndex ? "bg-emma-300" : "bg-emma-200/10"
              }`}
            />
          ))}
        </div>
        <p className="text-[10px] text-emma-200/25 text-center mt-2 mb-6 uppercase tracking-widest">
          Step {stepIndex + 1} of {STEPS.length} — {STEP_LABELS[step]}
        </p>

        <div className="rounded-2xl border border-surface-border bg-emma-950/60 backdrop-blur-xl p-8">
          {/* ── intro ───────────────────────────────────────────── */}
          {step === "intro" && (
            <div className="text-center animate-fade-in">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emma-300 to-emma-400 flex items-center justify-center mx-auto mb-6">
                <span className="font-display text-4xl italic text-emma-950">E</span>
              </div>
              <h1 className="text-lg font-medium text-emma-200/80 mb-2">Hey. I&apos;m Emma.</h1>
              <p className="text-sm font-light text-emma-200/40 leading-relaxed mb-6">
                I manage your environment, I remember everything, and I pay attention. Let me get to
                know you real quick.
              </p>
              <div className="rounded-xl border border-surface-border bg-surface p-4 mb-6 text-left">
                <p className="text-xs text-emma-200/60 leading-relaxed mb-3">
                  Emma is an AI assistant, not a human. By continuing you acknowledge you are
                  interacting with an artificial intelligence system as required by applicable law.
                </p>
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={aiDisclosureAcknowledged}
                    onChange={(e) => setAiDisclosureAcknowledged(e.target.checked)}
                    className="mt-0.5 accent-emma-300 cursor-pointer"
                  />
                  <span className="text-xs text-emma-200/50 leading-relaxed">
                    I understand I am interacting with an AI, not a human.
                  </span>
                </label>
              </div>
              <button
                onClick={() => setStep("name")}
                disabled={!aiDisclosureAcknowledged}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-emma-300 to-emma-400 text-sm font-medium text-emma-950 cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Let&apos;s go
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
                Just call me &quot;baby&quot;
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
                  onClick={() => setStep("confirm")}
                  disabled={!vibe}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emma-300 to-emma-400 text-sm font-medium text-emma-950 cursor-pointer disabled:opacity-30"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* ── confirm ─────────────────────────────────────────── */}
          {step === "confirm" && (
            <div className="animate-fade-in">
              <h2 className="text-lg font-medium text-emma-200/80 mb-2 text-center">
                Perfect, {name || "baby"}.
              </h2>
              <p className="text-sm font-light text-emma-200/40 leading-relaxed mb-6 text-center">
                I&apos;ll remember everything from here. Let&apos;s get started.
              </p>

              {error && <p className="text-[11px] text-red-300/60 mb-3 text-center">{error}</p>}

              <button
                onClick={finish}
                disabled={saving}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-emma-300 to-emma-400 text-sm font-medium text-emma-950 cursor-pointer disabled:opacity-50"
              >
                {saving ? "Setting up…" : "Launch Emma →"}
              </button>
              <button
                onClick={() => setStep("vibe")}
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
