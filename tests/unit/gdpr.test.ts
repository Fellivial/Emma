import { describe, expect, it, vi } from "vitest";
import { deleteUserOwnedData } from "@/app/api/emma/gdpr/route";

describe("GDPR deletion coverage", () => {
  it("deletes legacy and encrypted history plus direct user-owned agent data", async () => {
    const deleted: Array<{ table: string; column: string }> = [];
    const supabase = {
      from: vi.fn((table: string) => {
        const deletion = {
          eq: vi.fn(async (column: string) => {
            deleted.push({ table, column });
            return { count: 1, error: null };
          }),
          in: vi.fn(async (column: string) => {
            deleted.push({ table, column });
            return { count: 1, error: null };
          }),
        };
        return {
          select: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({
              data: table === "affiliates" ? [{ id: "affiliate-1" }] : [],
              error: null,
            }),
          })),
          delete: vi.fn(() => deletion),
        };
      }),
    };

    await deleteUserOwnedData(supabase as never, "11111111-1111-4111-8111-111111111111");

    const tableNames = deleted.map(({ table }) => table);
    expect(tableNames).toEqual(
      expect.arrayContaining([
        "legacy_chat_migration_ledger",
        "messages",
        "chat_messages",
        "conversations",
        "memories",
        "approvals",
        "action_log",
        "agent_task_summaries",
        "tasks",
        "audit_log",
        "user_mcp_servers",
        "user_files",
        "email_sequences",
        "trial_events",
        "trials",
        "affiliate_referrals",
        "affiliates",
        "referrals",
      ])
    );
    expect(deleted).toContainEqual({ table: "affiliate_referrals", column: "affiliate_id" });
    expect(deleted).toContainEqual({ table: "referrals", column: "referrer_id" });
    expect(tableNames.indexOf("email_sequences")).toBeLessThan(tableNames.indexOf("trials"));
    expect(tableNames.indexOf("trial_events")).toBeLessThan(tableNames.indexOf("trials"));
    expect(tableNames.indexOf("affiliate_referrals")).toBeLessThan(
      tableNames.indexOf("affiliates")
    );
    expect(tableNames).not.toContain("client_integrations");
  });

  it("fails the deletion when a required table cannot be cleared", async () => {
    const supabase = {
      from: vi.fn((table: string) => ({
        select: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) })),
        delete: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({
            count: 0,
            error: table === "messages" ? { message: "database failure" } : null,
          }),
          in: vi.fn().mockResolvedValue({ count: 0, error: null }),
        })),
      })),
    };

    await expect(deleteUserOwnedData(supabase as never, "user-1")).rejects.toThrow(
      "messages: database failure"
    );
  });
});
