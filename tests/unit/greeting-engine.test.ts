import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// greeting-engine uses localStorage and Date — mock both for determinism
const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    clear: () => {
      store = {};
    },
  };
})();

vi.stubGlobal("window", { localStorage: mockLocalStorage });
vi.stubGlobal("localStorage", mockLocalStorage);

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

describe("generateGreeting", () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns first-visit greeting when localStorage is empty", async () => {
    const { generateGreeting } = await import("@/core/greeting-engine");
    const result = generateGreeting("mommy", []);
    expect(result).toContain("I'm Emma");
  });

  it("returns a string for neutral persona regardless of memories", async () => {
    const { generateGreeting } = await import("@/core/greeting-engine");
    const result = generateGreeting("neutral", [mem("goal", "launch_app", "launch the app")]);
    expect(result).toBe("Hey, I'm Emma. What can I do for you?");
  });

  it("returns a non-empty string for returning user with no memories", async () => {
    mockLocalStorage.setItem("emma_last_session", String(Date.now() - 3 * 3600 * 1000));
    const { generateGreeting } = await import("@/core/greeting-engine");
    const result = generateGreeting("mommy", []);
    expect(result.length).toBeGreaterThan(0);
  });

  it("appends a goal follow-up when confidence is high and random allows", async () => {
    mockLocalStorage.setItem("emma_last_session", String(Date.now() - 3 * 3600 * 1000));
    vi.spyOn(Math, "random").mockReturnValue(0.8); // > 0.5 → enrichment fires; > 0.6 → no name swap

    const { generateGreeting } = await import("@/core/greeting-engine");
    const result = generateGreeting("mommy", [mem("goal", "job_search", "finding a new job")]);

    expect(result).toContain("finding a new job");
    expect(result).toContain("coming along");
  });

  it("appends a relationship follow-up with extracted name", async () => {
    mockLocalStorage.setItem("emma_last_session", String(Date.now() - 3 * 3600 * 1000));
    vi.spyOn(Math, "random").mockReturnValue(0.8);

    const { generateGreeting } = await import("@/core/greeting-engine");
    const result = generateGreeting("mommy", [
      mem("relationship", "partner_name", "Alex is my partner"),
    ]);

    expect(result).toContain("Alex");
  });

  it("skips memory enrichment when random is <= 0.5", async () => {
    mockLocalStorage.setItem("emma_last_session", String(Date.now() - 3 * 3600 * 1000));
    vi.spyOn(Math, "random").mockReturnValue(0.3); // <= 0.5 → enrichment skipped

    const { generateGreeting } = await import("@/core/greeting-engine");
    const result = generateGreeting("mommy", [mem("goal", "job_search", "finding a new job")]);

    expect(result).not.toContain("finding a new job");
  });

  it("skips memory enrichment on first visit", async () => {
    const { generateGreeting } = await import("@/core/greeting-engine");
    const result = generateGreeting("mommy", [mem("goal", "job_search", "finding a new job")]);
    expect(result).toContain("I'm Emma");
    expect(result).not.toContain("finding a new job");
  });

  it("skips low-confidence memories (below 0.75)", async () => {
    mockLocalStorage.setItem("emma_last_session", String(Date.now() - 3 * 3600 * 1000));
    vi.spyOn(Math, "random").mockReturnValue(0.8);

    const { generateGreeting } = await import("@/core/greeting-engine");
    const result = generateGreeting("mommy", [mem("goal", "vague_thing", "something vague", 0.5)]);

    expect(result).not.toContain("something vague");
  });
});
