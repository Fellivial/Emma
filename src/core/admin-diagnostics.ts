import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlan } from "@/core/pricing";

export type DiagnosticsLookup =
  | { type: "email"; value: string }
  | { type: "userId"; value: string }
  | { type: "clientId"; value: string };

type SupportSummaryInput = {
  account: {
    status: string;
    waitlistStatus: string;
    onboardingComplete: boolean;
  };
  billing: {
    planId: string;
    subscriptionStatus: string | null;
    paymentRecoveryState: string;
  };
  usage: {
    tokenBalance: number;
    overBudget: boolean;
  };
  tools: {
    toolsEnabled: string[];
    mcpEnabled: boolean;
  };
  ai: {
    recentFailureCount: number;
    recentCostGateBlocks: number;
  };
};

export type SupportSummary = {
  whyCantUseEmma: string[];
  whyStillFree: string[];
  whyCantAccessTools: string[];
  areTheyOverBudget: boolean;
  isOnboardingIncomplete: boolean;
  isBillingHealthy: boolean;
  hasRecentFailures: boolean;
};

const UNSAFE_KEY_PATTERNS = [
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /^token$/i,
  /api[_-]?key/i,
  /secret/i,
  /password/i,
  /raw[_-]?payload/i,
  /^payload$/i,
  /^input$/i,
  /^output$/i,
  /tool[_-]?input/i,
  /tool[_-]?output/i,
  /^content$/i,
  /^display$/i,
  /^body$/i,
  /message[_-]?body/i,
  /encrypted/i,
  /^value$/i,
  /memory[_-]?value/i,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray<T = Record<string, unknown>>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function firstRow<T = Record<string, unknown>>(value: unknown): T | null {
  return isRecord(value) ? (value as T) : null;
}

function normalizeCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function resolveDiagnosticsLookup(params: URLSearchParams): DiagnosticsLookup {
  const entries = [
    ["email", params.get("email")?.trim().toLowerCase()],
    ["userId", params.get("userId")?.trim()],
    ["clientId", params.get("clientId")?.trim()],
  ].filter((entry): entry is [DiagnosticsLookup["type"], string] => Boolean(entry[1]));

  if (entries.length !== 1) {
    throw new Error("Provide exactly one diagnostics lookup key: email, userId, or clientId.");
  }

  return { type: entries[0][0], value: entries[0][1] };
}

export function isAdminEmail(email: string | undefined, adminList = process.env.EMMA_ADMIN_EMAILS) {
  const admins = (adminList || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return admins.length > 0 && admins.includes(email?.toLowerCase() ?? "");
}

export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  return `${local[0]}***@${domain}`;
}

export function containsUnsafeDiagnosticData(value: unknown): boolean {
  if (typeof value === "string") return value.startsWith("enc:v1:");
  if (Array.isArray(value)) return value.some(containsUnsafeDiagnosticData);
  if (!isRecord(value)) return false;

  return Object.entries(value).some(([key, entry]) => {
    if (UNSAFE_KEY_PATTERNS.some((pattern) => pattern.test(key))) return true;
    return containsUnsafeDiagnosticData(entry);
  });
}

export function buildSupportSummary(input: SupportSummaryInput): SupportSummary {
  const whyCantUseEmma: string[] = [];
  const whyStillFree: string[] = [];
  const whyCantAccessTools: string[] = [];

  if (input.account.status !== "active") {
    whyCantUseEmma.push(`Account status is ${input.account.status}.`);
  }
  if (input.account.waitlistStatus !== "approved") {
    whyCantUseEmma.push(`Waitlist status is ${input.account.waitlistStatus}.`);
  }
  if (!input.account.onboardingComplete) {
    whyCantUseEmma.push("Onboarding is incomplete.");
  }
  if (input.usage.overBudget) {
    whyCantUseEmma.push("User is over budget for the current usage window.");
  }
  if (input.ai.recentFailureCount > 0) {
    whyCantUseEmma.push(`${input.ai.recentFailureCount} recent AI/tool failures are visible.`);
  }

  if (input.billing.planId === "free") {
    whyStillFree.push("Client plan is still free.");
  }
  if (input.billing.paymentRecoveryState !== "healthy") {
    whyStillFree.push(
      `Billing is in ${input.billing.paymentRecoveryState} payment recovery state.`
    );
  }
  if (input.billing.subscriptionStatus && input.billing.subscriptionStatus !== "active") {
    whyStillFree.push(`Subscription status is ${input.billing.subscriptionStatus}.`);
  }

  if (input.tools.toolsEnabled.length <= 1) {
    whyCantAccessTools.push("Only basic tools are enabled for this plan/client.");
  }
  if (!input.tools.mcpEnabled) {
    whyCantAccessTools.push("MCP is disabled or no MCP servers are connected.");
  }

  return {
    whyCantUseEmma,
    whyStillFree,
    whyCantAccessTools,
    areTheyOverBudget: input.usage.overBudget,
    isOnboardingIncomplete: !input.account.onboardingComplete,
    isBillingHealthy:
      input.billing.paymentRecoveryState === "healthy" &&
      (!input.billing.subscriptionStatus ||
        ["active", "on_trial"].includes(input.billing.subscriptionStatus)),
    hasRecentFailures: input.ai.recentFailureCount > 0 || input.ai.recentCostGateBlocks > 0,
  };
}

function getLemonMeta(client: Record<string, unknown> | null): Record<string, unknown> {
  const meta = client?.lemon_meta;
  return isRecord(meta) ? meta : {};
}

function paymentRecoveryState(lemonMeta: Record<string, unknown>): string {
  const status = String(lemonMeta.status || "");
  if (status === "past_due") return "payment_failed";
  if (status === "paused") return "paused";
  if (status === "cancelled" || status === "expired") return "cancelled_or_expired";
  return "healthy";
}

function isCancelled(lemonMeta: Record<string, unknown>): boolean {
  const status = String(lemonMeta.status || "");
  return status === "cancelled" || Boolean(lemonMeta.endsAt);
}

function inferLastActivity(rows: Array<Record<string, unknown>>): string | null {
  const dates = rows
    .flatMap((row) => [row.updated_at, row.completed_at, row.created_at, row.last_used_at])
    .filter((value): value is string => typeof value === "string")
    .sort();
  return dates.at(-1) ?? null;
}

async function findUserByLookup(
  supabase: SupabaseClient,
  lookup: DiagnosticsLookup
): Promise<Record<string, unknown> | null> {
  if (lookup.type === "userId") {
    const { data } = await supabase.auth.admin.getUserById(lookup.value);
    return (data?.user as unknown as Record<string, unknown>) ?? null;
  }

  if (lookup.type === "email") {
    const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const users = asArray<Record<string, unknown>>(data?.users);
    return users.find((user) => String(user.email || "").toLowerCase() === lookup.value) ?? null;
  }

  const { data: memberships } = await supabase
    .from("client_members")
    .select("user_id")
    .eq("client_id", lookup.value)
    .limit(1);
  const userId = asArray(memberships)[0]?.user_id;
  if (typeof userId !== "string") return null;
  const { data } = await supabase.auth.admin.getUserById(userId);
  return (data?.user as unknown as Record<string, unknown>) ?? null;
}

async function queryCount(
  query: PromiseLike<{ count?: number | null; data?: unknown }>
): Promise<number> {
  const result = await query;
  return normalizeCount(result.count ?? (Array.isArray(result.data) ? result.data.length : 0));
}

export async function buildAdminDiagnostics(supabase: SupabaseClient, lookup: DiagnosticsLookup) {
  const user = await findUserByLookup(supabase, lookup);
  const userId = typeof user?.id === "string" ? user.id : null;
  const email = typeof user?.email === "string" ? user.email : null;

  const directClientId = lookup.type === "clientId" ? lookup.value : null;

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    userId
      ? supabase
          .from("profiles")
          .select("id,name,role,onboarded,created_at,updated_at")
          .eq("id", userId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    userId
      ? supabase
          .from("client_members")
          .select(
            "client_id,user_id,role,joined_at,clients(id,slug,name,owner_id,tools_enabled,token_budget_monthly,token_budget_daily,message_limit_daily,plan_id,autonomy_tier,proactive_vision,lemon_meta,created_at,updated_at)"
          )
          .eq("user_id", userId)
      : directClientId
        ? supabase
            .from("client_members")
            .select(
              "client_id,user_id,role,joined_at,clients(id,slug,name,owner_id,tools_enabled,token_budget_monthly,token_budget_daily,message_limit_daily,plan_id,autonomy_tier,proactive_vision,lemon_meta,created_at,updated_at)"
            )
            .eq("client_id", directClientId)
        : Promise.resolve({ data: [] }),
  ]);

  const membershipRows = asArray<Record<string, unknown>>(memberships);
  const primaryMembership = membershipRows[0] ?? null;
  const primaryClient = firstRow<Record<string, unknown>>(primaryMembership?.clients);
  const clientId =
    directClientId ||
    (typeof primaryMembership?.client_id === "string" ? primaryMembership.client_id : null);
  const lemonMeta = getLemonMeta(primaryClient);
  const windowUserIds = [userId, clientId ? `client:${clientId}` : null].filter(
    (value): value is string => Boolean(value)
  );

  const [
    waitlistResult,
    usageWindowsResult,
    extraPacksResult,
    conversationsResult,
    messageCount,
    memoryRowsResult,
    approvalsResult,
    actionLogResult,
    auditLogResult,
    tasksResult,
    integrationsResult,
    whatsappCount,
  ] = await Promise.all([
    email
      ? supabase
          .from("waitlist_v2")
          .select("id,status,invited_at,invite_expires_at,converted_at,created_at")
          .eq("email", email.toLowerCase())
          .maybeSingle()
      : Promise.resolve({ data: null }),
    windowUserIds.length > 0
      ? supabase
          .from("usage_windows")
          .select(
            "id,user_id,window_type,window_start,tokens_used,messages_used,warning_sent,updated_at"
          )
          .in("user_id", windowUserIds)
          .order("updated_at", { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] }),
    userId
      ? supabase
          .from("extra_packs")
          .select("id,tokens_granted,tokens_remaining,valid_until,created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] }),
    userId
      ? supabase
          .from("conversations")
          .select("id,message_count,token_count,created_at,updated_at")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
    userId
      ? queryCount(
          supabase
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
        )
      : Promise.resolve(0),
    userId
      ? supabase
          .from("memories")
          .select("id,status,updated_at,last_accessed")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
    clientId || userId
      ? (clientId
          ? supabase
              .from("approvals")
              .select(
                "id,client_id,action_log_id,task_id,user_id,action,risk_level,tool_name,reason,status,decided_at,expires_at,created_at"
              )
              .eq("client_id", clientId)
          : supabase
              .from("approvals")
              .select(
                "id,client_id,action_log_id,task_id,user_id,action,risk_level,tool_name,reason,status,decided_at,expires_at,created_at"
              )
              .eq("user_id", userId as string)
        )
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
    clientId || userId
      ? (clientId
          ? supabase
              .from("action_log")
              .select(
                "id,client_id,user_id,task_id,step_number,action,token_cost,status,risk_level,trigger_type,error,duration_ms,created_at,completed_at"
              )
              .eq("client_id", clientId)
          : supabase
              .from("action_log")
              .select(
                "id,client_id,user_id,task_id,step_number,action,token_cost,status,risk_level,trigger_type,error,duration_ms,created_at,completed_at"
              )
              .eq("user_id", userId as string)
        )
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
    userId
      ? supabase
          .from("audit_log")
          .select("id,user_id,action,resource,resource_id,reason,created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
    clientId || userId
      ? (clientId
          ? supabase
              .from("tasks")
              .select(
                "id,client_id,user_id,status,trigger_type,steps_completed,max_steps,token_cost,created_at,started_at,completed_at"
              )
              .eq("client_id", clientId)
          : supabase
              .from("tasks")
              .select(
                "id,client_id,user_id,status,trigger_type,steps_completed,max_steps,token_cost,created_at,started_at,completed_at"
              )
              .eq("user_id", userId as string)
        )
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
    clientId
      ? supabase
          .from("client_integrations")
          .select(
            "id,client_id,service,status,account_identifier,last_used_at,last_error,mcp_url,created_at,updated_at"
          )
          .eq("client_id", clientId)
          .order("updated_at", { ascending: false })
          .limit(30)
      : Promise.resolve({ data: [] }),
    clientId
      ? queryCount(
          supabase
            .from("ingested_whatsapp")
            .select("id", { count: "exact", head: true })
            .eq("client_id", clientId)
        )
      : Promise.resolve(0),
  ]);

  const usageWindows = asArray<Record<string, unknown>>(usageWindowsResult.data);
  const extraPacks = asArray<Record<string, unknown>>(extraPacksResult.data);
  const conversations = asArray<Record<string, unknown>>(conversationsResult.data);
  const memories = asArray<Record<string, unknown>>(memoryRowsResult.data);
  const approvals = asArray<Record<string, unknown>>(approvalsResult.data);
  const actionLogs = asArray<Record<string, unknown>>(actionLogResult.data);
  const auditLogs = asArray<Record<string, unknown>>(auditLogResult.data);
  const tasks = asArray<Record<string, unknown>>(tasksResult.data);
  const integrations = asArray<Record<string, unknown>>(integrationsResult.data);
  const waitlist = firstRow(waitlistResult.data);
  const planId = String(primaryClient?.plan_id || "free");
  const plan = getPlan(planId);
  const toolsEnabled = asArray<string>(primaryClient?.tools_enabled);
  const monthlyWindow = usageWindows.find((row) => row.window_type === "monthly");
  const monthlyTokens = Number(monthlyWindow?.tokens_used || 0);
  const monthlyLimit = plan?.tokenBudgetMonthly || Number(primaryClient?.token_budget_monthly || 0);
  const overBudget = monthlyLimit > 0 && monthlyTokens >= monthlyLimit;
  const tokenBalance = Math.max(0, monthlyLimit - monthlyTokens);
  const activeMemoryCount = memories.filter((row) => row.status === "active").length;
  const failedActions = actionLogs.filter((row) => row.status === "failed");
  const recentCostGateBlocks = actionLogs.filter((row) =>
    String(row.error || row.status || "")
      .toLowerCase()
      .includes("cost")
  ).length;
  const mcpIntegrations = integrations.filter((row) =>
    String(row.service || "").startsWith("mcp_")
  );
  const whatsappLinked = integrations.some(
    (row) => row.service === "whatsapp" && row.status === "connected"
  );

  const summaryInput: SupportSummaryInput = {
    account: {
      status: user ? "active" : "missing_auth_user",
      waitlistStatus:
        user?.app_metadata && isRecord(user.app_metadata) && user.app_metadata.waitlist_approved
          ? "approved"
          : String(waitlist?.status || "unknown"),
      onboardingComplete: Boolean(firstRow(profile)?.onboarded),
    },
    billing: {
      planId,
      subscriptionStatus: typeof lemonMeta.status === "string" ? lemonMeta.status : null,
      paymentRecoveryState: paymentRecoveryState(lemonMeta),
    },
    usage: {
      tokenBalance,
      overBudget,
    },
    tools: {
      toolsEnabled,
      mcpEnabled: mcpIntegrations.some((row) => row.status === "connected"),
    },
    ai: {
      recentFailureCount: failedActions.length,
      recentCostGateBlocks,
    },
  };

  const operationalRows = [...actionLogs, ...auditLogs, ...tasks, ...integrations, ...usageWindows];

  return {
    lookup,
    generatedAt: new Date().toISOString(),
    userDiagnostics: {
      user: userId ? { id: userId, email: maskEmail(email) } : null,
      accountStatus: summaryInput.account.status,
      waitlistStatus: summaryInput.account.waitlistStatus,
      onboardingComplete: summaryInput.account.onboardingComplete,
      currentPlan: planId,
      subscriptionStatus: summaryInput.billing.subscriptionStatus,
      clientMembership: membershipRows.map((row) => ({
        clientId: row.client_id,
        role: row.role,
        joinedAt: row.joined_at,
      })),
      tokenBalance,
      usageWindow: usageWindows,
      memoryEnabled: activeMemoryCount > 0,
      memoryCounts: {
        recentRows: memories.length,
        active: activeMemoryCount,
      },
    },
    billingDiagnostics: {
      lemonCustomerId:
        typeof lemonMeta.customerId === "string"
          ? lemonMeta.customerId
          : typeof lemonMeta.customer_id === "string"
            ? lemonMeta.customer_id
            : null,
      subscriptionId:
        typeof lemonMeta.lemonSqueezyId === "string" ? lemonMeta.lemonSqueezyId : null,
      subscriptionStatus: summaryInput.billing.subscriptionStatus,
      renewalDate: typeof lemonMeta.renewsAt === "string" ? lemonMeta.renewsAt : null,
      cancellationState: isCancelled(lemonMeta) ? "cancelled_or_ending" : "not_cancelled",
      paymentRecoveryState: summaryInput.billing.paymentRecoveryState,
      lastWebhookProcessed:
        auditLogs.find((row) => row.resource === "billing" || row.resource === "extra_pack") ??
        null,
      extraPackTokenBalance: extraPacks.reduce(
        (sum, row) => sum + Number(row.tokens_remaining || 0),
        0
      ),
    },
    aiDiagnostics: {
      recentConversationCount: conversations.length,
      recentMessageCount: messageCount,
      recentOpenRouterFailures: failedActions
        .filter((row) =>
          String(row.error || "")
            .toLowerCase()
            .includes("openrouter")
        )
        .map((row) => ({
          id: row.id,
          status: row.status,
          error: row.error,
          createdAt: row.created_at,
        })),
      recentToolApprovalRequests: approvals.map((row) => ({
        id: row.id,
        toolName: row.tool_name,
        riskLevel: row.risk_level,
        status: row.status,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
      })),
      recentCostGateBlocks,
      recentSentryEventReferences: [],
    },
    operationalDiagnostics: {
      lastLogin:
        typeof user?.last_sign_in_at === "string"
          ? user.last_sign_in_at
          : typeof user?.lastSignInAt === "string"
            ? user.lastSignInAt
            : null,
      lastActivity: inferLastActivity(operationalRows),
      recentAuditLogEntries: auditLogs,
      recentActionLogEntries: actionLogs,
      taskSummaryStatus: {
        totalRecent: tasks.length,
        running: tasks.filter((row) => row.status === "running").length,
        awaitingApproval: tasks.filter((row) => row.status === "awaiting_approval").length,
        failed: tasks.filter((row) => row.status === "failed").length,
        completed: tasks.filter((row) => row.status === "completed").length,
      },
      featureFlagState: {
        toolsEnabled,
        proactiveVision: Boolean(primaryClient?.proactive_vision),
        autonomyTier: primaryClient?.autonomy_tier ?? null,
      },
      mcp: {
        enabled: mcpIntegrations.some((row) => row.status === "connected"),
        servers: mcpIntegrations.map((row) => ({
          id: row.id,
          service: row.service,
          status: row.status,
          urlConfigured: Boolean(row.mcp_url),
          lastUsedAt: row.last_used_at,
          lastError: row.last_error,
        })),
      },
      whatsappLinked,
      whatsappMessageCount: whatsappCount,
    },
    supportSummary: buildSupportSummary(summaryInput),
  };
}
