import { describe, expect, it, vi } from "vitest";
import type { DeletionRequestRow } from "@/core/account-deletion/workflow-types";

function makeFakeSupabase(
  options: {
    rows?: DeletionRequestRow[];
    rpcImpl?: (
      fn: string,
      args: unknown
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  } = {}
) {
  const rows: DeletionRequestRow[] = options.rows ?? [];
  let idCounter = 0;

  const rpc = vi.fn(
    options.rpcImpl ??
      (async () => ({ data: [{ table_name: "messages", deleted_count: 0 }], error: null }))
  );

  function from(table: string) {
    if (table !== "deletion_requests") throw new Error(`unexpected table ${table}`);
    return {
      select: () => ({
        eq: (_col: string, userId: string) => ({
          not: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => {
                  const match = rows.find(
                    (r) =>
                      r.user_id === userId && r.status !== "completed" && r.status !== "cancelled"
                  );
                  return { data: match ?? null, error: null };
                },
              }),
            }),
          }),
        }),
      }),
      insert: (values: Partial<DeletionRequestRow>) => ({
        select: () => ({
          single: async () => {
            idCounter += 1;
            const row: DeletionRequestRow = {
              id: `req-${idCounter}`,
              user_id: values.user_id as string,
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
      update: (patch: Partial<DeletionRequestRow>) => ({
        eq: async (_col: string, id: string) => {
          const row = rows.find((r) => r.id === id);
          if (row) Object.assign(row, patch);
          return { data: null, error: null };
        },
      }),
    };
  }

  return { from, rpc, rows };
}

describe("deletion workflow persistence layer", () => {
  it("creates a new deletion_requests row for a user with no active workflow", async () => {
    const { findActiveDeletionRequest, createDeletionRequest } =
      await import("@/core/account-deletion/workflow");
    const supabase = makeFakeSupabase();

    expect(await findActiveDeletionRequest(supabase as never, "user-1")).toBeNull();
    const row = await createDeletionRequest(supabase as never, "user-1");

    expect(row.user_id).toBe("user-1");
    expect(row.status).toBe("requested");
    expect(row.workflow_version).toBe(1);
    expect(row.checkpoint).toEqual([]);
  });

  it("finds an existing non-terminal row instead of treating the user as fresh", async () => {
    const { findActiveDeletionRequest } = await import("@/core/account-deletion/workflow");
    const existing: DeletionRequestRow = {
      id: "req-existing",
      user_id: "user-1",
      status: "deleting_storage",
      workflow_version: 1,
      checkpoint: [],
      grace_period_ends_at: null,
      requested_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
      cancelled_at: null,
      retry_count: 0,
    };
    const supabase = makeFakeSupabase({ rows: [existing] });

    const found = await findActiveDeletionRequest(supabase as never, "user-1");
    expect(found?.id).toBe("req-existing");
  });

  it("persist() patches and stamps a fresh updated_at without dropping other fields", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const { createDeletionRequest, persist } = await import("@/core/account-deletion/workflow");
    const supabase = makeFakeSupabase();
    const row = await createDeletionRequest(supabase as never, "user-1");
    const originalUpdatedAt = row.updated_at;

    vi.setSystemTime(new Date("2026-01-01T00:05:00.000Z"));
    const updated = await persist(supabase as never, row, { status: "validating" });

    expect(updated.status).toBe("validating");
    expect(updated.user_id).toBe("user-1");
    expect(updated.updated_at).toBe("2026-01-01T00:05:00.000Z");
    expect(updated.updated_at).not.toBe(originalUpdatedAt);
    vi.useRealTimers();
  });

  it("isPhaseCompleted() is true only for a matching, non-failed checkpoint entry", async () => {
    const { isPhaseCompleted } = await import("@/core/account-deletion/workflow");
    const row: DeletionRequestRow = {
      id: "req-1",
      user_id: "user-1",
      status: "deleting_storage",
      workflow_version: 1,
      checkpoint: [
        {
          phase: "deleting_storage",
          resourceId: "storage.document-ingestion",
          subResourceMarker: null,
          resourceStatus: "completed",
          recordedAt: new Date().toISOString(),
        },
        {
          phase: "deleting_storage",
          resourceId: "storage.task-documents",
          subResourceMarker: null,
          resourceStatus: "failed",
          recordedAt: new Date().toISOString(),
        },
      ],
      grace_period_ends_at: null,
      requested_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
      cancelled_at: null,
      retry_count: 0,
    };

    expect(isPhaseCompleted(row, "deleting_storage", "storage.document-ingestion")).toBe(true);
    expect(isPhaseCompleted(row, "deleting_storage", "storage.task-documents")).toBe(false);
    expect(isPhaseCompleted(row, "deleting_storage", "storage.unrelated")).toBe(false);
  });
});

describe("deletion adapter verify() — real implementation", () => {
  it("storage adapter verify() succeeds when the user's folder is empty", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
    const listMock = vi.fn(async () => ({ data: [], error: null }));
    vi.doMock("@supabase/supabase-js", () => ({
      createClient: () => ({ storage: { from: () => ({ list: listMock }) } }),
    }));

    const { createStorageBucketAdapter } =
      await import("@/core/account-deletion/adapters/storage-bucket-adapter");
    const adapter = createStorageBucketAdapter("document-ingestion", "storage.document-ingestion");
    const result = await adapter.verify({
      userId: "user-1",
      resourceId: "storage.document-ingestion",
    });

    expect(result).toEqual({ success: true, itemsProcessed: 0, detail: "folder empty" });
    vi.doUnmock("@supabase/supabase-js");
    vi.unstubAllEnvs();
  });
});
