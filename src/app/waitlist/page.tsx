"use client";

import { useState, useEffect } from "react";
import { Check, ArrowRight } from "lucide-react";

interface SpotData {
  spotsRemaining: number;
  totalSpots: number;
  waitlistCount: number;
}

type SubmitResult = {
  result: "accepted" | "waitlisted" | "already_active" | "already_waitlisted";
  message: string;
  position?: number;
  spotsRemaining?: number;
} | null;

const INDUSTRIES = [
  { value: "clinic", label: "Clinic / Healthcare" },
  { value: "ecommerce", label: "E-commerce" },
  { value: "real_estate", label: "Real Estate" },
  { value: "education", label: "Education" },
  { value: "legal", label: "Legal" },
  { value: "gaming", label: "Gaming / XR" },
  { value: "other", label: "Other" },
];

export default function WaitlistPage() {
  const [spots, setSpots] = useState<SpotData>({
    spotsRemaining: 10,
    totalSpots: 10,
    waitlistCount: 0,
  });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [industry, setIndustry] = useState("");
  const [message, setMessage] = useState("");
  const [referralSource, setReferralSource] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch live spot counter
  useEffect(() => {
    fetch("/api/waitlist")
      .then((r) => r.json())
      .then((data) =>
        setSpots({
          spotsRemaining: data.spotsRemaining ?? 10,
          totalSpots: data.totalSpots ?? 10,
          waitlistCount: data.waitlistCount ?? 0,
        })
      )
      .catch(() => {});
  }, []);

  const handleSubmit = async () => {
    if (!name.trim() || !email.trim() || !industry || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "join",
          name: name.trim(),
          email: email.trim(),
          industry,
          message: message.trim() || undefined,
          referralSource: referralSource.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
      } else {
        setResult(data);
        if (data.spotsRemaining !== undefined) {
          setSpots((prev) => ({ ...prev, spotsRemaining: data.spotsRemaining }));
        }
      }
    } catch {
      setError("Connection failed — please try again");
    }
    setSubmitting(false);
  };

  const spotsFilled = spots.spotsRemaining <= 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-emma-950 via-emma-900 to-emma-950 font-sans text-emma-100 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-10">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-emma-300 to-emma-400 flex items-center justify-center">
            <span className="font-display text-xl italic text-emma-950">E</span>
          </div>
          <span className="text-lg font-semibold tracking-wider text-emma-300">EMMA</span>
        </div>

        {/* ── Success state ──────────────────────────────────────────── */}
        {result ? (
          <div
            className={`rounded-2xl border p-8 text-center ${
              result.result === "accepted"
                ? "border-emerald-400/20 bg-emerald-400/3"
                : "border-emma-300/15 bg-emma-300/3"
            }`}
          >
            <div
              className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ${
                result.result === "accepted" ? "bg-emerald-400/15" : "bg-emma-300/10"
              }`}
            >
              <Check
                size={24}
                className={result.result === "accepted" ? "text-emerald-300" : "text-emma-300"}
              />
            </div>

            {result.result === "accepted" ? (
              <>
                <h2 className="text-lg font-light text-emma-200/80 mb-2">You're in.</h2>
                <p className="text-sm font-light text-emma-200/40 mb-1">
                  Emma will reach out shortly.
                </p>
                <p className="text-xs text-emma-200/20">Check your inbox for your login link.</p>
              </>
            ) : result.result === "waitlisted" ? (
              <>
                <h2 className="text-lg font-light text-emma-200/80 mb-2">You're on the list.</h2>
                <p className="text-sm font-light text-emma-200/40 mb-1">
                  Position <span className="text-emma-300 font-medium">#{result.position}</span>
                </p>
                <p className="text-xs text-emma-200/20">
                  We'll contact you personally when a spot opens.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-lg font-light text-emma-200/80 mb-2">{result.message}</h2>
              </>
            )}
          </div>
        ) : (
          <>
            {/* ── Spot Counter ──────────────────────────────────────── */}
            <div className="text-center mb-8">
              {spotsFilled ? (
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-400/8 border border-amber-400/15">
                  <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <span className="text-sm font-light text-amber-300/70">
                    All spots filled — join the waitlist
                  </span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full bg-emerald-400/5 border border-emerald-400/15">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-2xl font-light text-emerald-300">
                    {spots.spotsRemaining}
                  </span>
                  <span className="text-sm font-light text-emma-200/30">
                    of {spots.totalSpots} spots remaining
                  </span>
                </div>
              )}
            </div>

            {/* ── Emma greeting ─────────────────────────────────────── */}
            <div className="rounded-2xl border border-surface-border bg-surface p-8">
              <div className="mb-6">
                <p className="text-sm font-light text-emma-200/50 italic mb-3">
                  "Hey! I'm Emma. I'm only taking {spots.totalSpots} people right now — want one of
                  the spots?"
                </p>
                <h1 className="text-xl font-light text-emma-200/80 mb-1">
                  {spots.spotsRemaining === 1
                    ? "1 spot left."
                    : `${spots.spotsRemaining} spots left.`}{" "}
                  No exceptions.
                </h1>
                <p className="text-xs font-light text-emma-200/25 leading-relaxed">
                  Emma is an AI agent that sees, speaks, remembers, and acts — built for one
                  specific problem in your business.
                </p>
              </div>

              {/* ── Form ────────────────────────────────────────────── */}
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-emma-200/25 uppercase tracking-widest block mb-1">
                      Name *
                    </label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                      className="wl-input"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-emma-200/25 uppercase tracking-widest block mb-1">
                      Email *
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="wl-input"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-emma-200/25 uppercase tracking-widest block mb-1">
                    Industry *
                  </label>
                  <select
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    className="wl-input appearance-none"
                  >
                    <option value="">Select your industry…</option>
                    {INDUSTRIES.map((ind) => (
                      <option key={ind.value} value={ind.value}>
                        {ind.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-emma-200/25 uppercase tracking-widest block mb-1">
                    What problem do you want Emma to solve?
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="2–3 sentences about your use case"
                    rows={3}
                    className="wl-input resize-y"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-emma-200/25 uppercase tracking-widest block mb-1">
                    How did you hear about Emma?
                  </label>
                  <input
                    value={referralSource}
                    onChange={(e) => setReferralSource(e.target.value)}
                    placeholder="LinkedIn, friend, podcast…"
                    className="wl-input"
                  />
                </div>

                {error && <p className="text-xs text-red-300/60">{error}</p>}

                <button
                  onClick={handleSubmit}
                  disabled={!name.trim() || !email.trim() || !industry || submitting}
                  className="w-full mt-2 py-3 rounded-xl bg-gradient-to-r from-emma-300 to-emma-400 text-sm font-medium text-emma-950 cursor-pointer disabled:opacity-30 hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                >
                  {submitting ? "Submitting…" : spotsFilled ? "Join the Waitlist" : "Claim My Spot"}
                  <ArrowRight size={14} />
                </button>
              </div>

              {/* ── Pricing note ────────────────────────────────────── */}
              <div className="flex items-center justify-center gap-4 mt-5 pt-4 border-t border-surface-border">
                <span className="text-[10px] text-emma-200/15">Starter $29/mo</span>
                <span className="text-[10px] text-emma-200/20">·</span>
                <span className="text-[10px] text-emma-200/15">Pro $79/mo</span>
                <span className="text-[10px] text-emma-200/20">·</span>
                <span className="text-[10px] text-emma-200/15">Spots are plan-agnostic</span>
              </div>
            </div>
          </>
        )}

        {/* Footer */}
        <p className="text-center text-[10px] text-emma-200/10 mt-6">
          EMMA — Environment-Managing Modular Agent
        </p>
      </div>

      <style jsx>{`
        .wl-input {
          width: 100%;
          background: rgba(232, 160, 191, 0.03);
          border: 1px solid rgba(232, 160, 191, 0.08);
          border-radius: 0.75rem;
          padding: 0.625rem 0.875rem;
          font-size: 0.8125rem;
          font-weight: 300;
          color: #e8dfe6;
          outline: none;
          font-family: "Outfit", sans-serif;
          transition: border-color 0.2s;
        }
        .wl-input:focus {
          border-color: rgba(232, 160, 191, 0.2);
        }
        .wl-input::placeholder {
          color: rgba(232, 160, 191, 0.12);
        }
        select.wl-input {
          color: rgba(232, 160, 191, 0.5);
        }
        select.wl-input option {
          background: #1a1018;
          color: #e8dfe6;
        }
      `}</style>
    </div>
  );
}
