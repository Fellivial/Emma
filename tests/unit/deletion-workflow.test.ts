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

describe("runDeletionWorkflow", () => {
  it("creates a new row and reaches completed for a fresh user, tolerating unconfigured storage as best-effort", async () => {
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");
    const supabase = makeFakeSupabase({
      rpcImpl: async () => ({ data: [{ table_name: "messages", deleted_count: 3 }], error: null }),
    });

    const result = await runDeletionWorkflow(supabase as never, "user-1");

    expect(result.resumed).toBe(false);
    expect(result.status).toBe("completed");
    expect(supabase.rows).toHaveLength(1);
    expect(supabase.rows[0].completed_at).not.toBeNull();
    const dbEntry = supabase.rows[0].checkpoint.find(
      (e) => e.phase === "deleting_database" && e.resourceId === "db.batch"
    );
    expect(dbEntry?.resourceStatus).toBe("completed");
    // Storage isn't configured in this test env — best-effort per ADR 0004:
    // recorded as failed in checkpoint, but does not block completion.
    const storageEntries = supabase.rows[0].checkpoint.filter(
      (e) => e.phase === "deleting_storage"
    );
    expect(storageEntries.some((e) => e.resourceStatus === "failed")).toBe(true);
    expect(supabase.rows[0].retry_count).toBe(0);
  });

  it("resumes an existing non-terminal row instead of creating a second one, skipping already-completed steps", async () => {
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");
    const existing: DeletionRequestRow = {
      id: "req-existing",
      user_id: "user-1",
      status: "deleting_storage",
      workflow_version: 1,
      checkpoint: [
        {
          phase: "deleting_database",
          resourceId: "db.batch",
          subResourceMarker: null,
          resourceStatus: "completed",
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
    // Phase 5C: verify_database is a new step this row's checkpoint has
    // never touched, so it legitimately calls the verify RPC once on this
    // resume — the guarantee this test actually cares about is that the
    // *delete* RPC is never re-invoked for a phase already checkpointed
    // completed, which the fn-aware assertion below checks directly.
    const rpc = vi.fn(async (fn: string) => ({
      data:
        fn === "verify_user_owned_data_deleted"
          ? []
          : [{ table_name: "messages", deleted_count: 1 }],
      error: null,
    }));
    const supabase = { ...makeFakeSupabase({ rows: [existing] }), rpc };

    const result = await runDeletionWorkflow(supabase as never, "user-1");

    expect(result.resumed).toBe(true);
    expect(supabase.rows).toHaveLength(1);
    expect(result.status).toBe("completed");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("verify_user_owned_data_deleted", expect.anything());
  });

  it("halts at waiting_grace_period without erroring when a future grace period is set", async () => {
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");
    const future = new Date(Date.now() + 60_000).toISOString();
    const existing: DeletionRequestRow = {
      id: "req-grace",
      user_id: "user-1",
      status: "waiting_grace_period",
      workflow_version: 1,
      checkpoint: [],
      grace_period_ends_at: future,
      requested_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
      cancelled_at: null,
      retry_count: 0,
    };
    const supabase = makeFakeSupabase({ rows: [existing] });

    const result = await runDeletionWorkflow(supabase as never, "user-1");

    expect(result.status).toBe("waiting_grace_period");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("marks retry_pending on a transient database failure and completes on a later call from checkpoint", async () => {
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");
    let attempt = 0;
    const supabase = makeFakeSupabase({
      // fn-aware: `attempt` counts only the delete RPC, matching this
      // test's own subject ("transient database failure") — verify_database
      // now also calls rpc() (Phase 5C) and must not be conflated with it.
      rpcImpl: async (fn: string) => {
        if (fn === "verify_user_owned_data_deleted") return { data: [], error: null };
        attempt += 1;
        if (attempt === 1) return { data: null, error: { message: "transient failure" } };
        return { data: [{ table_name: "messages", deleted_count: 1 }], error: null };
      },
    });

    const first = await runDeletionWorkflow(supabase as never, "user-1");
    expect(first.status).toBe("retry_pending");
    expect(supabase.rows[0].retry_count).toBe(1);
    expect(supabase.rows).toHaveLength(1);

    const second = await runDeletionWorkflow(supabase as never, "user-1");
    expect(second.status).toBe("completed");
    expect(second.resumed).toBe(true);
    expect(attempt).toBe(2);
  });

  it("transitions to failed, not retry_pending, once the database step's retries are exhausted", async () => {
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");
    const supabase = makeFakeSupabase({
      rpcImpl: async () => ({ data: null, error: { message: "persistent failure" } }),
    });

    let result = await runDeletionWorkflow(supabase as never, "user-1");
    expect(result.status).toBe("retry_pending");
    result = await runDeletionWorkflow(supabase as never, "user-1");
    expect(result.status).toBe("retry_pending");
    result = await runDeletionWorkflow(supabase as never, "user-1");
    expect(result.status).toBe("retry_pending");
    result = await runDeletionWorkflow(supabase as never, "user-1");
    expect(result.status).toBe("failed");
    expect(supabase.rows).toHaveLength(1);
  });

  it("fails permanently on an invalid user_id without consuming a retry", async () => {
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");
    const supabase = makeFakeSupabase();

    const result = await runDeletionWorkflow(supabase as never, "");

    expect(result.status).toBe("failed");
    expect(supabase.rows[0].retry_count).toBe(0);
  });

  it("skips deleting_oauth and deleting_background_jobs resources with no adapter, without failing the workflow", async () => {
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");
    const supabase = makeFakeSupabase();

    const result = await runDeletionWorkflow(supabase as never, "user-1");

    expect(result.summary.some((line) => line.includes("oauth.client_integrations: skipped"))).toBe(
      true
    );
    expect(
      result.summary.some((line) => line.includes("background.document_process: skipped"))
    ).toBe(true);
    expect(result.status).toBe("completed");
  });

  it("does not silently restart a permanently-failed workflow", async () => {
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");
    const failedRow: DeletionRequestRow = {
      id: "req-failed",
      user_id: "user-1",
      status: "failed",
      workflow_version: 1,
      checkpoint: [
        {
          phase: "deleting_database",
          resourceId: "db.batch",
          subResourceMarker: null,
          resourceStatus: "failed",
          error: "persistent failure",
          recordedAt: new Date().toISOString(),
        },
      ],
      grace_period_ends_at: null,
      requested_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
      cancelled_at: null,
      retry_count: 4,
    };
    const rpc = vi.fn(async () => ({
      data: [{ table_name: "messages", deleted_count: 1 }],
      error: null,
    }));
    const supabase = { ...makeFakeSupabase({ rows: [failedRow] }), rpc };

    const result = await runDeletionWorkflow(supabase as never, "user-1");

    expect(result.status).toBe("failed");
    expect(rpc).not.toHaveBeenCalled();
    expect(supabase.rows).toHaveLength(1);
  });

  it("is idempotent — invoking twice after completion does not re-run or duplicate anything", async () => {
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");
    const rpc = vi.fn(async () => ({
      data: [{ table_name: "messages", deleted_count: 1 }],
      error: null,
    }));
    const supabase = { ...makeFakeSupabase(), rpc };

    const first = await runDeletionWorkflow(supabase as never, "user-1");
    expect(first.status).toBe("completed");
    // Phase 5C: one delete RPC call (deleting_database) + one verify RPC
    // call (verify_database) per completed run, not just the delete alone.
    expect(rpc).toHaveBeenCalledTimes(2);

    // deletion_requests_one_active_per_user excludes 'completed', so a
    // second call for the same user creates a fresh workflow — this proves
    // the *first* workflow itself doesn't duplicate work if re-entered
    // (covered above by the resume test); this test proves a completed
    // workflow doesn't linger as "active" and force a permanent block.
    const second = await runDeletionWorkflow(supabase as never, "user-1");
    expect(second.status).toBe("completed");
    expect(second.resumed).toBe(false);
    expect(supabase.rows).toHaveLength(2);
  });
});

describe("runDeletionWorkflow — concurrent execution safety", () => {
  function jitter(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, Math.random() * 8));
  }

  function makeJitteredFakeSupabase() {
    const rows: DeletionRequestRow[] = [];
    let idCounter = 0;

    const rpc = vi.fn(async (fn: string) => {
      await jitter();
      if (fn === "verify_user_owned_data_deleted") return { data: [], error: null };
      return { data: [{ table_name: "messages", deleted_count: 1 }], error: null };
    });

    function from(table: string) {
      if (table !== "deletion_requests") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: (_col: string, userId: string) => ({
            not: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => {
                    await jitter();
                    const match = rows.find(
                      (r) =>
                        r.user_id === userId && r.status !== "completed" && r.status !== "cancelled"
                    );
                    return {
                      data: match ? { ...match, checkpoint: [...match.checkpoint] } : null,
                      error: null,
                    };
                  },
                }),
              }),
            }),
          }),
        }),
        insert: (values: Partial<DeletionRequestRow>) => ({
          select: () => ({
            single: async () => {
              await jitter();
              const alreadyActive = rows.find(
                (r) =>
                  r.user_id === values.user_id &&
                  r.status !== "completed" &&
                  r.status !== "cancelled"
              );
              if (alreadyActive) {
                return {
                  data: null,
                  error: {
                    message:
                      'duplicate key value violates unique constraint "deletion_requests_one_active_per_user"',
                  },
                };
              }
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
              return { data: { ...row, checkpoint: [...row.checkpoint] }, error: null };
            },
          }),
        }),
        update: (patch: Partial<DeletionRequestRow>) => ({
          eq: (_col1: string, id: string) => ({
            eq: (_col2: string, updatedAt: string) => ({
              select: async (_cols: string) => {
                await jitter();
                const row = rows.find((r) => r.id === id);
                // Real conditional UPDATE ... WHERE id = $1 AND updated_at = $2:
                // zero affected rows if someone else already wrote since we read.
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
    }

    return { from, rpc, rows };
  }

  it("never invokes the atomic delete RPC more than once when two calls race on the same user", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");

    for (let attempt = 0; attempt < 5; attempt++) {
      const supabase = makeJitteredFakeSupabase();

      const results = await Promise.all([
        runDeletionWorkflow(supabase as never, "user-1"),
        runDeletionWorkflow(supabase as never, "user-1"),
      ]);

      // Phase 5C: the winning execution now legitimately calls rpc() twice
      // per full run (once for the delete, once for verify_database) — the
      // guarantee this test actually protects is that optimistic
      // concurrency prevents either call from being duplicated by the race,
      // checked per function name rather than as one combined total.
      const deleteCalls = supabase.rpc.mock.calls.filter(
        ([fn]: [string]) => fn === "delete_user_owned_data_ordered"
      );
      const verifyCalls = supabase.rpc.mock.calls.filter(
        ([fn]: [string]) => fn === "verify_user_owned_data_deleted"
      );
      expect(deleteCalls.length).toBe(1);
      expect(verifyCalls.length).toBe(1);
      expect(supabase.rows.length).toBe(1);
      // Both calls must resolve (not throw) even though one of them lost
      // the race partway through.
      for (const r of results) {
        expect(typeof r.status).toBe("string");
      }
    }
  }, 20000);
});
