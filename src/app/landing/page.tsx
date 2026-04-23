"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ArrowRight, Mic, Eye, Brain, Zap, Heart } from "lucide-react";

export default function LandingPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Extract referral/affiliate codes from URL
  const refCode = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("ref") : null;
  const affCode = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("aff") : null;

  const handleWaitlist = async () => {
    if (!email.trim() || submitting) return;
    setSubmitting(true);
    try {
      await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      // Track referral if code present
      if (refCode) {
        await fetch("/api/emma/referral", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "track", code: refCode, email }),
        }).catch(() => {});
      }

      // Track affiliate if code present
      if (affCode) {
        await fetch("/api/emma/affiliate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "track", affiliateCode: affCode, email }),
        }).catch(() => {});
      }

      setSubmitted(true);
    } catch {}
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emma-950 via-emma-900 to-emma-950 font-sans text-emma-100">
      {/* Nav */}
      <nav className="border-b border-surface-border bg-emma-950/60 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emma-300 to-emma-400 flex items-center justify-center">
              <span className="font-display text-base italic text-emma-950">E</span>
            </div>
            <span className="text-sm font-semibold tracking-wider text-emma-300">EMMA</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="#pillars" className="text-xs text-emma-200/30 hover:text-emma-200/60 transition-colors">Features</a>
            <a href="#pricing" className="text-xs text-emma-200/30 hover:text-emma-200/60 transition-colors">Pricing</a>
            <Link href="/login" className="px-4 py-1.5 rounded-full bg-emma-300/10 border border-emma-300/20 text-xs font-medium text-emma-300 hover:bg-emma-300/15 transition-all">
              Sign In
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-24 pb-20 text-center">
        <div className="inline-block px-3 py-1 rounded-full bg-emma-300/8 border border-emma-300/15 text-[11px] text-emma-300/60 mb-6">
          AI agent that sees, hears, remembers, and acts
        </div>

        <h1 className="text-4xl md:text-5xl font-light text-emma-100 leading-tight mb-4">
          Meet <span className="text-emma-300 font-medium">Emma</span>.<br />
          She manages your entire workspace.
        </h1>

        <p className="text-base font-light text-emma-200/40 max-w-xl mx-auto mb-10 leading-relaxed">
          An autonomous AI agent with voice, vision, personality, and proactive intelligence.
          She doesn't just respond — she anticipates, adapts, and acts.
        </p>

        {/* Waitlist */}
        {submitted ? (
          <div className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-emerald-400/10 border border-emerald-400/20 text-emerald-300 text-sm">
            <Check size={16} /> You're on the list. Emma will remember you.
          </div>
        ) : (
          <div className="flex items-center gap-2 max-w-md mx-auto">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleWaitlist()}
              placeholder="your@email.com"
              className="flex-1 bg-surface border border-surface-border rounded-xl px-4 py-3 text-sm font-light text-emma-100 placeholder:text-emma-200/15 outline-none focus:border-emma-300/25"
            />
            <button
              onClick={handleWaitlist}
              disabled={!email.trim() || submitting}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-emma-300 to-emma-400 text-sm font-medium text-emma-950 cursor-pointer disabled:opacity-30 hover:opacity-90 transition-opacity flex items-center gap-2"
            >
              Join Waitlist <ArrowRight size={14} />
            </button>
          </div>
        )}
      </section>

      {/* Demo Video */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <div className="rounded-2xl border border-surface-border bg-black/30 aspect-video flex items-center justify-center overflow-hidden">
          {/* Replace with actual video embed: <iframe src="..." /> */}
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-emma-300/10 border border-emma-300/20 flex items-center justify-center mx-auto mb-3">
              <div className="w-0 h-0 border-t-8 border-b-8 border-l-12 border-transparent border-l-emma-300 ml-1" />
            </div>
            <p className="text-xs text-emma-200/20">2-minute demo video</p>
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section id="pillars" className="max-w-6xl mx-auto px-6 pb-24">
        <div className="text-center mb-12">
          <h2 className="text-2xl font-light text-emma-200/80 mb-2">5 Pillars of Intelligence</h2>
          <p className="text-sm font-light text-emma-200/25">Each pillar works independently. Together, they create presence.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <PillarCard icon={<Mic size={20} />} title="Voice" desc="She hears you and speaks back. Real-time STT + ElevenLabs TTS with expression-aware tone." color="blue" />
          <PillarCard icon={<Eye size={20} />} title="Vision" desc="She sees your screen. Contextual awareness that lets her help with what you're actually working on." color="emerald" />
          <PillarCard icon={<Brain size={20} />} title="Brain" desc="Workflow orchestration, routine execution, tool coordination. She's the conductor of your workspace." color="amber" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PillarCard icon={<Heart size={20} />} title="Personality" desc="Persistent memory, emotion detection, multi-user profiles. She adapts to who you are over time." color="emma" />
          <PillarCard icon={<Zap size={20} />} title="Proactive" desc="She doesn't wait to be asked. Time-based triggers, autonomy tiers, pattern-aware actions." color="purple" />
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-4xl mx-auto px-6 pb-24">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-light text-emma-200/80 mb-2">Simple Pricing</h2>
          <p className="text-sm font-light text-emma-200/25">7-day free trial on all plans. Cancel anytime.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <PriceCard name="Free" price={0} tokens="300K" features={["Chat with Emma", "Voice TTS / STT (Web Speech)", "10 msgs/day · 50/week", "14-day inactivity expiry"]} />
          <PriceCard name="Starter" price={29} tokens="1M" features={["Everything in Free", "Persistent memory", "Screen & camera vision", "Emotion detection", "Routines & schedules", "40 msgs/day · 200/week", "Web Speech TTS"]} />
          <PriceCard name="Pro" price={79} tokens="2M" popular features={["Everything in Starter", "ElevenLabs TTS (high quality)", "Custom persona config", "API access", "Multi-user profiles", "80 msgs/day · 400/week"]} />
          <PriceCard name="Enterprise" price={-1} tokens="Unlimited" features={["Everything in Pro", "ElevenLabs (dedicated)", "Autonomous agent", "99.9% SLA", "White-label + dedicated support"]} />
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="border-t border-surface-border bg-emma-950/60">
        <div className="max-w-4xl mx-auto px-6 py-16 text-center">
          <h2 className="text-xl font-light text-emma-200/70 mb-2">Ready to meet Emma?</h2>
          <p className="text-sm font-light text-emma-200/25 mb-6">Join the waitlist. She'll remember you were early.</p>
          <Link href="/waitlist" className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-gradient-to-r from-emma-300 to-emma-400 text-sm font-medium text-emma-950 hover:opacity-90 transition-opacity">
            Get Started <ArrowRight size={14} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-surface-border py-6">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-emma-300 to-emma-400 flex items-center justify-center">
              <span className="font-display text-[10px] italic text-emma-950">E</span>
            </div>
            <span className="text-[11px] text-emma-200/20">EMMA — Environment-Managing Modular Agent</span>
          </div>
          <span className="text-[11px] text-emma-200/10">© {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
}

function PillarCard({ icon, title, desc, color }: { icon: React.ReactNode; title: string; desc: string; color: string }) {
  const colorMap: Record<string, string> = {
    blue: "border-blue-400/15 bg-blue-400/3 text-blue-300",
    emerald: "border-emerald-400/15 bg-emerald-400/3 text-emerald-300",
    amber: "border-amber-400/15 bg-amber-400/3 text-amber-300",
    emma: "border-emma-300/15 bg-emma-300/3 text-emma-300",
    purple: "border-purple-400/15 bg-purple-400/3 text-purple-300",
  };
  const cls = colorMap[color] || colorMap.emma;

  return (
    <div className={`rounded-2xl border p-6 ${cls.split(" ").slice(0, 2).join(" ")}`}>
      <div className={`w-10 h-10 rounded-xl bg-current/10 flex items-center justify-center mb-3 ${cls.split(" ")[2]}`}>
        {icon}
      </div>
      <h3 className="text-sm font-medium text-emma-200/70 mb-1">{title}</h3>
      <p className="text-xs font-light text-emma-200/35 leading-relaxed">{desc}</p>
    </div>
  );
}

function PriceCard({ name, price, tokens, features, popular }: {
  name: string; price: number; tokens: string; features: string[]; popular?: boolean;
}) {
  const isEnterprise = price < 0;
  const isFree = price === 0;

  return (
    <div className={`rounded-2xl border p-6 flex flex-col ${
      popular ? "border-emma-300/25 bg-emma-300/5 scale-[1.02]"
        : isEnterprise ? "border-emma-300/15 bg-emma-300/3"
        : "border-surface-border bg-surface"
    }`}>
      {popular && (
        <div className="text-[10px] font-medium text-emma-300 bg-emma-300/10 rounded-full px-3 py-1 self-start mb-3">Popular</div>
      )}
      {isEnterprise && (
        <div className="text-[10px] font-medium text-emma-300 bg-emma-300/10 rounded-full px-3 py-1 self-start mb-3">Enterprise</div>
      )}
      <h3 className="text-base font-medium text-emma-200/70">{name}</h3>
      <div className="flex items-baseline gap-1 mt-1 mb-1">
        {isFree ? (
          <span className="text-2xl font-light text-emma-100">Free</span>
        ) : isEnterprise ? (
          <span className="text-lg font-light text-emma-100">Contact us</span>
        ) : (
          <>
            <span className="text-2xl font-light text-emma-100">${price}</span>
            <span className="text-xs text-emma-200/25">/mo</span>
          </>
        )}
      </div>
      <div className="text-[11px] text-emma-200/20 mb-4">{tokens} tokens/month</div>
      <ul className="flex-1 flex flex-col gap-1.5 mb-5">
        {features.map((f, i) => (
          <li key={i} className="flex items-center gap-2 text-xs font-light text-emma-200/45">
            <Check size={11} className="text-emma-300/40 shrink-0" /> {f}
          </li>
        ))}
      </ul>
      <Link href="/login" className={`block text-center py-2.5 rounded-xl text-sm font-medium transition-all ${
        popular || isEnterprise
          ? "bg-gradient-to-r from-emma-300 to-emma-400 text-emma-950 hover:opacity-90"
          : "bg-surface border border-surface-border text-emma-200/50 hover:bg-surface-hover"
      }`}>
        {isFree ? "Get Started" : isEnterprise ? "Contact Sales" : "Start Free Trial"}
      </Link>
    </div>
  );
}
