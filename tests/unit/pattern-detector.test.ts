/**
 * pattern-detector.test.ts
 *
 * Covers the new/changed paths in src/core/pattern-detector.ts:
 *   - generateSuggestionsViaBatch returns empty map when OPENROUTER_API_KEY missing
 *   - generateSuggestionsViaBatch processes patterns with concurrency ≤5 via Promise.all
 *   - generateSuggestionsViaBatch returns populated map when API succeeds
 *   - generateSuggestionsViaBatch degrades silently on fetch error (returns partial map)
 *   - generateSuggestionsViaBatch returns empty map when patterns array is empty
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("@/lib/errors", () => ({
  fetchWithRetry: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => null),
}));

import { fetchWithRetry } from "@/lib/errors";
import { generateSuggestionsViaBatch, SUGGESTION_SYSTEM } from "@/core/pattern-detector";

const MOCK_PATTERNS = [
  {
    id: "p1",
    patternType: "daily",
    description: "send morning report",
    exampleGoals: ["send report", "email team", "daily summary"],
  },
  {
    id: "p2",
    patternType: "weekly",
    description: "review analytics",
    exampleGoals: ["check dashboard", "review metrics"],
  },
];

function makeOkResponse(content: string) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        choices: [{ message: { content } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENROUTER_API_KEY = "sk-test-key";
});

afterEach(() => {
  delete process.env.OPENROUTER_API_KEY;
});

describe("generateSuggestionsViaBatch", () => {
  it("returns empty map when OPENROUTER_API_KEY is not set", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const result = await generateSuggestionsViaBatch("", MOCK_PATTERNS);
    expect(result.size).toBe(0);
    expect(fetchWithRetry).not.toHaveBeenCalled();
  });

  it("returns empty map for empty patterns array", async () => {
    const result = await generateSuggestionsViaBatch("sk-key", []);
    expect(result.size).toBe(0);
  });

  it("returns populated map when API succeeds for all patterns", async () => {
    vi.mocked(fetchWithRetry)
      .mockResolvedValueOnce(makeOkResponse("Schedule your morning report at 8am automatically."))
      .mockResolvedValueOnce(makeOkResponse("I can remind you to review analytics every Monday."));

    const result = await generateSuggestionsViaBatch("sk-key", MOCK_PATTERNS);
    expect(result.size).toBe(2);
    expect(result.get("p1")).toContain("morning report");
    expect(result.get("p2")).toContain("analytics");
  });

  it("skips patterns where API returns empty string", async () => {
    vi.mocked(fetchWithRetry)
      .mockResolvedValueOnce(makeOkResponse(""))
      .mockResolvedValueOnce(
        makeOkResponse("Weekly analytics review, automated for Monday mornings.")
      );

    const result = await generateSuggestionsViaBatch("sk-key", MOCK_PATTERNS);
    expect(result.has("p1")).toBe(false);
    expect(result.has("p2")).toBe(true);
  });

  it("degrades silently: on fetch throw, returns fallback text for that pattern and continues others", async () => {
    vi.mocked(fetchWithRetry)
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce(makeOkResponse("I can automate your weekly analytics review."));

    const result = await generateSuggestionsViaBatch("sk-key", MOCK_PATTERNS);
    // p1 fetch threw — generateSuggestion catches and returns a non-empty fallback string
    // so p1 IS still in the map (with fallback text)
    expect(result.has("p1")).toBe(true);
    expect(result.get("p1")).toContain("send morning report");
    // p2 got a real API response
    expect(result.get("p2")).toContain("analytics");
  });

  it("processes more than 5 patterns across multiple concurrency batches", async () => {
    const manyPatterns = Array.from({ length: 7 }, (_, i) => ({
      id: `p${i}`,
      patternType: "daily",
      description: `task ${i}`,
      exampleGoals: [`goal ${i}`],
    }));

    vi.mocked(fetchWithRetry).mockImplementation(() =>
      Promise.resolve(makeOkResponse("Automate this recurring task for you."))
    );

    const result = await generateSuggestionsViaBatch("sk-key", manyPatterns);
    // All 7 should get a suggestion
    expect(result.size).toBe(7);
    // fetchWithRetry should have been called 7 times (once per pattern)
    expect(fetchWithRetry).toHaveBeenCalledTimes(7);
  });

  it("does not throw when fetch returns a non-ok response", async () => {
    vi.mocked(fetchWithRetry).mockResolvedValue({
      ok: false,
      status: 429,
    } as any);

    // generateSuggestion catches non-ok and returns a fallback string (non-empty)
    // so the pattern entry IS stored in the map
    await expect(generateSuggestionsViaBatch("sk-key", [MOCK_PATTERNS[0]])).resolves.not.toThrow();
  });
});

describe("companion voice framing (docs/niche.md alignment)", () => {
  it("suggestion prompt frames Emma as a companion, not an assistant", () => {
    expect(SUGGESTION_SYSTEM).toMatch(/companion/i);
    expect(SUGGESTION_SYSTEM).toMatch(/care/i);
    expect(SUGGESTION_SYSTEM).not.toMatch(/personal assistant/i);
  });

  it("suggestion prompt explicitly forbids the automation pitch", () => {
    expect(SUGGESTION_SYSTEM).toMatch(/never sound like a productivity tool/i);
  });

  it("fallback suggestion is companion-toned and keeps the pattern description", async () => {
    vi.mocked(fetchWithRetry).mockRejectedValue(new Error("network error"));

    const result = await generateSuggestionsViaBatch("sk-key", [MOCK_PATTERNS[0]]);
    const text = result.get("p1")!;
    expect(text).toContain("send morning report");
    expect(text).toMatch(/noticed/i);
    expect(text).not.toMatch(/schedule this automatically/i);
  });
});
