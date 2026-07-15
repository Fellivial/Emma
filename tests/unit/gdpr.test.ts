import { describe, expect, it, vi } from "vitest";
import {
  GDPR_EXPORT_TABLES,
  USER_OWNED_DELETE_ORDER,
  deleteUserOwnedData,
  exportUserOwnedData,
} from "@/app/api/emma/gdpr/route";

describe("GDPR deletion coverage", () => {
  it("passes the full ordered table list to the atomic delete RPC in one call", async () => {
    const rpc = vi.fn(async (fn: string, args: { p_user_id: string; p_tables: unknown }) => {
      const tables = args.p_tables as Array<{ table: string; column: string }>;
      return {
        data: tables.map(({ table }) => ({ table_name: table, deleted_count: 1 })),
        error: null,
      };
    });
    const supabase = { rpc };

    const summary = await deleteUserOwnedData(
      supabase as never,
      "11111111-1111-4111-8111-111111111111"
    );

    expect(rpc).toHaveBeenCalledTimes(1);
    const [fnName, args] = rpc.mock.calls[0];
    expect(fnName).toBe("delete_user_owned_data_ordered");
    expect(args.p_user_id).toBe("11111111-1111-4111-8111-111111111111");

    const tableNames = (args.p_tables as Array<{ table: string }>).map(({ table }) => table);
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
        "affiliates",
        "referrals",
      ])
    );
    // affiliate_referrals is not a registry entry — it's cascade-deleted
    // inside the RPC's affiliates special case (see the migration), not
    // passed as a separate table here.
    expect(tableNames).not.toContain("affiliate_referrals");
    expect(args.p_tables).toContainEqual({ table: "referrals", column: "referrer_id" });
    expect(tableNames.indexOf("email_sequences")).toBeLessThan(tableNames.indexOf("trials"));
    expect(tableNames.indexOf("trial_events")).toBeLessThan(tableNames.indexOf("trials"));
    expect(tableNames).not.toContain("client_integrations");

    expect(summary).toContain("legacy_chat_migration_ledger: 1");
    expect(summary).toContain("affiliates: 1");
  });

  it("every p_tables entry has an explicit, non-empty table and column string", async () => {
    // The SQL function falls back to 'user_id' via COALESCE when column is
    // absent, but the TS layer should never actually rely on that fallback —
    // USER_OWNED_DELETE_ORDER always resolves column itself. This guards
    // against a future regression where the mapping silently omits column.
    let sentTables: Array<{ table?: string; column?: string }> = [];
    const rpc = vi.fn(async (_fn: string, args: { p_tables: typeof sentTables }) => {
      sentTables = args.p_tables;
      return { data: [], error: null };
    });

    await deleteUserOwnedData({ rpc } as never, "user-1");

    expect(sentTables.length).toBeGreaterThan(0);
    for (const entry of sentTables) {
      expect(typeof entry.table).toBe("string");
      expect(entry.table).not.toBe("");
      expect(typeof entry.column).toBe("string");
      expect(entry.column).not.toBe("");
    }
  });

  it("fails the deletion when the RPC reports an error, without a second round trip", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "messages: database failure" },
    }));
    const supabase = { rpc };

    await expect(deleteUserOwnedData(supabase as never, "user-1")).rejects.toThrow(
      "messages: database failure"
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe("GDPR export coverage", () => {
  it("mirrors the direct user-owned deletion order and excludes secret fields", () => {
    const exportTables = GDPR_EXPORT_TABLES.map(
      ({ table, column }) => `${table}:${column ?? "user_id"}`
    );
    const deleteTables = USER_OWNED_DELETE_ORDER.map(
      ({ table, column }) => `${table}:${column ?? "user_id"}`
    );

    expect(exportTables).toEqual(deleteTables);
    expect(
      GDPR_EXPORT_TABLES.find(({ table }) => table === "user_mcp_servers")?.select
    ).not.toContain("auth_token");
    expect(GDPR_EXPORT_TABLES.find(({ table }) => table === "oauth_states")?.select).not.toContain(
      "state"
    );
    expect(GDPR_EXPORT_TABLES.find(({ table }) => table === "oauth_states")?.select).not.toContain(
      "code_verifier"
    );
    expect(GDPR_EXPORT_TABLES.find(({ table }) => table === "audit_log")?.select).not.toContain(
      "ip_address"
    );
    expect(
      GDPR_EXPORT_TABLES.find(({ table }) => table === "push_subscriptions")?.select
    ).not.toContain("subscription");
  });

  it("exports all allowlisted user-owned tables and affiliate child rows", async () => {
    const queries: Array<{ table: string; select: string; column?: string; value?: string }> = [];
    const userId = "11111111-1111-4111-8111-111111111111";

    const supabase = {
      from: vi.fn((table: string) => ({
        select: vi.fn((select: string) => {
          const chain = {
            eq: vi.fn((column: string, value: string) => {
              queries.push({ table, select, column, value });
              const result = {
                data:
                  table === "affiliates"
                    ? [{ id: "affiliate-1", user_id: userId }]
                    : [{ id: `${table}-1`, user_id: userId }],
                error: null,
              };
              return {
                ...result,
                limit: vi.fn(async () => result),
                then: (
                  resolve: (value: typeof result) => unknown,
                  reject?: (reason: unknown) => unknown
                ) => Promise.resolve(result).then(resolve, reject),
              };
            }),
            in: vi.fn(async () => ({
              data: [{ id: "ref-1", affiliate_id: "affiliate-1" }],
              error: null,
            })),
          };
          return chain;
        }),
      })),
    };

    const exported = await exportUserOwnedData(supabase as never, userId);

    expect(queries.map(({ table }) => table)).toEqual(
      expect.arrayContaining(GDPR_EXPORT_TABLES.map(({ table }) => table))
    );
    expect(exported.profile).toEqual({ id: "profiles-1", user_id: userId });
    expect(exported.affiliateReferrals).toEqual([{ id: "ref-1", affiliate_id: "affiliate-1" }]);
  });
});
