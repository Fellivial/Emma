import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { audit } from "@/core/security/audit";
import { decrypt } from "@/core/security/encryption";
import { toUserOwnedDeleteOrder, toGdprExportTables } from "@/core/account-deletion/registry";
import { getStorageDeletionAdapters } from "@/core/account-deletion/adapters/registry-adapters";
import type { SupabaseClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

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

/**
 * GDPR Right-to-Erasure endpoint.
 *
 * POST /api/emma/gdpr
 *   { action: "export" }  → Returns all user data as JSON
 *   { action: "delete" }  → Deletes directly user-owned Emma data
 *
 * Child records are deleted before trials, affiliates, tasks, conversations,
 * and profiles. Direct user-owned audit entries are deleted. Tenant-owned/shared
 * integrations and referral rows owned by another user are intentionally
 * excluded pending explicit ownership and retention policies.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "DB not configured" }, { status: 501 });
    }

    const { action, confirmEmail } = await req.json();

    // ── Data Export ──────────────────────────────────────────────────────
    if (action === "export") {
      const exportedData = await exportUserOwnedData(supabase, user.id);

      await audit({
        userId: user.id,
        action: "export",
        resource: "profile",
        reason: "GDPR data export requested",
      });

      return NextResponse.json({
        exportedAt: new Date().toISOString(),
        user: { id: user.id, email: user.email },
        ...exportedData,
      });
    }

    // ── Data Deletion ────────────────────────────────────────────────────
    if (action === "delete") {
      // Safety: require email confirmation
      if (confirmEmail !== user.email) {
        return NextResponse.json(
          {
            error:
              "Email confirmation required. Send { confirmEmail: 'your@email.com' } to proceed.",
          },
          { status: 400 }
        );
      }

      // Audit the request before deletion; the user-owned audit row is then
      // removed with the rest of the user's direct data below.
      await audit({
        userId: user.id,
        action: "delete",
        resource: "profile",
        reason: "GDPR right-to-erasure: full account data deletion",
        metadata: { email: user.email, timestamp: new Date().toISOString() },
      });

      const deletionLog = await deleteUserOwnedData(supabase, user.id);

      // Storage objects the database transaction above can't reach — real
      // Phase 2 adapters replacing the Phase 1 placeholder (deletionAdapter:
      // null). Best-effort: a storage failure is logged but doesn't fail the
      // request or roll back the DB erasure above, which already succeeded.
      for (const adapter of getStorageDeletionAdapters()) {
        const ctx = { userId: user.id, resourceId: adapter.resourceId };
        try {
          await adapter.prepare(ctx);
          const result = await adapter.delete(ctx);
          deletionLog.push(
            result.success
              ? `${adapter.resourceId}: ${result.itemsProcessed}`
              : `${adapter.resourceId}: error - ${result.error}`
          );
          if (!result.success) {
            console.error("[GDPR] Storage adapter failed", {
              resourceId: adapter.resourceId,
              error: result.error,
            });
          }
          await adapter.cleanup(ctx);
        } catch (err) {
          console.error("[GDPR] Storage adapter threw", { resourceId: adapter.resourceId, err });
          deletionLog.push(`${adapter.resourceId}: error - ${(err as Error).message}`);
        }
      }

      // Note: We do NOT delete the auth.users entry here.
      // The user can still log in but will have an empty account.
      // Full auth deletion should be done via Supabase dashboard or a separate admin action.

      return NextResponse.json({
        success: true,
        deletedAt: new Date().toISOString(),
        summary: deletionLog,
        note: "Auth account preserved. Contact support to fully delete your login credentials.",
      });
    }

    return NextResponse.json(
      { error: "Unknown action. Use 'export' or 'delete'." },
      { status: 400 }
    );
  } catch (err) {
    console.error("[GDPR] Error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
