import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: db.createClient }));
vi.mock("@/core/security/audit", () => ({ audit: vi.fn() }));

describe("getConversationMessages ordering", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
    vi.stubEnv("EMMA_ENCRYPTION_KEY", "a".repeat(64));
  });

  it("selects the most recent rows (descending) and returns them in chronological order", async () => {
    const { encrypt } = await import("@/core/security/encryption");

    // What the DB returns for a descending query: newest first.
    const rowsNewestFirst = [
      {
        role: "assistant",
        content: encrypt("newest"),
        display: encrypt("newest"),
        created_at: "2026-07-03T12:02:00Z",
      },
      {
        role: "user",
        content: encrypt("middle"),
        display: encrypt("middle"),
        created_at: "2026-07-03T12:01:00Z",
      },
      {
        role: "user",
        content: encrypt("oldest"),
        display: encrypt("oldest"),
        created_at: "2026-07-03T12:00:00Z",
      },
    ];

    const orderCalls: Array<{ column: string; opts: { ascending: boolean } }> = [];
    db.createClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn((column: string, opts: { ascending: boolean }) => {
              orderCalls.push({ column, opts });
              return { limit: vi.fn().mockResolvedValue({ data: rowsNewestFirst }) };
            }),
          })),
        })),
      })),
    });

    const { getConversationMessages } = await import("@/core/memory-db");
    const msgs = await getConversationMessages("conversation-1", 3);

    // The query must fetch the newest window, not the oldest.
    expect(orderCalls).toEqual([{ column: "created_at", opts: { ascending: false } }]);

    // The result must be chronological (oldest → newest) for prompt assembly.
    expect(msgs.map((m) => m.content)).toEqual(["oldest", "middle", "newest"]);
    expect(msgs.map((m) => m.createdAt)).toEqual([
      "2026-07-03T12:00:00Z",
      "2026-07-03T12:01:00Z",
      "2026-07-03T12:02:00Z",
    ]);
  });

  it("still skips undecryptable rows after the reorder", async () => {
    const { encrypt } = await import("@/core/security/encryption");
    const rows = [
      {
        role: "assistant",
        content: encrypt("good"),
        display: encrypt("good"),
        created_at: "2026-07-03T12:01:00Z",
      },
      {
        role: "user",
        content: "enc:v1:corrupted",
        display: "enc:v1:corrupted",
        created_at: "2026-07-03T12:00:00Z",
      },
    ];
    db.createClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({ limit: vi.fn().mockResolvedValue({ data: rows }) })),
          })),
        })),
      })),
    });

    const { getConversationMessages } = await import("@/core/memory-db");
    const msgs = await getConversationMessages("conversation-1", 2);

    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toBe("good");
  });
});
