type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface AgentRequestInput {
  action: "create" | "approve" | "reject" | "status" | "history";
  goal?: string;
  context?: string;
  triggerSource?: string;
  approvalId?: string;
  taskId?: string;
  limit?: number;
}

export interface HistoryMessageInput {
  id: string;
  role: "user" | "assistant";
  content: string;
  display: string;
  expression?: string;
  timestamp?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown, maxLength: number): value is string | undefined {
  return value === undefined || (typeof value === "string" && value.length <= maxLength);
}

export function parseAgentRequest(value: unknown): ValidationResult<AgentRequestInput> {
  if (!isRecord(value) || typeof value.action !== "string") {
    return { ok: false, error: "action is required" };
  }

  const actions = ["create", "approve", "reject", "status", "history"] as const;
  if (!actions.includes(value.action as (typeof actions)[number])) {
    return { ok: false, error: "Unknown action" };
  }
  if (!optionalString(value.goal, 10_000) || !optionalString(value.context, 50_000)) {
    return { ok: false, error: "goal or context is invalid" };
  }
  if (!optionalString(value.triggerSource, 200) || !optionalString(value.taskId, 200)) {
    return { ok: false, error: "triggerSource or taskId is invalid" };
  }
  if (!optionalString(value.approvalId, 200)) {
    return { ok: false, error: "approvalId is invalid" };
  }
  if (value.limit !== undefined && (!Number.isInteger(value.limit) || Number(value.limit) < 1 || Number(value.limit) > 100)) {
    return { ok: false, error: "limit must be an integer between 1 and 100" };
  }

  const action = value.action as AgentRequestInput["action"];
  if (action === "create" && (typeof value.goal !== "string" || !value.goal.trim())) {
    return { ok: false, error: "goal is required for create" };
  }
  if ((action === "approve" || action === "reject") && !value.approvalId) {
    return { ok: false, error: `approvalId is required for ${action}` };
  }
  if (action === "status" && !value.taskId) {
    return { ok: false, error: "taskId is required for status" };
  }

  return { ok: true, value: value as unknown as AgentRequestInput };
}

function parseHistoryMessage(value: unknown): ValidationResult<HistoryMessageInput> {
  if (!isRecord(value)) return { ok: false, error: "each message must be an object" };
  if (typeof value.id !== "string" || !value.id.trim() || value.id.length > 200) {
    return { ok: false, error: "message id is required" };
  }
  if (value.role !== "user" && value.role !== "assistant") {
    return { ok: false, error: "message role must be user or assistant" };
  }
  if (typeof value.content !== "string" || typeof value.display !== "string") {
    return { ok: false, error: "message content and display must be strings" };
  }
  if (value.content.length > 100_000 || value.display.length > 100_000) {
    return { ok: false, error: "message content is too long" };
  }
  if (!optionalString(value.expression, 100)) {
    return { ok: false, error: "message expression is invalid" };
  }
  if (value.timestamp !== undefined && (typeof value.timestamp !== "number" || !Number.isFinite(value.timestamp))) {
    return { ok: false, error: "message timestamp is invalid" };
  }
  return { ok: true, value: value as unknown as HistoryMessageInput };
}

export function parseHistoryMessages(value: unknown): ValidationResult<HistoryMessageInput[]> {
  const values = Array.isArray(value) ? value : [value];
  if (values.length === 0 || values.length > 100) {
    return { ok: false, error: "request must contain between 1 and 100 messages" };
  }
  const messages: HistoryMessageInput[] = [];
  for (const item of values) {
    const parsed = parseHistoryMessage(item);
    if (!parsed.ok) return parsed;
    messages.push(parsed.value);
  }
  return { ok: true, value: messages };
}
