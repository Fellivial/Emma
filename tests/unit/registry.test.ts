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
});
