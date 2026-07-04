// Behavior Flags derivation — ADR 0001.
// The derivation is the single source of truth for behavioral decisions:
// deterministic, memory-driven, emotion-modulated, persona-grounded.

import { describe, it, expect } from "vitest";
import { deriveBehaviorFlags, renderBehaviorDirectives } from "@/core/behavior-flags";
import type { MemoryEntry, EmotionState } from "@/types/emma";

// ─── Fixtures ────────────────────────────────────────────────────────────────

let seq = 0;
function pref(key: string, value: string, confidence = 0.9, timestamp?: number): MemoryEntry {
  seq += 1;
  return {
    id: `mem-${seq}`,
    timestamp: timestamp ?? seq * 1000,
    category: "preference",
    key,
    value,
    confidence,
    source: "extracted",
  };
}

function emotion(overrides: Partial<EmotionState> = {}): EmotionState {
  return {
    primary: "neutral",
    confidence: 0.8,
    valence: 0,
    arousal: 0.3,
    source: "combined",
    timestamp: Date.now(),
    ...overrides,
  };
}

const SAD = emotion({ primary: "sad", valence: -0.7, arousal: 0.2 });
const EXCITED = emotion({ primary: "excited", valence: 0.8, arousal: 0.8 });
const ANGRY = emotion({ primary: "angry", valence: -0.6, arousal: 0.9 });

// ─── Persona baselines ───────────────────────────────────────────────────────

describe("deriveBehaviorFlags — persona baselines", () => {
  it("mommy baseline: playful teasing, forward initiative", () => {
    const flags = deriveBehaviorFlags({ personaId: "mommy" });
    expect(flags).toEqual({
      verbosity: "normal",
      emojiUsage: "minimal",
      teasingLevel: "playful",
      warmth: "standard",
      initiative: "forward",
    });
  });

  it("neutral baseline: no teasing, balanced initiative", () => {
    const flags = deriveBehaviorFlags({ personaId: "neutral" });
    expect(flags.teasingLevel).toBe("off");
    expect(flags.initiative).toBe("balanced");
  });

  it("is deterministic — identical inputs produce identical flags", () => {
    const inputs = {
      personaId: "mommy" as const,
      memories: [pref("emoji_preference", "dislikes emojis", 0.9, 1000)],
      emotionState: SAD,
      localHour: 14,
    };
    expect(deriveBehaviorFlags(inputs)).toEqual(deriveBehaviorFlags(inputs));
  });
});

// ─── Memory → behavior ───────────────────────────────────────────────────────

describe("deriveBehaviorFlags — memory preferences", () => {
  it("'dislikes emojis' preference sets emojiUsage none", () => {
    const flags = deriveBehaviorFlags({
      personaId: "mommy",
      memories: [pref("emoji_preference", "dislikes emojis")],
    });
    expect(flags.emojiUsage).toBe("none");
  });

  it("'loves emojis' preference sets emojiUsage normal", () => {
    const flags = deriveBehaviorFlags({
      personaId: "mommy",
      memories: [pref("emoji_preference", "loves emojis in messages")],
    });
    expect(flags.emojiUsage).toBe("normal");
  });

  it("'prefers short answers' sets verbosity concise", () => {
    const flags = deriveBehaviorFlags({
      personaId: "mommy",
      memories: [pref("response_style", "prefers short answers")],
    });
    expect(flags.verbosity).toBe("concise");
  });

  it("'likes detailed explanations' sets verbosity verbose", () => {
    const flags = deriveBehaviorFlags({
      personaId: "mommy",
      memories: [pref("explanation_style", "likes detailed explanations")],
    });
    expect(flags.verbosity).toBe("verbose");
  });

  it("'does not like being teased' turns teasing off", () => {
    const flags = deriveBehaviorFlags({
      personaId: "mommy",
      memories: [pref("teasing_preference", "does not like being teased")],
    });
    expect(flags.teasingLevel).toBe("off");
  });

  it("'enjoys teasing' keeps teasing playful for neutral persona too", () => {
    const flags = deriveBehaviorFlags({
      personaId: "neutral",
      memories: [pref("teasing_preference", "enjoys playful teasing")],
    });
    expect(flags.teasingLevel).toBe("playful");
  });

  it("interaction_vibe 'warm' turns teasing off and elevates warmth (generalized Phase 2 mechanism)", () => {
    const flags = deriveBehaviorFlags({
      personaId: "mommy",
      memories: [pref("interaction_vibe", "warm")],
    });
    expect(flags.teasingLevel).toBe("off");
    expect(flags.warmth).toBe("elevated");
  });

  it("interaction_vibe 'balanced' softens teasing to light", () => {
    const flags = deriveBehaviorFlags({
      personaId: "mommy",
      memories: [pref("interaction_vibe", "balanced")],
    });
    expect(flags.teasingLevel).toBe("light");
  });

  it("ignores preferences below the 0.6 confidence gate", () => {
    const flags = deriveBehaviorFlags({
      personaId: "mommy",
      memories: [pref("emoji_preference", "dislikes emojis", 0.5)],
    });
    expect(flags.emojiUsage).toBe("minimal"); // baseline, not "none"
  });

  it("ignores non-preference categories entirely", () => {
    const goal: MemoryEntry = {
      id: "mem-goal",
      timestamp: 1000,
      category: "goal",
      key: "communication_goal",
      value: "wants short answers and no emojis",
      confidence: 0.95,
      source: "extracted",
    };
    const flags = deriveBehaviorFlags({ personaId: "mommy", memories: [goal] });
    expect(flags.verbosity).toBe("normal");
    expect(flags.emojiUsage).toBe("minimal");
  });

  it("newer preference wins on conflict", () => {
    const flags = deriveBehaviorFlags({
      personaId: "mommy",
      memories: [
        pref("emoji_preference", "loves emojis", 0.9, 1000),
        pref("emoji_preference_update", "actually hates emojis now", 0.9, 2000),
      ],
    });
    expect(flags.emojiUsage).toBe("none");
  });

  it("custom persona verbosity applies, memory preference overrides it", () => {
    const base = deriveBehaviorFlags({
      personaId: "mommy",
      customPersona: { verbosity: "verbose" },
    });
    expect(base.verbosity).toBe("verbose");

    const overridden = deriveBehaviorFlags({
      personaId: "mommy",
      customPersona: { verbosity: "verbose" },
      memories: [pref("response_style", "keep it short and brief")],
    });
    expect(overridden.verbosity).toBe("concise");
  });
});

// ─── Emotion → behavior ──────────────────────────────────────────────────────

describe("deriveBehaviorFlags — emotion modulation", () => {
  it("negative emotion suppresses teasing and elevates warmth", () => {
    const flags = deriveBehaviorFlags({ personaId: "mommy", emotionState: SAD });
    expect(flags.teasingLevel).toBe("off");
    expect(flags.warmth).toBe("elevated");
  });

  it("negative emotion overrides even a pro-teasing memory preference (care first)", () => {
    const flags = deriveBehaviorFlags({
      personaId: "mommy",
      memories: [pref("teasing_preference", "loves being teased")],
      emotionState: SAD,
    });
    expect(flags.teasingLevel).toBe("off");
  });

  it("agitated distress (high arousal) also damps initiative", () => {
    const flags = deriveBehaviorFlags({ personaId: "mommy", emotionState: ANGRY });
    expect(flags.initiative).toBe("balanced");
  });

  it("positive emotion never raises teasing above the memory ceiling", () => {
    const flags = deriveBehaviorFlags({
      personaId: "mommy",
      memories: [pref("teasing_preference", "does not like teasing")],
      emotionState: EXCITED,
    });
    expect(flags.teasingLevel).toBe("off");
  });

  it("positive emotion raises neutral persona initiative to forward", () => {
    const flags = deriveBehaviorFlags({ personaId: "neutral", emotionState: EXCITED });
    expect(flags.initiative).toBe("forward");
  });

  it("low-confidence emotion is ignored (same 0.3 gate as the prompt)", () => {
    const flags = deriveBehaviorFlags({
      personaId: "mommy",
      emotionState: emotion({ valence: -0.9, confidence: 0.2 }),
    });
    expect(flags.teasingLevel).toBe("playful"); // baseline unchanged
  });

  it("durable style preferences survive emotion (sad user still hates emojis)", () => {
    const flags = deriveBehaviorFlags({
      personaId: "mommy",
      memories: [pref("emoji_preference", "hates emojis"), pref("response_style", "short answers")],
      emotionState: SAD,
    });
    expect(flags.emojiUsage).toBe("none");
    expect(flags.verbosity).toBe("concise");
  });
});

// ─── Time → behavior ─────────────────────────────────────────────────────────

describe("deriveBehaviorFlags — time modulation", () => {
  it("late night lowers forward initiative to balanced", () => {
    expect(deriveBehaviorFlags({ personaId: "mommy", localHour: 23 }).initiative).toBe("balanced");
    expect(deriveBehaviorFlags({ personaId: "mommy", localHour: 3 }).initiative).toBe("balanced");
  });

  it("daytime leaves initiative at the persona baseline", () => {
    expect(deriveBehaviorFlags({ personaId: "mommy", localHour: 14 }).initiative).toBe("forward");
  });
});

// ─── Directive rendering ─────────────────────────────────────────────────────

describe("renderBehaviorDirectives", () => {
  it("renders nothing when flags match the persona baseline", () => {
    const flags = deriveBehaviorFlags({ personaId: "mommy" });
    expect(renderBehaviorDirectives(flags, "mommy")).toBe("");
  });

  it("renders one line per deviating flag", () => {
    const flags = deriveBehaviorFlags({
      personaId: "mommy",
      memories: [pref("emoji_preference", "dislikes emojis")],
      emotionState: SAD,
    });
    const out = renderBehaviorDirectives(flags, "mommy");
    expect(out).toContain("## Behavior Directives");
    expect(out).toContain("Do not use emojis.");
    expect(out).toContain("No teasing right now");
    expect(out).toContain("Lead with care and empathy");
  });

  it("stays within the ADR prompt budget (≤ 8 directive lines)", () => {
    // Worst case: every flag deviates from baseline.
    const flags = deriveBehaviorFlags({
      personaId: "mommy",
      memories: [pref("emoji_preference", "hates emojis"), pref("response_style", "short answers")],
      emotionState: ANGRY,
      localHour: 23,
    });
    const out = renderBehaviorDirectives(flags, "mommy");
    const directiveLines = out.split("\n").filter((l) => l.startsWith("- "));
    expect(directiveLines.length).toBeGreaterThan(0);
    expect(directiveLines.length).toBeLessThanOrEqual(8);
  });
});
