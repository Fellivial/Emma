/**
 * Resolves Deletion Resource Registry entries to adapter instances.
 *
 * Keeps the Registry as the single source of truth for which resources have
 * a real Phase 2 adapter (deletionAdapter === "storage-bucket-delete")
 * instead of a second hardcoded resourceId list drifting alongside it.
 */

import { DELETION_RESOURCE_REGISTRY } from "../registry";
import { createStorageBucketAdapter } from "./storage-bucket-adapter";
import type { DeletionAdapter } from "../adapter";

function bucketFromResourceId(resourceId: string): string {
  return resourceId.replace(/^storage\./, "");
}

const STORAGE_ADAPTERS: ReadonlyArray<DeletionAdapter> = DELETION_RESOURCE_REGISTRY.filter(
  (entry) => entry.deletionAdapter === "storage-bucket-delete"
).map((entry) =>
  createStorageBucketAdapter(bucketFromResourceId(entry.resourceId), entry.resourceId)
);

export function getStorageDeletionAdapters(): ReadonlyArray<DeletionAdapter> {
  return STORAGE_ADAPTERS;
}
