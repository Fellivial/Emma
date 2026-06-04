"use client";

import { useState, useEffect } from "react";
import { getPlan } from "@/core/pricing";
import {
  TONE_ADJECTIVE_ALLOWLIST,
  TOPIC_TAG_ALLOWLIST,
  SUPPORTED_LANGUAGES,
  type ToneAdjective,
  type TopicTag,
  type CustomPersona,
} from "@/types/persona";

// ─── Upgrade Gate ────────────────────────────────────────────────────────────

function UpgradeGate() {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-8 text-center gap-6">
      <div className="w-12 h-12 rounded-2xl bg-emma-300/10 border border-emma-300/20 flex items-center justify-center">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path
            d="M10 2l2.5 5 5.5.8-4 3.9.9 5.5L10 14.5l-4.9 2.7.9-5.5L2 7.8l5.5-.8L10 2z"
            stroke="#e8a0bf"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="space-y-2">
        <h2 className="text-base font-semibold text-emma-200/90">Custom Persona</h2>
        <p className="text-sm text-emma-200/45 max-w-xs leading-relaxed">
          Shape Emma&apos;s name, tone, topics, and communication style. Available on Pro and
          Enterprise plans.
        </p>
      </div>
      <a
        href="/settings/billing"
        className="px-4 py-2 rounded-xl bg-emma-300/10 border border-emma-300/20 text-sm text-emma-300 hover:bg-emma-300/15 transition-colors"
      >
        Upgrade to Pro
      </a>
    </div>
  );
}

// ─── Tag Toggle ───────────────────────────────────────────────────────────────

function TagToggle<T extends string>({
  label,
  options,
  selected,
  onChange,
  limit,
}: {
  label: string;
  options: T[];
  selected: T[];
  onChange: (v: T[]) => void;
  limit?: number;
}) {
  const toggle = (tag: T) => {
    if (selected.includes(tag)) {
      onChange(selected.filter((t) => t !== tag));
    } else if (!limit || selected.length < limit) {
      onChange([...selected, tag]);
    }
  };
  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-emma-200/50 uppercase tracking-widest">
        {label}
      </label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              className={`px-2.5 py-1 rounded-lg text-xs transition-all border ${
                active
                  ? "bg-emma-300/15 border-emma-300/30 text-emma-200/90"
                  : "bg-transparent border-emma-200/10 text-emma-200/35 hover:border-emma-200/25 hover:text-emma-200/55"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Segment Control ─────────────────────────────────────────────────────────

function SegmentControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-emma-200/50 uppercase tracking-widest">
        {label}
      </label>
      <div className="flex gap-1 p-1 bg-emma-950/60 border border-surface-border rounded-xl w-fit">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
              value === opt.value
                ? "bg-emma-300/15 border border-emma-300/20 text-emma-200/90"
                : "text-emma-200/35 hover:text-emma-200/55 border border-transparent"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

interface VoiceEntry {
  voiceId: string;
  name: string;
  category: "cloned" | "generated" | "premade" | "professional";
}

type FormState = {
  name: string;
  basePersonaId: "mommy" | "neutral";
  toneAdjectives: ToneAdjective[];
  communicationStyle: "formal" | "casual";
  verbosity: "concise" | "normal" | "verbose";
  topicsEmphasise: TopicTag[];
  topicsAvoid: TopicTag[];
  language: string;
  voiceId: string;
  description: string;
};

function defaultForm(): FormState {
  return {
    name: "",
    basePersonaId: "neutral",
    toneAdjectives: [],
    communicationStyle: "casual",
    verbosity: "normal",
    topicsEmphasise: [],
    topicsAvoid: [],
    language: "en",
    voiceId: "",
    description: "",
  };
}

function personaToForm(p: CustomPersona): FormState {
  return {
    name: p.name ?? "",
    basePersonaId: p.basePersonaId,
    toneAdjectives: p.toneAdjectives,
    communicationStyle: p.communicationStyle,
    verbosity: p.verbosity,
    topicsEmphasise: p.topicsEmphasise,
    topicsAvoid: p.topicsAvoid,
    language: p.language,
    voiceId: p.voiceId ?? "",
    description: p.description ?? "",
  };
}

export default function PersonaPage() {
  const [planId, setPlanId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [voices, setVoices] = useState<VoiceEntry[]>([]);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [elConnected, setElConnected] = useState(false);

  useEffect(() => {
    const loadAll = async () => {
      try {
        const [usageRes, personaRes] = await Promise.all([
          fetch("/api/emma/usage"),
          fetch("/api/emma/persona"),
        ]);
        const usage = await usageRes.json();
        if (usage.planId) setPlanId(usage.planId as string);

        const { persona } = (await personaRes.json()) as { persona: CustomPersona | null };
        if (persona) setForm(personaToForm(persona));
      } catch {
        // continue with defaults
      } finally {
        setLoading(false);
      }

      // Load ElevenLabs voices after form is ready (non-blocking)
      setVoiceLoading(true);
      try {
        const vr = await fetch("/api/integrations/elevenlabs/voices");
        if (vr.ok) {
          const vd = (await vr.json()) as { voices?: VoiceEntry[] };
          setVoices(vd.voices ?? []);
          setElConnected(true);
        }
      } catch {
        // ElevenLabs not connected — voice picker hidden
      } finally {
        setVoiceLoading(false);
      }
    };
    void loadAll();
  }, []);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/emma/persona", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name || undefined,
          basePersonaId: form.basePersonaId,
          toneAdjectives: form.toneAdjectives,
          communicationStyle: form.communicationStyle,
          verbosity: form.verbosity,
          topicsEmphasise: form.topicsEmphasise,
          topicsAvoid: form.topicsAvoid,
          language: form.language,
          voiceId: form.voiceId || undefined,
          description: form.description || undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (data.ok) {
        setStatus({ ok: true, msg: "Persona saved." });
      } else {
        setStatus({ ok: false, msg: data.error ?? "Save failed." });
      }
    } catch {
      setStatus({ ok: false, msg: "Network error." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="w-5 h-5 rounded-full border-2 border-emma-300/30 border-t-emma-300 animate-spin" />
      </div>
    );
  }

  const hasPlan = planId !== null && getPlan(planId).features.customPersona;
  if (!hasPlan) return <UpgradeGate />;

  const descLen = form.description.length;

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-base font-semibold text-emma-200/90">Custom Persona</h1>
        <p className="text-sm text-emma-200/40 mt-1">Shape how Emma presents herself to you.</p>
      </div>

      <div className="space-y-6">
        {/* Name */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-emma-200/50 uppercase tracking-widest">
            Emma&apos;s name
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => set("name", e.target.value.slice(0, 30))}
            placeholder="Emma"
            maxLength={30}
            className="w-full bg-emma-950/60 border border-surface-border rounded-xl px-4 py-2.5 text-sm text-emma-200/80 placeholder:text-emma-200/20 focus:outline-none focus:border-emma-300/30 transition-colors"
          />
          <p className="text-[10px] text-emma-200/25">{form.name.length}/30</p>
        </div>

        {/* Base persona */}
        <SegmentControl
          label="Base persona"
          value={form.basePersonaId}
          onChange={(v) => set("basePersonaId", v)}
          options={[
            { value: "neutral", label: "Standard" },
            { value: "mommy", label: "Mommy" },
          ]}
        />

        {/* Tone */}
        <TagToggle
          label="Tone adjectives (pick up to 5)"
          options={TONE_ADJECTIVE_ALLOWLIST}
          selected={form.toneAdjectives}
          onChange={(v) => set("toneAdjectives", v)}
          limit={5}
        />

        {/* Communication style */}
        <SegmentControl
          label="Communication style"
          value={form.communicationStyle}
          onChange={(v) => set("communicationStyle", v)}
          options={[
            { value: "casual", label: "Casual" },
            { value: "formal", label: "Formal" },
          ]}
        />

        {/* Verbosity */}
        <SegmentControl
          label="Verbosity"
          value={form.verbosity}
          onChange={(v) => set("verbosity", v)}
          options={[
            { value: "concise", label: "Concise" },
            { value: "normal", label: "Normal" },
            { value: "verbose", label: "Detailed" },
          ]}
        />

        {/* Topics */}
        <TagToggle
          label="Topics to emphasise"
          options={TOPIC_TAG_ALLOWLIST}
          selected={form.topicsEmphasise}
          onChange={(v) => set("topicsEmphasise", v)}
        />
        <TagToggle
          label="Topics to avoid"
          options={TOPIC_TAG_ALLOWLIST}
          selected={form.topicsAvoid}
          onChange={(v) => set("topicsAvoid", v)}
        />

        {/* Language */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-emma-200/50 uppercase tracking-widest">
            Response language
          </label>
          <select
            value={form.language}
            onChange={(e) => set("language", e.target.value)}
            className="bg-emma-950/60 border border-surface-border rounded-xl px-4 py-2.5 text-sm text-emma-200/80 focus:outline-none focus:border-emma-300/30 transition-colors"
          >
            {Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </div>

        {/* Voice */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-emma-200/50 uppercase tracking-widest">
            Voice
          </label>
          {voiceLoading ? (
            <p className="text-[11px] text-emma-200/25">Loading voices…</p>
          ) : !elConnected ? (
            <p className="text-[11px] text-emma-200/35">
              Connect{" "}
              <a
                href="/settings/integrations"
                className="text-emma-300/60 hover:text-emma-300/80 underline underline-offset-2 transition-colors"
              >
                ElevenLabs
              </a>{" "}
              in Integrations to use a custom cloned voice.
            </p>
          ) : (
            <>
              <select
                value={form.voiceId}
                onChange={(e) => set("voiceId", e.target.value)}
                className="w-full bg-emma-950/60 border border-surface-border rounded-xl px-4 py-2.5 text-sm text-emma-200/80 focus:outline-none focus:border-emma-300/30 transition-colors"
              >
                <option value="">None — use integration default</option>
                {voices.filter((v) => v.category === "cloned" || v.category === "generated")
                  .length > 0 && (
                  <optgroup label="Your voices">
                    {voices
                      .filter((v) => v.category === "cloned" || v.category === "generated")
                      .map((v) => (
                        <option key={v.voiceId} value={v.voiceId}>
                          {v.name}
                        </option>
                      ))}
                  </optgroup>
                )}
                <optgroup label="Premade">
                  {voices
                    .filter((v) => v.category !== "cloned" && v.category !== "generated")
                    .map((v) => (
                      <option key={v.voiceId} value={v.voiceId}>
                        {v.name}
                      </option>
                    ))}
                </optgroup>
              </select>
              <p className="text-[10px] text-emma-200/25">
                Overrides the voice set in Integrations → ElevenLabs for this persona.
              </p>
            </>
          )}
        </div>

        {/* Description */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-emma-200/50 uppercase tracking-widest">
            Additional preferences
          </label>
          <textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value.slice(0, 500))}
            rows={4}
            placeholder="e.g. Always use bullet points for lists. Avoid overly technical language."
            className="w-full bg-emma-950/60 border border-surface-border rounded-xl px-4 py-3 text-sm text-emma-200/80 placeholder:text-emma-200/20 focus:outline-none focus:border-emma-300/30 transition-colors resize-none"
          />
          <p className="text-[10px] text-emma-200/25">{descLen}/500</p>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-4 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 rounded-xl bg-emma-300/10 border border-emma-300/20 text-sm text-emma-300 hover:bg-emma-300/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? "Saving…" : "Save persona"}
        </button>
        {status && (
          <p className={`text-xs ${status.ok ? "text-emma-300/70" : "text-red-400/70"}`}>
            {status.msg}
          </p>
        )}
      </div>
    </div>
  );
}
