"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Save, ArrowLeft, BarChart3, CreditCard, Zap, Gift } from "lucide-react";
import Link from "next/link";

interface Config {
  name: string;
  personaName: string;
  personaPrompt: string;
  personaGreeting: string;
  voiceId: string;
  tokenBudgetMonthly: number;
  messageLimitDaily: number;
}

interface Usage {
  dailyMessages: number;
  dailyTokens: number;
  monthlyTokens: number;
  monthlyCost: number;
}

export default function SettingsPage() {
  const [config, setConfig] = useState<Config>({
    name: "My Emma",
    personaName: "Emma",
    personaPrompt: "",
    personaGreeting: "",
    voiceId: "",
    tokenBudgetMonthly: 500000,
    messageLimitDaily: 50,
  });
  const [usage, setUsage] = useState<Usage>({ dailyMessages: 0, dailyTokens: 0, monthlyTokens: 0, monthlyCost: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
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
          });
        }
        if (data.usage) setUsage(data.usage);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/emma/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) setSaved(true);
    } catch {}
    setSaving(false);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emma-950 via-emma-900 to-emma-950">
        <div className="text-emma-200/20 text-sm">Loading settings…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emma-950 via-emma-900 to-emma-950 font-sans text-emma-100">
      {/* Header */}
      <div className="border-b border-surface-border bg-emma-950/80 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-emma-200/30 hover:text-emma-300 transition-colors">
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1 className="text-sm font-semibold text-emma-300 tracking-wider">Settings</h1>
              <p className="text-[10px] text-emma-200/25">Configure your Emma instance</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/settings/usage" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-emma-200/40 border border-surface-border hover:bg-surface transition-all">
              <BarChart3 size={12} /> Usage
            </Link>
            <Link href="/settings/tasks" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-emma-200/40 border border-surface-border hover:bg-surface transition-all">
              <Zap size={12} /> Tasks
            </Link>
            <Link href="/settings/billing" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-emma-200/40 border border-surface-border hover:bg-surface transition-all">
              <CreditCard size={12} /> Billing
            </Link>
            <Link href="/refer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-emma-200/40 border border-surface-border hover:bg-surface transition-all">
              <Gift size={12} /> Refer
            </Link>
            <button onClick={handleLogout} className="px-3 py-1.5 rounded-lg text-[11px] text-red-300/40 border border-red-400/10 hover:bg-red-400/5 transition-all cursor-pointer">
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Quick usage bar */}
        <div className="rounded-xl border border-surface-border bg-surface p-4 mb-6 grid grid-cols-4 gap-4">
          <Stat label="Today" value={`${usage.dailyMessages} msgs`} sub={`/ ${config.messageLimitDaily}`} />
          <Stat label="Today Tokens" value={formatTokens(usage.dailyTokens)} />
          <Stat label="This Month" value={formatTokens(usage.monthlyTokens)} sub={`/ ${formatTokens(config.tokenBudgetMonthly)}`} />
          <Stat label="Est. Cost" value={`$${usage.monthlyCost}`} sub="this month" />
        </div>

        {/* Persona Settings */}
        <Section title="Persona">
          <Field label="Instance Name" sub="What clients see as the app name">
            <input value={config.name} onChange={(e) => setConfig({ ...config, name: e.target.value })}
              className="settings-input" placeholder="My Emma" />
          </Field>
          <Field label="Persona Name" sub="What she calls herself">
            <input value={config.personaName} onChange={(e) => setConfig({ ...config, personaName: e.target.value })}
              className="settings-input" placeholder="Emma" />
          </Field>
          <Field label="Persona Description" sub="Custom personality prompt (leave empty for default Mommy)">
            <textarea value={config.personaPrompt} onChange={(e) => setConfig({ ...config, personaPrompt: e.target.value })}
              className="settings-input min-h-[120px] resize-y" placeholder="You are Emma, a warm and attentive AI assistant…" />
          </Field>
          <Field label="Greeting Message" sub="First message when a new session starts (leave empty for auto-generated)">
            <textarea value={config.personaGreeting} onChange={(e) => setConfig({ ...config, personaGreeting: e.target.value })}
              className="settings-input min-h-[80px] resize-y" placeholder="Hey! I'm Emma. What can I help you with?" />
          </Field>
        </Section>

        {/* Voice */}
        <Section title="Voice">
          <Field label="ElevenLabs Voice ID" sub="Override the default voice (leave empty for Rachel)">
            <input value={config.voiceId} onChange={(e) => setConfig({ ...config, voiceId: e.target.value })}
              className="settings-input font-mono text-xs" placeholder="21m00Tcm4TlvDq8ikWAM" />
          </Field>
        </Section>

        {/* Save */}
        <div className="flex items-center gap-3 mt-8">
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emma-300 to-emma-400 text-sm font-medium text-emma-950 cursor-pointer disabled:opacity-50 transition-opacity">
            <Save size={14} /> {saving ? "Saving…" : "Save Changes"}
          </button>
          {saved && <span className="text-xs text-emerald-400/60">✓ Saved — changes apply on next session</span>}
        </div>
      </div>

      <style jsx>{`
        .settings-input {
          width: 100%;
          background: rgba(232,160,191,0.04);
          border: 1px solid rgba(232,160,191,0.1);
          border-radius: 0.75rem;
          padding: 0.625rem 1rem;
          font-size: 0.875rem;
          font-weight: 300;
          color: #e8dfe6;
          outline: none;
          font-family: 'Outfit', sans-serif;
          transition: border-color 0.2s;
        }
        .settings-input:focus { border-color: rgba(232,160,191,0.25); }
        .settings-input::placeholder { color: rgba(232,160,191,0.15); }
      `}</style>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-xs font-medium text-emma-200/30 uppercase tracking-widest mb-4">{title}</h2>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

function Field({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-light text-emma-200/60 mb-1">{label}</label>
      {sub && <p className="text-[11px] text-emma-200/20 mb-2">{sub}</p>}
      {children}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-[10px] text-emma-200/25 uppercase tracking-wider">{label}</div>
      <div className="text-lg font-light text-emma-200/70 mt-0.5">{value}</div>
      {sub && <div className="text-[10px] text-emma-200/15">{sub}</div>}
    </div>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}
