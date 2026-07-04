import type { PersonaId } from "@/types/emma";
import type { BehaviorFlags } from "@/core/behavior-flags";
import { getPersonaBaseline } from "@/core/behavior-flags";

/**
 * Voice modulation from behavior flags — Phase 4 consumer (ADR 0001).
 *
 * Expression-based voice settings remain the primary styling dimension
 * (EXPRESSION_VOICE_SETTINGS for ElevenLabs, VOICE_PARAMS for WebSpeech);
 * these helpers apply a light second pass on top:
 *
 *   - warmth "elevated"  → softer delivery: slower, steadier volume, a touch
 *     more expressive style. Direction matches each engine's own "warm" preset.
 *   - initiative lowered below the persona baseline (distress or late night)
 *     → slightly calmer pace. Never raises energy above the expression preset.
 *
 * Both helpers are pure, deterministic, and identity at baseline flags. They
 * validate flag values structurally, so unvalidated JSON (the TTS route body)
 * can be passed through safely — unknown values are ignored.
 */

// ─── ElevenLabs ──────────────────────────────────────────────────────────────

export interface ElevenLabsVoiceSettings {
  stability: number;
  similarity_boost: number;
  style: number;
  speed: number;
}

/** Subset of flags that voice delivery consumes; values may be untrusted. */
export interface VoiceBehaviorHints {
  warmth?: unknown;
  initiative?: unknown;
}

const INITIATIVE_RANK: Record<BehaviorFlags["initiative"], number> = {
  reactive: 0,
  balanced: 1,
  forward: 2,
};

function initiativeLowered(personaId: PersonaId, initiative: unknown): boolean {
  if (initiative !== "reactive" && initiative !== "balanced" && initiative !== "forward") {
    return false;
  }
  const baseline = getPersonaBaseline(personaId).initiative;
  return INITIATIVE_RANK[initiative] < INITIATIVE_RANK[baseline];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Applies warmth/initiative modulation to expression-derived ElevenLabs
 * settings. Unknown or baseline hints return the settings unchanged.
 */
export function applyFlagsToElevenLabsSettings(
  settings: ElevenLabsVoiceSettings,
  personaId: PersonaId,
  hints?: VoiceBehaviorHints
): ElevenLabsVoiceSettings {
  if (!hints) return settings;

  let { stability, style, speed } = settings;

  if (hints.warmth === "elevated") {
    // Toward the warm preset: unhurried, slightly less clamped, more style.
    speed = clamp(speed * 0.94, 0.75, 1.2);
    stability = clamp(stability - 0.1, 0.2, 1);
    style = clamp(style + 0.1, 0, 0.6);
  }

  if (initiativeLowered(personaId, hints.initiative)) {
    // Ease off the energy — calmer pace, never faster.
    speed = clamp(speed * 0.97, 0.75, 1.2);
  }

  if (stability === settings.stability && style === settings.style && speed === settings.speed) {
    return settings;
  }
  return { ...settings, stability, style, speed };
}

// ─── WebSpeech ───────────────────────────────────────────────────────────────

export interface WebSpeechVoiceParams {
  rate: number;
  pitch: number;
  volume: number;
}

/**
 * Applies warmth/initiative modulation to emotion-derived WebSpeech params.
 * Rate floor stays at 0.88 — WebSpeech prosody degrades below ~0.9 (it
 * stretches phonemes instead of pausing; see voice-engine.ts VOICE_PARAMS).
 */
export function applyFlagsToWebSpeechParams(
  params: WebSpeechVoiceParams,
  personaId: PersonaId,
  hints?: VoiceBehaviorHints
): WebSpeechVoiceParams {
  if (!hints) return params;

  let { rate, pitch, volume } = params;

  if (hints.warmth === "elevated") {
    rate = clamp(rate * 0.96, 0.88, 1.1);
    pitch = clamp(pitch * 0.99, 0.9, 1.0);
    volume = clamp(volume * 0.92, 0.5, 1.0);
  }

  if (initiativeLowered(personaId, hints.initiative)) {
    rate = clamp(rate * 0.98, 0.88, 1.1);
  }

  if (rate === params.rate && pitch === params.pitch && volume === params.volume) {
    return params;
  }
  return { rate, pitch, volume };
}
