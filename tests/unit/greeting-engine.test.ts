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

  it("returns a contextual first-visit greeting for neutral persona", async () => {
    const { generateGreeting } = await import("@/core/greeting-engine");
    const result = generateGreeting("neutral", [mem("goal", "launch_app", "launch the app")]);
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain("Emma");
  });

  it("returns a returning-user greeting for neutral persona without mommy-voice content", async () => {
    mockLocalStorage.setItem("emma_last_session", String(Date.now() - 3 * 3600 * 1000));
    const { generateGreeting } = await import("@/core/greeting-engine");
    const result = generateGreeting("neutral", []);
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toContain("baby");
    expect(result).not.toContain("Mmm");
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

  it("neutral greeting inserts user_name memory into greeting text", async () => {
    mockLocalStorage.setItem("emma_last_session", String(Date.now() - 3 * 3600 * 1000));
    // Fix hour=10 (morning) so the selected greeting starts with "Hey" and the
    // name-insertion regex always has a match regardless of when the test runs.
    vi.spyOn(Date.prototype, "getHours").mockReturnValue(10);
    vi.spyOn(Math, "random").mockReturnValue(0.9); // > 0.6 → name swap fires

    const { generateGreeting } = await import("@/core/greeting-engine");
    const result = generateGreeting("neutral", [mem("personal", "user_name", "Jordan")]);

    expect(result).toContain("Jordan");
  });

  it("mommy greeting swaps 'baby' for user_name memory value", async () => {
    mockLocalStorage.setItem("emma_last_session", String(Date.now() - 3 * 3600 * 1000));
    // Fix hour=10 (morning) → morning[2] = "Rise and shine, baby. …" which has "baby".
    vi.spyOn(Date.prototype, "getHours").mockReturnValue(10);
    vi.spyOn(Math, "random").mockReturnValue(0.9); // picks index 2 (floor(0.9*3)=2), fires name swap

    const { generateGreeting } = await import("@/core/greeting-engine");
    const result = generateGreeting("mommy", [mem("personal", "user_name", "Jordan")]);

    expect(result).toContain("Jordan");
    expect(result).not.toContain("baby");
  });
});

describe("generateGreeting with behavior flags", () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("teasing-off greeting has no teasing markers across hours and bank picks", async () => {
    const { generateGreeting } = await import("@/core/greeting-engine");
    const off = flags({ teasingLevel: "off" });

    for (const hour of [8, 14, 19, 22, 2]) {
      for (const rand of [0, 0.49, 0.99]) {
        vi.restoreAllMocks();
        vi.spyOn(Date.prototype, "getHours").mockReturnValue(hour);
        vi.spyOn(Math, "random").mockReturnValue(rand);
        // Re-seed a 3h-ago visit before each call — getSessionContext writes now.
        mockLocalStorage.setItem("emma_last_session", String(Date.now() - 3 * 3600 * 1000));

        const result = generateGreeting("mommy", [], off);
        expect(result.length).toBeGreaterThan(0);
        expect(hasTeasing(result), `hour=${hour} rand=${rand}: "${result}"`).toBe(false);
      }
    }
  });

  it("teasing-off first visit greeting is not flirty", async () => {
    const { generateGreeting } = await import("@/core/greeting-engine");
    const result = generateGreeting("mommy", [], flags({ teasingLevel: "off" }));
    expect(result).toContain("I'm Emma");
    expect(result).not.toContain("turn me on");
    expect(hasTeasing(result)).toBe(false);
  });

  it("teasing-off absence greetings stay warm without teasing", async () => {
    const { generateGreeting } = await import("@/core/greeting-engine");
    const off = flags({ teasingLevel: "off" });

    for (const hoursAgo of [0.5, 30, 100]) {
      for (const rand of [0, 0.99]) {
        vi.restoreAllMocks();
        vi.spyOn(Math, "random").mockReturnValue(rand);
        mockLocalStorage.setItem("emma_last_session", String(Date.now() - hoursAgo * 3600 * 1000));

        const result = generateGreeting("mommy", [], off);
        expect(result.length).toBeGreaterThan(0);
        expect(hasTeasing(result), `hoursAgo=${hoursAgo} rand=${rand}: "${result}"`).toBe(false);
      }
    }
  });

  it("playful flags keep the default teasing bank (absence structure intact)", async () => {
    mockLocalStorage.setItem("emma_last_session", String(Date.now() - 100 * 3600 * 1000));
    const { generateGreeting } = await import("@/core/greeting-engine");
    const result = generateGreeting("mommy", [], flags({ teasingLevel: "playful" }));
    expect(result).toMatch(/show up|been days/);
  });

  it("memory follow-up still appends when teasing is off", async () => {
    mockLocalStorage.setItem("emma_last_session", String(Date.now() - 3 * 3600 * 1000));
    vi.spyOn(Math, "random").mockReturnValue(0.8);

    const { generateGreeting } = await import("@/core/greeting-engine");
    const result = generateGreeting(
      "mommy",
      [mem("goal", "job_search", "finding a new job")],
      flags({ teasingLevel: "off" })
    );

    expect(result).toContain("finding a new job");
    expect(hasTeasing(result)).toBe(false);
  });

  it("omitting flags preserves the original teasing greeting behavior", async () => {
    const { generateGreeting } = await import("@/core/greeting-engine");
    const result = generateGreeting("mommy", []);
    expect(result).toContain("I'm Emma");
    expect(result).toContain("baby");
  });
});

describe("getGreetingExpression with behavior flags", () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("first visit softens from flirty to warm when teasing is off", async () => {
    const { getGreetingExpression } = await import("@/core/greeting-engine");
    expect(getGreetingExpression("mommy", flags({ teasingLevel: "off" }))).toBe("warm");
  });

  it("first visit stays flirty with playful flags", async () => {
    const { getGreetingExpression } = await import("@/core/greeting-engine");
    expect(getGreetingExpression("mommy", flags({ teasingLevel: "playful" }))).toBe("flirty");
  });

  it("elevated warmth softens the expression even when teasing is allowed", async () => {
    const { getGreetingExpression } = await import("@/core/greeting-engine");
    const expr = getGreetingExpression("mommy", flags({ warmth: "elevated" }));
    expect(expr).not.toBe("flirty");
    expect(expr).not.toBe("smirk");
  });

  it("very long absence maps to concerned instead of skeptical when softened", async () => {
    mockLocalStorage.setItem("emma_last_session", String(Date.now() - 100 * 3600 * 1000));
    const { getGreetingExpression } = await import("@/core/greeting-engine");
    expect(getGreetingExpression("mommy", flags({ teasingLevel: "off" }))).toBe("concerned");
  });
});
