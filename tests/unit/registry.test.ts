import { describe, expect, it } from "vitest";
import {
  DELETION_RESOURCE_REGISTRY,
  getDatabaseResources,
  toGdprExportTables,
  toUserOwnedDeleteOrder,
  type ResourceOwnership,
} from "@/core/account-deletion/registry";

const VALID_OWNERSHIP: ResourceOwnership[] = ["user-owned", "tenant-owned", "out-of-scope"];

describe("Deletion Resource Registry", () => {
  it("has exactly 37 entries (32 database + 5 other)", () => {
    expect(DELETION_RESOURCE_REGISTRY).toHaveLength(37);
    expect(getDatabaseResources()).toHaveLength(32);
  });

  it("has no duplicate resourceId across the whole registry", () => {
    const ids = DELETION_RESOURCE_REGISTRY.map((entry) => entry.resourceId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("stamps every entry with workflow version 1", () => {
    for (const entry of DELETION_RESOURCE_REGISTRY) {
      expect(entry.introducedInWorkflowVersion).toBe(1);
    }
  });

  it("only uses valid ownership classifications", () => {
    for (const entry of DELETION_RESOURCE_REGISTRY) {
      expect(VALID_OWNERSHIP).toContain(entry.ownershipClassification);
    }
  });

  it("every database resource is phase 'deleting_database', critical, and has the legacy delete adapter", () => {
    for (const entry of getDatabaseResources()) {
      expect(entry.phase).toBe("deleting_database");
      expect(entry.criticality).toBe("critical");
      expect(entry.deletionAdapter).toBe("legacy-table-delete");
      expect(entry.verificationAdapter).toBeNull();
      expect(entry.enumerable).toBe(false);
    }
  });

  it("the out-of-scope resource has no phase or criticality", () => {
    const excluded = DELETION_RESOURCE_REGISTRY.find(
      (entry) => entry.resourceId === "excluded.ingested_whatsapp"
    );
    expect(excluded).toBeDefined();
    expect(excluded?.ownershipClassification).toBe("out-of-scope");
    expect(excluded?.phase).toBeNull();
    expect(excluded?.criticality).toBeNull();
  });

  it("includes the known non-database resources with their expected phase", () => {
    const byId = new Map(DELETION_RESOURCE_REGISTRY.map((entry) => [entry.resourceId, entry]));
    expect(byId.get("storage.document-ingestion")?.phase).toBe("deleting_storage");
    expect(byId.get("storage.task-documents")?.phase).toBe("deleting_storage");
    expect(byId.get("oauth.client_integrations")?.phase).toBe("deleting_oauth");
    expect(byId.get("oauth.client_integrations")?.ownershipClassification).toBe("tenant-owned");
    expect(byId.get("background.document_process")?.phase).toBe("deleting_background_jobs");
  });

  it("gives both Storage resources the Phase 2 real adapter, not the Phase 1 placeholder", () => {
    const byId = new Map(DELETION_RESOURCE_REGISTRY.map((entry) => [entry.resourceId, entry]));
    expect(byId.get("storage.document-ingestion")?.deletionAdapter).toBe("storage-bucket-delete");
    expect(byId.get("storage.task-documents")?.deletionAdapter).toBe("storage-bucket-delete");
  });

  it("leaves OAuth and background-job resources as null adapters (out of Phase 2 scope)", () => {
    const byId = new Map(DELETION_RESOURCE_REGISTRY.map((entry) => [entry.resourceId, entry]));
    expect(byId.get("oauth.client_integrations")?.deletionAdapter).toBeNull();
    expect(byId.get("background.document_process")?.deletionAdapter).toBeNull();
  });

  it("toUserOwnedDeleteOrder() mirrors getDatabaseResources() table/column, in order", () => {
    const order = toUserOwnedDeleteOrder();
    const resources = getDatabaseResources();
    expect(order).toHaveLength(resources.length);
    order.forEach((entry, i) => {
      expect(entry.table).toBe(resources[i].table);
      expect(entry.column).toBe(resources[i].column);
    });
  });

  it("toUserOwnedDeleteOrder() keeps child-before-parent ordering for known cascades", () => {
    const tables = toUserOwnedDeleteOrder().map(({ table }) => table);
    expect(tables.indexOf("email_sequences")).toBeLessThan(tables.indexOf("trials"));
    expect(tables.indexOf("trial_events")).toBeLessThan(tables.indexOf("trials"));
    expect(tables.indexOf("companion_state")).toBeLessThan(tables.indexOf("profiles"));
  });

  it("toGdprExportTables() has one entry per database resource with unique keys", () => {
    const exportTables = toGdprExportTables();
    const resources = getDatabaseResources();
    expect(exportTables).toHaveLength(resources.length);

    const keys = exportTables.map(({ key }) => key);
    expect(new Set(keys).size).toBe(keys.length);

    exportTables.forEach((entry, i) => {
      expect(entry.table).toBe(resources[i].table);
      expect(entry.column).toBe(resources[i].column);
      expect(entry.select).toBe(resources[i].exportSelect);
      expect(entry.limit).toBe(resources[i].exportLimit);
    });
  });

  it("caps the audit_log export at 500 rows", () => {
    const auditLog = toGdprExportTables().find(({ table }) => table === "audit_log");
    expect(auditLog?.limit).toBe(500);
  });

  it("db.affiliates has no column override — the SQL cascade assumes it resolves to user_id", () => {
    // The transactional function's affiliate_referrals cascade dynamically
    // reads whatever column this entry resolves to (v_column), so it's safe
    // against a future override — but if this entry ever *did* override its
    // column, the cascade's own ownership lookup would follow it too. This
    // test documents and locks in today's actual assumption: no override.
    const affiliates = getDatabaseResources().find((entry) => entry.table === "affiliates");
    expect(affiliates?.column).toBe("user_id");
  });

  it("has no registry entry for affiliate_referrals — it's cascade-deleted inline, not column-filtered", () => {
    const ids = DELETION_RESOURCE_REGISTRY.map((entry) => entry.resourceId);
    const tables = getDatabaseResources().map((entry) => entry.table);
    expect(ids).not.toContain("db.affiliate_referrals");
    expect(tables).not.toContain("affiliate_referrals");
  });

  it("every database resource's table/column would pass the SQL function's own identifier check", () => {
    // Defense-in-depth consistency: the transactional function validates
    // table/column against ^[a-zA-Z_][a-zA-Z0-9_]*$ before using them in
    // dynamic SQL. Every Registry-sourced value should already satisfy that
    // pattern — this test fails loudly in CI, not at RPC-call time in
    // production, if a future entry ever wouldn't.
    const identifierPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    for (const { table, column } of toUserOwnedDeleteOrder()) {
      expect(table).toMatch(identifierPattern);
      expect(column).toMatch(identifierPattern);
    }
  });
});
