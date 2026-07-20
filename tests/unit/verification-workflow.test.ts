import { beforeEach, describe, expect, it, vi } from "vitest";
import { toVerificationTargets } from "@/core/account-deletion/registry";
import type { CheckpointEntry, DeletionRequestRow } from "@/core/account-deletion/workflow-types";

const db = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: db.createClient }));

type RpcResponse = { data: unknown; error: { message: string } | null };

const CLEAN_DELETE_RESPONSE: RpcResponse = {
  data: [{ table_name: "messages", deleted_count: 0 }],
  error: null,
};

/** Every verification-eligible resource reported clean. */
function cleanVerifyRows() {
  return toVerificationTargets().map(({ table }) => ({
    table_name: table,
    remaining_count: 0,
    checked: true,
    error_detail: null,
  }));
}

/**
 * Builds an rpc() mock that discriminates by function name — the delete RPC
 * always succeeds cleanly; the verify RPC's response sequence is driven by
 * `verifySequence`, one entry consumed per call (the last entry repeats
 * once exhausted), letting a test simulate a defect on call 1 and its
 * resolution on call 2 without a second, separate mock.
 */
function makeRpc(verifySequence: RpcResponse[]) {
  let verifyCalls = 0;
  let deleteCalls = 0;
  const rpc = vi.fn(async (fn: string) => {
    if (fn === "verify_user_owned_data_deleted") {
      const idx = Math.min(verifyCalls, verifySequence.length - 1);
      verifyCalls += 1;
      return verifySequence[idx] ?? { data: cleanVerifyRows(), error: null };
    }
    deleteCalls += 1;
    return CLEAN_DELETE_RESPONSE;
  });
  return { rpc, deleteCallCount: () => deleteCalls, verifyCallCount: () => verifyCalls };
}

function makeDeletionRequestsFake(rows: DeletionRequestRow[]) {
  return function from(table: string) {
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
            const row: DeletionRequestRow = {
              id: `req-${rows.length + 1}`,
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
              if (!row || row.updated_at !== updatedAt) return { data: [], error: null };
              // patch already carries the correct updated_at (persist()'s own
              // next.updated_at) — do not re-stamp it independently here, or
              // the fake's row and persist()'s returned `next` diverge on the
              // very next call, spuriously tripping the optimistic-
              // concurrency check this same handler is supposed to enforce.
              Object.assign(row, patch);
              return { data: [{ id: row.id }], error: null };
            },
          }),
        }),
      }),
    };
  };
}

function seedRow(overrides: Partial<DeletionRequestRow> = {}): DeletionRequestRow {
  return {
    id: "req-seed",
    user_id: "user-1",
    status: "verify_database",
    workflow_version: 1,
    checkpoint: [],
    grace_period_ends_at: null,
    requested_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: null,
    cancelled_at: null,
    retry_count: 0,
    ...overrides,
  };
}

function entry(
  phase: CheckpointEntry["phase"],
  resourceId: string,
  resourceStatus: CheckpointEntry["resourceStatus"],
  extra: Partial<CheckpointEntry> = {}
): CheckpointEntry {
  return {
    phase,
    resourceId,
    subResourceMarker: null,
    resourceStatus,
    recordedAt: new Date().toISOString(),
    ...extra,
  };
}

/** Storage mock: per-bucket queue of list() responses, one consumed per call. */
function makeStorageMock(
  responses: Record<
    string,
    Array<{ data: Array<{ name: string }> | null; error: { message: string } | null }>
  >
) {
  const calls: Record<string, number> = {};
  return {
    storage: {
      from: (bucket: string) => ({
        list: vi.fn(async () => {
          calls[bucket] = (calls[bucket] ?? 0) + 1;
          const seq = responses[bucket] ?? [];
          return seq[Math.min(calls[bucket] - 1, seq.length - 1)] ?? { data: [], error: null };
        }),
        // stepDeletingStorage runs before stepVerifyStorage in STATE_ORDER
        // and shares this same adapter/bucket call path — remove() must
        // exist so a leftover object seeded for a verify()-focused test
        // doesn't make the (unrelated, best-effort) delete phase throw.
        remove: vi.fn(async () => ({ error: null })),
      }),
    },
    calls,
  };
}

const BUCKET_A = "document-ingestion"; // storage.document-ingestion
const BUCKET_B = "task-documents"; // storage.task-documents

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
  db.createClient.mockReset();
  db.createClient.mockReturnValue(makeStorageMock({}));
});

describe("stepVerifyDatabase (via runDeletionWorkflow) — TDD §4.1", () => {
  it("a fully clean batch produces one completed entry per resource plus a completed marker", async () => {
    const { rpc } = makeRpc([{ data: cleanVerifyRows(), error: null }]);
    const rows = [seedRow({ status: "verify_database" })];
    const supabase = { from: makeDeletionRequestsFake(rows), rpc };
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");

    const result = await runDeletionWorkflow(supabase as never, "user-1");

    expect(result.status).toBe("completed");
    const dbEntries = result.checkpoint.filter((e) => e.phase === "verify_database");
    const targets = toVerificationTargets();
    expect(dbEntries).toHaveLength(targets.length + 1); // + the marker
    for (const { resourceId } of targets) {
      const e = dbEntries.find((x) => x.resourceId === resourceId);
      expect(e?.resourceStatus).toBe("completed");
      expect(e?.remainingCount).toBe(0);
    }
    const marker = dbEntries.find((e) => e.resourceId === "db.verification-batch");
    expect(marker?.resourceStatus).toBe("completed");
  });

  it("a table with remaining rows produces a failed entry, a failed marker, and blocks completion", async () => {
    const dirtyRows = cleanVerifyRows().map((r) =>
      r.table_name === "memories" ? { ...r, remaining_count: 3 } : r
    );
    const { rpc } = makeRpc([{ data: dirtyRows, error: null }]);
    const rows = [seedRow({ status: "verify_database" })];
    const supabase = { from: makeDeletionRequestsFake(rows), rpc };
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");

    const result = await runDeletionWorkflow(supabase as never, "user-1");

    expect(result.status).toBe("retry_pending");
    const failedEntry = result.checkpoint.find((e) => e.resourceId === "db.memories");
    expect(failedEntry?.resourceStatus).toBe("failed");
    expect(failedEntry?.remainingCount).toBe(3);
    const marker = result.checkpoint.find((e) => e.resourceId === "db.verification-batch");
    expect(marker?.resourceStatus).toBe("failed");
  });

  it("a per-table checked:false is inconclusive and does not block completion", async () => {
    const partialRows = cleanVerifyRows().map((r) =>
      r.table_name === "document_chunks"
        ? { ...r, checked: false, remaining_count: null, error_detail: "unknown column" }
        : r
    );
    const { rpc } = makeRpc([{ data: partialRows, error: null }]);
    const rows = [seedRow({ status: "verify_database" })];
    const supabase = { from: makeDeletionRequestsFake(rows), rpc };
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");

    const result = await runDeletionWorkflow(supabase as never, "user-1");

    expect(result.status).toBe("completed");
    const inconclusive = result.checkpoint.find((e) => e.resourceId === "db.document_chunks");
    expect(inconclusive?.resourceStatus).toBe("inconclusive");
    expect(inconclusive?.remainingCount).toBeUndefined();
    const marker = result.checkpoint.find((e) => e.resourceId === "db.verification-batch");
    expect(marker?.resourceStatus).toBe("completed");
  });

  it("a whole-call RPC failure produces exactly one inconclusive marker and does not block completion", async () => {
    const { rpc } = makeRpc([{ data: null, error: { message: "connection reset" } }]);
    const rows = [seedRow({ status: "verify_database" })];
    const supabase = { from: makeDeletionRequestsFake(rows), rpc };
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");

    const result = await runDeletionWorkflow(supabase as never, "user-1");

    expect(result.status).toBe("completed");
    const dbEntries = result.checkpoint.filter((e) => e.phase === "verify_database");
    expect(dbEntries).toHaveLength(1);
    expect(dbEntries[0]).toMatchObject({
      resourceId: "db.verification-batch",
      resourceStatus: "inconclusive",
      error: "connection reset",
    });
  });

  it("resume: marker already completed skips real re-verification (no second RPC call)", async () => {
    const { rpc, verifyCallCount } = makeRpc([{ data: cleanVerifyRows(), error: null }]);
    const rows = [
      seedRow({
        status: "verify_database",
        checkpoint: [
          ...cleanVerifyRows().map((r) =>
            entry("verify_database", `db.${r.table_name}`, "completed", { remainingCount: 0 })
          ),
          entry("verify_database", "db.verification-batch", "completed", {
            detail: "batch verification executed",
          }),
        ],
      }),
    ];
    const supabase = { from: makeDeletionRequestsFake(rows), rpc };
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");

    const result = await runDeletionWorkflow(supabase as never, "user-1");

    expect(result.status).toBe("completed");
    expect(verifyCallCount()).toBe(0);
    // The guard's own fresh entry is appended *after* the pre-seeded marker
    // — checkpoint now has two "db.verification-batch" entries (the
    // original "completed" one this call didn't touch, plus the guard's own
    // "skipped"/"already completed" one) — so this must find the *last*
    // match, not the first.
    const skipEntry = result.checkpoint.findLast(
      (e) => e.phase === "verify_database" && e.resourceId === "db.verification-batch"
    );
    expect(skipEntry?.resourceStatus).toBe("skipped");
    expect(skipEntry?.detail).toBe("already completed");
  });
});

describe("stepVerifyStorage (via runDeletionWorkflow) — TDD §4.2", () => {
  it("both buckets clean: two completed entries, workflow reaches completed", async () => {
    const { rpc } = makeRpc([{ data: cleanVerifyRows(), error: null }]);
    db.createClient.mockReturnValue(
      makeStorageMock({
        [BUCKET_A]: [{ data: [], error: null }],
        [BUCKET_B]: [{ data: [], error: null }],
      })
    );
    const rows = [seedRow({ status: "verify_storage" })];
    const supabase = { from: makeDeletionRequestsFake(rows), rpc };
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");

    const result = await runDeletionWorkflow(supabase as never, "user-1");

    expect(result.status).toBe("completed");
    const storageEntries = result.checkpoint.filter((e) => e.phase === "verify_storage");
    expect(storageEntries).toHaveLength(2);
    expect(storageEntries.every((e) => e.resourceStatus === "completed")).toBe(true);
  });

  it("a bucket with leftover objects is failed with remainingCount and blocks completion", async () => {
    const { rpc } = makeRpc([{ data: cleanVerifyRows(), error: null }]);
    db.createClient.mockReturnValue(
      makeStorageMock({
        [BUCKET_A]: [{ data: [], error: null }],
        [BUCKET_B]: [{ data: [{ name: "leftover.pdf" }], error: null }],
      })
    );
    const rows = [seedRow({ status: "verify_storage" })];
    const supabase = { from: makeDeletionRequestsFake(rows), rpc };
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");

    const result = await runDeletionWorkflow(supabase as never, "user-1");

    expect(result.status).toBe("retry_pending");
    const failedEntry = result.checkpoint.find((e) => e.resourceId === "storage.task-documents");
    expect(failedEntry?.resourceStatus).toBe("failed");
    expect(failedEntry?.remainingCount).toBe(1);
  });

  it("a list() error (outage) is inconclusive, not failed, and does not block completion", async () => {
    const { rpc } = makeRpc([{ data: cleanVerifyRows(), error: null }]);
    db.createClient.mockReturnValue(
      makeStorageMock({
        [BUCKET_A]: [{ data: null, error: { message: "list failed" } }],
        [BUCKET_B]: [{ data: [], error: null }],
      })
    );
    const rows = [seedRow({ status: "verify_storage" })];
    const supabase = { from: makeDeletionRequestsFake(rows), rpc };
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");

    const result = await runDeletionWorkflow(supabase as never, "user-1");

    expect(result.status).toBe("completed");
    const inconclusive = result.checkpoint.find(
      (e) => e.resourceId === "storage.document-ingestion"
    );
    expect(inconclusive?.resourceStatus).toBe("inconclusive");
  });

  it("unconfigured storage (no env vars) is inconclusive for both buckets, not failed", async () => {
    vi.unstubAllEnvs();
    const { rpc } = makeRpc([{ data: cleanVerifyRows(), error: null }]);
    const rows = [seedRow({ status: "verify_storage" })];
    const supabase = { from: makeDeletionRequestsFake(rows), rpc };
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");

    const result = await runDeletionWorkflow(supabase as never, "user-1");

    expect(result.status).toBe("completed");
    const storageEntries = result.checkpoint.filter((e) => e.phase === "verify_storage");
    expect(storageEntries.every((e) => e.resourceStatus === "inconclusive")).toBe(true);
  });
});

describe("stepVerifyExternal (via runDeletionWorkflow) — TDD §4.3", () => {
  it("emits skipped entries for OAuth/background-job resources plus a completed marker", async () => {
    const { rpc } = makeRpc([{ data: cleanVerifyRows(), error: null }]);
    db.createClient.mockReturnValue(
      makeStorageMock({
        [BUCKET_A]: [{ data: [], error: null }],
        [BUCKET_B]: [{ data: [], error: null }],
      })
    );
    const rows = [seedRow({ status: "verify_external" })];
    const supabase = { from: makeDeletionRequestsFake(rows), rpc };
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");

    const result = await runDeletionWorkflow(supabase as never, "user-1");

    expect(result.status).toBe("completed");
    const externalEntries = result.checkpoint.filter((e) => e.phase === "verify_external");
    expect(
      externalEntries.find((e) => e.resourceId === "oauth.client_integrations")?.resourceStatus
    ).toBe("skipped");
    expect(
      externalEntries.find((e) => e.resourceId === "background.document_process")?.resourceStatus
    ).toBe("skipped");
    const marker = externalEntries.find((e) => e.resourceId === "external.verification-batch");
    expect(marker?.resourceStatus).toBe("completed");
  });

  it("resume: marker already completed short-circuits without re-emitting per-resource entries", async () => {
    const { rpc } = makeRpc([{ data: cleanVerifyRows(), error: null }]);
    const rows = [
      seedRow({
        status: "verify_external",
        checkpoint: [
          entry("verify_external", "external.verification-batch", "completed", {
            detail: "batch verification executed",
          }),
        ],
      }),
    ];
    const supabase = { from: makeDeletionRequestsFake(rows), rpc };
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");

    const result = await runDeletionWorkflow(supabase as never, "user-1");

    expect(result.status).toBe("completed");
    // Only the guard's own single "skipped" entry should have been appended
    // this call — no fresh per-resource entries were emitted.
    const newEntries = result.checkpoint.filter(
      (e) => e.phase === "verify_external" && e.detail === "already completed"
    );
    expect(newEntries).toHaveLength(1);
  });
});

describe("Workflow outcome authority — ADR-0005 item 5, TDD §5.1", () => {
  it("a verify_storage failure alone (deletion and verify_database clean) still blocks completion", async () => {
    const { rpc } = makeRpc([{ data: cleanVerifyRows(), error: null }]);
    db.createClient.mockReturnValue(
      makeStorageMock({
        [BUCKET_A]: [{ data: [{ name: "leftover" }], error: null }],
        [BUCKET_B]: [{ data: [], error: null }],
      })
    );
    const rows = [seedRow({ status: "requested" })];
    const supabase = { from: makeDeletionRequestsFake(rows), rpc };
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");

    const result = await runDeletionWorkflow(supabase as never, "user-1");

    // Deletion itself succeeded, and Storage deletion is still best-effort —
    // the failure is caught only at the *verification* phase, proving
    // verification alone is now sufficient to prevent a false "completed".
    expect(result.status).toBe("retry_pending");
  });

  it("an inconclusive-only result across all three verify phases still reaches completed", async () => {
    const { rpc } = makeRpc([{ data: null, error: { message: "rpc unavailable" } }]);
    vi.unstubAllEnvs();
    const rows = [seedRow({ status: "requested" })];
    const supabase = { from: makeDeletionRequestsFake(rows), rpc };
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");

    const result = await runDeletionWorkflow(supabase as never, "user-1");

    expect(result.status).toBe("completed");
  });
});

describe("MANDATORY REGRESSION — Marker Defect (TDD §9 scenario 15, original CRITICAL finding)", () => {
  it("a confirmed defect is never masked by the marker, retry re-verifies for real, and success never follows a confirmed defect", async () => {
    const dirtyRows = cleanVerifyRows().map((r) =>
      r.table_name === "memories" ? { ...r, remaining_count: 3 } : r
    );
    const { rpc, verifyCallCount } = makeRpc([
      { data: dirtyRows, error: null }, // call 1: confirmed defect
      { data: dirtyRows, error: null }, // call 2 (retry): still dirty — real re-check
      { data: dirtyRows, error: null }, // call 3 (retry): still dirty
      { data: dirtyRows, error: null }, // call 4 (retry): still dirty — MAX_RETRY_COUNT exhausted
    ]);
    const rows = [seedRow({ status: "requested" })];
    const supabase = { from: makeDeletionRequestsFake(rows), rpc };
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");

    const first = await runDeletionWorkflow(supabase as never, "user-1");
    expect(first.status).toBe("retry_pending");
    const markerAfterFirst = first.checkpoint.find((e) => e.resourceId === "db.verification-batch");
    expect(markerAfterFirst?.resourceStatus).toBe("failed"); // never "completed" after a real defect

    const second = await runDeletionWorkflow(supabase as never, "user-1");
    // The guard must NOT fire — verifyUserOwnedDataDeleted() must be called
    // again for real, not silently skipped because a marker exists.
    expect(verifyCallCount()).toBe(2);
    expect(second.status).toBe("retry_pending"); // NOT silently "completed"
    expect(second.status).not.toBe("completed");

    const third = await runDeletionWorkflow(supabase as never, "user-1");
    expect(verifyCallCount()).toBe(3);
    expect(third.status).toBe("retry_pending"); // still not "completed"
    expect(third.status).not.toBe("completed");

    // MAX_RETRY_COUNT = 3: the 4th failed attempt (retry_count goes 3 -> 4,
    // 4 > 3) is the one that finally transitions to permanent "failed" —
    // matching deletion-workflow.test.ts's own established retry-exhaustion
    // sequence for the (unmodified) deleting_database step.
    const fourth = await runDeletionWorkflow(supabase as never, "user-1");
    expect(verifyCallCount()).toBe(4);
    expect(fourth.status).toBe("failed"); // terminal — still never "completed"
    expect(fourth.status).not.toBe("completed");
  });
});

describe("MANDATORY REGRESSION — Storage Undercount (TDD §9 scenario 17, Revision 3 finding)", () => {
  it("the per-resource guard pushes no placeholder, so a genuinely-verified-clean bucket's evidence is never lost to a later retry", async () => {
    const { rpc } = makeRpc([{ data: cleanVerifyRows(), error: null }]);
    // Call 1: bucket A clean, bucket B has a real leftover object.
    // Call 2 (retry): bucket A's guard fires (already "completed" — must
    // push nothing); bucket B is re-verified for real and now clean.
    db.createClient.mockReturnValue(
      makeStorageMock({
        [BUCKET_A]: [{ data: [], error: null }],
        [BUCKET_B]: [
          { data: [{ name: "leftover" }], error: null },
          { data: [], error: null },
        ],
      })
    );
    // Seeded starting at verify_storage directly (deleting_database/
    // deleting_storage already checkpointed completed) so this test's
    // storage-mock response queue is consumed only by stepVerifyStorage's
    // own list() calls — stepDeletingStorage runs earlier in STATE_ORDER
    // and shares the identical adapter/bucket call path, which would
    // otherwise silently consume responses meant for verification.
    const rows = [
      seedRow({
        status: "verify_storage",
        checkpoint: [
          entry("deleting_database", "db.batch", "completed"),
          entry("deleting_storage", "storage.document-ingestion", "completed"),
          entry("deleting_storage", "storage.task-documents", "completed"),
        ],
      }),
    ];
    const supabase = { from: makeDeletionRequestsFake(rows), rpc };
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");

    const first = await runDeletionWorkflow(supabase as never, "user-1");
    expect(first.status).toBe("retry_pending");

    const second = await runDeletionWorkflow(supabase as never, "user-1");
    expect(second.status).toBe("completed");

    const storageEntries = second.checkpoint.filter((e) => e.phase === "verify_storage");
    const bucketAEntries = storageEntries.filter(
      (e) => e.resourceId === "storage.document-ingestion"
    );
    const bucketBEntries = storageEntries.filter((e) => e.resourceId === "storage.task-documents");

    // The guard must have pushed NO entry for bucket A on the retry — its
    // one and only entry is still the original, genuine "completed" one.
    expect(bucketAEntries).toHaveLength(1);
    expect(bucketAEntries[0].resourceStatus).toBe("completed");
    expect(bucketAEntries.some((e) => e.resourceStatus === "skipped")).toBe(false);

    // Bucket B has two real entries (failed, then completed) — both are
    // genuine verification attempts, not placeholders.
    expect(bucketBEntries).toHaveLength(2);
    expect(bucketBEntries[0].resourceStatus).toBe("failed");
    expect(bucketBEntries[1].resourceStatus).toBe("completed");

    // Counting only actual verification work: among the *current* (latest)
    // evidence per resource, both buckets are genuinely verified — not one
    // verified and one merely "skipped".
    const latestPerResource = new Map<string, CheckpointEntry>();
    for (const e of storageEntries) latestPerResource.set(e.resourceId, e);
    expect(
      Array.from(latestPerResource.values()).every((e) => e.resourceStatus === "completed")
    ).toBe(true);
  });
});

describe("MANDATORY REGRESSION — Resume (repeated retries, repeated resumes, partial interruptions)", () => {
  it("a pre-Phase-5C row with only old per-resource 'skipped' placeholders (no marker) re-runs real verification on first post-deploy resume", async () => {
    // Simulates the exact compatibility hazard TDD §4.4/§9 scenario 10
    // names: the pre-Phase-5C pass-through wrote 32 "skipped" placeholder
    // entries, one per resourceId, but never the aggregate marker.
    const { rpc, verifyCallCount } = makeRpc([{ data: cleanVerifyRows(), error: null }]);
    const oldPlaceholders = toVerificationTargets().map(({ resourceId }) =>
      entry("verify_database", resourceId, "skipped", {
        detail: "no verificationAdapter configured in the Registry",
      })
    );
    const rows = [seedRow({ status: "verify_database", checkpoint: oldPlaceholders })];
    const supabase = { from: makeDeletionRequestsFake(rows), rpc };
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");

    const result = await runDeletionWorkflow(supabase as never, "user-1");

    expect(verifyCallCount()).toBe(1); // real verification ran — guard was correctly absent
    expect(result.status).toBe("completed");
    const marker = result.checkpoint.find((e) => e.resourceId === "db.verification-batch");
    expect(marker?.resourceStatus).toBe("completed");
  });

  it("repeated resumes across an interrupted multi-phase workflow reach the same deterministic outcome", async () => {
    const { rpc } = makeRpc([{ data: cleanVerifyRows(), error: null }]);
    db.createClient.mockReturnValue(
      makeStorageMock({
        [BUCKET_A]: [{ data: [], error: null }],
        [BUCKET_B]: [{ data: [], error: null }],
      })
    );
    // Simulate an interruption right after deleting_database completed.
    const rows = [
      seedRow({
        status: "deleting_storage",
        checkpoint: [entry("deleting_database", "db.batch", "completed")],
      }),
    ];
    const supabase = { from: makeDeletionRequestsFake(rows), rpc };
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");

    const result = await runDeletionWorkflow(supabase as never, "user-1");
    expect(result.status).toBe("completed");

    // A second, redundant call for the same (now completed) row must not
    // resurrect or duplicate any work — deletion_requests_one_active_per_user
    // excludes 'completed', so this creates a fresh row rather than reusing
    // the finished one, and that fresh row also completes deterministically.
    const again = await runDeletionWorkflow(supabase as never, "user-1");
    expect(again.status).toBe("completed");
    expect(again.resumed).toBe(false);
  });

  it("both verify_storage guards already satisfied on resume returns an empty step without halting the workflow", async () => {
    const { rpc } = makeRpc([{ data: cleanVerifyRows(), error: null }]);
    const rows = [
      seedRow({
        status: "verify_storage",
        checkpoint: [
          entry("verify_storage", "storage.document-ingestion", "completed"),
          entry("verify_storage", "storage.task-documents", "completed"),
        ],
      }),
    ];
    const supabase = { from: makeDeletionRequestsFake(rows), rpc };
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");

    const result = await runDeletionWorkflow(supabase as never, "user-1");

    expect(result.status).toBe("completed");
    // No new verify_storage entries were appended this call.
    const storageEntries = result.checkpoint.filter((e) => e.phase === "verify_storage");
    expect(storageEntries).toHaveLength(2);
  });
});

describe("DeletionWorkflowResult.checkpoint — TDD §4.6, populated on every return path", () => {
  it("is populated on the already-permanently-failed short-circuit", async () => {
    const { rpc } = makeRpc([{ data: cleanVerifyRows(), error: null }]);
    const rows = [
      seedRow({
        status: "failed",
        checkpoint: [entry("deleting_database", "db.batch", "failed", { error: "boom" })],
        retry_count: 4,
      }),
    ];
    const supabase = { from: makeDeletionRequestsFake(rows), rpc };
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");

    const result = await runDeletionWorkflow(supabase as never, "user-1");

    expect(result.status).toBe("failed");
    expect(result.checkpoint).toEqual(rows[0].checkpoint);
  });

  it("is populated on a normal completion", async () => {
    const { rpc } = makeRpc([{ data: cleanVerifyRows(), error: null }]);
    db.createClient.mockReturnValue(
      makeStorageMock({
        [BUCKET_A]: [{ data: [], error: null }],
        [BUCKET_B]: [{ data: [], error: null }],
      })
    );
    const rows = [seedRow({ status: "requested" })];
    const supabase = { from: makeDeletionRequestsFake(rows), rpc };
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");

    const result = await runDeletionWorkflow(supabase as never, "user-1");

    expect(result.status).toBe("completed");
    expect(result.checkpoint.length).toBeGreaterThan(0);
    expect(result.checkpoint).toEqual(rows[0].checkpoint);
  });

  it("fails permanently on an invalid user_id (PermanentStepError branch) with checkpoint populated", async () => {
    const { rpc } = makeRpc([{ data: cleanVerifyRows(), error: null }]);
    const rows: DeletionRequestRow[] = [];
    const supabase = { from: makeDeletionRequestsFake(rows), rpc };
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");

    const result = await runDeletionWorkflow(supabase as never, "");

    expect(result.status).toBe("failed");
    expect(result.checkpoint).toEqual(rows[0].checkpoint);
    expect(result.checkpoint.some((e) => e.resourceId === "workflow.step")).toBe(true);
  });

  it("uses the freshly re-fetched row's checkpoint, not the stale local one, on the ConcurrentModificationError branch", async () => {
    // Deterministically forces the very first persist() call in the run to
    // find a zero-row UPDATE result (as if another execution already wrote
    // to this row) — the exact condition that makes persist() throw
    // ConcurrentModificationError. Confirms TDD §4.6's one exception to the
    // blanket "checkpoint: row.checkpoint" rule: this branch must use
    // `current?.checkpoint ?? row.checkpoint` (the row re-fetched *after*
    // conceding), not the workflow's own stale `row` variable.
    const { rpc } = makeRpc([{ data: cleanVerifyRows(), error: null }]);
    const rows = [seedRow({ status: "requested", checkpoint: [] })];
    let updateCalls = 0;
    const concurrentCheckpoint = [entry("validating", "workflow.validation", "completed")];
    const from = (table: string) => {
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
        update: (patch: Partial<DeletionRequestRow>) => ({
          eq: (_col1: string, id: string) => ({
            eq: (_col2: string, updatedAt: string) => ({
              select: async (_cols: string) => {
                updateCalls += 1;
                const row = rows.find((r) => r.id === id);
                if (!row) return { data: [], error: null };
                if (updateCalls === 1) {
                  // Simulate a concurrent writer landing between our read
                  // and our first write.
                  row.updated_at = new Date(Date.now() + 1000).toISOString();
                  row.checkpoint = concurrentCheckpoint;
                  return { data: [], error: null };
                }
                if (row.updated_at !== updatedAt) return { data: [], error: null };
                Object.assign(row, patch);
                return { data: [{ id: row.id }], error: null };
              },
            }),
          }),
        }),
      };
    };
    const supabase = { from, rpc };
    const { runDeletionWorkflow } = await import("@/core/account-deletion/workflow");

    const result = await runDeletionWorkflow(supabase as never, "user-1");

    expect(result.checkpoint).toEqual(concurrentCheckpoint);
  });
});
