/**
 * Storage bucket deletion adapter (Phase 2).
 *
 * Every bucket account deletion touches keys objects as `${userId}/...`
 * (see ingest/document/presign/route.ts:97 and integrations/docgen.ts:82),
 * so enumeration is a flat, non-recursive list of one folder per user — no
 * directory walk needed.
 */

import { createClient } from "@supabase/supabase-js";
import {
  noopCleanup,
  noopPrepare,
  stubVerify,
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
    verify: stubVerify("storage verification deferred to Phase 3"),

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
