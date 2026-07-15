import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { audit } from "@/core/security/audit";
import { decrypt } from "@/core/security/encryption";
import { toUserOwnedDeleteOrder, toGdprExportTables } from "@/core/account-deletion/registry";
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

export async function deleteUserOwnedData(
  supabase: Pick<SupabaseClient, "from">,
  userId: string
): Promise<string[]> {
  const summary: string[] = [];
  for (const { table, column = "user_id" } of USER_OWNED_DELETE_ORDER) {
    if (table === "affiliates") {
      const { data: affiliates, error: affiliateReadError } = await supabase
        .from("affiliates")
        .select("id")
        .eq("user_id", userId);
      if (affiliateReadError) throw new Error(`affiliates: ${affiliateReadError.message}`);

      const affiliateIds = (affiliates || []).map((row) => row.id as string);
      if (affiliateIds.length > 0) {
        const { count, error } = await supabase
          .from("affiliate_referrals")
          .delete({ count: "exact" })
          .in("affiliate_id", affiliateIds);
        if (error) throw new Error(`affiliate_referrals: ${error.message}`);
        summary.push(`affiliate_referrals: ${count ?? 0}`);
      } else {
        summary.push("affiliate_referrals: 0");
      }
    }

    const { count, error } = await supabase
      .from(table)
      .delete({ count: "exact" })
      .eq(column, userId);
    if (error) throw new Error(`${table}: ${error.message}`);
    summary.push(`${table}: ${count ?? 0}`);
  }
  return summary;
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
