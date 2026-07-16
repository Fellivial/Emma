/**
 * Storage bucket deletion adapter (Phase 2: delete/prepare/cleanup;
 * Phase 3: real verify()).
 *
 * Every bucket account deletion touches keys objects as `${userId}/...`
 * (see ingest/document/presign/route.ts:97 and integrations/docgen.ts:82),
 * so enumeration is a flat, non-recursive list of one folder per user — no
 * directory walk needed. verify() re-lists the same folder rather than
 * trusting delete()'s own report, so it independently catches a case where
 * delete() reported success but an object was added to the folder in the
 * window between delete() and verify() (e.g. a slow, still-in-flight
 * upload) — exactly the kind of gap ADR 0004 named as the reason verify()
 * was reserved as a real Phase 3 step rather than fused into delete().
 */

import { createClient } from "@supabase/supabase-js";
import {
  noopCleanup,
  noopPrepare,
  type DeletionAdapter,
  type DeletionAdapterContext,
  type DeletionAdapterResult,
} from "../adapter";

const LIST_PAGE_SIZE = 100;

function getStorageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export function createStorageBucketAdapter(bucket: string, resourceId: string): DeletionAdapter {
  return {
    resourceId,
    prepare: noopPrepare,
    cleanup: noopCleanup,

    async verify({ userId }: DeletionAdapterContext): Promise<DeletionAdapterResult> {
      const supabase = getStorageClient();
      if (!supabase) {
        return { success: false, itemsProcessed: 0, error: "storage not configured" };
      }
      const { data: files, error } = await supabase.storage.from(bucket).list(userId, { limit: 1 });
      if (error) {
        return { success: false, itemsProcessed: 0, error: error.message };
      }
      if (!files || files.length === 0) {
        return { success: true, itemsProcessed: 0, detail: "folder empty" };
      }
      return {
        success: false,
        itemsProcessed: files.length,
        error: "objects remain under user folder",
      };
    },

    async delete({ userId }: DeletionAdapterContext): Promise<DeletionAdapterResult> {
      const supabase = getStorageClient();
      if (!supabase) {
        return { success: false, itemsProcessed: 0, error: "storage not configured" };
      }

      let removed = 0;

      // Re-listing after each batch (rather than listing once up front) is
      // what makes this resumable: a call interrupted partway through just
      // picks up whatever objects are still listed the next time delete()
      // runs, and a fully-cleared folder naturally lists empty (idempotent).
      for (;;) {
        const { data: files, error: listError } = await supabase.storage
          .from(bucket)
          .list(userId, { limit: LIST_PAGE_SIZE });

        if (listError) {
          return { success: false, itemsProcessed: removed, error: listError.message };
        }
        if (!files || files.length === 0) break;

        const paths = files.map((file) => `${userId}/${file.name}`);
        const { error: removeError } = await supabase.storage.from(bucket).remove(paths);
        if (removeError) {
          return { success: false, itemsProcessed: removed, error: removeError.message };
        }
        removed += paths.length;

        if (files.length < LIST_PAGE_SIZE) break;
      }

      return { success: true, itemsProcessed: removed };
    },
  };
}
