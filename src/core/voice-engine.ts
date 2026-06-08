"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// ─── Voice State Machine ─────────────────────────────────────────────────────

export type VoiceMode = "idle" | "listening" | "thinking" | "speaking";

const SILENCE_TIMEOUT = 5000; // 5s of silence → auto-stop recording

export type VoiceError = "not-allowed" | "no-speech" | "hardware" | "service-not-allowed" | null;

interface UseVoiceReturn {
  mode: VoiceMode;
  listening: boolean;
  speaking: boolean;
  supported: boolean;
  error: VoiceError;
  listen: () => Promise<string | null>;
  stopListening: () => void;
  speak: (text: string, clientId?: string, emotion?: string) => void;
  fetchAudioBlob: (text: string, clientId?: string, expression?: string) => Promise<Blob | null>;
  speakFallback: (
    text: string,
    emotion?: string,
    onTalkStart?: () => void,
    onTalkEnd?: () => void
  ) => void;
  stopSpeaking: () => void;
  setMode: (mode: VoiceMode) => void;
  setCurrentEmotion: (emotion: string) => void;
  clearError: () => void;
}

/**
 * Voice I/O with formal state machine:
 *   idle → listening → thinking → speaking → idle
 *
 * Silence timeout: auto-stops recording after 5s of no speech.
 * Edge cases: mic permission denied → returns null, stays idle.
 */

// ── Emotion-to-voice-params (tuned for WebSpeech) ────────────────────────────
//
// WebSpeech's prosody engine degrades below ~0.92 rate — it stretches phonemes
// instead of adding natural pauses, which is what causes the "stiff" sound.
// Keep rates at 0.92–1.0 and let the Neural voice handle the unhurried feel.
//
// Pitch: 1.0 = the voice's natural baseline. For "warm intimate mommy" the pitch
// must stay at or BELOW 1.0 across all emotions — pitches above 1.0 push the
// voice into bright/chipper territory ("perky assistant"), not warm-mommy.
// Per-chunk teasing variation is handled in getChunkConfig, not here.
const VOICE_PARAMS: Record<string, { rate: number; pitch: number; volume: number }> = {
  // Emma's core tones
  neutral: { rate: 0.95, pitch: 0.97, volume: 0.9 },
  warm: { rate: 0.91, pitch: 0.95, volume: 0.85 },
  smirk: { rate: 0.97, pitch: 0.99, volume: 0.95 },
  flirty: { rate: 0.92, pitch: 0.98, volume: 0.85 },
  amused: { rate: 0.96, pitch: 0.99, volume: 0.9 },
  concerned: { rate: 0.9, pitch: 0.95, volume: 0.8 },
  sad: { rate: 0.88, pitch: 0.93, volume: 0.75 },
  skeptical: { rate: 0.95, pitch: 0.96, volume: 0.9 },
  listening: { rate: 0.92, pitch: 0.96, volume: 0.8 },
  idle_bored: { rate: 0.97, pitch: 0.98, volume: 0.9 },

  // Mapped emotions from detection pipeline
  happy: { rate: 0.96, pitch: 0.99, volume: 0.9 },
  caring: { rate: 0.91, pitch: 0.95, volume: 0.85 },
  focused: { rate: 0.95, pitch: 0.96, volume: 0.9 },
  excited: { rate: 0.99, pitch: 1.02, volume: 0.95 },
};

// ── Emma-specific speech pattern processing ───────────────────────────────────
//
// Filler sounds get a period so the sentence splitter isolates them as their
// own utterances — isFiller() then detects them for intimate whisper params.
// Ellipsis becomes a period so chunk grouping handles the pause naturally.
function processForEmma(text: string): string {
  return (
    text
      // Filler sounds: normalise any trailing punctuation to a period so the
      // sentence regex isolates "Mmm." / "Ahh." / "Hmm." as their own chunk.
      .replace(/\b(Mmm|Ahh|Hmm)[.,]?\s*/gi, "$1. ")

      // Comma before terms of endearment
      .replace(/\bbaby\b/gi, ", baby")
      .replace(/\bsweetheart\b/gi, ", sweetheart")

      // Em dash → comma pause
      .replace(/—/g, ", ")

      // Ellipsis → period
      .replace(/\.{3}/g, ".")
      .replace(/…/g, ".")

      .trim()
  );
}

// ── Filler detection ──────────────────────────────────────────────────────────

function isFiller(text: string): boolean {
  return /^(Mmm|Ahh|Hmm)[.,]?\s*$/i.test(text.trim());
}

// ── Per-chunk prosody adaptation ──────────────────────────────────────────────
//
// WebSpeech can't vary prosody mid-utterance, but every chunk is its own
// utterance — so each chunk can have a different rate/pitch/volume/gap.
// This creates the tonal range the mommy persona needs:
//   "Mmm."          → intimate whisper, long breath after
//   "Did you now?"  → playful pitch lift, short gap
//   "…baby."        → softer landing, medium breath
//   everything else → base emotion params, 80 ms gap

type VoiceParams = { rate: number; pitch: number; volume: number };

function getChunkConfig(chunk: string, base: VoiceParams): VoiceParams & { gapMs: number } {
  const t = chunk.trim();

  if (isFiller(t)) {
    return {
      rate: Math.max(0.82, base.rate * 0.9),
      pitch: base.pitch * 0.97,
      volume: base.volume * 0.8,
      gapMs: 150, // long breath — she's savoring the moment
    };
  }

  // Short teasing question — playful upward lilt, capped so it doesn't go bright
  if (t.endsWith("?") && t.length < 55) {
    return {
      rate: Math.min(1.03, base.rate * 1.04),
      pitch: Math.min(1.02, base.pitch * 1.04),
      volume: base.volume,
      gapMs: 55,
    };
  }

  // Endearment term — softer landing, slight slow-down
  if (/\b(baby|sweetheart)\b/i.test(t)) {
    return {
      rate: base.rate * 0.96,
      pitch: base.pitch,
      volume: base.volume * 0.9,
      gapMs: 100,
    };
  }

  // Short punchy statement (< 40 chars) — teasing energy without question
  if (t.length < 40) {
    return {
      rate: Math.min(1.02, base.rate * 1.01),
      pitch: base.pitch,
      volume: base.volume,
      gapMs: 65,
    };
  }

  return { ...base, gapMs: 80 };
}

// Pick the best audio MIME type supported by this browser's MediaRecorder.
function getSupportedMimeType(): string {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  return (
    types.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ??
    ""
  );
}

export function useVoice(): UseVoiceReturn {
  const [mode, setMode] = useState<VoiceMode>("idle");
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState<VoiceError>(null);

  // true → listen() should use the MediaRecorder → /api/emma/stt path instead of Web Speech
  const usesServerSttRef = useRef(false);
  // false after the server responds 403 (Free plan) or 501 (no key); disables server path for session
  const serverSttAvailableRef = useRef(true);

  useEffect(() => {
    const w = window as Window & { webkitSpeechRecognition?: unknown };
    const hasSR = !!(window.SpeechRecognition || w.webkitSpeechRecognition);
    const isFirefox = /firefox/i.test(navigator.userAgent);
    const webSpeechOk = hasSR && !isFirefox;

    // MediaRecorder-based server STT is available in all modern browsers including Firefox.
    const hasMR =
      typeof MediaRecorder !== "undefined" && typeof navigator.mediaDevices !== "undefined";

    // localStorage flag: set when service-not-allowed fires, cleared if user upgrades/re-enables.
    const snaFlag =
      typeof localStorage !== "undefined" && localStorage.getItem("emma_voice_sna") === "1";

    const serverSttPathOk = hasMR && serverSttAvailableRef.current;

    setSupported(webSpeechOk || serverSttPathOk);
    usesServerSttRef.current = (!webSpeechOk || snaFlag) && serverSttPathOk;
  }, []);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pauseTimerRef = useRef<NodeJS.Timeout | null>(null);
  // MediaRecorder refs for the server STT path
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  // After a 501 (ElevenLabs not configured), skip all future TTS requests this session.
  const elevenLabsUnavailableRef = useRef(false);

  // Derived booleans for backward compat
  const listening = mode === "listening";
  const speaking = mode === "speaking";

  useEffect(() => {
    const isFirefox = /firefox/i.test(navigator.userAgent);
    if (isFirefox) return;
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

  // ── Server-side STT via MediaRecorder → /api/emma/stt ────────────────────────

  const listenViaServer = useCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
      setError(null);
      setMode("listening");

      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          mediaStreamRef.current = stream;
          const mimeType = getSupportedMimeType();
          const recorder = mimeType
            ? new MediaRecorder(stream, { mimeType })
            : new MediaRecorder(stream);
          mediaRecorderRef.current = recorder;
          const chunks: Blob[] = [];

          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
          };

          // Silence detection: stop after 2s of quiet
          const audioCtx = new AudioContext();
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          const freqData = new Uint8Array(analyser.frequencyBinCount);
          let silenceMs = 0;
          const SILENCE_THRESHOLD = 15;
          const SILENCE_LIMIT = 2000;
          const silenceInterval = setInterval(() => {
            analyser.getByteFrequencyData(freqData);
            const avg = freqData.reduce((a, b) => a + b, 0) / freqData.length;
            if (avg < SILENCE_THRESHOLD) {
              silenceMs += 200;
              if (silenceMs >= SILENCE_LIMIT) {
                clearInterval(silenceInterval);
                recorder.stop();
              }
            } else {
              silenceMs = 0;
            }
          }, 200);

          recorder.onstop = async () => {
            clearInterval(silenceInterval);
            stream.getTracks().forEach((t) => t.stop());
            audioCtx.close().catch(() => {});
            mediaRecorderRef.current = null;
            mediaStreamRef.current = null;
            setMode("thinking");

            if (chunks.length === 0) {
              setMode("idle");
              resolve(null);
              return;
            }

            const blob = new Blob(chunks, { type: mimeType || "audio/webm" });
            const form = new FormData();
            form.append("audio", blob, `audio.${mimeType.includes("mp4") ? "m4a" : "webm"}`);
            form.append("mimeType", mimeType || "audio/webm");

            try {
              const res = await fetch("/api/emma/stt", { method: "POST", body: form });
              if (res.status === 403 || res.status === 501) {
                // Free plan or key not configured — disable server STT for this session
                serverSttAvailableRef.current = false;
                usesServerSttRef.current = false;
                setSupported(false);
                setMode("idle");
                resolve(null);
                return;
              }
              if (!res.ok) {
                setMode("idle");
                resolve(null);
                return;
              }
              const data = (await res.json()) as { transcript?: string };
              setMode("idle");
              resolve(data.transcript || null);
            } catch {
              setMode("idle");
              resolve(null);
            }
          };

          recorder.onerror = () => {
            clearInterval(silenceInterval);
            stream.getTracks().forEach((t) => t.stop());
            audioCtx.close().catch(() => {});
            mediaRecorderRef.current = null;
            mediaStreamRef.current = null;
            setError("hardware");
            setMode("idle");
            resolve(null);
          };

          recorder.start(200);
        })
        .catch(() => {
          setError("not-allowed");
          setMode("idle");
          resolve(null);
        });
    });
  }, []);

  // ── STT with silence timeout ───────────────────────────────────────────────

  const listen = useCallback((): Promise<string | null> => {
    // Route to server STT when Web Speech is unavailable (Firefox, service-not-allowed)
    if (usesServerSttRef.current && serverSttAvailableRef.current) {
      return listenViaServer();
    }

    return new Promise((resolve) => {
      const r = recognitionRef.current;
      if (!r) {
        resolve(null);
        return;
      }

      // Clear error from any previous attempt
      setError(null);

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

        const errEvent = e as unknown as { error: string };
        if (errEvent.error === "not-allowed") {
          setError("not-allowed");
        } else if (errEvent.error === "no-speech") {
          setError("no-speech");
        } else if (errEvent.error === "service-not-allowed") {
          setError("service-not-allowed");
          // Persist so we skip Web Speech init next session
          try {
            localStorage.setItem("emma_voice_sna", "1");
          } catch {}
          // Switch to MediaRecorder/server path if available; otherwise hide mic button
          const hasMR =
            typeof MediaRecorder !== "undefined" && typeof navigator.mediaDevices !== "undefined";
          if (hasMR && serverSttAvailableRef.current) {
            usesServerSttRef.current = true;
            setSupported(true);
          } else {
            setSupported(false);
          }
        } else {
          setError("hardware");
        }

        resolve(null);
      };

      r.onend = () => {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        // Only reset to idle if we haven't transitioned to thinking
        setMode((prev) => (prev === "listening" ? "idle" : prev));
        resolve(null);
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
  }, [listenViaServer]);

  // ── Fetch ElevenLabs audio blob (for avatar lip sync) ──────────────────────

  const fetchAudioBlob = useCallback(
    async (text: string, clientId?: string, expression?: string): Promise<Blob | null> => {
      if (elevenLabsUnavailableRef.current) return null;
      try {
        const res = await fetch("/api/emma/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, clientId, expression }),
        });
        if (res.status === 204 || res.status === 501) {
          elevenLabsUnavailableRef.current = true;
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

    // Jenny first: her design intent is "warm and relaxed for digital assistants" —
    // more conversational by default than Aria's broader professional-leaning character.
    // Aria second as a warm fallback. Both are Windows 11 Azure Neural (Online|Natural).
    // Michelle Online Natural is also available in Chrome on Windows — warmer register.
    const candidates = [
      "Microsoft Jenny", // Windows 11 Neural — casual, warm, assistant-optimized
      "Microsoft Aria", // Windows 11 Neural — versatile, empathetic fallback
      "Microsoft Michelle", // Windows 11 Neural — warm register, third option
      "Karen", // macOS — warm, Australian
      "Moira", // macOS — intimate, Irish
      "Samantha", // macOS — clean American
      "Google UK English Female", // Chrome/Android
      "Microsoft Zira", // Windows legacy — last resort
    ];

    for (const name of candidates) {
      // Prefer the Neural/Online/Natural variant of a given voice name
      const neural = voices.find((v) => v.name.startsWith(name) && /Online|Natural/i.test(v.name));
      if (neural) return neural;
      const any = voices.find((v) => v.name.startsWith(name));
      if (any) return any;
    }

    // Fallback: any English female voice, then any English voice
    const femaleEn = voices.find(
      (v) => v.lang.startsWith("en") && /female|woman|girl/i.test(v.name)
    );
    if (femaleEn) return femaleEn;

    return voices.find((v) => v.lang.startsWith("en")) || null;
  }, []);

  // ── Web Speech TTS (Emma-tuned) ───────────────────────────────────────────

  const currentEmotionRef = useRef<string>("neutral");

  const speakFallback = useCallback(
    (text: string, emotion?: string, onTalkStart?: () => void, onTalkEnd?: () => void) => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      if (pauseTimerRef.current) {
        clearTimeout(pauseTimerRef.current);
        pauseTimerRef.current = null;
      }

      const processedText = processForEmma(text);
      const emo = emotion || currentEmotionRef.current || "neutral";
      const base = VOICE_PARAMS[emo] || VOICE_PARAMS.neutral;
      const voice = getBestVoice();

      // Chrome silently cuts off utterances > ~160 chars, so we must split.
      // Filler sounds (Mmm. / Ahh. / Hmm.) stay as standalone chunks so
      // getChunkConfig can give them intimate whisper params.
      const CHUNK_LIMIT = 160;
      const sentences = processedText.match(/[^.!?]+[.!?]+\s*/g) || [processedText];
      const chunks: string[] = [];
      let current = "";

      for (const s of sentences) {
        const t = s.trim();
        if (!t) continue;

        if (isFiller(t)) {
          // Never merge a filler sound into an adjacent sentence
          if (current) {
            chunks.push(current);
            current = "";
          }
          chunks.push(t);
        } else if (!current) {
          current = t;
        } else if ((current + " " + t).length <= CHUNK_LIMIT) {
          current += " " + t;
        } else {
          chunks.push(current);
          current = t;
        }
      }
      if (current) chunks.push(current);

      let idx = 0;
      let talkStartFired = false;

      const speakNext = () => {
        if (idx >= chunks.length) {
          setMode("idle");
          onTalkEnd?.();
          return;
        }
        const chunk = chunks[idx++];
        if (!chunk) {
          speakNext();
          return;
        }

        const cfg = getChunkConfig(chunk, base);

        const utterance = new SpeechSynthesisUtterance(chunk);
        utterance.rate = cfg.rate;
        utterance.pitch = cfg.pitch;
        utterance.volume = cfg.volume;
        if (voice) utterance.voice = voice;

        utterance.onstart = () => {
          setMode("speaking");
          if (!talkStartFired) {
            talkStartFired = true;
            onTalkStart?.();
          }
        };
        utterance.onend = () => {
          pauseTimerRef.current = setTimeout(speakNext, cfg.gapMs);
        };
        utterance.onerror = () => {
          setMode("idle");
          onTalkEnd?.();
        };

        window.speechSynthesis.speak(utterance);
      };

      speakNext();
    },
    [getBestVoice]
  );

  // ── Full speak (ElevenLabs → fallback) ─────────────────────────────────────

  const speakElevenLabs = useCallback(
    async (text: string, clientId?: string, expression?: string): Promise<boolean> => {
      const blob = await fetchAudioBlob(text, clientId, expression);
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
    (text: string, _clientId?: string, emotion?: string) => {
      // Always try ElevenLabs first — server returns 204 if no key configured
      speakElevenLabs(text, undefined, emotion).then((ok) => {
        if (!ok) speakFallback(text, emotion);
      });
    },
    [speakElevenLabs, speakFallback]
  );

  const setCurrentEmotion = useCallback((emotion: string) => {
    currentEmotionRef.current = emotion;
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const stopListening = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    try {
      recognitionRef.current?.abort();
    } catch {}
    // Stop server STT recording if active
    try {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    } catch {}
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    setMode("idle");
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
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return {
    mode,
    listening,
    speaking,
    supported,
    error,
    listen,
    stopListening,
    speak,
    fetchAudioBlob,
    speakFallback,
    stopSpeaking,
    setMode,
    setCurrentEmotion,
    clearError,
  };
}
