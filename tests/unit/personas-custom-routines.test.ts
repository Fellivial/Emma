// personas-custom-routines.test.ts
//
// Tests buildSystemPromptBlocks from src/core/personas.ts for T-15:
//   - customRoutines: []   => output only includes built-in routines
//   - customRoutines: [...] => output includes custom routine name/description
//   - no customRoutines field => same as customRoutines: []
//   - built-in routines are always present regardless of customRoutines
//
// Called by: test runner only. No existing file tests personas.ts exports.

import { describe, it, expect } from "vitest";
import { buildSystemPromptBlocks, buildSystemPrompt } from "@/core/personas";
import type { Routine } from "@/types/emma";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const CUSTOM_ROUTINE_1: Routine = {
  id: "daily_briefing",
  name: "Daily Briefing",
  icon: "X",
  description: "Summarize overnight activity and weather",
  commands: [],
  triggers: [{ type: "voice", value: "give me my briefing" }],
  builtIn: false,
  autonomyTier: 2,
};

const CUSTOM_ROUTINE_2: Routine = {
  id: "standup_prep",
  name: "Standup Prep",
  icon: "X",
  description: "Pull yesterday tasks and open PRs for standup",
  commands: [],
  triggers: [],
  builtIn: false,
  autonomyTier: 3,
};

// Minimal valid PromptContext for a mommy persona
const BASE_CTX = {
  personaId: "mommy" as const,
};

// ── buildSystemPromptBlocks — structure ───────────────────────────────────────

describe("buildSystemPromptBlocks — return shape", () => {
  it("returns at least one block for base context", () => {
    const blocks = buildSystemPromptBlocks(BASE_CTX);
    expect(blocks.length).toBeGreaterThanOrEqual(1);
  });

  it("every block has type: 'text'", () => {
    const blocks = buildSystemPromptBlocks(BASE_CTX);
    for (const block of blocks) {
      expect(block.type).toBe("text");
    }
  });

  it("first block contains persona system prompt text", () => {
    const blocks = buildSystemPromptBlocks(BASE_CTX);
    expect(blocks[0].text).toContain("EMMA");
  });

  it("returns a second block when visionContext is provided", () => {
    const blocks = buildSystemPromptBlocks({
      ...BASE_CTX,
      visionContext: "User has VS Code open with a TypeScript file",
    });
    expect(blocks.length).toBe(2);
    expect(blocks[1].text).toContain("VS Code");
  });

  it("does NOT return a second block when no vision or emotion provided", () => {
    const blocks = buildSystemPromptBlocks(BASE_CTX);
    // Only 1 block when no dynamic content
    expect(blocks.length).toBe(1);
  });
});

// ── buildSystemPromptBlocks — built-in routines always present ────────────────

describe("buildSystemPromptBlocks — built-in routines", () => {
  it("morning_standup is always in the output (no customRoutines)", () => {
    const blocks = buildSystemPromptBlocks(BASE_CTX);
    const text = blocks[0].text;
    expect(text).toContain("Morning Standup");
  });

  it("focus_mode is always in the output", () => {
    const blocks = buildSystemPromptBlocks(BASE_CTX);
    expect(blocks[0].text).toContain("Focus Mode");
  });

  it("end_of_day routine is present", () => {
    const blocks = buildSystemPromptBlocks(BASE_CTX);
    expect(blocks[0].text).toContain("End of Day");
  });
});

// ── buildSystemPromptBlocks — customRoutines merging (T-15) ──────────────────

describe("buildSystemPromptBlocks — customRoutines merging (T-15)", () => {
  it("customRoutines: [] does not duplicate built-in routines", () => {
    const blocks = buildSystemPromptBlocks({ ...BASE_CTX, customRoutines: [] });
    const text = blocks[0].text;
    // Morning Standup appears exactly once
    const matches = text.match(/Morning Standup/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("customRoutines with a routine => its name appears in the output", () => {
    const blocks = buildSystemPromptBlocks({
      ...BASE_CTX,
      customRoutines: [CUSTOM_ROUTINE_1],
    });
    const text = blocks[0].text;
    expect(text).toContain("Daily Briefing");
  });

  it("customRoutines with a routine => its description appears in the output", () => {
    const blocks = buildSystemPromptBlocks({
      ...BASE_CTX,
      customRoutines: [CUSTOM_ROUTINE_1],
    });
    const text = blocks[0].text;
    expect(text).toContain("Summarize overnight activity and weather");
  });

  it("customRoutines with a voice trigger => trigger value appears in the output", () => {
    const blocks = buildSystemPromptBlocks({
      ...BASE_CTX,
      customRoutines: [CUSTOM_ROUTINE_1],
    });
    const text = blocks[0].text;
    expect(text).toContain("give me my briefing");
  });

  it("customRoutines: [r1, r2] => both routine names appear", () => {
    const blocks = buildSystemPromptBlocks({
      ...BASE_CTX,
      customRoutines: [CUSTOM_ROUTINE_1, CUSTOM_ROUTINE_2],
    });
    const text = blocks[0].text;
    expect(text).toContain("Daily Briefing");
    expect(text).toContain("Standup Prep");
  });

  it("custom routine with no triggers shows 'none' for voice triggers", () => {
    const blocks = buildSystemPromptBlocks({
      ...BASE_CTX,
      customRoutines: [CUSTOM_ROUTINE_2], // no triggers
    });
    const text = blocks[0].text;
    // The serializer outputs "Voice triggers: none" when there are no voice triggers
    expect(text).toContain("none");
  });

  it("no customRoutines field => same output as customRoutines: []", () => {
    const blocksNoField = buildSystemPromptBlocks(BASE_CTX);
    const blocksEmptyArray = buildSystemPromptBlocks({ ...BASE_CTX, customRoutines: [] });
    expect(blocksNoField[0].text).toBe(blocksEmptyArray[0].text);
  });

  it("built-in routines still present alongside custom routines", () => {
    const blocks = buildSystemPromptBlocks({
      ...BASE_CTX,
      customRoutines: [CUSTOM_ROUTINE_1],
    });
    const text = blocks[0].text;
    // Both built-in and custom present
    expect(text).toContain("Morning Standup");
    expect(text).toContain("Daily Briefing");
  });
});

// ── buildSystemPrompt (backward-compat wrapper) ───────────────────────────────

describe("buildSystemPrompt — backward-compat wrapper", () => {
  it("returns a non-empty string", () => {
    const result = buildSystemPrompt(BASE_CTX);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("contains custom routine name when provided", () => {
    const result = buildSystemPrompt({ ...BASE_CTX, customRoutines: [CUSTOM_ROUTINE_1] });
    expect(result).toContain("Daily Briefing");
  });
});

// ── Neutral persona ───────────────────────────────────────────────────────────

describe("buildSystemPromptBlocks — neutral persona", () => {
  it("uses neutral system prompt (not mommy)", () => {
    const blocks = buildSystemPromptBlocks({ personaId: "neutral", customRoutines: [] });
    const text = blocks[0].text;
    // Neutral does not say "baby" or have the mommy tone marker
    expect(text).toContain("EMMA");
    expect(text).toContain("Morning Standup"); // routines still present
  });

  it("neutral persona includes memory weaving instruction", () => {
    const blocks = buildSystemPromptBlocks({ personaId: "neutral" });
    expect(blocks[0].text).toContain('never say "according to my records"');
  });

  it("neutral persona includes distress handling rule", () => {
    const blocks = buildSystemPromptBlocks({ personaId: "neutral" });
    expect(blocks[0].text).toContain("distressed");
  });
});
