import { decrypt } from "../security/encryption";
import { toUserOwnedDeleteOrder, toGdprExportTables } from "./registry";
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
