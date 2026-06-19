import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: db.createClient }));
vi.mock("@/core/security/audit", () => ({ audit: vi.fn() }));

describe("conversation metadata encryption", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
    vi.stubEnv("EMMA_ENCRYPTION_KEY", "a".repeat(64));
  });

  it("encrypts future summaries and titles before writing", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const client = {
      from: vi.fn(() => ({
        update: vi.fn((value) => {
          updates.push(value);
          return { eq: vi.fn().mockResolvedValue({ error: null }) };
        }),
      })),
    };
    db.createClient.mockReturnValue(client);
    const { updateConversationSummary, updateConversationTitle } = await import("@/core/memory-db");

    await updateConversationSummary("conversation-1", "private summary");
    await updateConversationTitle("conversation-1", "private title");

    expect(updates[0].summary).toMatch(/^enc:v1:/);
    expect(updates[1].title).toMatch(/^enc:v1:/);
    expect(JSON.stringify(updates)).not.toContain("private summary");
    expect(JSON.stringify(updates)).not.toContain("private title");
  });

  it("decrypts encrypted metadata and preserves legacy plaintext reads", async () => {
    const { encrypt } = await import("@/core/security/encryption");
    const rows = [
      { id: "one", summary: encrypt("secret"), title: encrypt("title"), message_count: 2 },
      { id: "two", summary: "legacy summary", title: "legacy title", message_count: 1 },
    ];
    db.createClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: rows.shift() }) })),
            })),
          })),
        })),
      })),
    });
    const { getLatestConversationSummary } = await import("@/core/memory-db");

    await expect(getLatestConversationSummary("11111111-1111-4111-8111-111111111111")).resolves.toMatchObject({
      summary: "secret",
      title: "title",
    });
    await expect(getLatestConversationSummary("11111111-1111-4111-8111-111111111111")).resolves.toMatchObject({
      summary: "legacy summary",
      title: "legacy title",
    });
  });
});
