/**
 * Deletion Resource Registry (ADR 0004, Phase 1: Foundation)
 *
 * The single canonical inventory of every resource that may need to be
 * deleted, verified, or reported on when a user's account is erased. Every
 * other part of the account-deletion system reads from this list rather
 * than maintaining its own — orchestration (which resources to process per
 * phase), verification (which resources to independently re-check),
 * metrics (grouped by resourceId), and today, Phase 1's only consumer:
 * src/app/api/emma/gdpr/route.ts derives its delete-order and export-table
 * arrays from here instead of maintaining them separately.
 *
 * Before this registry existed, USER_OWNED_DELETE_ORDER and
 * GDPR_EXPORT_TABLES in gdpr/route.ts independently listed largely the same
 * resources — the exact duplication that let document_chunks, personas,
 * push_subscriptions, and proactive_daily drift out of sync with the live
 * database undetected (see the Phase 0 deployment audit). Merging them here
 * is Phase 1's fix for that duplication, not just documentation of intent.
 *
 * Phase 1 populates this with today's actual resources, including the ones
 * the current GDPR delete path does NOT yet handle (Storage, OAuth,
 * background jobs — Phase 0B's findings) with deletionAdapter/
 * verificationAdapter left null. Later phases implement those adapters;
 * this file does not change deletion behavior by itself.
 */

export type ResourceOwnership = "user-owned" | "tenant-owned" | "out-of-scope";
export type ResourceCriticality = "critical" | "high" | "medium" | "informational";
export type DeletionPhase =
  | "deleting_database"
  | "deleting_storage"
  | "deleting_oauth"
  | "deleting_background_jobs";

interface ResourceEntryBase {
  resourceId: string;
  ownershipClassification: ResourceOwnership;
  owner: string;
  criticality: ResourceCriticality | null;
  enumerable: boolean;
  deletionAdapter: string | null;
  verificationAdapter: string | null;
  introducedInWorkflowVersion: number;
  notes?: string;
}

export interface DatabaseResourceEntry extends ResourceEntryBase {
  phase: "deleting_database";
  table: string;
  column: string;
  exportKey: string;
  exportSelect: string;
  exportLimit?: number;
}

export interface OtherResourceEntry extends ResourceEntryBase {
  phase: Exclude<DeletionPhase, "deleting_database"> | null;
}

export type DeletionResourceEntry = DatabaseResourceEntry | OtherResourceEntry;

function db(
  entry: Omit<DatabaseResourceEntry, "phase" | "column" | "criticality"> & {
    column?: string;
  }
): DatabaseResourceEntry {
  return {
    phase: "deleting_database",
    column: entry.column ?? "user_id",
    criticality: "critical",
    ...entry,
  };
}

/**
 * The 32 directly user-owned tables currently deleted/exported by
 * gdpr/route.ts, in the exact order deletion must happen (children before
 * parents). deletionAdapter "legacy-table-delete" is a label, not a literal
 * DeletionAdapter instance — as of Phase 2 the standard adapter lifecycle
 * (src/core/account-deletion/adapter.ts) exists and Storage resources use
 * it, but database resources deliberately don't: they're deleted together,
 * atomically, by one transactional SQL function
 * (delete_user_owned_data_ordered), not per-table adapter calls. See ADR
 * 0004's "Why database resources don't use the DeletionAdapter interface."
 */
const DATABASE_RESOURCES: DatabaseResourceEntry[] = [
  db({
    resourceId: "db.legacy_chat_migration_ledger",
    ownershipClassification: "user-owned",
    owner: "gdpr-route",
    enumerable: false,
    deletionAdapter: "legacy-table-delete",
    verificationAdapter: null,
    introducedInWorkflowVersion: 1,
    table: "legacy_chat_migration_ledger",
    exportKey: "legacyChatMigrationLedger",
    exportSelect: "legacy_message_id,user_id,migrated_at",
  }),
  db({
    resourceId: "db.user_mcp_servers",
    ownershipClassification: "user-owned",
    owner: "gdpr-route",
    enumerable: false,
    deletionAdapter: "legacy-table-delete",
    verificationAdapter: null,
    introducedInWorkflowVersion: 1,
    table: "user_mcp_servers",
    exportKey: "userMcpServers",
    exportSelect: "id,user_id,name,url,allowed_tools,blocked_tools,enabled,created_at",
  }),
  db({
    resourceId: "db.user_files",
    ownershipClassification: "user-owned",
    owner: "gdpr-route",
    enumerable: false,
    deletionAdapter: "legacy-table-delete",
    verificationAdapter: null,
    introducedInWorkflowVersion: 1,
    table: "user_files",
    exportKey: "userFiles",
    exportSelect: "id,user_id,file_id,name,media_type,size_bytes,created_at",
  }),
  db({
    resourceId: "db.message_feedback",
    ownershipClassification: "user-owned",
    owner: "gdpr-route",
    enumerable: false,
    deletionAdapter: "legacy-table-delete",
    verificationAdapter: null,
    introducedInWorkflowVersion: 1,
    table: "message_feedback",
    exportKey: "messageFeedback",
    exportSelect: "id,user_id,message_id,rating,created_at",
  }),
  db({
    resourceId: "db.messages",
    ownershipClassification: "user-owned",
    owner: "gdpr-route",
    enumerable: false,
    deletionAdapter: "legacy-table-delete",
    verificationAdapter: null,
    introducedInWorkflowVersion: 1,
    table: "messages",
    exportKey: "messages",
    exportSelect:
      "id,conversation_id,user_id,role,content,display,expression,token_estimate,created_at",
  }),
  db({
    resourceId: "db.chat_messages",
    ownershipClassification: "user-owned",
    owner: "gdpr-route",
    enumerable: false,
    deletionAdapter: "legacy-table-delete",
    verificationAdapter: null,
    introducedInWorkflowVersion: 1,
    table: "chat_messages",
    exportKey: "chatMessages",
    exportSelect: "id,user_id,role,content,display,expression,created_at",
  }),
  db({
    resourceId: "db.conversations",
    ownershipClassification: "user-owned",
    owner: "gdpr-route",
    enumerable: false,
    deletionAdapter: "legacy-table-delete",
    verificationAdapter: null,
    introducedInWorkflowVersion: 1,
    table: "conversations",
    exportKey: "conversations",
    exportSelect: "id,user_id,title,summary,message_count,token_count,created_at,updated_at",
  }),
  db({
    resourceId: "db.document_chunks",
    ownershipClassification: "user-owned",
    owner: "gdpr-route",
    enumerable: false,
    deletionAdapter: "legacy-table-delete",
    verificationAdapter: null,
    introducedInWorkflowVersion: 1,
    table: "document_chunks",
    exportKey: "documentChunks",
    exportSelect: "id,user_id,doc_id,chunk_index,chunk_text,created_at",
  }),
  db({
    resourceId: "db.ingested_documents",
    ownershipClassification: "user-owned",
    owner: "gdpr-route",
    enumerable: false,
    deletionAdapter: "legacy-table-delete",
    verificationAdapter: null,
    introducedInWorkflowVersion: 1,
    table: "ingested_documents",
    exportKey: "ingestedDocuments",
    exportSelect:
      "id,user_id,client_id,label,mime_type,character_count,chunk_count,extracted_text,created_at",
  }),
  db({
    resourceId: "db.email_sequences",
    ownershipClassification: "user-owned",
    owner: "gdpr-route",
    enumerable: false,
    deletionAdapter: "legacy-table-delete",
    verificationAdapter: null,
    introducedInWorkflowVersion: 1,
    table: "email_sequences",
    exportKey: "emailSequences",
    exportSelect:
      "id,trial_id,user_id,email,template_id,status,error_detail,scheduled_for,sent_at,created_at",
  }),
  db({
    resourceId: "db.trial_events",
    ownershipClassification: "user-owned",
    owner: "gdpr-route",
    enumerable: false,
    deletionAdapter: "legacy-table-delete",
    verificationAdapter: null,
    introducedInWorkflowVersion: 1,
    table: "trial_events",
    exportKey: "trialEvents",
    exportSelect: "id,trial_id,user_id,event,metadata,created_at",
  }),
  db({
    resourceId: "db.trials",
    ownershipClassification: "user-owned",
    owner: "gdpr-route",
    enumerable: false,
    deletionAdapter: "legacy-table-delete",
    verificationAdapter: null,
    introducedInWorkflowVersion: 1,
    table: "trials",
    exportKey: "trials",
    exportSelect:
      "id,user_id,client_id,plan_id,status,messages_used,messages_limit,started_at,expires_at,converted_at,cancelled_at,first_message_at,first_voice_at,first_memory_at,first_routine_at,source,referral_code,affiliate_code",
  }),
  db({
    resourceId: "db.referrals",
    ownershipClassification: "user-owned",
    owner: "gdpr-route",
    enumerable: false,
    deletionAdapter: "legacy-table-delete",
    verificationAdapter: null,
    introducedInWorkflowVersion: 1,
    table: "referrals",
    column: "referrer_id",
    exportKey: "referrals",
    exportSelect:
      "id,referrer_id,referrer_client_id,referral_code,referred_email,referred_user_id,status,reward_type,reward_applied,created_at,converted_at,rewarded_at",
    notes:
      "Rows where this user is the referrer are directly owned. Rows where this user is only the referred party are shared reward records and are retained.",
  }),
  db({
    resourceId: "db.affiliates",
    ownershipClassification: "user-owned",
    owner: "gdpr-route",
    enumerable: false,
    deletionAdapter: "legacy-table-delete",
    verificationAdapter: null,
    introducedInWorkflowVersion: 1,
    table: "affiliates",
    exportKey: "affiliates",
    exportSelect:
      "id,user_id,name,email,affiliate_code,commission_rate,commission_months,total_earned,total_referrals,status,created_at",
    notes:
      "Child affiliate_referrals rows are cascade-deleted/exported by affiliate_id ahead of this table via a special case in gdpr/route.ts — not a plain column-filtered delete, kept inline rather than modeled as a second registry entry.",
  }),
  db({
    resourceId: "db.approvals",
    ownershipClassification: "user-owned",
    owner: "gdpr-route",
    enumerable: false,
    deletionAdapter: "legacy-table-delete",
    verificationAdapter: null,
    introducedInWorkflowVersion: 1,
    table: "approvals",
    exportKey: "approvals",
    exportSelect:
      "id,client_id,action_log_id,task_id,user_id,action,risk_level,tool_name,reason,status,decided_by,decided_at,expires_at,created_at",
  }),
  db({
    resourceId: "db.action_log",
    ownershipClassification: "user-owned",
    owner: "gdpr-route",
    enumerable: false,
    deletionAdapter: "legacy-table-delete",
    verificationAdapter: null,
    introducedInWorkflowVersion: 1,
    table: "action_log",
    exportKey: "actionLog",
    exportSelect:
      "id,client_id,user_id,task_id,step_number,action,token_cost,status,risk_level,trigger_type,error,duration_ms,created_at,completed_at",
  }),
  db({
    resourceId: "db.agent_task_summaries",
    ownershipClassification: "user-owned",
    owner: "gdpr-route",
    enumerable: false,
    deletionAdapter: "legacy-table-delete",
    verificationAdapter: null,
    introducedInWorkflowVersion: 1,
    table: "agent_task_summaries",
    exportKey: "agentTaskSummaries",
    exportSelect: "id,task_id,client_id,user_id,summary_text,tokens_used,created_at",
  }),
  db({
    resourceId: "db.provenance_chains",
    ownershipClassification: "user-owned",
    owner: "gdpr-route",
    enumerable: false,
    deletionAdapter: "legacy-table-delete",
    verificationAdapter: null,
    introducedInWorkflowVersion: 1,
    table: "provenance_chains",
    exportKey: "provenanceChains",
    exportSelect:
      "id,chain_id,status,started_at,completed_at,user_id,client_id,created_at,updated_at",
  }),
  db({
    resourceId: "db.pattern_detections",
    ownershipClassification: "user-owned",
    owner: "gdpr-route",
    enumerable: false,
    deletionAdapter: "legacy-table-delete",
    verificationAdapter: null,
    introducedInWorkflowVersion: 1,
    table: "pattern_detections",
    exportKey: "patternDetections",
    exportSelect:
      "id,client_id,user_id,pattern_type,workflow_id,tool_sequence,recurrence,status,suppressed_until,suggestion_text,created_at,updated_at",
  }),
  db({
    resourceId: "db.tasks",
    ownershipClassification: "user-owned",
    owner: "gdpr-route",
    enumerable: false,
    deletionAdapter: "legacy-table-delete",
    verificationAdapter: null,
    introducedInWorkflowVersion: 1,
    table: "tasks",
    exportKey: "tasks",
    exportSelect:
      "id,client_id,user_id,goal,context,status,trigger_type,trigger_source,steps_completed,max_steps,token_cost,result,summary,task_summary,steps_taken,created_at,completed_at,started_at",
  }),
  db({
    resourceId: "db.push_subscriptions",
    ownershipClassification: "user-owned",
    owner: "gdpr-route",
    enumerable: false,
    deletionAdapter: "legacy-table-delete",
    verificationAdapter: null,
    introducedInWorkflowVersion: 1,
    table: "push_subscriptions",
    exportKey: "pushSubscriptions",
    exportSelect: "id,user_id,user_agent,created_at",
  }),
  db({
    resourceId: "db.proactive_daily",
    ownershipClassification: "user-owned",
    owner: "gdpr-route",
    enumerable: false,
    deletionAdapter: "legacy-table-delete",
    verificationAdapter: null,
    introducedInWorkflowVersion: 1,
    table: "proactive_daily",
    exportKey: "proactiveDaily",
    exportSelect: "user_id,day,count",
  }),
  db({
    resourceId: "db.companion_state",
    ownershipClassification: "user-owned",
    owner: "gdpr-route",
    enumerable: false,
    deletionAdapter: "legacy-table-delete",
    verificationAdapter: null,
    introducedInWorkflowVersion: 1,
    table: "companion_state",
    exportKey: "companionState",
    exportSelect:
      "user_id,last_interaction_at,last_greeting_context,last_mood,last_emotion,last_proactive_topic,presence_summary,updated_at",
  }),
  db({
    resourceId: "db.oauth_states",
    ownershipClassification: "user-owned",
    owner: "gdpr-route",
    enumerable: false,
    deletionAdapter: "legacy-table-delete",
    verificationAdapter: null,
    introducedInWorkflowVersion: 1,
    table: "oauth_states",
    exportKey: "oauthStates",
    exportSelect: "id,user_id,client_id,service,created_at,expires_at",
  }),
  db({
    resourceId: "db.usage_windows",
    ownershipClassification: "user-owned",
    owner: "gdpr-route",
    enumerable: false,
    deletionAdapter: "legacy-table-delete",
    verificationAdapter: null,
    introducedInWorkflowVersion: 1,
    table: "usage_windows",
    exportKey: "usageWindows",
    exportSelect:
      "id,user_id,window_type,window_start,tokens_used,messages_used,warning_sent,updated_at",
  }),
  db({
    resourceId: "db.extra_packs",
    ownershipClassification: "user-owned",
    owner: "gdpr-route",
    enumerable: false,
    deletionAdapter: "legacy-table-delete",
    verificationAdapter: null,
    introducedInWorkflowVersion: 1,
    table: "extra_packs",
    exportKey: "extraPacks",
    exportSelect: "id,user_id,tokens_granted,tokens_remaining,valid_until,purchase_ref,created_at",
  }),
  db({
    resourceId: "db.personas",
    ownershipClassification: "user-owned",
    owner: "gdpr-route",
    enumerable: false,
    deletionAdapter: "legacy-table-delete",
    verificationAdapter: null,
    introducedInWorkflowVersion: 1,
    table: "personas",
    exportKey: "personas",
    exportSelect:
      "id,user_id,name,base_persona_id,tone_adjectives,communication_style,verbosity,topics_emphasise,topics_avoid,language,voice_id,description,description_screened_at,created_at,updated_at",
  }),
  db({
    resourceId: "db.memories",
    ownershipClassification: "user-owned",
    owner: "gdpr-route",
    enumerable: false,
    deletionAdapter: "legacy-table-delete",
    verificationAdapter: null,
    introducedInWorkflowVersion: 1,
    table: "memories",
    exportKey: "memories",
    exportSelect:
      "id,user_id,category,key,value,confidence,source,status,superseded_by,last_accessed,created_at,updated_at",
  }),
  db({
    resourceId: "db.usage",
    ownershipClassification: "user-owned",
    owner: "gdpr-route",
    enumerable: false,
    deletionAdapter: "legacy-table-delete",
    verificationAdapter: null,
    introducedInWorkflowVersion: 1,
    table: "usage",
    exportKey: "usage",
    exportSelect: "id,user_id,date,message_count,token_count,api_calls",
  }),
  db({
    resourceId: "db.client_members",
    ownershipClassification: "user-owned",
    owner: "gdpr-route",
    enumerable: false,
    deletionAdapter: "legacy-table-delete",
    verificationAdapter: null,
    introducedInWorkflowVersion: 1,
    table: "client_members",
    exportKey: "clientMembers",
    exportSelect: "client_id,user_id,role,joined_at",
  }),
  db({
    resourceId: "db.audit_log",
    ownershipClassification: "user-owned",
    owner: "gdpr-route",
    enumerable: false,
    deletionAdapter: "legacy-table-delete",
    verificationAdapter: null,
    introducedInWorkflowVersion: 1,
    table: "audit_log",
    exportKey: "auditLog",
    exportSelect: "id,user_id,action,resource,resource_id,reason,created_at",
    exportLimit: 500,
  }),
  db({
    resourceId: "db.profiles",
    ownershipClassification: "user-owned",
    owner: "gdpr-route",
    enumerable: false,
    deletionAdapter: "legacy-table-delete",
    verificationAdapter: null,
    introducedInWorkflowVersion: 1,
    table: "profiles",
    column: "id",
    exportKey: "profile",
    exportSelect:
      "id,name,avatar,role,tts_enabled,notifications_enabled,quiet_hours_start,quiet_hours_end,onboarded,created_at,updated_at",
  }),
];

/**
 * Resources the current synchronous GDPR path does NOT delete — Phase 0B's
 * findings, made explicit in code. deletionAdapter/verificationAdapter stay
 * null until a later phase implements them; nothing reads these yet.
 */
const OTHER_RESOURCES: OtherResourceEntry[] = [
  {
    resourceId: "storage.document-ingestion",
    ownershipClassification: "user-owned",
    owner: "inngest/document-process",
    phase: "deleting_storage",
    criticality: "high",
    enumerable: true,
    deletionAdapter: "storage-bucket-delete",
    verificationAdapter: null,
    introducedInWorkflowVersion: 1,
    notes:
      "Objects are normally removed by documentProcess's own cleanup step after a successful ingest. Phase 2 adds a real deletion adapter (src/core/account-deletion/adapters/storage-bucket-adapter.ts) so objects from failed/interrupted uploads are covered too, wired into the existing GDPR delete endpoint.",
  },
  {
    resourceId: "storage.task-documents",
    ownershipClassification: "user-owned",
    owner: "core/integrations/docgen",
    phase: "deleting_storage",
    criticality: "high",
    enumerable: true,
    deletionAdapter: "storage-bucket-delete",
    verificationAdapter: null,
    introducedInWorkflowVersion: 1,
    notes:
      "Generated DOCX/PDF exports. Phase 2 adds a real deletion adapter for this bucket (see storage.document-ingestion above) — previously no delete code existed anywhere in the repo for it.",
  },
  {
    resourceId: "oauth.client_integrations",
    ownershipClassification: "tenant-owned",
    owner: "core/integrations/adapter",
    phase: "deleting_oauth",
    criticality: "medium",
    enumerable: true,
    deletionAdapter: null,
    verificationAdapter: null,
    introducedInWorkflowVersion: 1,
    notes:
      "Shared per-client OAuth tokens (Gmail/Calendar/Slack/Notion/HubSpot). Deletion policy for a single member leaving a shared client is an open product/legal question, not yet resolved.",
  },
  {
    resourceId: "background.document_process",
    ownershipClassification: "user-owned",
    owner: "inngest/document-process",
    phase: "deleting_background_jobs",
    criticality: "high",
    enumerable: false,
    deletionAdapter: null,
    verificationAdapter: null,
    introducedInWorkflowVersion: 1,
    notes:
      "In-flight document/process Inngest runs are not cancelled on account deletion today; a run completing after deletion can write document_chunks/storage objects for a user that no longer exists.",
  },
  {
    resourceId: "excluded.ingested_whatsapp",
    ownershipClassification: "out-of-scope",
    owner: "n/a",
    phase: null,
    criticality: null,
    enumerable: false,
    deletionAdapter: null,
    verificationAdapter: null,
    introducedInWorkflowVersion: 1,
    notes:
      "No user_id-shaped ownership column exists on this table. Listed explicitly, per the Phase 0 audit, so its absence from the delete path reads as a deliberate decision rather than an oversight.",
  },
];

export const DELETION_RESOURCE_REGISTRY: ReadonlyArray<DeletionResourceEntry> = [
  ...DATABASE_RESOURCES,
  ...OTHER_RESOURCES,
];

export function getDatabaseResources(): ReadonlyArray<DatabaseResourceEntry> {
  return DATABASE_RESOURCES;
}

/** Derives the delete-order array gdpr/route.ts's deleteUserOwnedData() consumes. */
export function toUserOwnedDeleteOrder(): ReadonlyArray<{ table: string; column?: string }> {
  return DATABASE_RESOURCES.map(({ table, column }) => ({ table, column }));
}

export interface ExportSpec {
  key: string;
  table: string;
  column?: string;
  select: string;
  limit?: number;
}

/** Derives the export-table array gdpr/route.ts's exportUserOwnedData() consumes. */
export function toGdprExportTables(): ReadonlyArray<ExportSpec> {
  return DATABASE_RESOURCES.map(({ table, column, exportKey, exportSelect, exportLimit }) => ({
    key: exportKey,
    table,
    column,
    select: exportSelect,
    limit: exportLimit,
  }));
}

/**
 * Filters the Registry to entries belonging to one deletion phase. Phase 3's
 * workflow orchestrator uses this so it never hardcodes which resourceIds
 * belong to deleting_storage/deleting_oauth/deleting_background_jobs — the
 * Registry stays the only place that answer lives, exactly as it already is
 * for toUserOwnedDeleteOrder()/toGdprExportTables(). Database resources
 * (phase "deleting_database") are included for completeness (e.g. Phase 3's
 * verify_database step reads them) even though deletion itself processes
 * them as one atomic batch, not by iterating this list.
 */
export function getResourcesByPhase(phase: DeletionPhase): ReadonlyArray<DeletionResourceEntry> {
  return DELETION_RESOURCE_REGISTRY.filter((entry) => entry.phase === phase);
}
