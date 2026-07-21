import { decrypt } from "../security/encryption";
import { toUserOwnedDeleteOrder, toGdprExportTables, toVerificationTargets } from "./registry";
import type { SupabaseClient } from "@supabase/supabase-js";

// Derived from the Deletion Resource Registry (src/core/account-deletion/registry.ts)
// rather than maintained here — the Registry is the single canonical inventory
// of user-owned resources; this array and GDPR_EXPORT_TABLES below are two
// projections of the same source instead of independently-maintained lists.
export const USER_OWNED_DELETE_ORDER: ReadonlyArray<{ table: string; column?: string }> =
  toUserOwnedDeleteOrder();

export const GDPR_EXPORT_TABLES = toGdprExportTables();

interface DeleteUserOwnedDataRow {
  table_name: string;
  deleted_count: number;
}

/**
 * Deletes every table in USER_OWNED_DELETE_ORDER for one user inside a
 * single Postgres transaction (delete_user_owned_data_ordered — Phase 2).
 * Table/column list and order still come entirely from the Registry; the
 * database function only adds atomicity and the affiliates special case
 * (see supabase/migrations/20260716000001_transactional_deletion.sql).
 * A failure partway through now rolls back everything instead of leaving
 * the user's data half-deleted.
 */
export async function deleteUserOwnedData(
  supabase: Pick<SupabaseClient, "rpc">,
  userId: string
): Promise<string[]> {
  const { data, error } = await supabase.rpc("delete_user_owned_data_ordered", {
    p_user_id: userId,
    p_tables: USER_OWNED_DELETE_ORDER.map(({ table, column = "user_id" }) => ({ table, column })),
  });
  if (error) throw new Error(error.message);

  return ((data ?? []) as DeleteUserOwnedDataRow[]).map(
    ({ table_name, deleted_count }) => `${table_name}: ${deleted_count}`
  );
}

/**
 * One database resource's verification outcome (Phase 4B TDD §2.3). Always
 * present for every verification-eligible resource, whether or not that
 * resource's own check succeeded — an inconclusive check is itself
 * evidence, not an absence of evidence.
 */
export interface DatabaseVerificationResult {
  resourceId: string;
  table: string;
  checked: boolean;
  remainingCount: number | null;
  errorDetail?: string;
}

interface VerifyUserOwnedDataRow {
  table_name: string;
  remaining_count: number | null;
  checked: boolean;
  error_detail: string | null;
}

/**
 * Phase 5B infrastructure (TDD §2.3) — the verification counterpart to
 * deleteUserOwnedData(), following its exact shape: same (supabase, userId)
 * parameter injection, same re-throw-on-whole-call-failure contract. Issues
 * exactly one supabase.rpc() call for every verification-eligible resource
 * (the batching requirement, ADR-0005 item 6) and maps the read-only
 * verify_user_owned_data_deleted RPC's tabular result back to Registry
 * resourceIds via a table→resourceId lookup built once from
 * toVerificationTargets() — never in SQL, exactly as
 * delete_user_owned_data_ordered's caller never resolves resourceIds either.
 *
 * Does not decide workflow outcome — it only reports what it found; that is
 * stepVerifyDatabase's job (workflow.ts, wired since Phase 5C). Does not
 * catch a whole-call RPC failure itself — it re-throws, exactly like
 * deleteUserOwnedData() (gdpr-data.ts:36), leaving that to the caller.
 */
export async function verifyUserOwnedDataDeleted(
  supabase: Pick<SupabaseClient, "rpc">,
  userId: string
): Promise<DatabaseVerificationResult[]> {
  const targets = toVerificationTargets();
  const resourceIdByTable = new Map(targets.map(({ table, resourceId }) => [table, resourceId]));

  const { data, error } = await supabase.rpc("verify_user_owned_data_deleted", {
    p_user_id: userId,
    p_tables: targets.map(({ table, column = "user_id" }) => ({ table, column })),
  });
  if (error) throw new Error(error.message);

  return ((data ?? []) as VerifyUserOwnedDataRow[]).map((row) => {
    const resourceId = resourceIdByTable.get(row.table_name);
    if (!resourceId) {
      throw new Error(
        `verify_user_owned_data_deleted returned an unrecognized table: ${row.table_name}`
      );
    }
    return {
      resourceId,
      table: row.table_name,
      checked: row.checked,
      remainingCount: row.remaining_count,
      errorDetail: row.error_detail ?? undefined,
    };
  });
}

function decryptExportValue(value: unknown): unknown {
  if (typeof value !== "string" || !value.startsWith("enc:v1:")) return value;
  try {
    return decrypt(value);
  } catch {
    return null;
  }
}

function decryptExportRow(row: Record<string, unknown>): Record<string, unknown> {
  const decrypted = { ...row };
  for (const key of [
    "value",
    "title",
    "summary",
    "content",
    "display",
    "chunk_text",
    "extracted_text",
    "last_mood",
    "last_emotion",
    "last_proactive_topic",
    "presence_summary",
  ]) {
    if (key in decrypted) decrypted[key] = decryptExportValue(decrypted[key]);
  }
  return decrypted;
}

export async function exportUserOwnedData(
  supabase: Pick<SupabaseClient, "from">,
  userId: string
): Promise<Record<string, unknown>> {
  const entries = await Promise.all(
    GDPR_EXPORT_TABLES.map(async ({ key, table, column = "user_id", select, limit }) => {
      const query = supabase.from(table).select(select).eq(column, userId);
      const { data } = limit ? await query.limit(limit) : await query;
      const rows = ((data || []) as unknown as Array<Record<string, unknown>>).map(
        decryptExportRow
      );
      return [key, key === "profile" ? (rows[0] ?? null) : rows] as const;
    })
  );

  const exported = Object.fromEntries(entries);
  if (exported.affiliates) {
    const affiliateIds = (exported.affiliates as Array<Record<string, unknown>>)
      .map((row) => row.id)
      .filter((id): id is string => typeof id === "string");
    if (affiliateIds.length > 0) {
      const { data } = await supabase
        .from("affiliate_referrals")
        .select(
          "id,affiliate_id,referred_email,referred_user_id,referred_client_id,status,plan_id,monthly_revenue,commission_paid,months_tracked,created_at,converted_at"
        )
        .in("affiliate_id", affiliateIds);
      exported.affiliateReferrals = (data || []) as Array<Record<string, unknown>>;
    } else {
      exported.affiliateReferrals = [];
    }
  }

  return exported;
}
