"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Check, Zap, ArrowRight } from "lucide-react";

type Step = "auth" | "config" | "starting" | "ready";

export default function TrialPage() {
  const [step, setStep] = useState<Step>("auth");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [useCase, setUseCase] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const source = searchParams.get("source") || "organic";
  const refCode = searchParams.get("ref") || null;
  const affCode = searchParams.get("aff") || null;

  // Check if already logged in
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }: any) => {
      if (data.user) {
        setEmail(data.user.email || "");
        setStep("config");
      }
    });
  }, [supabase]);

  const handleAuth = async () => {
    if (!email.trim() || !supabase) return;
    setLoading(true);
    setError(null);

    try {
      const { error: authErr } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/trial?step=config` },
      });

      if (authErr) {
        setError(authErr.message);
      } else {
        setError(null);
        setStep("config");
      }
    } catch (err) {
      setError(String(err));
    }
    setLoading(false);
  };

  const handleStartTrial = async () => {
    setLoading(true);
    setStep("starting");

    try {
      const res = await fetch("/api/emma/trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          email,
          source,
          referralCode: refCode,
          affiliateCode: affCode,
        }),
      });
      const data = await res.json();

      if (data.trial) {
        setStep("ready");
      } else {
        setError(data.error || "Failed to start trial");
        setStep("config");
      }
    } catch (err) {
      setError(String(err));
      setStep("config");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emma-950 via-emma-900 to-emma-950 flex items-center justify-center font-sans text-emma-100 p-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emma-300 to-emma-400 flex items-center justify-center">
            <span className="font-display text-xl italic text-emma-950">E</span>
          </div>
          <span className="text-lg font-semibold tracking-wider text-emma-300">EMMA</span>
        </div>

        {/* Step 1: Auth */}
        {step === "auth" && (
          <div className="rounded-2xl border border-surface-border bg-surface p-8">
            <h1 className="text-xl font-light text-emma-200/80 mb-1">Start your free trial</h1>
            <p className="text-xs font-light text-emma-200/30 mb-6">14 days · 500 messages · All Starter features · No credit card</p>

            <TrialFeatures />

            <div className="mt-6">
              <label className="text-[11px] text-emma-200/30 block mb-1.5">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAuth()}
                placeholder="you@company.com"
                className="w-full bg-emma-200/3 border border-emma-200/8 rounded-xl px-4 py-3 text-sm text-emma-100 placeholder:text-emma-200/15 outline-none focus:border-emma-300/25"
              />
            </div>

            {error && <p className="text-xs text-red-300/60 mt-2">{error}</p>}

            <button
              onClick={handleAuth}
              disabled={!email.trim() || loading}
              className="w-full mt-4 py-3 rounded-xl bg-gradient-to-r from-emma-300 to-emma-400 text-sm font-medium text-emma-950 cursor-pointer disabled:opacity-30 hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
            >
              {loading ? "Sending link…" : "Continue with email"} <ArrowRight size={14} />
            </button>

            <p className="text-center text-[10px] text-emma-200/15 mt-4">
              We'll send a magic link — no password needed
            </p>
          </div>
        )}

        {/* Step 2: Config */}
        {step === "config" && (
          <div className="rounded-2xl border border-surface-border bg-surface p-8">
            <h1 className="text-xl font-light text-emma-200/80 mb-1">Quick setup</h1>
            <p className="text-xs font-light text-emma-200/30 mb-6">Two questions, then Emma is live</p>

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-[11px] text-emma-200/30 block mb-1.5">What should Emma call you?</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full bg-emma-200/3 border border-emma-200/8 rounded-xl px-4 py-3 text-sm text-emma-100 placeholder:text-emma-200/15 outline-none focus:border-emma-300/25"
                />
              </div>

              <div>
                <label className="text-[11px] text-emma-200/30 block mb-1.5">What will you use Emma for?</label>
                <select
                  value={useCase}
                  onChange={(e) => setUseCase(e.target.value)}
                  className="w-full bg-emma-200/3 border border-emma-200/8 rounded-xl px-4 py-3 text-sm text-emma-100 outline-none focus:border-emma-300/25 appearance-none"
                >
                  <option value="">Select...</option>
                  <option value="customer_support">Customer support / intake</option>
                  <option value="personal_assistant">Personal assistant</option>
                  <option value="clinic">Healthcare / clinic</option>
                  <option value="real_estate">Real estate</option>
                  <option value="ecommerce">E-commerce</option>
                  <option value="other">Something else</option>
                </select>
              </div>
            </div>

            {error && <p className="text-xs text-red-300/60 mt-3">{error}</p>}

            <button
              onClick={handleStartTrial}
              disabled={loading}
              className="w-full mt-6 py-3 rounded-xl bg-gradient-to-r from-emma-300 to-emma-400 text-sm font-medium text-emma-950 cursor-pointer disabled:opacity-30 hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
            >
              <Zap size={14} /> Start my trial
            </button>
          </div>
        )}

        {/* Step 3: Starting */}
        {step === "starting" && (
          <div className="rounded-2xl border border-surface-border bg-surface p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-emma-300/10 flex items-center justify-center mx-auto mb-4 animate-pulse">
              <Zap size={20} className="text-emma-300" />
            </div>
            <h1 className="text-lg font-light text-emma-200/80 mb-2">Setting up your Emma…</h1>
            <p className="text-xs text-emma-200/25">This takes about 5 seconds</p>
          </div>
        )}

        {/* Step 4: Ready */}
        {step === "ready" && (
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/3 p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-400/15 flex items-center justify-center mx-auto mb-4">
              <Check size={20} className="text-emerald-300" />
            </div>
            <h1 className="text-lg font-light text-emma-200/80 mb-2">Emma is ready</h1>
            <p className="text-xs text-emma-200/30 mb-6">14-day trial · 500 messages · All Starter features</p>

            <button
              onClick={() => router.push("/")}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-emma-300 to-emma-400 text-sm font-medium text-emma-950 cursor-pointer hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
            >
              Open Emma <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TrialFeatures() {
  const features = [
    "Voice TTS / STT",
    "Persistent memory",
    "Screen awareness",
    "Emotion detection",
    "Workflow routines",
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {features.map((f) => (
        <span key={f} className="text-[11px] text-emma-300/50 bg-emma-300/6 border border-emma-300/10 rounded-full px-2.5 py-1">
          {f}
        </span>
      ))}
    </div>
  );
}
