import type { MemoryEntry, EmotionState, PersonaId } from "@/types/emma";
import type { CustomPersona } from "@/types/persona";

/**
 * Behavior Flags — the deterministic behavioral layer between state and prompt.
 *
 * See docs/adr/0001-behavior-flags.md. This module is the ONLY place that maps
 * user state (memories, emotion, persona, time) to behavioral decisions.
 * Consumers render or verify flags; they never re-derive behavior themselves.
 *
 * Client-safe: no fs, no server-only imports — greeting/proactive engines may
 * consume flags in later phases.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BehaviorFlags {
  /** Response length policy. */
  verbosity: "concise" | "normal" | "verbose";
  /** Emoji policy. */
  emojiUsage: "none" | "minimal" | "normal";
  /** Teasing / playful-edge intensity. */
  teasingLevel: "off" | "light" | "playful";
  /** Empathy / affection lean. */
  warmth: "standard" | "elevated";
  /** Follow-up questions and unprompted suggestions. */
  initiative: "reactive" | "balanced" | "forward";
}

export interface BehaviorInputs {
  personaId: PersonaId;
  /** Preference-category entries drive style flags. Other categories are ignored. */
  memories?: MemoryEntry[];
  /** Fused emotion state — per-turn modulation, confidence-gated at > 0.3. */
  emotionState?: EmotionState;
  /** User-configured persona settings (Pro/Enterprise). */
  customPersona?: Pick<CustomPersona, "verbosity">;
  /** Hour 0-23 in the user's timezone; late night lowers initiative. */
  localHour?: number;
}

// Same gate the prompt builder uses for the emotion block.
const EMOTION_CONFIDENCE_GATE = 0.3;
// Preference memories below this are too weak to change behavior.
const MEMORY_CONFIDENCE_GATE = 0.6;

// ─── Persona Baselines ───────────────────────────────────────────────────────

const PERSONA_BASELINES: Record<PersonaId, BehaviorFlags> = {
  mommy: {
    verbosity: "normal",
    emojiUsage: "minimal",
    teasingLevel: "playful",
    warmth: "standard",
    initiative: "forward",
  },
  neutral: {
    verbosity: "normal",
    emojiUsage: "minimal",
    teasingLevel: "off",
    warmth: "standard",
    initiative: "balanced",
  },
};

// ─── Memory Preference Matching ──────────────────────────────────────────────

/**
 * Reads a single preference memory and returns the flag adjustments it implies.
 * Matches recognized keys first (what the extractor tends to produce), then
 * falls back to scanning the value text, since extraction chooses keys freely.
 */
function readPreference(entry: MemoryEntry): Partial<BehaviorFlags> {
  const key = entry.key.toLowerCase();
  const value = entry.value.toLowerCase();
  const out: Partial<BehaviorFlags> = {};

  // interaction_vibe — the original Phase 2 mechanism, generalized here.
  // "playful" keeps teasing; "warm" and "balanced" soften it.
  if (key === "interaction_vibe") {
    if (value.includes("playful")) out.teasingLevel = "playful";
    else if (value.includes("warm")) {
      out.teasingLevel = "off";
      out.warmth = "elevated";
    } else if (value.includes("balanced")) out.teasingLevel = "light";
    return out;
  }

  const text = `${key} ${value}`;

  // Verbosity / response length
  const wantsConcise =
    /\b(concise|short|brief|to the point|less wordy|fewer words|short answers?)\b/.test(text) &&
    !/\b(not|don'?t|no)\s+(too\s+)?(concise|short|brief)\b/.test(text);
  const wantsVerbose = /\b(detailed|thorough|longer|in.?depth|verbose|elaborate)\b/.test(text);
  if (wantsConcise) out.verbosity = "concise";
  else if (wantsVerbose) out.verbosity = "verbose";

  // Emoji usage
  if (/emoji/.test(text)) {
    const negative = /\b(no|without|hates?|dislikes?|stop|avoid|never|too many)\b/.test(text);
    const positive = /\b(loves?|likes?|enjoys?|more|wants?)\b/.test(text) && !negative;
    if (negative) out.emojiUsage = "none";
    else if (positive) out.emojiUsage = "normal";
  }

  // Teasing
  if (/teas|flirt|banter/.test(text)) {
    const negative = /\b(no|not|stop|don'?t|hates?|dislikes?|avoid|less|uncomfortable)\b/.test(
      text
    );
    const positive = /\b(loves?|likes?|enjoys?|more|wants?)\b/.test(text) && !negative;
    if (negative) out.teasingLevel = "off";
    else if (positive) out.teasingLevel = "playful";
  }

  return out;
}

function levelOfTeasing(t: BehaviorFlags["teasingLevel"]): number {
  return t === "off" ? 0 : t === "light" ? 1 : 2;
}

// ─── Derivation ──────────────────────────────────────────────────────────────

/**
 * Derives behavior flags from user state. Pure and deterministic — same inputs
 * always yield the same flags.
 *
 * Precedence (lowest → highest):
 *   persona baseline → custom persona settings → memory preferences
 *   → emotion / time modulation.
 *
 * Two invariants (see ADR):
 *   1. Durable preferences beat per-turn emotion for style flags
 *      (verbosity, emojiUsage).
 *   2. Negative emotion only ever LOWERS teasing — never raises it above what
 *      persona + memory allow. Distress always suppresses teasing entirely.
 */
export function deriveBehaviorFlags(inputs: BehaviorInputs): BehaviorFlags {
  const flags: BehaviorFlags = { ...PERSONA_BASELINES[inputs.personaId] };

  // ── Custom persona settings (explicit user configuration) ──────────────────
  if (inputs.customPersona?.verbosity) {
    flags.verbosity = inputs.customPersona.verbosity;
  }

  // ── Memory preferences ──────────────────────────────────────────────────────
  // Process oldest → newest so newer preferences win on conflict.
  const prefs = (inputs.memories ?? [])
    .filter((m) => m.category === "preference" && m.confidence >= MEMORY_CONFIDENCE_GATE)
    .sort((a, b) => a.timestamp - b.timestamp);

  for (const entry of prefs) {
    Object.assign(flags, readPreference(entry));
  }

  // Remember the memory-derived ceiling before emotion modulation.
  const teasingCeiling = flags.teasingLevel;

  // ── Emotion modulation (per-turn, may only soften) ─────────────────────────
  const e = inputs.emotionState;
  if (e && e.confidence > EMOTION_CONFIDENCE_GATE) {
    if (e.valence < -0.3) {
      // Distress: no teasing, lead with care.
      flags.teasingLevel = "off";
      flags.warmth = "elevated";
      // Agitated distress (high arousal): don't pile on suggestions.
      if (e.arousal > 0.6 && flags.initiative === "forward") {
        flags.initiative = "balanced";
      }
    } else if (e.valence > 0.4 && e.arousal > 0.4) {
      // Clearly upbeat: match the energy — but never past the memory ceiling.
      if (levelOfTeasing(teasingCeiling) >= 1) {
        flags.teasingLevel = teasingCeiling;
      }
      if (flags.initiative === "balanced") flags.initiative = "forward";
    }
  }

  // ── Time modulation ─────────────────────────────────────────────────────────
  // Late night: stay present, stop pushing.
  if (inputs.localHour !== undefined && (inputs.localHour >= 23 || inputs.localHour < 5)) {
    if (flags.initiative === "forward") flags.initiative = "balanced";
  }

  return flags;
}

// ─── Prompt Rendering ────────────────────────────────────────────────────────

/**
 * Renders flags as compact prompt directives — one line per flag that needs
 * stating. Returns "" when every flag matches the persona baseline (nothing
 * worth saying). Consumed by buildSystemPromptBlocks(); this function renders
 * decisions, it never makes them.
 */
export function renderBehaviorDirectives(flags: BehaviorFlags, personaId: PersonaId): string {
  const base = PERSONA_BASELINES[personaId];
  const lines: string[] = [];

  if (flags.verbosity !== base.verbosity) {
    if (flags.verbosity === "concise")
      lines.push("- Keep responses brief — 1-2 sentences unless the task genuinely requires more.");
    else if (flags.verbosity === "verbose")
      lines.push("- The user prefers thorough answers — expand where it adds value.");
  }

  if (flags.emojiUsage !== base.emojiUsage) {
    if (flags.emojiUsage === "none") lines.push("- Do not use emojis.");
    else if (flags.emojiUsage === "normal")
      lines.push("- Emojis are welcome where they fit naturally.");
  }

  if (flags.teasingLevel !== base.teasingLevel) {
    if (flags.teasingLevel === "off")
      lines.push("- No teasing right now — be straightforwardly supportive.");
    else if (flags.teasingLevel === "light") lines.push("- Keep teasing gentle and occasional.");
    else lines.push("- Playful teasing is welcome.");
  }

  if (flags.warmth === "elevated") {
    lines.push("- Lead with care and empathy before anything else.");
  }

  if (flags.initiative !== base.initiative) {
    if (flags.initiative === "reactive")
      lines.push("- Answer what's asked; skip unprompted suggestions this turn.");
    else if (flags.initiative === "balanced")
      lines.push("- Ease off unprompted suggestions — follow the user's lead.");
    else lines.push("- Feel free to take initiative with follow-ups and suggestions.");
  }

  if (lines.length === 0) return "";

  return `## Behavior Directives\nCurrent behavioral adjustments — these override your default style where they conflict:\n${lines.join("\n")}`;
}
