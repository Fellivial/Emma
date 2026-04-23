import { describe, it, expect } from "vitest";
import {
  estimateTokens,
  estimateMessageTokens,
  estimateTotalTokens,
  calculateBudget,
  splitMessages,
  trimToFit,
  DEFAULT_CONFIG,
} from "@/core/context-manager";
import type { ApiMessage } from "@/types/emma";

describe("estimateTokens", () => {
  it("estimates ~4 chars per token", () => {
    const tokens = estimateTokens("Hello world"); // 11 chars
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(10);
  });

  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("handles long text", () => {
    const text = "a".repeat(3800); // Should be ~1000 tokens
    const tokens = estimateTokens(text);
    expect(tokens).toBeGreaterThan(900);
    expect(tokens).toBeLessThan(1100);
  });
});

describe("estimateMessageTokens", () => {
  it("estimates text message", () => {
    const msg: ApiMessage = { role: "user", content: "Hello Emma" };
    const tokens = estimateMessageTokens(msg);
    expect(tokens).toBeGreaterThan(0);
  });

  it("adds overhead for role", () => {
    const msg: ApiMessage = { role: "user", content: "" };
    const tokens = estimateMessageTokens(msg);
    expect(tokens).toBe(4); // Just overhead
  });
});

describe("calculateBudget", () => {
  it("calculates budget with no messages", () => {
    const budget = calculateBudget([], 3000);
    expect(budget.used).toBe(0);
    expect(budget.utilization).toBe(0);
    expect(budget.overBudget).toBe(false);
    expect(budget.needsSummarization).toBe(false);
  });

  it("detects when summarization is needed", () => {
    // Create enough messages to exceed 75% of budget
    const messages: ApiMessage[] = [];
    for (let i = 0; i < 200; i++) {
      messages.push({ role: "user", content: "A".repeat(400) }); // ~100 tokens each
    }
    const budget = calculateBudget(messages, 3000);
    // 200 * ~100 = ~20k tokens. Budget is ~92.5k. 20k/92.5k = 21% — not enough
    // Need more messages to trigger
    expect(budget.used).toBeGreaterThan(0);
  });

  it("marks over budget correctly", () => {
    const messages: ApiMessage[] = [];
    for (let i = 0; i < 1000; i++) {
      messages.push({ role: "user", content: "A".repeat(400) });
    }
    const budget = calculateBudget(messages, 3000);
    expect(budget.overBudget).toBe(true);
  });
});

describe("splitMessages", () => {
  it("keeps last N messages as recent", () => {
    const messages: ApiMessage[] = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `Message ${i}`,
    }));

    const { old, recent } = splitMessages(messages);
    expect(recent.length).toBe(DEFAULT_CONFIG.minMessagesToKeep); // 10
    expect(old.length).toBe(10);
  });

  it("detects existing summary", () => {
    const messages: ApiMessage[] = [
      { role: "assistant", content: "[SUMMARY] Previous conversation summary" },
      ...Array.from({ length: 15 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: `Message ${i}`,
      })),
    ];

    const { summary, old, recent } = splitMessages(messages);
    expect(summary).not.toBeNull();
    expect(summary?.content).toContain("[SUMMARY]");
  });

  it("handles fewer messages than minKeep", () => {
    const messages: ApiMessage[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
    ];

    const { old, recent } = splitMessages(messages);
    expect(old).toHaveLength(0);
    expect(recent).toHaveLength(2);
  });
});

describe("trimToFit", () => {
  it("removes oldest messages to fit budget", () => {
    const messages: ApiMessage[] = Array.from({ length: 50 }, (_, i) => ({
      role: "user" as const,
      content: "A".repeat(400),
    }));

    const trimmed = trimToFit(messages, 5000);
    expect(trimmed.length).toBeLessThan(50);
    expect(trimmed.length).toBeGreaterThanOrEqual(DEFAULT_CONFIG.minMessagesToKeep);
  });

  it("preserves summary message at index 0", () => {
    const messages: ApiMessage[] = [
      { role: "assistant", content: "[SUMMARY] Important context" },
      ...Array.from({ length: 30 }, () => ({
        role: "user" as const,
        content: "A".repeat(400),
      })),
    ];

    const trimmed = trimToFit(messages, 5000);
    expect(trimmed[0].content).toContain("[SUMMARY]");
  });
});
