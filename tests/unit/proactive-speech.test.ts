import { describe, it, expect } from "vitest";
import type { MemoryEntry } from "@/types/emma";
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

// Mirrors the teasing markers the response validator checks for.
const TEASING_PATTERNS = [/\bbaby\b/i, /(^|[.!?]\s+)mmm\b/i, /(^|[.!?]\s+)ahh\b/i, /😏|😘/u];

function hasTeasing(text: string): boolean {
  return TEASING_PATTERNS.some((p) => p.test(text));
}

function mem(
  category: MemoryEntry["category"],
  key: string,
  value: string,
  confidence = 0.9
): MemoryEntry {
  return {
    id: `m-${key}`,
    timestamp: Date.now(),
    category,
    key,
    value,
    confidence,
    source: "extracted",
  };
}

describe("buildMemoryIdleComment", () => {
  it("returns null when memories array is empty", async () => {
    const { buildMemoryIdleComment } = await import("@/core/proactive-speech");
    expect(buildMemoryIdleComment([])).toBeNull();
  });

  it("returns null when all memories are below confidence threshold", async () => {
    const { buildMemoryIdleComment } = await import("@/core/proactive-speech");
    expect(buildMemoryIdleComment([mem("goal", "g", "launch the app", 0.5)])).toBeNull();
  });

  it("generates a goal-based comment containing the goal text", async () => {
    const { buildMemoryIdleComment } = await import("@/core/proactive-speech");
    const result = buildMemoryIdleComment([mem("goal", "job_search", "finding a new job")]);
    expect(result).not.toBeNull();
    expect(result).toContain("finding a new job");
  });

  it("generates a relationship comment with the extracted name", async () => {
    const { buildMemoryIdleComment } = await import("@/core/proactive-speech");
    const result = buildMemoryIdleComment([mem("relationship", "partner", "Alex is my partner")]);
    expect(result).not.toBeNull();
    expect(result).toContain("Alex");
  });

  it("generates a habit comment containing the habit text", async () => {
    const { buildMemoryIdleComment } = await import("@/core/proactive-speech");
    const result = buildMemoryIdleComment([mem("habit", "routine", "morning run")]);
    expect(result).not.toBeNull();
    expect(result).toContain("morning run");
  });

  it("prioritises goal over relationship and habit", async () => {
    const { buildMemoryIdleComment } = await import("@/core/proactive-speech");
    const result = buildMemoryIdleComment([
      mem("habit", "h", "evening yoga"),
      mem("relationship", "partner", "Alex"),
      mem("goal", "g", "ship the MVP"),
    ]);
    expect(result).toContain("ship the MVP");
  });

  it("falls back to relationship when no goal exists", async () => {
    const { buildMemoryIdleComment } = await import("@/core/proactive-speech");
    const result = buildMemoryIdleComment([
      mem("habit", "h", "evening yoga"),
      mem("relationship", "partner", "Jordan is my partner"),
    ]);
    expect(result).toContain("Jordan");
  });

  it("neutral persona goal comment contains no mommy voice", async () => {
    const { buildMemoryIdleComment } = await import("@/core/proactive-speech");
    const result = buildMemoryIdleComment([mem("goal", "g", "launch the app")], "neutral");
    expect(result).not.toBeNull();
    expect(result).not.toContain("Mmm");
    expect(result).toContain("launch the app");
  });

  it("neutral persona relationship comment skips 'You've been quiet'", async () => {
    const { buildMemoryIdleComment } = await import("@/core/proactive-speech");
    const result = buildMemoryIdleComment(
      [mem("relationship", "partner", "Alex is my partner")],
      "neutral"
    );
    expect(result).not.toBeNull();
    expect(result).not.toContain("You've been quiet");
    expect(result).toContain("Alex");
  });

  it("mommy persona goal comment retains Mmm voice", async () => {
    const { buildMemoryIdleComment } = await import("@/core/proactive-speech");
    const result = buildMemoryIdleComment([mem("goal", "g", "finish the project")], "mommy");
    expect(result).toContain("Mmm");
  });

  it("soft mode drops the Mmm prefix from the mommy goal comment", async () => {
    const { buildMemoryIdleComment } = await import("@/core/proactive-speech");
    const result = buildMemoryIdleComment([mem("goal", "g", "finish the project")], "mommy", true);
    expect(result).not.toBeNull();
    expect(result).toContain("finish the project");
    expect(hasTeasing(result!)).toBe(false);
  });
});

describe("selectProactiveBanks", () => {
  it("mommy default banks keep the teasing voice", async () => {
    const { selectProactiveBanks } = await import("@/core/proactive-speech");
    const banks = selectProactiveBanks("mommy");
    const allTexts = [...banks.idleComments, ...banks.idleConcern, ...banks.lateNightNudge].map(
      (m) => m.text
    );
    expect(allTexts.some((t) => hasTeasing(t))).toBe(true);
  });

  it("mommy teasing-off banks contain zero teasing markers", async () => {
    const { selectProactiveBanks } = await import("@/core/proactive-speech");
    const banks = selectProactiveBanks("mommy", flags({ teasingLevel: "off" }));
    for (const bank of [banks.idleComments, banks.idleConcern, banks.lateNightNudge]) {
      expect(bank.length).toBeGreaterThan(0);
      for (const msg of bank) {
        expect(hasTeasing(msg.text), `"${msg.text}"`).toBe(false);
      }
    }
  });

  it("light and playful teasing keep the default mommy banks", async () => {
    const { selectProactiveBanks } = await import("@/core/proactive-speech");
    const playful = selectProactiveBanks("mommy", flags({ teasingLevel: "playful" }));
    const light = selectProactiveBanks("mommy", flags({ teasingLevel: "light" }));
    const unflagged = selectProactiveBanks("mommy");
    expect(playful.idleComments).toBe(unflagged.idleComments);
    expect(light.idleComments).toBe(unflagged.idleComments);
  });

  it("neutral banks are unchanged regardless of flags", async () => {
    const { selectProactiveBanks } = await import("@/core/proactive-speech");
    const withFlags = selectProactiveBanks("neutral", flags({ teasingLevel: "off" }));
    const without = selectProactiveBanks("neutral");
    expect(withFlags.idleComments).toBe(without.idleComments);
    expect(withFlags.idleConcern).toBe(without.idleConcern);
    expect(withFlags.lateNightNudge).toBe(without.lateNightNudge);
  });
});

describe("shouldSkipPlayfulIdle", () => {
  it("skips the playful idle comment during distress (warmth elevated)", async () => {
    const { shouldSkipPlayfulIdle } = await import("@/core/proactive-speech");
    expect(shouldSkipPlayfulIdle(flags({ warmth: "elevated" }))).toBe(true);
  });

  it("does not skip at standard warmth or without flags", async () => {
    const { shouldSkipPlayfulIdle } = await import("@/core/proactive-speech");
    expect(shouldSkipPlayfulIdle(flags())).toBe(false);
    expect(shouldSkipPlayfulIdle(undefined)).toBe(false);
  });
});
