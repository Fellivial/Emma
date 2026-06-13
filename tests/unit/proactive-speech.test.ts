import { describe, it, expect } from "vitest";
import type { MemoryEntry } from "@/types/emma";

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
});
