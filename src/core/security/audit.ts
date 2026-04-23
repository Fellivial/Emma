/**
 * Audit Logger — compliance-grade action logging.
 *
 * Every data access/mutation by Emma is logged with:
 *   who    — user ID or "system"
 *   what   — action type (read/write/delete/execute)
 *   where  — resource type + ID
 *   when   — server timestamp
 *   why    — reason/context
 *
 * Logs are append-only. No one can delete audit entries.
 * Stored in a separate `audit_log` table with no RLS delete policy.
 */

import { createClient } from "@supabase/supabase-js";

export type AuditAction =
  | "read"
  | "write"
  | "delete"
  | "execute"
  | "login"
  | "logout"
  | "export"
  | "approve"
  | "reject"
  | "encrypt"
  | "decrypt";

export type AuditResource =
  | "memory"
  | "conversation"
  | "message"
  | "profile"
  | "client_config"
  | "device"
  | "routine"
  | "approval"
  | "task"
  | "webhook"
  | "billing"
  | "session";

export interface AuditEntry {
  userId: string;
  action: AuditAction;
  resource: AuditResource;
  resourceId?: string;
  reason: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Log an auditable action. Non-blocking — failures are logged to console
 * but never thrown (audit should not break user flows).
 */
export async function audit(entry: AuditEntry): Promise<void> {
  const supabase = getSupabase();

  // Always log to console as backup
  const logLine = `[AUDIT] ${entry.action} ${entry.resource}${entry.resourceId ? `:${entry.resourceId}` : ""} by=${entry.userId} reason="${entry.reason}"`;

  if (!supabase) {
    console.log(logLine);
    return;
  }

  try {
    await supabase.from("audit_log").insert({
      user_id: entry.userId,
      action: entry.action,
      resource: entry.resource,
      resource_id: entry.resourceId || null,
      reason: entry.reason,
      metadata: entry.metadata || null,
      ip_address: entry.ip || null,
    });
  } catch (err) {
    // Never throw from audit — log and continue
    console.error("[AUDIT] Write failed:", err);
    console.log(logLine); // Fallback to console
  }
}

/**
 * Batch audit — for operations that touch multiple resources.
 */
export async function auditBatch(entries: AuditEntry[]): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    for (const e of entries) {
      console.log(`[AUDIT] ${e.action} ${e.resource} by=${e.userId}`);
    }
    return;
  }

  try {
    const rows = entries.map((e) => ({
      user_id: e.userId,
      action: e.action,
      resource: e.resource,
      resource_id: e.resourceId || null,
      reason: e.reason,
      metadata: e.metadata || null,
      ip_address: e.ip || null,
    }));
    await supabase.from("audit_log").insert(rows);
  } catch (err) {
    console.error("[AUDIT] Batch write failed:", err);
  }
}

/**
 * Read audit log for a user (for GDPR data export / transparency).
 */
export async function getAuditLogForUser(
  userId: string,
  limit: number = 100
): Promise<Array<Record<string, unknown>>> {
  const supabase = getSupabase();
  if (!supabase) return [];

  try {
    const { data } = await supabase
      .from("audit_log")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    return data || [];
  } catch {
    return [];
  }
}
