// Character consistency — Phase 3 "Become Emma".
//
// These tests simulate the conditions under which personality drift happens —
// long conversations, emotion churn, summarization cycles, session reloads,
// memory updates — and assert that the behavioral layer stays stable where it
// should and adapts only where it should.

import { describe, it, expect } from "vitest";
import { deriveBehaviorFlags, type BehaviorFlags } from "@/core/behavior-flags";
import { buildSystemPrompt, buildSystemPromptBlocks } from "@/core/personas";
import type { MemoryEntry, EmotionState } from "@/types/emma";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function pref(key: string, value: string, timestamp: number, confidence = 0.9): MemoryEntry {
  return {
    id: `mem-${key}-${timestamp}`,
    timestamp,
    category: "preference",
    key,
    value,
    confidence,
    source: "extracted",
  };
}

function emotion(valence: number, arousal: number, confidence = 0.8): EmotionState {
  return {
    primary: valence < -0.3 ? "sad" : valence > 0.4 ? "happy" : "neutral",
    confidence,
    valence,
    arousal,
    source: "combined",
    timestamp: Date.now(),
  };
}

const DURABLE_PREFS = [
  pref("emoji_preference", "dislikes emojis", 1000),
  pref("response_style", "prefers short answers", 2000),
];

// Deterministic pseudo-random emotion churn — simulates a long session's
// fluctuating fusion output without test flakiness.
function churnEmotion(turn: number): EmotionState {
  const valence = Math.sin(turn * 1.7) * 0.9;
  const arousal = (Math.sin(turn * 2.3) + 1) / 2;
  return emotion(valence, arousal);
}

// ─── Long conversations ──────────────────────────────────────────────────────

describe("character consistency — long conversations", () => {
  it("style flags never drift across 300 turns of emotion churn", () => {
    for (let turn = 0; turn < 300; turn++) {
      const flags = deriveBehaviorFlags({
        personaId: "mommy",
        memories: DURABLE_PREFS,
        emotionState: churnEmotion(turn),
        localHour: 14,
      });
      // Durable user preferences hold regardless of per-turn emotion.
      expect(flags.emojiUsage).toBe("none");
      expect(flags.verbosity).toBe("concise");
      // Teasing may modulate, but only within the defined range.
      expect(["off", "light", "playful"]).toContain(flags.teasingLevel);
    }
  });

  it("teasing always returns to the persona ceiling once distress passes", () => {
    const during = deriveBehaviorFlags({
      personaId: "mommy",
      memories: DURABLE_PREFS,
      emotionState: emotion(-0.8, 0.3),
    });
    expect(during.teasingLevel).toBe("off");

    const after = deriveBehaviorFlags({
      personaId: "mommy",
      memories: DURABLE_PREFS,
      emotionState: emotion(0.1, 0.3),
    });
    expect(after.teasingLevel).toBe("playful"); // full recovery, no residue
  });
});

// ─── Summarization cycles ────────────────────────────────────────────────────

describe("character consistency — summarization cycles", () => {
  it("behavior directives are identical before and after conversation summarization", () => {
    const flags = deriveBehaviorFlags({
      personaId: "mommy",
      memories: DURABLE_PREFS,
    });

    // Same flags, no summary vs. after N summarization cycles (summary text
    // grows/changes but must not leak into behavioral decisions).
    const fresh = buildSystemPrompt({ personaId: "mommy", behaviorFlags: flags });
    const summarized = buildSystemPrompt({
      personaId: "mommy",
      behaviorFlags: flags,
      previousContext:
        "The user discussed project deadlines, then asked for code review help. Emma teased them about procrastinating.",
    });

    const directiveBlock = (p: string) =>
      p.includes("## Behavior Directives") ? p.slice(p.indexOf("## Behavior Directives")) : "";
    expect(directiveBlock(fresh)).toBe(directiveBlock(summarized));
  });

  it("flags derive only from structured state, never from summary prose", () => {
    // A summary claiming the user loves emojis must not override the stored
    // preference — summaries are LLM text, not state (ADR data-sources rule).
    const flags = deriveBehaviorFlags({
      personaId: "mommy",
      memories: [pref("emoji_preference", "dislikes emojis", 1000)],
      // deriveBehaviorFlags has no summary input by design — this asserts the
      // signature itself: only memories/emotion/persona/time exist.
    });
    expect(flags.emojiUsage).toBe("none");
  });
});

// ─── Session reloads ─────────────────────────────────────────────────────────

describe("character consistency — session reloads", () => {
  it("same persisted memories reproduce identical flags in a fresh session", () => {
    // Sessions share nothing but the DB — flags must be a pure function of
    // reloaded state.
    const sessionA = deriveBehaviorFlags({
      personaId: "mommy",
      memories: DURABLE_PREFS,
      localHour: 10,
    });
    const sessionB = deriveBehaviorFlags({
      personaId: "mommy",
      memories: [...DURABLE_PREFS].reverse(), // DB row order must not matter
      localHour: 10,
    });
    expect(sessionA).toEqual(sessionB);
  });
});

// ─── Memory updates ──────────────────────────────────────────────────────────

describe("character consistency — memory updates", () => {
  it("a new preference changes exactly the flags it concerns", () => {
    const before = deriveBehaviorFlags({ personaId: "mommy", memories: DURABLE_PREFS });
    const after = deriveBehaviorFlags({
      personaId: "mommy",
      memories: [...DURABLE_PREFS, pref("teasing_preference", "please stop teasing me", 3000)],
    });

    expect(after.teasingLevel).toBe("off"); // the concerned flag changed
    expect(after.emojiUsage).toBe(before.emojiUsage); // everything else held
    expect(after.verbosity).toBe(before.verbosity);
    expect(after.initiative).toBe(before.initiative);
  });

  it("a superseding preference flips behavior the reference-architecture way (interaction_vibe)", () => {
    const playful = deriveBehaviorFlags({
      personaId: "mommy",
      memories: [pref("interaction_vibe", "playful", 1000)],
    });
    expect(playful.teasingLevel).toBe("playful");

    const warm = deriveBehaviorFlags({
      personaId: "mommy",
      memories: [pref("interaction_vibe", "warm", 2000)],
    });
    expect(warm.teasingLevel).toBe("off");
    expect(warm.warmth).toBe("elevated");
  });
});

// ─── Emotion transitions ─────────────────────────────────────────────────────

describe("character consistency — emotion transitions", () => {
  it("sad → neutral → happy produces the expected teasing trajectory", () => {
    const trajectory = [emotion(-0.7, 0.2), emotion(0.0, 0.3), emotion(0.8, 0.7)].map(
      (e) =>
        deriveBehaviorFlags({ personaId: "mommy", emotionState: e, localHour: 14 }).teasingLevel
    );
    expect(trajectory).toEqual(["off", "playful", "playful"]);
  });

  it("emotion transitions never touch durable style flags", () => {
    const results = [emotion(-0.9, 0.9), emotion(0.9, 0.9), emotion(0, 0)].map((e) =>
      deriveBehaviorFlags({ personaId: "mommy", memories: DURABLE_PREFS, emotionState: e })
    );
    for (const flags of results) {
      expect(flags.emojiUsage).toBe("none");
      expect(flags.verbosity).toBe("concise");
    }
  });
});

// ─── Prompt stability ────────────────────────────────────────────────────────

describe("character consistency — prompt stability", () => {
  const STABLE_FLAGS: BehaviorFlags = {
    verbosity: "concise",
    emojiUsage: "none",
    teasingLevel: "playful",
    warmth: "standard",
    initiative: "forward",
  };

  it("identical context always renders the identical prompt (no nondeterminism)", () => {
    const ctx = { personaId: "mommy" as const, behaviorFlags: STABLE_FLAGS };
    expect(buildSystemPrompt(ctx)).toBe(buildSystemPrompt(ctx));
  });

  it("directives land in the dynamic block, preserving the stable/cacheable split", () => {
    const blocks = buildSystemPromptBlocks({
      personaId: "mommy",
      behaviorFlags: STABLE_FLAGS,
    });
    expect(blocks.length).toBe(2);
    expect(blocks[0].text).not.toContain("## Behavior Directives");
    expect(blocks[1].text).toContain("## Behavior Directives");
  });

  it("baseline flags add zero prompt weight", () => {
    const without = buildSystemPrompt({ personaId: "mommy" });
    const withBaseline = buildSystemPrompt({
      personaId: "mommy",
      behaviorFlags: deriveBehaviorFlags({ personaId: "mommy" }),
    });
    expect(withBaseline).toBe(without);
  });

  it("the emotion block no longer carries behavioral instructions (moved to directives)", () => {
    const prompt = buildSystemPrompt({
      personaId: "mommy",
      emotionState: emotion(-0.7, 0.2),
      behaviorFlags: deriveBehaviorFlags({
        personaId: "mommy",
        emotionState: emotion(-0.7, 0.2),
      }),
    });
    expect(prompt).not.toContain("Adapt your tone accordingly");
    expect(prompt).toContain("## Behavior Directives");
    expect(prompt).toContain("Lead with care and empathy");
  });
});
