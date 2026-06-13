"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Save } from "lucide-react";
import type { AutonomyTier } from "@/types/emma";

interface Config {
  name: string;
  personaName: string;
  personaPrompt: string;
  personaGreeting: string;
  voiceId: string;
  tokenBudgetMonthly: number;
  messageLimitDaily: number;
  autonomyTier?: AutonomyTier;
  proactiveVision?: boolean;
}

type VibeOption = "playful" | "warm" | "balanced";

const VIBE_OPTIONS: { vibe: VibeOption; label: string; emoji: string; description: string }[] = [
  {
    vibe: "playful",
    label: "Playful",
    emoji: "✨",
    description: "Flirty, teasing, and full of personality. Emma at her most expressive.",
  },
  {
    vibe: "warm",
    label: "Warm",
    emoji: "🤍",
    description: "Caring and supportive. Emma is always in your corner.",
  },
  {
    vibe: "balanced",
    label: "Balanced",
    emoji: "⚖️",
    description: "Warm but clear. Emma reads the room and adjusts to what you need.",
  },
];

const AUTONOMY_OPTIONS: {
  tier: AutonomyTier;
  label: string;
  emoji: string;
  headline: string;
  description: string;
}[] = [
  {
    tier: 3,
    label: "Autonomous",
    emoji: "⚡",
    headline: "Emma acts independently",
    description: "Tools execute without asking. Emma notifies you after completing actions.",
  },
  {
    tier: 2,
    label: "Suggest",
    emoji: "💬",
    headline: "Emma proposes, you decide",
    description: "Emma drafts actions and waits for your approval before executing anything.",
  },
  {
    tier: 1,
    label: "Ask First",
    emoji: "🤝",
    headline: "Always ask before acting",
    description: "Emma checks in before every action. Maximum control, zero surprises.",
  },
];

export default function ProfilePage() {
  const [config, setConfig] = useState<Config>({
    name: "My Emma",
    personaName: "Emma",
    personaPrompt: "",
    personaGreeting: "",
    voiceId: "",
    tokenBudgetMonthly: 500000,
    messageLimitDaily: 50,
    autonomyTier: 2,
    proactiveVision: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [currentVibe, setCurrentVibe] = useState<VibeOption | null>(null);
  const [vibeSaving, setVibeSaving] = useState(false);
  const [vibeSaved, setVibeSaved] = useState(false);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    fetch("/api/emma/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.config) {
          setConfig({
            name: data.config.name || "My Emma",
            personaName: data.config.personaName || "Emma",
            personaPrompt: data.config.personaPrompt || "",
            personaGreeting: data.config.personaGreeting || "",
            voiceId: data.config.voiceId || "",
            tokenBudgetMonthly: data.config.tokenBudgetMonthly || 500000,
            messageLimitDaily: data.config.messageLimitDaily || 50,
            autonomyTier: data.config.autonomyTier ?? 2,
            proactiveVision: data.config.proactiveVision ?? false,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/emma/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get", category: "preference" }),
    })
      .then((r) => r.json())
      .then((data) => {
        const vibeEntry = (data.entries as Array<{ key: string; value: string }> | undefined)?.find(
          (e) => e.key === "interaction_vibe"
        );
        if (vibeEntry) setCurrentVibe(vibeEntry.value as VibeOption);
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      const res = await fetch("/api/emma/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        const data = await res.json().catch(() => ({}));
        setSaveError(data.error || `Save failed (${res.status})`);
      }
    } catch {
      setSaveError("Network error — changes not saved");
    }
    setSaving(false);
  };

  const handleVibeChange = async (vibe: VibeOption) => {
    if (vibeSaving || vibe === currentVibe) return;
    setVibeSaving(true);
    try {
      const res = await fetch("/api/emma/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          entry: {
            category: "preference",
            key: "interaction_vibe",
            value: vibe,
            confidence: 1.0,
            source: "explicit",
          },
        }),
      });
      if (res.ok) {
        setCurrentVibe(vibe);
        setVibeSaved(true);
        setTimeout(() => setVibeSaved(false), 2000);
      }
    } catch {}
    setVibeSaving(false);
  };

  const handleLogout = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-emma-200/20 text-sm">Loading…</div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-8">
      <div className="mb-8">
        <h1 className="text-xl font-light text-emma-100">Profile</h1>
        <p className="text-xs text-emma-300/50 mt-1">
          Persona configuration, autonomy mode, and behaviour preferences.
        </p>
      </div>

      {/* ── Conversation Style ───────────────────────────────────────────── */}
      <Section title="Conversation Style">
        <p className="text-[11px] text-emma-200/25 -mt-1 mb-4">
          Choose how Emma talks with you. Takes effect next time you open the app.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {VIBE_OPTIONS.map((opt) => {
            const selected = currentVibe === opt.vibe;
            return (
              <button
                key={opt.vibe}
                onClick={() => handleVibeChange(opt.vibe)}
                disabled={vibeSaving}
                className={`text-left rounded-2xl border p-4 transition-all cursor-pointer disabled:opacity-50 ${
                  selected
                    ? "border-emma-300/35 bg-emma-300/6 shadow-[0_0_24px_rgba(232,160,191,0.07)]"
                    : "border-surface-border bg-surface hover:border-emma-300/15 hover:bg-surface-hover"
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-2xl">{opt.emoji}</span>
                  {selected && (
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-emma-300/15 border border-emma-300/25 text-emma-300 font-medium tracking-wider uppercase">
                      Active
                    </span>
                  )}
                </div>
                <div
                  className={`text-sm font-medium mb-1 ${selected ? "text-emma-200/90" : "text-emma-200/50"}`}
                >
                  {opt.label}
                </div>
                <p className="text-[11px] font-light text-emma-200/30 leading-relaxed">
                  {opt.description}
                </p>
              </button>
            );
          })}
        </div>
        {vibeSaved && (
          <p className="text-[11px] text-emma-300/70 mt-3">
            Style updated — takes effect next session.
          </p>
        )}
        {currentVibe === null && !loading && (
          <p className="text-[11px] text-emma-200/20 mt-3">
            No style set yet — complete onboarding to set your preference, or pick one above.
          </p>
        )}
      </Section>

      {/* ── Autonomy ─────────────────────────────────────────────────────── */}
      <Section title="Autonomy">
        <p className="text-[11px] text-emma-200/25 -mt-1 mb-4">
          Choose how much independence Emma has when completing tasks and using tools.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {AUTONOMY_OPTIONS.map((opt) => {
            const selected = config.autonomyTier === opt.tier;
            return (
              <button
                key={opt.tier}
                onClick={() => setConfig({ ...config, autonomyTier: opt.tier })}
                className={`text-left rounded-2xl border p-4 transition-all cursor-pointer ${
                  selected
                    ? "border-emma-300/35 bg-emma-300/6 shadow-[0_0_24px_rgba(232,160,191,0.07)]"
                    : "border-surface-border bg-surface hover:border-emma-300/15 hover:bg-surface-hover"
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-2xl">{opt.emoji}</span>
                  {selected && (
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-emma-300/15 border border-emma-300/25 text-emma-300 font-medium tracking-wider uppercase">
                      Active
                    </span>
                  )}
                </div>
                <div
                  className={`text-sm font-medium mb-1 ${selected ? "text-emma-200/90" : "text-emma-200/50"}`}
                >
                  {opt.label}
                </div>
                <div className="text-[10px] font-medium text-emma-300/50 mb-1.5">
                  {opt.headline}
                </div>
                <p className="text-[11px] font-light text-emma-200/30 leading-relaxed">
                  {opt.description}
                </p>
              </button>
            );
          })}
        </div>
      </Section>

      {/* ── Vision ───────────────────────────────────────────────────────── */}
      <Section title="Vision">
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1">
            <div className="text-sm font-light text-emma-200/60 mb-1">
              Proactive screen awareness
            </div>
            <p className="text-[11px] text-emma-200/25 leading-relaxed">
              Allow Emma to periodically analyse your screen to provide context-aware suggestions
              without you having to ask. Requires the Vision tab to be active in the app.
            </p>
          </div>
          <button
            onClick={() => setConfig({ ...config, proactiveVision: !config.proactiveVision })}
            className={`relative shrink-0 mt-0.5 rounded-full transition-colors cursor-pointer ${
              config.proactiveVision ? "bg-emma-300/60" : "bg-emma-200/10"
            }`}
            style={{ width: 40, height: 22 }}
            aria-checked={config.proactiveVision}
            role="switch"
          >
            <span
              className="absolute top-0.5 w-4 h-4 rounded-full bg-white/90 shadow transition-transform"
              style={{
                transform: config.proactiveVision ? "translateX(20px)" : "translateX(3px)",
              }}
            />
          </button>
        </div>
      </Section>

      {/* ── Persona ──────────────────────────────────────────────────────── */}
      <Section title="Persona">
        <Field label="Instance Name" sub="What clients see as the app name">
          <input
            value={config.name}
            onChange={(e) => setConfig({ ...config, name: e.target.value })}
            className="settings-input"
            placeholder="My Emma"
          />
        </Field>
        <Field label="Persona Name" sub="What she calls herself">
          <input
            value={config.personaName}
            onChange={(e) => setConfig({ ...config, personaName: e.target.value })}
            className="settings-input"
            placeholder="Emma"
          />
        </Field>
        <Field
          label="Persona Description"
          sub="Custom personality prompt (leave empty for default)"
        >
          <textarea
            value={config.personaPrompt}
            onChange={(e) => setConfig({ ...config, personaPrompt: e.target.value })}
            className="settings-input min-h-[120px] resize-y"
            placeholder="You are Emma, a warm and attentive AI assistant…"
          />
        </Field>
        <Field
          label="Greeting Message"
          sub="First message when a new session starts (leave empty for auto-generated)"
        >
          <textarea
            value={config.personaGreeting}
            onChange={(e) => setConfig({ ...config, personaGreeting: e.target.value })}
            className="settings-input min-h-[80px] resize-y"
            placeholder="Hey! I'm Emma. What can I help you with?"
          />
        </Field>
      </Section>

      {/* ── Save ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mt-8 pb-6">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emma-300 to-emma-400 text-sm font-medium text-emma-950 cursor-pointer disabled:opacity-50 transition-opacity"
        >
          <Save size={14} /> {saving ? "Saving…" : "Save Changes"}
        </button>
        {saved && (
          <span className="text-xs text-emerald-400/60">✓ Saved — takes effect next session</span>
        )}
        {saveError && <span className="text-xs text-red-400/60">{saveError}</span>}
        <button
          onClick={handleLogout}
          className="ml-auto text-[11px] text-emma-200/20 hover:text-red-300/50 transition-colors cursor-pointer"
        >
          Sign out
        </button>
      </div>

      <style jsx>{`
        .settings-input {
          width: 100%;
          background: rgba(232, 160, 191, 0.04);
          border: 1px solid rgba(232, 160, 191, 0.1);
          border-radius: 0.75rem;
          padding: 0.625rem 1rem;
          font-size: 0.875rem;
          font-weight: 300;
          color: #e8dfe6;
          outline: none;
          font-family: "Outfit", sans-serif;
          transition: border-color 0.2s;
        }
        .settings-input:focus {
          border-color: rgba(232, 160, 191, 0.25);
        }
        .settings-input::placeholder {
          color: rgba(232, 160, 191, 0.15);
        }
      `}</style>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-xs font-medium text-emma-200/30 uppercase tracking-widest mb-4">
        {title}
      </h2>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  sub,
  children,
}: {
  label: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-light text-emma-200/60 mb-1">{label}</label>
      {sub && <p className="text-[11px] text-emma-200/20 mb-2">{sub}</p>}
      {children}
    </div>
  );
}
