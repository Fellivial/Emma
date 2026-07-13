import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { audit } from "@/core/security/audit";
import { decrypt } from "@/core/security/encryption";
import type { SupabaseClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export const USER_OWNED_DELETE_ORDER: ReadonlyArray<{ table: string; column?: string }> = [
  { table: "legacy_chat_migration_ledger" },
  { table: "user_mcp_servers" },
  { table: "user_files" },
  { table: "message_feedback" },
  { table: "messages" },
  { table: "chat_messages" },
  { table: "conversations" },
  { table: "document_chunks" },
  { table: "ingested_documents" },
  { table: "email_sequences" },
  { table: "trial_events" },
  { table: "trials" },
  // Referral rows created by this user are directly owned. Rows where this
  // user is only the referred party are shared reward records and are retained.
  { table: "referrals", column: "referrer_id" },
  { table: "affiliates" },
  { table: "approvals" },
  { table: "action_log" },
  { table: "agent_task_summaries" },
  { table: "provenance_chains" },
  { table: "pattern_detections" },
  { table: "tasks" },
  { table: "push_subscriptions" },
  { table: "proactive_daily" },
  { table: "companion_state" },
  { table: "oauth_states" },
  { table: "usage_windows" },
  { table: "extra_packs" },
  { table: "personas" },
  { table: "memories" },
  { table: "usage" },
  { table: "client_members" },
  { table: "audit_log" },
  { table: "profiles", column: "id" },
];

type ExportSpec = {
  key: string;
  table: string;
  column?: string;
  select: string;
  limit?: number;
};

export const GDPR_EXPORT_TABLES: ReadonlyArray<ExportSpec> = [
  {
    key: "legacyChatMigrationLedger",
    table: "legacy_chat_migration_ledger",
    select: "legacy_message_id,user_id,migrated_at",
  },
  {
    key: "userMcpServers",
    table: "user_mcp_servers",
    select: "id,user_id,name,url,allowed_tools,blocked_tools,enabled,created_at",
  },
  {
    key: "userFiles",
    table: "user_files",
    select: "id,user_id,file_id,name,media_type,size_bytes,created_at",
  },
  {
    key: "messageFeedback",
    table: "message_feedback",
    select: "id,user_id,message_id,rating,created_at",
  },
  {
    key: "messages",
    table: "messages",
    select: "id,conversation_id,user_id,role,content,display,expression,token_estimate,created_at",
  },
  {
    key: "chatMessages",
    table: "chat_messages",
    select: "id,user_id,role,content,display,expression,created_at",
  },
  {
    key: "conversations",
    table: "conversations",
    select: "id,user_id,title,summary,message_count,token_count,created_at,updated_at",
  },
  {
    key: "documentChunks",
    table: "document_chunks",
    select: "id,user_id,doc_id,chunk_index,chunk_text,created_at",
  },
  {
    key: "ingestedDocuments",
    table: "ingested_documents",
    select:
      "id,user_id,client_id,label,mime_type,character_count,chunk_count,extracted_text,created_at",
  },
  {
    key: "emailSequences",
    table: "email_sequences",
    select:
      "id,trial_id,user_id,email,template_id,status,error_detail,scheduled_for,sent_at,created_at",
  },
  {
    key: "trialEvents",
    table: "trial_events",
    select: "id,trial_id,user_id,event,metadata,created_at",
  },
  {
    key: "trials",
    table: "trials",
    select:
      "id,user_id,client_id,plan_id,status,messages_used,messages_limit,started_at,expires_at,converted_at,cancelled_at,first_message_at,first_voice_at,first_memory_at,first_routine_at,source,referral_code,affiliate_code",
  },
  {
    key: "referrals",
    table: "referrals",
    column: "referrer_id",
    select:
      "id,referrer_id,referrer_client_id,referral_code,referred_email,referred_user_id,status,reward_type,reward_applied,created_at,converted_at,rewarded_at",
  },
  {
    key: "affiliates",
    table: "affiliates",
    select:
      "id,user_id,name,email,affiliate_code,commission_rate,commission_months,total_earned,total_referrals,status,created_at",
  },
  {
    key: "approvals",
    table: "approvals",
    select:
      "id,client_id,action_log_id,task_id,user_id,action,risk_level,tool_name,reason,status,decided_by,decided_at,expires_at,created_at",
  },
  {
    key: "actionLog",
    table: "action_log",
    select:
      "id,client_id,user_id,task_id,step_number,action,token_cost,status,risk_level,trigger_type,error,duration_ms,created_at,completed_at",
  },
  {
    key: "agentTaskSummaries",
    table: "agent_task_summaries",
    select: "id,task_id,client_id,user_id,summary_text,tokens_used,created_at",
  },
  {
    key: "provenanceChains",
    table: "provenance_chains",
    select: "id,chain_id,status,started_at,completed_at,user_id,client_id,created_at,updated_at",
  },
  {
    key: "patternDetections",
    table: "pattern_detections",
    select:
      "id,client_id,user_id,pattern_type,workflow_id,tool_sequence,recurrence,status,suppressed_until,suggestion_text,created_at,updated_at",
  },
  {
    key: "tasks",
    table: "tasks",
    select:
      "id,client_id,user_id,goal,context,status,trigger_type,trigger_source,steps_completed,max_steps,token_cost,result,summary,task_summary,steps_taken,created_at,completed_at,started_at",
  },
  {
    key: "pushSubscriptions",
    table: "push_subscriptions",
    select: "id,user_id,user_agent,created_at",
  },
  { key: "proactiveDaily", table: "proactive_daily", select: "user_id,day,count" },
  {
    key: "companionState",
    table: "companion_state",
    select:
      "user_id,last_interaction_at,last_greeting_context,last_mood,last_emotion,last_proactive_topic,presence_summary,updated_at",
  },
  {
    key: "oauthStates",
    table: "oauth_states",
    select: "id,user_id,client_id,service,created_at,expires_at",
  },
  {
    key: "usageWindows",
    table: "usage_windows",
    select: "id,user_id,window_type,window_start,tokens_used,messages_used,warning_sent,updated_at",
  },
  {
    key: "extraPacks",
    table: "extra_packs",
    select: "id,user_id,tokens_granted,tokens_remaining,valid_until,purchase_ref,created_at",
  },
  {
    key: "personas",
    table: "personas",
    select:
      "id,user_id,name,base_persona_id,tone_adjectives,communication_style,verbosity,topics_emphasise,topics_avoid,language,voice_id,description,description_screened_at,created_at,updated_at",
  },
  {
    key: "memories",
    table: "memories",
    select:
      "id,user_id,category,key,value,confidence,source,status,superseded_by,last_accessed,created_at,updated_at",
  },
  { key: "usage", table: "usage", select: "id,user_id,date,message_count,token_count,api_calls" },
  { key: "clientMembers", table: "client_members", select: "client_id,user_id,role,joined_at" },
  {
    key: "auditLog",
    table: "audit_log",
    select: "id,user_id,action,resource,resource_id,reason,created_at",
    limit: 500,
  },
  {
    key: "profile",
    table: "profiles",
    column: "id",
    select:
      "id,name,avatar,role,tts_enabled,notifications_enabled,quiet_hours_start,quiet_hours_end,onboarded,created_at,updated_at",
  },
];

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
