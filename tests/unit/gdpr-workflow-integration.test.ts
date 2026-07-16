import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const routeMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ getUser: routeMocks.getUser }));
vi.mock("@supabase/supabase-js", () => ({ createClient: routeMocks.createClient }));

import { POST } from "@/app/api/emma/gdpr/route";

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
            eq: async (_col: string, id: string) => {
              const row = rows.find((r) => r.id === id);
              if (row) Object.assign(row, patch);
              return { data: null, error: null };
            },
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
});
