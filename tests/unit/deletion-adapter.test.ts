import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: db.createClient }));

describe("deletion adapter lifecycle", () => {
  it("noopPrepare/noopCleanup resolve without doing anything", async () => {
    const { noopPrepare, noopCleanup } = await import("@/core/account-deletion/adapter");
    await expect(noopPrepare()).resolves.toBeUndefined();
    await expect(noopCleanup()).resolves.toBeUndefined();
  });

  it("stubVerify always reports success with zero items and the given detail", async () => {
    const { stubVerify } = await import("@/core/account-deletion/adapter");
    const verify = stubVerify("deferred to Phase 3");
    await expect(verify()).resolves.toEqual({
      success: true,
      itemsProcessed: 0,
      detail: "deferred to Phase 3",
    });
  });
});

describe("storage bucket deletion adapter", () => {
  beforeEach(() => {
    vi.resetModules();
    db.createClient.mockReset();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
  });

  it("lists and removes every object under the user's folder, across pages", async () => {
    const listCalls: string[] = [];
    const removeCalls: string[][] = [];
    let call = 0;
    const bucketClient = {
      list: vi.fn(async (folder: string) => {
        listCalls.push(folder);
        call++;
        if (call === 1) {
          return {
            data: Array.from({ length: 100 }, (_, i) => ({ name: `file-${i}` })),
            error: null,
          };
        }
        return { data: [{ name: "file-last" }], error: null };
      }),
      remove: vi.fn(async (paths: string[]) => {
        removeCalls.push(paths);
        return { error: null };
      }),
    };
    db.createClient.mockReturnValue({ storage: { from: vi.fn(() => bucketClient) } });

    const { createStorageBucketAdapter } =
      await import("@/core/account-deletion/adapters/storage-bucket-adapter");
    const adapter = createStorageBucketAdapter("document-ingestion", "storage.document-ingestion");

    const result = await adapter.delete({
      userId: "user-1",
      resourceId: "storage.document-ingestion",
    });

    expect(result).toEqual({ success: true, itemsProcessed: 101 });
    expect(listCalls).toEqual(["user-1", "user-1"]);
    expect(removeCalls[0]).toHaveLength(100);
    expect(removeCalls[0][0]).toBe("user-1/file-0");
    expect(removeCalls[1]).toEqual(["user-1/file-last"]);
  });

  it("is idempotent — a second delete() on an already-empty folder is a no-op success", async () => {
    const bucketClient = {
      list: vi.fn(async () => ({ data: [], error: null })),
      remove: vi.fn(),
    };
    db.createClient.mockReturnValue({ storage: { from: vi.fn(() => bucketClient) } });

    const { createStorageBucketAdapter } =
      await import("@/core/account-deletion/adapters/storage-bucket-adapter");
    const adapter = createStorageBucketAdapter("task-documents", "storage.task-documents");

    const result = await adapter.delete({ userId: "user-1", resourceId: "storage.task-documents" });

    expect(result).toEqual({ success: true, itemsProcessed: 0 });
    expect(bucketClient.remove).not.toHaveBeenCalled();
  });

  it("reports a failed list() without throwing", async () => {
    const bucketClient = {
      list: vi.fn(async () => ({ data: null, error: { message: "list failed" } })),
      remove: vi.fn(),
    };
    db.createClient.mockReturnValue({ storage: { from: vi.fn(() => bucketClient) } });

    const { createStorageBucketAdapter } =
      await import("@/core/account-deletion/adapters/storage-bucket-adapter");
    const adapter = createStorageBucketAdapter("document-ingestion", "storage.document-ingestion");

    const result = await adapter.delete({
      userId: "user-1",
      resourceId: "storage.document-ingestion",
    });

    expect(result).toEqual({ success: false, itemsProcessed: 0, error: "list failed" });
  });

  it("reports a failed remove() without throwing, keeping items already removed", async () => {
    const bucketClient = {
      list: vi.fn(async () => ({ data: [{ name: "file-0" }], error: null })),
      remove: vi.fn(async () => ({ error: { message: "remove failed" } })),
    };
    db.createClient.mockReturnValue({ storage: { from: vi.fn(() => bucketClient) } });

    const { createStorageBucketAdapter } =
      await import("@/core/account-deletion/adapters/storage-bucket-adapter");
    const adapter = createStorageBucketAdapter("document-ingestion", "storage.document-ingestion");

    const result = await adapter.delete({
      userId: "user-1",
      resourceId: "storage.document-ingestion",
    });

    expect(result).toEqual({ success: false, itemsProcessed: 0, error: "remove failed" });
  });

  it("fails gracefully when Supabase env vars are missing", async () => {
    vi.unstubAllEnvs();

    const { createStorageBucketAdapter } =
      await import("@/core/account-deletion/adapters/storage-bucket-adapter");
    const adapter = createStorageBucketAdapter("document-ingestion", "storage.document-ingestion");

    const result = await adapter.delete({
      userId: "user-1",
      resourceId: "storage.document-ingestion",
    });

    expect(result).toEqual({ success: false, itemsProcessed: 0, error: "storage not configured" });
  });

  it("verify() is a stub deferring to Phase 3 and never touches storage", async () => {
    const { createStorageBucketAdapter } =
      await import("@/core/account-deletion/adapters/storage-bucket-adapter");
    const adapter = createStorageBucketAdapter("document-ingestion", "storage.document-ingestion");

    const result = await adapter.verify({
      userId: "user-1",
      resourceId: "storage.document-ingestion",
    });

    expect(result.success).toBe(true);
    expect(result.itemsProcessed).toBe(0);
    expect(db.createClient).not.toHaveBeenCalled();
  });
});

describe("registry-driven adapter resolution", () => {
  it("returns exactly one adapter per Storage resource marked storage-bucket-delete in the Registry", async () => {
    const { DELETION_RESOURCE_REGISTRY } = await import("@/core/account-deletion/registry");
    const { getStorageDeletionAdapters } =
      await import("@/core/account-deletion/adapters/registry-adapters");

    const expectedIds = DELETION_RESOURCE_REGISTRY.filter(
      (entry) => entry.deletionAdapter === "storage-bucket-delete"
    ).map((entry) => entry.resourceId);

    const adapters = getStorageDeletionAdapters();

    expect(adapters.map((a) => a.resourceId).sort()).toEqual(expectedIds.sort());
    expect(expectedIds).toEqual(
      expect.arrayContaining(["storage.document-ingestion", "storage.task-documents"])
    );
  });

  it("every resolved adapter satisfies the full DeletionAdapter lifecycle contract", async () => {
    // Future-proofing: this holds for Storage today and should keep holding
    // when an OAuth or background-job adapter is added later without
    // needing a parallel, adapter-type-specific version of this test.
    const { getStorageDeletionAdapters } =
      await import("@/core/account-deletion/adapters/registry-adapters");

    const adapters = getStorageDeletionAdapters();
    expect(adapters.length).toBeGreaterThan(0);

    for (const adapter of adapters) {
      expect(typeof adapter.resourceId).toBe("string");
      expect(adapter.resourceId.length).toBeGreaterThan(0);
      expect(typeof adapter.prepare).toBe("function");
      expect(typeof adapter.delete).toBe("function");
      expect(typeof adapter.verify).toBe("function");
      expect(typeof adapter.cleanup).toBe("function");
    }
  });
});
