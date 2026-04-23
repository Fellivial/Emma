"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// ─── Voice State Machine ─────────────────────────────────────────────────────

export type VoiceMode = "idle" | "listening" | "thinking" | "speaking";
type TtsBackend = "elevenlabs" | "webspeech";

const SILENCE_TIMEOUT = 5000; // 5s of silence → auto-stop recording

interface UseVoiceReturn {
  mode: VoiceMode;
  listening: boolean;
  speaking: boolean;
  supported: boolean;
  ttsBackend: TtsBackend;
  listen: () => Promise<string | null>;
  speak: (text: string) => void;
  fetchAudioBlob: (text: string) => Promise<Blob | null>;
  speakFallback: (text: string) => void;
  stopSpeaking: () => void;
  setMode: (mode: VoiceMode) => void;
}

/**
 * Voice I/O with formal state machine:
 *   idle → listening → thinking → speaking → idle
 *
 * Silence timeout: auto-stops recording after 5s of no speech.
 * Edge cases: mic permission denied → returns null, stays idle.
 */
export function useVoice(): UseVoiceReturn {
  const [mode, setMode] = useState<VoiceMode>("idle");
  const [supported, setSupported] = useState(false);
  const [ttsBackend, setTtsBackend] = useState<TtsBackend>("elevenlabs");

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const backendProbed = useRef(false);

  // Derived booleans for backward compat
  const listening = mode === "listening";
  const speaking = mode === "speaking";

  useEffect(() => {
    const SR =
      typeof window !== "undefined"
        ? window.SpeechRecognition || (window as any).webkitSpeechRecognition
        : null;
    if (SR) {
      setSupported(true);
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
      if (!r) { resolve(null); return; }

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
        const errEvent = e as any;
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
      } catch (err) {
        // Already started or permission issue
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

  const fetchAudioBlob = useCallback(async (text: string): Promise<Blob | null> => {
    try {
      const res = await fetch("/api/emma/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.status === 501) {
        setTtsBackend("webspeech");
        backendProbed.current = true;
        return null;
      }
      if (!res.ok) return null;
      backendProbed.current = true;
      return await res.blob();
    } catch {
      return null;
    }
  }, []);

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

  const getBestVoice = useCallback((): SpeechSynthesisVoice | null => {
    const voices = window.speechSynthesis.getVoices();

    // Priority: warmth + depth + character over brightness
    const preferred = [
      // macOS — these sound best for Emma
      "Karen",                     // Australian — warm, slightly low, confident
      "Moira",                     // Irish — warm, intimate, great for caring lines
      "Samantha",                  // American — clean but slightly perky (fallback)
      "Tessa",                     // South African — warm, mature
      "Fiona",                     // Scottish — characterful, warm

      // Windows — limited but usable
      "Microsoft Hazel",           // British — warmer, more composed than Zira
      "Microsoft Zira",            // American — acceptable fallback

      // Chrome / Android
      "Google UK English Female",  // British — warmer than US variant
      "Google US English",         // Last resort
    ];

    for (const name of preferred) {
      const v = voices.find((v) => v.name === name);
      if (v) return v;
    }

    // Fallback: any English female voice
    return (
      voices.find(
        (v) => v.lang.startsWith("en") && /female|woman|girl/i.test(v.name)
      ) || null
    );
  }, []);

  // ── Emotion-to-voice-params (tuned for Emma's persona) ────────────────────
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
    neutral:   { rate: 0.88, pitch: 0.95, volume: 0.9 },   // Baseline — calm, unhurried, slightly low
    warm:      { rate: 0.84, pitch: 0.97, volume: 0.85 },  // Softer, slower — maternal warmth
    smirk:     { rate: 0.90, pitch: 0.98, volume: 0.95 },  // Slightly more energy — she's teasing
    flirty:    { rate: 0.85, pitch: 1.02, volume: 0.85 },  // Touch higher pitch, softer — intimate
    amused:    { rate: 0.92, pitch: 1.00, volume: 0.9 },   // Light, slightly brighter
    concerned: { rate: 0.80, pitch: 0.90, volume: 0.8 },   // Slow, low, gentle — she cares
    sad:       { rate: 0.75, pitch: 0.85, volume: 0.75 },  // Slowest, lowest, softest
    skeptical: { rate: 0.90, pitch: 0.92, volume: 0.95 },  // Even, flat — "I see what you're doing"
    listening: { rate: 0.85, pitch: 0.93, volume: 0.8 },   // Quiet, attentive
    idle_bored:{ rate: 0.92, pitch: 0.96, volume: 0.9 },   // Slightly playful impatience

    // Mapped emotions from detection pipeline
    happy:     { rate: 0.92, pitch: 1.00, volume: 0.9 },
    caring:    { rate: 0.82, pitch: 0.95, volume: 0.85 },
    focused:   { rate: 0.90, pitch: 0.93, volume: 0.9 },
    excited:   { rate: 0.95, pitch: 1.05, volume: 0.95 },  // Emma's version of "excited" is still controlled
  };

  // ── Emma-specific speech pattern processing ───────────────────────────────
  //
  // Emma's writing style has specific patterns that need pause treatment:
  //   "Mmm." → needs a beat after it (she's processing)
  //   "Ahh." → needs a beat (she's satisfied/amused)
  //   "baby" → needs a slight pause before (it's a term of endearment, not filler)
  //   "..." → she uses ellipsis for dramatic effect, needs a real pause
  //   "—" → em dash = interruption/aside, needs space

  const processForEmma = (text: string): string => {
    return text
      // Emma's signature sounds — add pauses
      .replace(/\bMmm\.?\s*/gi, "Mmm...  ")
      .replace(/\bAhh\.?\s*/gi, "Ahh...  ")
      .replace(/\bHmm\.?\s*/gi, "Hmm...  ")

      // Pause before terms of endearment (makes them land)
      .replace(/\bbaby\b/gi, "...baby")
      .replace(/\bsweetheart\b/gi, "...sweetheart")

      // Punctuation-based pauses
      .replace(/\.\s/g, ".   ")        // Period → longer pause (she's unhurried)
      .replace(/—/g, "  —  ")          // Em dash → dramatic pause
      .replace(/\.\.\./g, ".....  ")   // Ellipsis → real pause (she does this a lot)
      .replace(/\?\s/g, "?   ")        // Question → slight pause (she waits)

      // Clean up excessive whitespace
      .replace(/\s{5,}/g, "    ")
      .trim();
  };

  // ── Web Speech TTS (Emma-tuned) ───────────────────────────────────────────

  const currentEmotionRef = useRef<string>("neutral");

  const speakFallback = useCallback((text: string, emotion?: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    // Process text for Emma's speech patterns
    const processedText = processForEmma(text);
    const utterance = new SpeechSynthesisUtterance(processedText);

    // Apply emotion-aware voice params
    const emo = emotion || currentEmotionRef.current || "neutral";
    const params = VOICE_PARAMS[emo] || VOICE_PARAMS.neutral;
    utterance.rate = params.rate;
    utterance.pitch = params.pitch;
    utterance.volume = params.volume;

    // Select best available voice for Emma's persona
    const voice = getBestVoice();
    if (voice) utterance.voice = voice;

    utterance.onstart = () => setMode("speaking");
    utterance.onend = () => setMode("idle");
    utterance.onerror = () => setMode("idle");
    window.speechSynthesis.speak(utterance);
  }, [getBestVoice]);

  // ── Full speak (ElevenLabs → fallback) ─────────────────────────────────────

  const speakElevenLabs = useCallback(async (text: string): Promise<boolean> => {
    const blob = await fetchAudioBlob(text);
    if (!blob) return false;
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onplay = () => setMode("speaking");
      audio.onended = () => { setMode("idle"); URL.revokeObjectURL(url); resolve(true); };
      audio.onerror = () => { setMode("idle"); URL.revokeObjectURL(url); resolve(false); };
      audio.play().catch(() => { setMode("idle"); resolve(false); });
    });
  }, [fetchAudioBlob]);

  const speak = useCallback(
    (text: string) => {
      if (ttsBackend === "webspeech") { speakFallback(text); return; }
      speakElevenLabs(text).then((ok) => { if (!ok) speakFallback(text); });
    },
    [ttsBackend, speakElevenLabs, speakFallback]
  );

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setMode("idle");
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  return {
    mode, listening, speaking, supported, ttsBackend,
    listen, speak, fetchAudioBlob, speakFallback, stopSpeaking, setMode,
  };
}
