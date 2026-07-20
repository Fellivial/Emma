import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const routeMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ getUser: routeMocks.getUser }));
vi.mock("@supabase/supabase-js", () => ({ createClient: routeMocks.createClient }));

import { POST } from "@/app/api/emma/gdpr/route";
import { toVerificationTargets } from "@/core/account-deletion/registry";

function jsonRequest(body: unknown) {
  return new NextRequest("https://emma.example.org/api/emma/gdpr", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

interface FakeRow {
  id: string;
  user_id: unknown;
  status: string;
  workflow_version: number;
  checkpoint: unknown[];
  grace_period_ends_at: null;
  requested_at: string;
  updated_at: string;
  completed_at: string | null;
  cancelled_at: null;
  retry_count: number;
}

describe("POST /api/emma/gdpr delete — Phase 3 workflow wiring", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://emma-test.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
    routeMocks.getUser.mockReset();
    routeMocks.createClient.mockReset();
  });

  it("delegates to the deletion workflow and returns its status instead of deleting inline", async () => {
    routeMocks.getUser.mockResolvedValue({ id: "user-1", email: "a@b.com" });

    const rows: FakeRow[] = [];
    routeMocks.createClient.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: [{ table_name: "messages", deleted_count: 2 }],
        error: null,
      })),
      from: vi.fn((table: string) => {
        if (table === "audit_log") {
          return { insert: vi.fn(async () => ({ error: null })) };
        }
        return {
          select: () => ({
            eq: () => ({
              not: () => ({
                order: () => ({
                  limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
                }),
              }),
            }),
          }),
          insert: (values: Partial<FakeRow>) => ({
            select: () => ({
              single: async () => {
                const row: FakeRow = {
                  id: "req-1",
                  user_id: values.user_id,
                  status: "requested",
                  workflow_version: 1,
                  checkpoint: [],
                  grace_period_ends_at: null,
                  requested_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  completed_at: null,
                  cancelled_at: null,
                  retry_count: 0,
                };
                rows.push(row);
                return { data: row, error: null };
              },
            }),
          }),
          update: (patch: Partial<FakeRow>) => ({
            eq: (_col1: string, id: string) => ({
              eq: (_col2: string, updatedAt: string) => ({
                select: async (_cols: string) => {
                  const row = rows.find((r) => r.id === id);
                  if (!row || row.updated_at !== updatedAt) {
                    return { data: [], error: null };
                  }
                  Object.assign(row, patch);
                  return { data: [{ id: row.id }], error: null };
                },
              }),
            }),
          }),
        };
      }),
    });

    const response = await POST(jsonRequest({ action: "delete", confirmEmail: "a@b.com" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("completed");
    expect(body.success).toBe(true);
    expect(Array.isArray(body.summary)).toBe(true);
    expect(body.summary.some((line: string) => line.includes("deleting_database/db.batch"))).toBe(
      true
    );
    expect(rows).toHaveLength(1);
  });

  it("still requires email confirmation before touching the workflow", async () => {
    routeMocks.getUser.mockResolvedValue({ id: "user-1", email: "a@b.com" });

    const response = await POST(jsonRequest({ action: "delete", confirmEmail: "wrong@b.com" }));

    expect(response.status).toBe(400);
    expect(routeMocks.createClient).not.toHaveBeenCalled();
  });

  it("still returns 501 when Supabase is unconfigured and confirmEmail is correct (precedence: confirmEmail checked first, but DB-config check still fires when the email matches)", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    routeMocks.getUser.mockResolvedValue({ id: "user-1", email: "a@b.com" });

    const response = await POST(jsonRequest({ action: "delete", confirmEmail: "a@b.com" }));
    const body = await response.json();

    expect(response.status).toBe(501);
    expect(body.error).toBe("DB not configured");
    expect(routeMocks.createClient).not.toHaveBeenCalled();
  });
});

/**
 * A minimal fake Supabase client parameterized by an rpc implementation that
 * distinguishes the delete vs. verify function names — unlike the single
 * "any rpc call returns this" mock in the suite above, which is enough for
 * status/success assertions but too coarse to exercise realistic verify
 * counts.
 */
function makeFakeGdprSupabase(
  rpcImpl: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
) {
  const rows: FakeRow[] = [];
  return {
    client: {
      rpc: vi.fn(rpcImpl),
      from: vi.fn((table: string) => {
        if (table === "audit_log") {
          return { insert: vi.fn(async () => ({ error: null })) };
        }
        return {
          select: () => ({
            eq: () => ({
              not: () => ({
                order: () => ({
                  limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
                }),
              }),
            }),
          }),
          insert: (values: Partial<FakeRow>) => ({
            select: () => ({
              single: async () => {
                const row: FakeRow = {
                  id: "req-1",
                  user_id: values.user_id,
                  status: "requested",
                  workflow_version: 1,
                  checkpoint: [],
                  grace_period_ends_at: null,
                  requested_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  completed_at: null,
                  cancelled_at: null,
                  retry_count: 0,
                };
                rows.push(row);
                return { data: row, error: null };
              },
            }),
          }),
          update: (patch: Partial<FakeRow>) => ({
            eq: (_col1: string, id: string) => ({
              eq: (_col2: string, updatedAt: string) => ({
                select: async (_cols: string) => {
                  const row = rows.find((r) => r.id === id);
                  if (!row || row.updated_at !== updatedAt) {
                    return { data: [], error: null };
                  }
                  Object.assign(row, patch);
                  return { data: [{ id: row.id }], error: null };
                },
              }),
            }),
          }),
        };
      }),
    },
    rows,
  };
}

describe("POST /api/emma/gdpr delete — Phase 5D verification response field", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://emma-test.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
    routeMocks.getUser.mockReset();
    routeMocks.createClient.mockReset();
  });

  it("reports a clean run as fully verified, sibling of (not replacing) summary", async () => {
    routeMocks.getUser.mockResolvedValue({ id: "user-1", email: "a@b.com" });
    const { client } = makeFakeGdprSupabase(async (fn, args) => {
      const tables = args.p_tables as Array<{ table: string }>;
      if (fn === "delete_user_owned_data_ordered") {
        return {
          data: tables.map(({ table }) => ({ table_name: table, deleted_count: 1 })),
          error: null,
        };
      }
      if (fn === "verify_user_owned_data_deleted") {
        return {
          data: tables.map(({ table }) => ({
            table_name: table,
            remaining_count: 0,
            checked: true,
            error_detail: null,
          })),
          error: null,
        };
      }
      return { data: [], error: null };
    });
    routeMocks.createClient.mockReturnValue(client);

    const response = await POST(jsonRequest({ action: "delete", confirmEmail: "a@b.com" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    // Backward compatibility: existing fields keep their exact shape.
    expect(body.success).toBe(true);
    expect(body.status).toBe("completed");
    expect(typeof body.deletedAt).toBe("string");
    expect(Array.isArray(body.summary)).toBe(true);
    expect(body.note).toEqual(expect.any(String));

    // New, additive field.
    expect(body.verification.database.verified).toBe(toVerificationTargets().length);
    expect(body.verification.database.failed).toBe(0);
    // No real bucket contents were supplied to the fake storage client, so
    // storage verification is inconclusive rather than false-"verified" —
    // the same "tolerating unconfigured storage" posture the rest of this
    // subsystem's tests already accept for a fake client with no `.storage`.
    expect(body.verification.storage.inconclusive).toBe(2);
    expect(body.verification.external.skipped).toBe(2);
  });

  it("does not report success when the database verification confirms leftover data", async () => {
    routeMocks.getUser.mockResolvedValue({ id: "user-1", email: "a@b.com" });
    const { client } = makeFakeGdprSupabase(async (fn, args) => {
      const tables = args.p_tables as Array<{ table: string }>;
      if (fn === "delete_user_owned_data_ordered") {
        return {
          data: tables.map(({ table }) => ({ table_name: table, deleted_count: 1 })),
          error: null,
        };
      }
      if (fn === "verify_user_owned_data_deleted") {
        return {
          data: tables.map(({ table }, i) => ({
            table_name: table,
            remaining_count: i === 0 ? 1 : 0,
            checked: true,
            error_detail: null,
          })),
          error: null,
        };
      }
      return { data: [], error: null };
    });
    routeMocks.createClient.mockReturnValue(client);

    const response = await POST(jsonRequest({ action: "delete", confirmEmail: "a@b.com" }));
    const body = await response.json();

    // API cannot report verification success when the workflow reports failure.
    expect(body.success).toBe(false);
    expect(body.status).toBe("retry_pending");
    expect(body.verification.database.failed).toBe(1);
    expect(body.verification.database.verified).toBe(toVerificationTargets().length - 1);
  });
});
