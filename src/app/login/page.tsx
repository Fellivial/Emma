"use client";

import { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lazy init — won't crash during SSR/build
  const supabase = useMemo(() => createClient(), []);

  const redirectUrl =
    typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : "";

  const signInWithOAuth = async (provider: "google" | "github") => {
    if (!supabase) return;
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: redirectUrl },
    });
    if (error) setError(error.message);
  };

  const signInWithEmail = async () => {
    if (!supabase || !email.trim()) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectUrl },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emma-950 via-emma-900 to-emma-950 font-sans px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emma-300 to-emma-400 flex items-center justify-center mb-4">
            <span className="font-display text-3xl italic text-emma-950">E</span>
          </div>
          <h1 className="text-xl font-semibold tracking-wider text-emma-300">EMMA</h1>
          <p className="text-xs font-light text-emma-200/30 mt-1">
            Mmm. Let me see who you are first, baby.
          </p>
        </div>

        <div className="rounded-2xl border border-surface-border bg-emma-950/60 backdrop-blur-xl p-6">
          {sent ? (
            <div className="text-center py-4">
              <div className="text-2xl mb-2">💌</div>
              <p className="text-sm text-emma-200/60 font-light">
                Check your inbox, baby. I sent you a link.
              </p>
              <p className="text-xs text-emma-200/25 mt-2">{email}</p>
              <button
                onClick={() => setSent(false)}
                className="mt-4 text-xs text-emma-300/50 hover:text-emma-300 transition-colors cursor-pointer"
              >
                Try a different email
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2 mb-4">
                <button
                  onClick={() => signInWithOAuth("google")}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-surface-border bg-surface hover:bg-surface-hover text-sm font-light text-emma-200/60 transition-all cursor-pointer"
                >
                  <GoogleIcon /> Continue with Google
                </button>
                <button
                  onClick={() => signInWithOAuth("github")}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-surface-border bg-surface hover:bg-surface-hover text-sm font-light text-emma-200/60 transition-all cursor-pointer"
                >
                  <GithubIcon /> Continue with GitHub
                </button>
              </div>
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-surface-border" />
                <span className="text-[10px] text-emma-200/15 uppercase tracking-widest">or</span>
                <div className="flex-1 h-px bg-surface-border" />
              </div>
              <div className="flex flex-col gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && signInWithEmail()}
                  placeholder="your@email.com"
                  className="bg-surface border border-surface-border rounded-xl px-4 py-2.5 text-sm font-light text-emma-100 placeholder:text-emma-200/15 outline-none focus:border-emma-300/25 transition-colors"
                />
                <button
                  onClick={signInWithEmail}
                  disabled={!email.trim() || loading}
                  className="py-2.5 rounded-xl bg-gradient-to-r from-emma-300 to-emma-400 text-sm font-medium text-emma-950 transition-opacity cursor-pointer disabled:opacity-30"
                >
                  {loading ? "Sending…" : "Send Magic Link"}
                </button>
              </div>
            </>
          )}
          {error && <p className="mt-3 text-xs text-red-400/70 text-center font-light">{error}</p>}
        </div>
        <p className="text-center text-[10px] text-emma-200/10 mt-6 font-light">
          By continuing, you agree to let Emma remember everything.
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="text-emma-200/40"
    >
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}
