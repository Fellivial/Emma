// Response validator — ADR 0001. Confirms (never rewrites) that a response
// honored the behavior flags it was generated under.

import { describe, it, expect } from "vitest";
import { validateResponseBehavior } from "@/core/response-validator";
import type { BehaviorFlags } from "@/core/behavior-flags";

function flags(overrides: Partial<BehaviorFlags> = {}): BehaviorFlags {
  return {
    verbosity: "normal",
    emojiUsage: "minimal",
    teasingLevel: "playful",
    warmth: "standard",
    initiative: "forward",
    ...overrides,
  };
}

describe("validateResponseBehavior — emoji policy", () => {
  it("flags emoji use when policy is none", () => {
    const result = validateResponseBehavior("Sounds great! 🎉", flags({ emojiUsage: "none" }));
    expect(result.consistent).toBe(false);
    expect(result.violations).toContain("emoji_used_when_none");
  });

  it("passes emoji-free text when policy is none", () => {
    const result = validateResponseBehavior("Sounds great!", flags({ emojiUsage: "none" }));
    expect(result.consistent).toBe(true);
  });

  it("does not police emojis under minimal or normal policies", () => {
    expect(validateResponseBehavior("Nice 🎉", flags({ emojiUsage: "minimal" })).consistent).toBe(
      true
    );
    expect(validateResponseBehavior("Nice 🎉", flags({ emojiUsage: "normal" })).consistent).toBe(
      true
    );
  });
});

describe("validateResponseBehavior — verbosity", () => {
  const LONG_PROSE =
    "First sentence here. Second sentence follows. Third one arrives. Fourth is pushing it. Fifth is clearly too much. Sixth seals it.";

  it("flags long prose under concise", () => {
    const result = validateResponseBehavior(LONG_PROSE, flags({ verbosity: "concise" }));
    expect(result.violations).toContain("too_long_for_concise");
  });

  it("passes short prose under concise", () => {
    const result = validateResponseBehavior(
      "Done. Anything else?",
      flags({ verbosity: "concise" })
    );
    expect(result.consistent).toBe(true);
  });

  it("skips length checks for structured responses (code)", () => {
    const code = "Here you go.\n```ts\nconst a = 1;\nconst b = 2;\n```\n" + LONG_PROSE;
    const result = validateResponseBehavior(code, flags({ verbosity: "concise" }));
    expect(result.violations).not.toContain("too_long_for_concise");
  });

  it("skips length checks for structured responses (lists)", () => {
    const list = "Steps:\n- one thing\n- another thing\n" + LONG_PROSE;
    const result = validateResponseBehavior(list, flags({ verbosity: "concise" }));
    expect(result.violations).not.toContain("too_long_for_concise");
  });

  it("never length-flags verbose mode", () => {
    const result = validateResponseBehavior(
      LONG_PROSE + " " + LONG_PROSE,
      flags({ verbosity: "verbose" })
    );
    expect(result.consistent).toBe(true);
  });
});

describe("validateResponseBehavior — teasing suppression", () => {
  it("flags 'baby' when teasing is off", () => {
    const result = validateResponseBehavior(
      "Come on, baby. You've got this.",
      flags({ teasingLevel: "off" })
    );
    expect(result.violations).toContain("teasing_when_off");
  });

  it("flags sentence-opening 'Mmm' when teasing is off", () => {
    const result = validateResponseBehavior(
      "Mmm. Interesting choice.",
      flags({ teasingLevel: "off" })
    );
    expect(result.violations).toContain("teasing_when_off");
  });

  it("does not flag 'mmm' mid-sentence (not the persona tic)", () => {
    const result = validateResponseBehavior(
      "The hmmm-worthy part is the query plan.",
      flags({ teasingLevel: "off" })
    );
    expect(result.violations).not.toContain("teasing_when_off");
  });

  it("does not flag 'baby' inside another word", () => {
    const result = validateResponseBehavior(
      "The babysitter arrives at six.",
      flags({ teasingLevel: "off" })
    );
    expect(result.violations).not.toContain("teasing_when_off");
  });

  it("allows teasing markers when teasing is playful", () => {
    const result = validateResponseBehavior(
      "Mmm. Look who finally showed up, baby.",
      flags({ teasingLevel: "playful" })
    );
    expect(result.consistent).toBe(true);
  });
});

describe("validateResponseBehavior — combined", () => {
  it("reports multiple violations at once", () => {
    const result = validateResponseBehavior(
      "Mmm. Missing you, baby 😘",
      flags({ teasingLevel: "off", emojiUsage: "none" })
    );
    expect(result.consistent).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining(["emoji_used_when_none", "teasing_when_off"])
    );
  });
});
