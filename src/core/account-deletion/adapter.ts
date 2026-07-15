/**
 * Deletion Adapter Lifecycle (Phase 2: Execution Foundation)
 *
 * The shared contract every resource-specific deletion adapter implements.
 * Phase 2 only implements Storage adapters against this contract; OAuth,
 * background-job, and other external adapters are later-phase work but
 * reuse the same four-stage lifecycle so a future orchestrator can drive
 * every adapter identically regardless of resource type.
 *
 * verify() is part of the contract now so adapters don't need a breaking
 * interface change when Phase 3 adds real verification — Phase 2's own
 * adapters implement it as a stub (see stubVerify below) since Phase 3 owns
 * verification logic.
 */

export interface DeletionAdapterContext {
  userId: string;
  resourceId: string;
}

export interface DeletionAdapterResult {
  success: boolean;
  itemsProcessed: number;
  detail?: string;
  error?: string;
}

export interface DeletionAdapter {
  resourceId: string;
  prepare(ctx: DeletionAdapterContext): Promise<void>;
  delete(ctx: DeletionAdapterContext): Promise<DeletionAdapterResult>;
  verify(ctx: DeletionAdapterContext): Promise<DeletionAdapterResult>;
  cleanup(ctx: DeletionAdapterContext): Promise<void>;
}

export async function noopPrepare(): Promise<void> {}

export async function noopCleanup(): Promise<void> {}

/** Phase 2 adapters use this for verify() — Phase 3 owns real verification. */
export function stubVerify(detail: string) {
  return async function verify(): Promise<DeletionAdapterResult> {
    return { success: true, itemsProcessed: 0, detail };
  };
}
