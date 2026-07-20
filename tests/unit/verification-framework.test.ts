import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { verifyUserOwnedDataDeleted } from "@/core/account-deletion/gdpr-data";
import { toVerificationTargets } from "@/core/account-deletion/registry";
import { summarizeRawVerificationEvidence } from "@/core/account-deletion/verification-types";
import type { VerificationEvidence } from "@/core/account-deletion/verification-types";

function makeRpcClient(
  impl: (fn: string, args: unknown) => Promise<{ data: unknown; error: { message: string } | null }>
) {
  return { rpc: vi.fn(impl) };
}

describe("verifyUserOwnedDataDeleted (Phase 5B verification framework — not wired into any workflow step)", () => {
  it("issues exactly one rpc() call for every verification-eligible resource (batching)", async () => {
    const targets = toVerificationTargets();
    const supabase = makeRpcClient(async () => ({
      data: targets.map(({ table }) => ({
        table_name: table,
        remaining_count: 0,
        checked: true,
        error_detail: null,
      })),
      error: null,
    }));

    const results = await verifyUserOwnedDataDeleted(supabase as never, "user-1");

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(targets.length);
  });

  it("sends p_user_id and p_tables built from toVerificationTargets()'s table/column pairs", async () => {
    const targets = toVerificationTargets();
    const supabase = makeRpcClient(async (fn, args) => {
      expect(fn).toBe("verify_user_owned_data_deleted");
      expect(args).toEqual({
        p_user_id: "user-42",
        p_tables: targets.map(({ table, column = "user_id" }) => ({ table, column })),
      });
      return { data: [], error: null };
    });

    await verifyUserOwnedDataDeleted(supabase as never, "user-42");
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });

  it("maps a clean result (remaining_count 0, checked true) to every resource, keyed by Registry resourceId", async () => {
    const targets = toVerificationTargets();
    const supabase = makeRpcClient(async () => ({
      data: targets.map(({ table }) => ({
        table_name: table,
        remaining_count: 0,
        checked: true,
        error_detail: null,
      })),
      error: null,
    }));

    const results = await verifyUserOwnedDataDeleted(supabase as never, "user-1");

    expect(results).toHaveLength(targets.length);
    const byResourceId = new Map(results.map((r) => [r.resourceId, r]));
    for (const { resourceId, table } of targets) {
      expect(byResourceId.get(resourceId)).toEqual({
        resourceId,
        table,
        checked: true,
        remainingCount: 0,
        errorDetail: undefined,
      });
    }
  });

  it("maps a table with remaining rows to checked: true, remainingCount > 0", async () => {
    const [first] = toVerificationTargets();
    const supabase = makeRpcClient(async () => ({
      data: [{ table_name: first.table, remaining_count: 3, checked: true, error_detail: null }],
      error: null,
    }));

    const [result] = await verifyUserOwnedDataDeleted(supabase as never, "user-1");
    expect(result).toEqual({
      resourceId: first.resourceId,
      table: first.table,
      checked: true,
      remainingCount: 3,
      errorDetail: undefined,
    });
  });

  it("maps a table the SQL function could not check to checked: false, remainingCount: null", async () => {
    const [first] = toVerificationTargets();
    const supabase = makeRpcClient(async () => ({
      data: [
        {
          table_name: first.table,
          remaining_count: null,
          checked: false,
          error_detail: "unknown column: document_chunks.user_id",
        },
      ],
      error: null,
    }));

    const [result] = await verifyUserOwnedDataDeleted(supabase as never, "user-1");
    expect(result).toEqual({
      resourceId: first.resourceId,
      table: first.table,
      checked: false,
      remainingCount: null,
      errorDetail: "unknown column: document_chunks.user_id",
    });
  });

  it("re-throws on a whole-call RPC failure, exactly like deleteUserOwnedData()", async () => {
    const supabase = makeRpcClient(async () => ({
      data: null,
      error: { message: "connection reset" },
    }));

    await expect(verifyUserOwnedDataDeleted(supabase as never, "user-1")).rejects.toThrow(
      "connection reset"
    );
  });

  it("throws if the RPC returns a table_name not present in toVerificationTargets() (integrity guard)", async () => {
    const supabase = makeRpcClient(async () => ({
      data: [
        { table_name: "not_a_real_table", remaining_count: 0, checked: true, error_detail: null },
      ],
      error: null,
    }));

    await expect(verifyUserOwnedDataDeleted(supabase as never, "user-1")).rejects.toThrow(
      /unrecognized table/
    );
  });
});

describe("verifyUserOwnedDataDeleted — dependency injection (no global state, no singleton)", () => {
  it("uses only the injected client per call — two calls with two different clients never cross-talk", async () => {
    const [first] = toVerificationTargets();
    const clientA = makeRpcClient(async () => ({
      data: [{ table_name: first.table, remaining_count: 0, checked: true, error_detail: null }],
      error: null,
    }));
    const clientB = makeRpcClient(async () => ({
      data: [{ table_name: first.table, remaining_count: 7, checked: true, error_detail: null }],
      error: null,
    }));

    const [resultA] = await verifyUserOwnedDataDeleted(clientA as never, "user-a");
    const [resultB] = await verifyUserOwnedDataDeleted(clientB as never, "user-b");

    expect(resultA.remainingCount).toBe(0);
    expect(resultB.remainingCount).toBe(7);
    expect(clientA.rpc).toHaveBeenCalledTimes(1);
    expect(clientB.rpc).toHaveBeenCalledTimes(1);
  });
});

describe("verification-types — shared framework models (Phase 5B: contracts only, no execution)", () => {
  it("summarizeRawVerificationEvidence() counts a fully clean attempt as all-verified", () => {
    const evidence: VerificationEvidence = [
      { resourceId: "db.a", table: "a", checked: true, remainingCount: 0 },
      { resourceId: "db.b", table: "b", checked: true, remainingCount: 0 },
    ];
    expect(summarizeRawVerificationEvidence(evidence)).toEqual({
      verified: 2,
      failed: 0,
      inconclusive: 0,
    });
  });

  it("summarizeRawVerificationEvidence() distinguishes failed (confirmed leftover data) from inconclusive (not checked)", () => {
    const evidence: VerificationEvidence = [
      { resourceId: "db.a", table: "a", checked: true, remainingCount: 0 },
      { resourceId: "db.b", table: "b", checked: true, remainingCount: 5 },
      { resourceId: "db.c", table: "c", checked: false, remainingCount: null, errorDetail: "x" },
    ];
    expect(summarizeRawVerificationEvidence(evidence)).toEqual({
      verified: 1,
      failed: 1,
      inconclusive: 1,
    });
  });

  it("summarizeRawVerificationEvidence() on empty evidence returns all zero", () => {
    expect(summarizeRawVerificationEvidence([])).toEqual({
      verified: 0,
      failed: 0,
      inconclusive: 0,
    });
  });
});

describe("Phase 5C scope boundary — workflow activated, API surface still untouched", () => {
  // Phase 5B's own "feature isolation" checks here (workflow.ts unchanged,
  // CRITICAL_STEPS unwidened, zero-arg verify-step pass-throughs) are
  // deliberately retired, not merely deleted without explanation: Phase 5C
  // is the phase whose entire purpose is to activate exactly what those
  // checks asserted stayed inert. Real coverage for the now-wired workflow
  // lives in verification-workflow.test.ts. What remains true, and worth
  // keeping a regression lock on, is that WP7 (the API surface) is still
  // untouched — route.ts gains no new response field until a later phase.
  const routeSource = readFileSync(
    resolve(process.cwd(), "src/app/api/emma/gdpr/route.ts"),
    "utf8"
  );

  it("route.ts does not reference a new 'verification' response field yet (WP7, not yet in scope)", () => {
    expect(routeSource).not.toContain("verification:");
    expect(routeSource).not.toContain("verifyUserOwnedDataDeleted");
  });
});
