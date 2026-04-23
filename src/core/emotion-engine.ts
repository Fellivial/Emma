"use client";

import { useState, useRef, useCallback } from "react";
import type { EmotionState, EmotionLabel, EmotionAnalysis } from "@/types/emma";

interface UseEmotionReturn {
  currentEmotion: EmotionState | null;
  analyzing: boolean;
  analyzeVoice: (audioData: Float32Array, sampleRate: number) => EmotionState;
  analyzeFromVision: (frameBase64: string) => Promise<EmotionState | null>;
  analyzeText: (text: string) => EmotionState;
  getCombined: () => EmotionState | null;
  history: EmotionState[];
}

/**
 * Emotion detection engine.
 *
 * Voice: Analyzes audio features (energy, pitch variance, speaking rate)
 *        to estimate arousal/valence → maps to emotion labels.
 *
 * Vision: Sends webcam frame to /api/emma/emotion with Claude Vision
 *         for facial expression analysis.
 *
 * Text: Simple keyword/pattern-based sentiment from user messages.
 *
 * Combined: Weighted fusion of all available signals.
 */
export function useEmotion(): UseEmotionReturn {
  const [currentEmotion, setCurrentEmotion] = useState<EmotionState | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [history, setHistory] = useState<EmotionState[]>([]);

  const voiceRef = useRef<EmotionState | null>(null);
  const visionRef = useRef<EmotionState | null>(null);
  const textRef = useRef<EmotionState | null>(null);

  const pushHistory = (state: EmotionState) => {
    setHistory((prev) => [state, ...prev].slice(0, 50));
    setCurrentEmotion(state);
  };

  // ── Voice Sentiment (Web Audio API features) ───────────────────────────────

  const analyzeVoice = useCallback((audioData: Float32Array, sampleRate: number): EmotionState => {
    // Compute basic audio features
    const energy = computeRMS(audioData);
    const zcr = computeZeroCrossingRate(audioData);
    const spectralCentroid = computeSpectralCentroid(audioData, sampleRate);

    // Map features to arousal/valence
    // High energy + high ZCR → high arousal (excited/angry)
    // Low energy + low ZCR → low arousal (calm/sad)
    const arousal = Math.min(1, (energy * 3 + zcr * 0.5) / 2);
    const valence = spectralCentroid > 2000 ? 0.3 : spectralCentroid > 1000 ? 0.0 : -0.3;

    const label = mapToEmotion(valence, arousal);
    const state: EmotionState = {
      primary: label,
      confidence: 0.4 + energy * 0.3, // Low confidence from audio alone
      valence,
      arousal,
      source: "voice",
      timestamp: Date.now(),
    };

    voiceRef.current = state;
    return state;
  }, []);

  // ── Vision Expression (Claude Vision) ──────────────────────────────────────

  const analyzeFromVision = useCallback(async (frameBase64: string): Promise<EmotionState | null> => {
    setAnalyzing(true);
    try {
      const res = await fetch("/api/emma/emotion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frame: frameBase64, source: "vision" }),
      });

      const data = await res.json();
      if (data.emotion) {
        const state: EmotionState = {
          ...data.emotion,
          source: "vision",
          timestamp: Date.now(),
        };
        visionRef.current = state;
        pushHistory(state);
        return state;
      }
      return null;
    } catch {
      return null;
    } finally {
      setAnalyzing(false);
    }
  }, []);

  // ── Text Sentiment (pattern matching) ──────────────────────────────────────

  const analyzeText = useCallback((text: string): EmotionState => {
    const lower = text.toLowerCase();

    let label: EmotionLabel = "neutral";
    let valence = 0;
    let arousal = 0.3;
    let confidence = 0.5;

    // Simple keyword matching
    const patterns: [RegExp, EmotionLabel, number, number][] = [
      [/\b(happy|great|awesome|love|amazing|wonderful|excited)\b/, "happy", 0.8, 0.6],
      [/\b(sad|depressed|down|unhappy|miserable|lonely)\b/, "sad", -0.7, 0.2],
      [/\b(angry|furious|mad|pissed|hate)\b/, "angry", -0.6, 0.9],
      [/\b(anxious|worried|nervous|scared|afraid)\b/, "anxious", -0.4, 0.7],
      [/\b(tired|exhausted|sleepy|drained|fatigued)\b/, "tired", -0.2, 0.1],
      [/\b(excited|pumped|thrilled|stoked|hyped)\b/, "excited", 0.9, 0.9],
      [/\b(frustrated|annoyed|irritated|ugh)\b/, "frustrated", -0.5, 0.6],
      [/\b(calm|relaxed|peaceful|chill|serene)\b/, "calm", 0.3, 0.1],
      [/\b(stressed|overwhelmed|pressured|swamped)\b/, "stressed", -0.5, 0.7],
      [/\b(fine|okay|ok|alright|meh)\b/, "neutral", 0.0, 0.2],
    ];

    for (const [regex, emoLabel, v, a] of patterns) {
      if (regex.test(lower)) {
        label = emoLabel;
        valence = v;
        arousal = a;
        confidence = 0.7;
        break;
      }
    }

    // Exclamation marks increase arousal
    const exclamations = (text.match(/!/g) || []).length;
    arousal = Math.min(1, arousal + exclamations * 0.1);

    // ALL CAPS increases arousal
    if (text === text.toUpperCase() && text.length > 3) {
      arousal = Math.min(1, arousal + 0.3);
    }

    const state: EmotionState = {
      primary: label,
      confidence,
      valence,
      arousal,
      source: "text",
      timestamp: Date.now(),
    };

    textRef.current = state;
    pushHistory(state);
    return state;
  }, []);

  // ── Combined Fusion ────────────────────────────────────────────────────────

  const getCombined = useCallback((): EmotionState | null => {
    const signals = [voiceRef.current, visionRef.current, textRef.current].filter(
      (s): s is EmotionState => s !== null && Date.now() - s.timestamp < 30_000
    );

    if (signals.length === 0) return null;

    // Weighted average by confidence
    let totalWeight = 0;
    let valence = 0;
    let arousal = 0;

    const sourceWeights = { voice: 0.3, vision: 0.4, text: 0.3 };

    for (const s of signals) {
      const w = s.confidence * (sourceWeights[s.source as keyof typeof sourceWeights] || 0.3);
      valence += s.valence * w;
      arousal += s.arousal * w;
      totalWeight += w;
    }

    if (totalWeight === 0) return null;

    valence /= totalWeight;
    arousal /= totalWeight;

    const label = mapToEmotion(valence, arousal);
    const combined: EmotionState = {
      primary: label,
      confidence: Math.min(1, totalWeight),
      valence,
      arousal,
      source: "combined",
      timestamp: Date.now(),
    };

    setCurrentEmotion(combined);
    return combined;
  }, []);

  return {
    currentEmotion,
    analyzing,
    analyzeVoice,
    analyzeFromVision,
    analyzeText,
    getCombined,
    history,
  };
}

// ─── Audio Feature Extraction ────────────────────────────────────────────────

function computeRMS(data: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i] * data[i];
  }
  return Math.sqrt(sum / data.length);
}

function computeZeroCrossingRate(data: Float32Array): number {
  let crossings = 0;
  for (let i = 1; i < data.length; i++) {
    if ((data[i] >= 0 && data[i - 1] < 0) || (data[i] < 0 && data[i - 1] >= 0)) {
      crossings++;
    }
  }
  return crossings / data.length;
}

function computeSpectralCentroid(data: Float32Array, sampleRate: number): number {
  let numerator = 0;
  let denominator = 0;
  const binSize = sampleRate / data.length;
  for (let i = 0; i < data.length; i++) {
    const mag = Math.abs(data[i]);
    numerator += i * binSize * mag;
    denominator += mag;
  }
  return denominator > 0 ? numerator / denominator : 0;
}

// ─── Emotion Mapping (Russell's Circumplex) ──────────────────────────────────

function mapToEmotion(valence: number, arousal: number): EmotionLabel {
  // High arousal, positive valence → excited/happy
  if (arousal > 0.6 && valence > 0.3) return "excited";
  if (arousal > 0.3 && valence > 0.3) return "happy";
  // High arousal, negative valence → angry/frustrated
  if (arousal > 0.6 && valence < -0.3) return "angry";
  if (arousal > 0.4 && valence < -0.2) return "frustrated";
  // Low arousal, negative valence → sad/tired
  if (arousal < 0.3 && valence < -0.3) return "sad";
  if (arousal < 0.2) return "tired";
  // Low arousal, positive valence → calm
  if (arousal < 0.3 && valence > 0) return "calm";
  // Medium arousal, negative → anxious/stressed
  if (valence < -0.2) return "stressed";
  if (arousal > 0.5) return "anxious";

  return "neutral";
}
