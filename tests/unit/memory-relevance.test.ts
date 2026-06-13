import { describe, it, expect, vi, beforeEach } from "vitest";
import { encrypt } from "@/core/security/encryption";

// Stable encryption key for test fixtures
const TEST_KEY = "a".repeat(64);
vi.stubEnv("EMMA_ENCRYPTION_KEY", TEST_KEY);

const USER_ID = "00000000-0000-0000-0000-000000000001";

function makeRow(key: string, value: string, confidence = 0.8, daysAgo = 0) {
  const created = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  return {
    id: `mem-${key}`,
    user_id: USER_ID,
    category: "personal",
    key,
    value: encrypt(value),
    confidence,
    source: "extracted",
    status: "active",
    created_at: created,
    updated_at: created,
    last_accessed: null,
  };
}

// Build a mock Supabase chain that resolves to `rows`
function mockSupabase(rows: ReturnType<typeof makeRow>[]) {
  const updateChain = {
    in: vi.fn().mockResolvedValue({ error: null }),
  };
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: rows, error: null }),
    update: vi.fn().mockReturnValue(updateChain),
  };
  return {
    from: vi.fn().mockReturnValue(chain),
    updateChain,
  };
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

describe("getRelevantMemoriesForUser", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
  });

  it("returns all entries when count ≤ limit without scoring", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const rows = [makeRow("cat_name", "Miso"), makeRow("job_title", "Engineer")];
    vi.mocked(createClient).mockReturnValue(mockSupabase(rows) as never);

    const { getRelevantMemoriesForUser } = await import("@/core/memory-db");
    const result = await getRelevantMemoriesForUser(USER_ID, "anything", 15);
    expect(result).toHaveLength(2);
  });

  it("ranks memories with keyword overlap above non-matching ones", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    // 6 memories, limit=3 — "cat" and "miso" appear in the query
    const rows = [
      makeRow("job_title", "Software Engineer", 0.9, 0), // recent, no match
      makeRow("favourite_food", "Pizza", 0.8, 1), // no match
      makeRow("sibling_name", "Alex", 0.8, 2), // no match
      makeRow("cat_name", "Miso", 0.8, 3), // matches "cat" + "miso"
      makeRow("cat_breed", "Ragdoll", 0.7, 4), // matches "cat"
      makeRow("morning_routine", "Coffee first", 0.6, 5), // no match
    ];
    vi.mocked(createClient).mockReturnValue(mockSupabase(rows) as never);

    const { getRelevantMemoriesForUser } = await import("@/core/memory-db");
    const result = await getRelevantMemoriesForUser(USER_ID, "my cat miso is sick", 3);

    expect(result).toHaveLength(3);
    // The two cat memories must surface despite being older
    const keys = result.map((m) => m.key);
    expect(keys).toContain("cat_name");
    expect(keys).toContain("cat_breed");
  });

  it("falls back to recency when query has no usable keywords", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    // Pass rows newest-first to match the real DB's `created_at DESC` order
    const rows = [
      makeRow("job_title", "Engineer", 0.9, 0), // newest
      makeRow("home_city", "Berlin", 0.8, 2), // middle
      makeRow("cat_name", "Miso", 0.8, 5), // older
    ];
    vi.mocked(createClient).mockReturnValue(mockSupabase(rows) as never);

    const { getRelevantMemoriesForUser } = await import("@/core/memory-db");
    // Query is only stop words — keyword list will be empty
    const result = await getRelevantMemoriesForUser(USER_ID, "the a an", 2);

    expect(result).toHaveLength(2);
    // No keyword scoring — returns first 2 in recency order (job_title, home_city)
    expect(result[0].key).toBe("job_title");
    expect(result[1].key).toBe("home_city");
  });

  it("returns empty array for invalid UUID", async () => {
    const { getRelevantMemoriesForUser } = await import("@/core/memory-db");
    const result = await getRelevantMemoriesForUser("not-a-uuid", "hello");
    expect(result).toEqual([]);
  });

  it("touches last_accessed for all returned memories", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const rows = [makeRow("job_title", "Engineer"), makeRow("cat_name", "Miso")];
    const mock = mockSupabase(rows);
    vi.mocked(createClient).mockReturnValue(mock as never);

    const { getRelevantMemoriesForUser } = await import("@/core/memory-db");
    await getRelevantMemoriesForUser(USER_ID, "anything", 15);
    // Flush microtask queue so the fire-and-forget update resolves
    await Promise.resolve();

    expect(mock.updateChain.in).toHaveBeenCalledWith(
      "id",
      expect.arrayContaining(["mem-job_title", "mem-cat_name"])
    );
  });
});
