import {
  checkUsage,
  recordUsage,
  type EnforcementResult,
  type UsagePersistenceResult,
} from "@/core/usage-enforcer";
import { checkDistributedRateLimit } from "@/lib/ratelimit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type CostOperation =
  | "chat"
  | "agent"
  | "vision"
  | "emotion"
  | "summarize"
  | "memory_extract"
  | "memory_reflection"
  | "history_summarize"
  | "persona_screen"
  | "stt"
  | "tts"
  | "document_ingest"
  | "ocr"
  | "embeddings"
  | "whatsapp_ingest"
  | "background";

const OPERATION_LIMITS: Record<CostOperation, { limit: number; windowSeconds: number }> = {
  chat: { limit: 10, windowSeconds: 10 },
  agent: { limit: 12, windowSeconds: 60 },
  vision: { limit: 12, windowSeconds: 60 },
  emotion: { limit: 20, windowSeconds: 60 },
  summarize: { limit: 12, windowSeconds: 60 },
  memory_extract: { limit: 10, windowSeconds: 60 },
  memory_reflection: { limit: 4, windowSeconds: 60 },
  history_summarize: { limit: 8, windowSeconds: 60 },
  persona_screen: { limit: 10, windowSeconds: 60 },
  stt: { limit: 10, windowSeconds: 60 },
  tts: { limit: 20, windowSeconds: 60 },
  document_ingest: { limit: 4, windowSeconds: 60 },
  ocr: { limit: 6, windowSeconds: 60 },
  embeddings: { limit: 20, windowSeconds: 60 },
  whatsapp_ingest: { limit: 12, windowSeconds: 60 },
  background: { limit: 20, windowSeconds: 60 },
};

export interface CostGateInput {
  operation: CostOperation;
  userId?: string | null;
  clientId?: string | null;
  planId?: string;
}

export interface CostIdentity {
  userId?: string | null;
  clientId?: string | null;
  planId: string;
  key: string;
}

export interface CostResult {
  inputTokens?: number;
  outputTokens?: number;
  units?: number;
  success: boolean;
}

interface CostLog {
  event: "attempt" | "result";
  operation: CostOperation;
  userId?: string | null;
  clientId?: string | null;
  planId?: string;
  allowed?: boolean;
  reason?: string;
  success?: boolean;
  inputTokens?: number;
  outputTokens?: number;
  units?: number;
}

export interface CostGateDependencies {
  production: boolean;
  resolveIdentity(input: CostGateInput): Promise<CostIdentity>;
  checkBudget(identity: CostIdentity): Promise<EnforcementResult>;
  checkRate(
    operation: CostOperation,
    key: string,
    limit: number,
    windowSeconds: number
  ): Promise<{ allowed: boolean; resetAt: number }>;
  recordUsage(
    identity: CostIdentity,
    inputTokens: number,
    outputTokens: number,
    messages: number
  ): Promise<UsagePersistenceResult>;
  log(entry: CostLog): void;
}

export type CostGateDecision =
  | {
      allowed: true;
      operation: CostOperation;
      identity: CostIdentity;
      warning?: EnforcementResult;
      resetAt: number;
    }
  | {
      allowed: false;
      operation: CostOperation;
      reason: "identity_unavailable" | "budget_exceeded" | "rate_limited" | "metering_unavailable";
      status: 429 | 503;
      message: string;
      resetAt?: number;
    };

async function resolveIdentity(input: CostGateInput): Promise<CostIdentity> {
  const userId = input.userId ?? null;
  let clientId = input.clientId ?? null;
  let planId = input.planId;

  if ((!clientId || !planId) && (userId || clientId)) {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      if (process.env.NODE_ENV === "production") throw new Error("Cost identity database unavailable");
    } else if (clientId) {
      const { data, error } = await supabase
        .from("clients")
        .select("plan_id")
        .eq("id", clientId)
        .single();
      if (error && process.env.NODE_ENV === "production") throw error;
      planId ??= (data?.plan_id as string | undefined) ?? "free";
    } else if (userId) {
      const { data, error } = await supabase
        .from("client_members")
        .select("client_id, clients(plan_id)")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      if (error && process.env.NODE_ENV === "production") throw error;
      clientId = (data?.client_id as string | undefined) ?? null;
      const clients = data?.clients as unknown as { plan_id?: string } | null;
      planId ??= clients?.plan_id ?? "free";
    }
  }

  if (!userId && !clientId && process.env.NODE_ENV === "production") {
    throw new Error("Cost identity missing");
  }

  const key = clientId ? `client:${clientId}` : `user:${userId ?? "dev-user"}`;
  return { userId, clientId, planId: planId ?? "free", key };
}

const defaultDependencies: CostGateDependencies = {
  production: process.env.NODE_ENV === "production",
  resolveIdentity,
  checkBudget: (identity) =>
    checkUsage(identity.userId ?? null, identity.planId, "UTC", 1, identity.clientId ?? undefined),
  checkRate: (operation, key, limit, windowSeconds) =>
    checkDistributedRateLimit({ key, namespace: operation, limit, windowSeconds }),
  recordUsage: (identity, inputTokens, outputTokens, messages) =>
    recordUsage(
      identity.userId ?? null,
      inputTokens,
      outputTokens,
      identity.planId,
      "UTC",
      1,
      identity.clientId ?? undefined,
      messages
    ),
  log: (entry) => console.warn(`[CostGate] ${JSON.stringify(entry)}`),
};

export function createCostGate(dependencies: CostGateDependencies = defaultDependencies) {
  const unhealthyIdentities = new Set<string>();

  return {
    async enforce(input: CostGateInput): Promise<CostGateDecision> {
      let identity: CostIdentity;
      try {
        identity = await dependencies.resolveIdentity(input);
        const budget = await dependencies.checkBudget(identity);
        if (budget.status === "blocked") {
          const infrastructureFailure = budget.infrastructureFailure === true;
          const decision: CostGateDecision = {
            allowed: false,
            operation: input.operation,
            reason: infrastructureFailure ? "metering_unavailable" : "budget_exceeded",
            status: infrastructureFailure ? 503 : 429,
            message: budget.message ??
              (infrastructureFailure
                ? "Cost enforcement is temporarily unavailable."
                : "Usage budget exceeded."),
          };
          dependencies.log({
            event: "attempt",
            operation: input.operation,
            userId: identity.userId,
            clientId: identity.clientId,
            planId: identity.planId,
            allowed: false,
            reason: decision.reason,
          });
          return decision;
        }

        // A zero-unit write uses the authoritative accounting RPC without
        // changing plan consumption. Provider work is allowed only when the
        // same persistence path used for reconciliation is writable.
        const probe = await dependencies.recordUsage(identity, 0, 0, 0);
        if (!probe.success) {
          unhealthyIdentities.add(identity.key);
          if (dependencies.production) throw new Error("Usage persistence unavailable");
        } else {
          unhealthyIdentities.delete(identity.key);
        }

        const config = OPERATION_LIMITS[input.operation];
        const rate = await dependencies.checkRate(
          input.operation,
          identity.key,
          config.limit,
          config.windowSeconds
        );
        if (!rate.allowed) {
          dependencies.log({
            event: "attempt",
            operation: input.operation,
            userId: identity.userId,
            clientId: identity.clientId,
            planId: identity.planId,
            allowed: false,
            reason: "rate_limited",
          });
          return {
            allowed: false,
            operation: input.operation,
            reason: "rate_limited",
            status: 429,
            message: "Too many paid operations. Please retry shortly.",
            resetAt: rate.resetAt,
          };
        }

        dependencies.log({
          event: "attempt",
          operation: input.operation,
          userId: identity.userId,
          clientId: identity.clientId,
          planId: identity.planId,
          allowed: true,
        });
        return {
          allowed: true,
          operation: input.operation,
          identity,
          warning: budget.status === "warning" ? budget : undefined,
          resetAt: rate.resetAt,
        };
      } catch {
        dependencies.log({
          event: "attempt",
          operation: input.operation,
          userId: input.userId,
          clientId: input.clientId,
          planId: input.planId,
          allowed: false,
          reason: "metering_unavailable",
        });
        return {
          allowed: false,
          operation: input.operation,
          reason: "metering_unavailable",
          status: 503,
          message: dependencies.production
            ? "Cost enforcement is temporarily unavailable."
            : "Local cost enforcement failed.",
        };
      }
    },

    async record(decision: Extract<CostGateDecision, { allowed: true }>, result: CostResult) {
      const inputTokens = Math.max(0, result.inputTokens ?? result.units ?? 0);
      const outputTokens = Math.max(0, result.outputTokens ?? 0);
      const persistence = await dependencies.recordUsage(
        decision.identity,
        inputTokens,
        outputTokens,
        1
      );
      if (persistence.success) unhealthyIdentities.delete(decision.identity.key);
      else unhealthyIdentities.add(decision.identity.key);
      dependencies.log({
        event: "result",
        operation: decision.operation,
        userId: decision.identity.userId,
        clientId: decision.identity.clientId,
        planId: decision.identity.planId,
        success: result.success && persistence.success,
        reason: persistence.success ? undefined : "usage_persistence_failed",
        inputTokens,
        outputTokens,
        units: result.units,
      });
      return persistence;
    },
  };
}

const costGate = createCostGate();

export const enforceCostGate = costGate.enforce;
export const recordCostResult = costGate.record;

export function costGateResponse(decision: Extract<CostGateDecision, { allowed: false }>): Response {
  const retryAfter = decision.resetAt
    ? Math.max(1, Math.ceil((decision.resetAt - Date.now()) / 1000)).toString()
    : undefined;
  return Response.json(
    { error: decision.message, code: decision.reason },
    {
      status: decision.status,
      headers: {
        "Cache-Control": "no-store",
        ...(retryAfter ? { "Retry-After": retryAfter } : {}),
      },
    }
  );
}
