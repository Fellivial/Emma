"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Step = "intro" | "name" | "vibe" | "ready";

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>("intro");
  const [name, setName] = useState("");
  const [vibe, setVibe] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const finish = async () => {
    setSaving(true);
    if (!supabase) { router.push("/"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("profiles").update({
        name: name.trim() || "Baby",
        onboarded: true,
      }).eq("id", user.id);

      // Store vibe preference as a memory
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
    }
    router.push("/");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emma-950 via-emma-900 to-emma-950 font-sans px-4">
      <div className="w-full max-w-md">
        {/* Progress */}
        <div className="flex gap-1.5 mb-8 px-8">
          {(["intro", "name", "vibe", "ready"] as Step[]).map((s, i) => (
            <div
              key={s}
              className={`flex-1 h-0.5 rounded-full transition-all duration-500 ${
                i <= ["intro", "name", "vibe", "ready"].indexOf(step)
                  ? "bg-emma-300"
                  : "bg-emma-200/10"
              }`}
            />
          ))}
        </div>

        <div className="rounded-2xl border border-surface-border bg-emma-950/60 backdrop-blur-xl p-8">
          {/* Step 1: Intro */}
          {step === "intro" && (
            <div className="text-center animate-fade-in">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emma-300 to-emma-400 flex items-center justify-center mx-auto mb-6">
                <span className="font-display text-4xl italic text-emma-950">E</span>
              </div>
              <h1 className="text-lg font-medium text-emma-200/80 mb-2">
                Hey. I'm Emma.
              </h1>
              <p className="text-sm font-light text-emma-200/40 leading-relaxed mb-6">
                I manage your environment, I remember everything, and I pay attention.
                Let me get to know you real quick.
              </p>
              <button
                onClick={() => setStep("name")}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-emma-300 to-emma-400 text-sm font-medium text-emma-950 cursor-pointer hover:opacity-90 transition-opacity"
              >
                Let's go
              </button>
            </div>
          )}

          {/* Step 2: Name */}
          {step === "name" && (
            <div className="animate-fade-in">
              <p className="text-sm text-emma-200/50 font-light mb-1">
                Mmm. First things first.
              </p>
              <h2 className="text-lg font-medium text-emma-200/80 mb-6">
                What should I call you?
              </h2>
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
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emma-300 to-emma-400 text-sm font-medium text-emma-950 cursor-pointer disabled:opacity-30"
                  disabled={!name.trim()}
                >
                  Next
                </button>
              </div>
              <button
                onClick={() => { setName("Baby"); setStep("vibe"); }}
                className="w-full mt-2 text-xs text-emma-300/30 hover:text-emma-300/50 cursor-pointer transition-colors"
              >
                Just call me "baby"
              </button>
            </div>
          )}

          {/* Step 3: Vibe check */}
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
                  onClick={() => setStep("ready")}
                  disabled={!vibe}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emma-300 to-emma-400 text-sm font-medium text-emma-950 cursor-pointer disabled:opacity-30"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Ready */}
          {step === "ready" && (
            <div className="text-center animate-fade-in">
              <div className="text-4xl mb-4">😏</div>
              <h2 className="text-lg font-medium text-emma-200/80 mb-2">
                Perfect, {name || "baby"}.
              </h2>
              <p className="text-sm font-light text-emma-200/40 leading-relaxed mb-6">
                I'll remember everything from here. Your preferences, your habits, your moods.
                Don't worry — I only use it to take care of you.
              </p>
              <button
                onClick={finish}
                disabled={saving}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-emma-300 to-emma-400 text-sm font-medium text-emma-950 cursor-pointer disabled:opacity-50"
              >
                {saving ? "Setting up…" : "Take me to Emma"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const VIBE_OPTIONS = [
  { id: "playful", icon: "😏", label: "Playful & teasing", desc: "The full Emma experience — flirty, confident, pays attention" },
  { id: "warm", icon: "🥰", label: "Warm & caring", desc: "Less teasing, more warmth — supportive and present" },
  { id: "balanced", icon: "😌", label: "Balanced", desc: "A mix of both — reads the room and adjusts" },
];
