"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// ─── Voice State Machine ─────────────────────────────────────────────────────

export type VoiceMode = "idle" | "listening" | "thinking" | "speaking";

const SILENCE_TIMEOUT = 5000; // 5s of silence → auto-stop recording

interface UseVoiceReturn {
  mode: VoiceMode;
  listening: boolean;
  speaking: boolean;
  supported: boolean;
  listen: () => Promise<string | null>;
  speak: (text: string, clientId?: string, emotion?: string) => void;
  fetchAudioBlob: (text: string, clientId?: string) => Promise<Blob | null>;
  speakFallback: (text: string, emotion?: string) => void;
  stopSpeaking: () => void;
  setMode: (mode: VoiceMode) => void;
  setCurrentEmotion: (emotion: string) => void;
}

/**
 * Voice I/O with formal state machine:
 *   idle → listening → thinking → speaking → idle
 *
 * Silence timeout: auto-stops recording after 5s of no speech.
 * Edge cases: mic permission denied → returns null, stays idle.
 */

// ── Emotion-to-voice-params (tuned for Emma's persona) ───────────────────────
//
// Baseline philosophy:
//   - Emma is SLOW. She doesn't rush. Rate should rarely exceed 1.0.
//   - Emma is LOW. Not deep — just lower than "helpful assistant" pitch.
//   - Pitch 1.0 = normal. Emma's neutral sits at 0.95 (slightly low = confident).
//   - Rate 0.88 = unhurried. She takes her time. That's the persona.
//
// The gap between Web Speech and ElevenLabs is INTENTIONAL.
// These params make Web Speech as good as possible — but the ceiling
// is the upgrade incentive for Pro.
const VOICE_PARAMS: Record<string, { rate: number; pitch: number; volume: number }> = {
  // Emma's core tones
  neutral: { rate: 0.88, pitch: 0.95, volume: 0.9 }, // Baseline — calm, unhurried, slightly low
  warm: { rate: 0.84, pitch: 0.97, volume: 0.85 }, // Softer, slower — maternal warmth
  smirk: { rate: 0.9, pitch: 0.98, volume: 0.95 }, // Slightly more energy — she's teasing
  flirty: { rate: 0.85, pitch: 1.02, volume: 0.85 }, // Touch higher pitch, softer — intimate
  amused: { rate: 0.92, pitch: 1.0, volume: 0.9 }, // Light, slightly brighter
  concerned: { rate: 0.8, pitch: 0.9, volume: 0.8 }, // Slow, low, gentle — she cares
  sad: { rate: 0.75, pitch: 0.85, volume: 0.75 }, // Slowest, lowest, softest
  skeptical: { rate: 0.9, pitch: 0.92, volume: 0.95 }, // Even, flat — "I see what you're doing"
  listening: { rate: 0.85, pitch: 0.93, volume: 0.8 }, // Quiet, attentive
  idle_bored: { rate: 0.92, pitch: 0.96, volume: 0.9 }, // Slightly playful impatience

  // Mapped emotions from detection pipeline
  happy: { rate: 0.92, pitch: 1.0, volume: 0.9 },
  caring: { rate: 0.82, pitch: 0.95, volume: 0.85 },
  focused: { rate: 0.9, pitch: 0.93, volume: 0.9 },
  excited: { rate: 0.95, pitch: 1.05, volume: 0.95 }, // Emma's version of "excited" is still controlled
};

// ── Emma-specific speech pattern processing ───────────────────────────────────
//
// Emma's writing style has specific patterns that need pause treatment:
//   "Mmm." → needs a beat after it (she's processing)
//   "Ahh." → needs a beat (she's satisfied/amused)
//   "baby" → needs a slight pause before (it's a term of endearment, not filler)
//   "..." → she uses ellipsis for dramatic effect, needs a real pause
//   "—" → em dash = interruption/aside, needs space
function processForEmma(text: string): string {
  return (
    text
      // Emma's signature sounds — ellipsis creates a real TTS pause
      .replace(/\bMmm\.?\s*/gi, "Mmm... ")
      .replace(/\bAhh\.?\s*/gi, "Ahh... ")
      .replace(/\bHmm\.?\s*/gi, "Hmm... ")

      // Comma before terms of endearment — WebSpeech pauses on commas, not spaces
      .replace(/\bbaby\b/gi, ", baby")
      .replace(/\bsweetheart\b/gi, ", sweetheart")

      // Em dash → comma pause (WebSpeech doesn't pause on em dash)
      .replace(/—/g, ", ")

      // Trim trailing whitespace only — sentence splits handle inter-sentence pacing
      .trim()
  );
}

export function useVoice(): UseVoiceReturn {
  const [mode, setMode] = useState<VoiceMode>("idle");
  const [supported] = useState(() => {
    if (typeof window === "undefined") return false;
    const w = window as Window & { webkitSpeechRecognition?: unknown };
    return !!(window.SpeechRecognition || w.webkitSpeechRecognition);
  });

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pauseTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Derived booleans for backward compat
  const listening = mode === "listening";
  const speaking = mode === "speaking";

  useEffect(() => {
    const w =
      typeof window !== "undefined"
        ? (window as Window & { webkitSpeechRecognition?: new () => SpeechRecognition })
        : null;
    const SR = w ? w.SpeechRecognition || w.webkitSpeechRecognition : null;
    if (SR) {
      const r = new SR();
      r.continuous = false;
      r.interimResults = false;
      r.lang = "en-US";
      recognitionRef.current = r;
    }
  }, []);

  // ── STT with silence timeout ───────────────────────────────────────────────

  const listen = useCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
      const r = recognitionRef.current;
      if (!r) {
        resolve(null);
        return;
      }

      // Clear any previous silence timer
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }

      r.onresult = (e: SpeechRecognitionEvent) => {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        setMode("thinking");
        resolve(e.results[0][0].transcript);
      };

      r.onerror = (e: Event) => {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        setMode("idle");

        // Check for specific error types
        const errEvent = e as SpeechRecognitionErrorEvent;
        if (errEvent.error === "not-allowed") {
          console.warn("[EMMA Voice] Microphone permission denied");
        } else if (errEvent.error === "no-speech") {
          console.warn("[EMMA Voice] No speech detected (silence timeout)");
        }

        resolve(null);
      };

      r.onend = () => {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        // Only reset to idle if we haven't transitioned to thinking
        setMode((prev) => (prev === "listening" ? "idle" : prev));
      };

      setMode("listening");

      try {
        r.start();
      } catch {
        setMode("idle");
        resolve(null);
        return;
      }

      // Silence timeout: auto-stop if no speech after 5s
      silenceTimerRef.current = setTimeout(() => {
        try {
          r.stop();
        } catch {}
        setMode("idle");
        resolve(null);
      }, SILENCE_TIMEOUT);
    });
  }, []);

  // ── Fetch ElevenLabs audio blob (for avatar lip sync) ──────────────────────

  const fetchAudioBlob = useCallback(
    async (text: string, clientId?: string): Promise<Blob | null> => {
      try {
        const res = await fetch("/api/emma/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, clientId }),
        });
        if (res.status === 501) {
          return null;
        }
        if (!res.ok) return null;
        return await res.blob();
      } catch {
        return null;
      }
    },
    []
  );

  // ── Web Speech TTS (fallback) ──────────────────────────────────────────────

  // ── Web Speech voice selection (tuned for Emma's persona) ──────────────────
  //
  // Emma = warm, confident, slightly breathy, unhurried, low-moderate pitch.
  // NOT: perky, chipper, high-pitched, robotic, news-anchor.
  //
  // Voice priority ordered by how well they match "Flirty Teasing Mommy":
  //   - Deeper, warmer voices ranked higher
  //   - Samantha (macOS) is pleasant but too "helpful assistant"
  //   - Karen/Moira have more character and warmth
  //   - On Windows, Hazel (British) > Zira (American) for this persona

  // Chrome populates voices asynchronously — cache after voiceschanged fires.
  const cachedVoicesRef = useRef<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const load = () => {
      cachedVoicesRef.current = window.speechSynthesis.getVoices();
    };
    load(); // populate synchronously when already available (Firefox/Safari)
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  const getBestVoice = useCallback((): SpeechSynthesisVoice | null => {
    const voices =
      cachedVoicesRef.current.length > 0
        ? cachedVoicesRef.current
        : window.speechSynthesis.getVoices();

    // Priority: warmth + depth + character over brightness
    const preferred = [
      // macOS — these sound best for Emma
      "Karen", // Australian — warm, slightly low, confident
      "Moira", // Irish — warm, intimate, great for caring lines
      "Samantha", // American — clean but slightly perky (fallback)
      "Tessa", // South African — warm, mature
      "Fiona", // Scottish — characterful, warm

      // Windows 11 / Edge Natural voices (much better than legacy)
      "Microsoft Aria", // Natural female, conversational, warm — best on Win11
      "Microsoft Jenny", // Natural female, clear, friendly
      "Microsoft Michelle", // Natural female, confident

      // Windows legacy — limited but usable
      "Microsoft Hazel", // British — warmer, more composed than Zira
      "Microsoft Zira", // American — acceptable fallback

      // Chrome / Android
      "Google UK English Female", // British — warmer than US variant
      "Google US English", // Last resort
    ];

    for (const name of preferred) {
      // substring match so "Microsoft Aria Online (Natural)" also hits "Microsoft Aria"
      const v = voices.find((v) => v.name.startsWith(name));
      if (v) return v;
    }

    // Fallback 1: any English female voice
    const femaleEn = voices.find(
      (v) => v.lang.startsWith("en") && /female|woman|girl/i.test(v.name)
    );
    if (femaleEn) return femaleEn;

    // Fallback 2: any English voice (guarantees correct language on Windows)
    return voices.find((v) => v.lang.startsWith("en")) || null;
  }, []);

  // ── Web Speech TTS (Emma-tuned) ───────────────────────────────────────────

  const currentEmotionRef = useRef<string>("neutral");

  const speakFallback = useCallback(
    (text: string, emotion?: string) => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      if (pauseTimerRef.current) {
        clearTimeout(pauseTimerRef.current);
        pauseTimerRef.current = null;
      }

      const processedText = processForEmma(text);

      // Split into sentences — single-utterance delivery sounds robotic.
      // Each sentence gets its own utterance with a 250ms breath between them.
      const sentences = processedText.match(/[^.!?]+[.!?…]+\s*/g) || [processedText];

      const emo = emotion || currentEmotionRef.current || "neutral";
      const params = VOICE_PARAMS[emo] || VOICE_PARAMS.neutral;
      const voice = getBestVoice();

      let idx = 0;

      const speakNext = () => {
        if (idx >= sentences.length) {
          setMode("idle");
          return;
        }
        const trimmed = sentences[idx].trim();
        idx++;
        if (!trimmed) {
          speakNext();
          return;
        }

        const utterance = new SpeechSynthesisUtterance(trimmed);
        utterance.rate = params.rate;
        utterance.pitch = params.pitch;
        utterance.volume = params.volume;
        if (voice) utterance.voice = voice;

        utterance.onstart = () => setMode("speaking");
        utterance.onend = () => {
          pauseTimerRef.current = setTimeout(speakNext, 250);
        };
        utterance.onerror = () => setMode("idle");

        window.speechSynthesis.speak(utterance);
      };

      speakNext();
    },
    [getBestVoice]
  );

  // ── Full speak (ElevenLabs → fallback) ─────────────────────────────────────

  const speakElevenLabs = useCallback(
    async (text: string, clientId?: string): Promise<boolean> => {
      const blob = await fetchAudioBlob(text, clientId);
      if (!blob) return false;
      return new Promise((resolve) => {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onplay = () => setMode("speaking");
        audio.onended = () => {
          setMode("idle");
          URL.revokeObjectURL(url);
          resolve(true);
        };
        audio.onerror = () => {
          setMode("idle");
          URL.revokeObjectURL(url);
          resolve(false);
        };
        audio.play().catch(() => {
          setMode("idle");
          resolve(false);
        });
      });
    },
    [fetchAudioBlob]
  );

  const speak = useCallback(
    (text: string, clientId?: string, emotion?: string) => {
      // Always try ElevenLabs if clientId provided — server 501s if no key configured
      if (clientId) {
        speakElevenLabs(text, clientId).then((ok) => {
          if (!ok) speakFallback(text, emotion);
        });
        return;
      }
      speakFallback(text, emotion);
    },
    [speakElevenLabs, speakFallback]
  );

  const setCurrentEmotion = useCallback((emotion: string) => {
    currentEmotionRef.current = emotion;
  }, []);

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
    setMode("idle");
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    };
  }, []);

  return {
    mode,
    listening,
    speaking,
    supported,
    listen,
    speak,
    fetchAudioBlob,
    speakFallback,
    stopSpeaking,
    setMode,
    setCurrentEmotion,
  };
}
