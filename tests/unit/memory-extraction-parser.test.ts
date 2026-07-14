import { describe, it, expect, vi, afterEach } from "vitest";
import { parseMemoryExtraction } from "@/core/memory-extraction-parser";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseMemoryExtraction — official contract: {memories: [...]}", () => {
  it("parses a well-formed object-wrapped response", () => {
    const raw = JSON.stringify({
      memories: [
        { category: "habit", key: "wake_up_time", value: "6am", confidence: 0.9 },
        { category: "goal", key: "learn_spanish", value: "learning Spanish", confidence: 0.85 },
      ],
    });

    const result = parseMemoryExtraction(raw);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      category: "habit",
      key: "wake_up_time",
      value: "6am",
      confidence: 0.9,
    });
  });

  it("parses an empty memories array without error", () => {
    const result = parseMemoryExtraction('{"memories":[]}');
    expect(result).toEqual([]);
  });
});

describe("parseMemoryExtraction — defensive parsing (P2 regression: parsed.filter crash)", () => {
  it("does not throw and returns [] on malformed JSON", () => {
    expect(() => parseMemoryExtraction("not json at all")).not.toThrow();
    expect(parseMemoryExtraction("not json at all")).toEqual([]);
  });

  it("does not throw and returns [] on an empty object (missing memories key)", () => {
    expect(() => parseMemoryExtraction("{}")).not.toThrow();
    expect(parseMemoryExtraction("{}")).toEqual([]);
  });

  it("tolerates a bare array — the exact shape the live model was observed to return", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const raw = JSON.stringify([
      { category: "habit", key: "wake_up_time", value: "6am", confidence: 0.9 },
    ]);

    const result = parseMemoryExtraction(raw);

    expect(result).toEqual([
      { category: "habit", key: "wake_up_time", value: "6am", confidence: 0.9 },
    ]);
  });

  it("tolerates an empty bare array", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(parseMemoryExtraction("[]")).toEqual([]);
  });

  it("drops items with missing fields instead of crashing the whole batch", () => {
    const raw = JSON.stringify({
      memories: [
        { category: "habit", key: "wake_up_time", value: "6am", confidence: 0.9 },
        { category: "habit", key: "missing_value" }, // no value, no confidence
      ],
    });

    const result = parseMemoryExtraction(raw);

    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("wake_up_time");
  });

  it("drops items with invalid confidence values (out of range, wrong type, missing)", () => {
    const raw = JSON.stringify({
      memories: [
        { category: "habit", key: "a", value: "v", confidence: 1.5 }, // out of range
        { category: "habit", key: "b", value: "v", confidence: -0.1 }, // out of range
        { category: "habit", key: "c", value: "v", confidence: "high" }, // wrong type
        { category: "habit", key: "d", value: "v" }, // missing
        { category: "habit", key: "e", value: "v", confidence: 0.7 }, // valid
      ],
    });

    const result = parseMemoryExtraction(raw);

    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("e");
  });

  it("drops items with unknown/invalid categories", () => {
    const raw = JSON.stringify({
      memories: [
        { category: "not_a_real_category", key: "a", value: "v", confidence: 0.9 },
        { category: "habit", key: "b", value: "v", confidence: 0.9 },
      ],
    });

    const result = parseMemoryExtraction(raw);

    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("b");
  });

  it("returns [] for a typo'd wrapper key ({memory: [...]} instead of {memories: [...]})", () => {
    const raw = JSON.stringify({
      memory: [{ category: "habit", key: "a", value: "v", confidence: 0.9 }],
    });

    expect(parseMemoryExtraction(raw)).toEqual([]);
  });

  it("returns [] for an unrelated JSON shape (e.g. a number or string)", () => {
    expect(parseMemoryExtraction("42")).toEqual([]);
    expect(parseMemoryExtraction('"just a string"')).toEqual([]);
  });

  it("never throws regardless of input — the exact guarantee that fixes the TypeError crash", () => {
    const inputs = [
      "",
      "null",
      "undefined",
      "{",
      "[{}]",
      '{"memories": null}',
      '{"memories": "not an array"}',
      '{"memories": [null, undefined, 42, "string", []]}',
    ];

    for (const input of inputs) {
      expect(() => parseMemoryExtraction(input)).not.toThrow();
    }
  });
});
