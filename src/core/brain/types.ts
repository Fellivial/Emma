/**
 * Brain Gateway — normalized contracts (ADR 0003).
 *
 * These types are Emma's provider-independent inference vocabulary. Application
 * code speaks only these shapes; providers translate them to their wire format.
 *
 * The message/tool-call shape is deliberately OpenAI-compatible: it is Emma's
 * own canonical transcript format, chosen because it is already persisted in
 * `tasks.step_transcript` for approval-pause resume (changing it would force a
 * data migration for zero architectural gain). Providers whose wire format
 * differs translate inside their own implementation — the contract's stability
 * is what matters (ADR 0003 Principle 4), not its distance from any one wire.
 */

// ─── Tasks ───────────────────────────────────────────────────────────────────

/** Which model tier serves the request. Providers map tiers to concrete models. */
export type BrainTask = "brain" | "vision" | "utility";

// ─── Messages ────────────────────────────────────────────────────────────────

export type BrainContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface BrainToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface BrainMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | BrainContentPart[] | null;
  tool_calls?: BrainToolCall[];
  tool_call_id?: string;
}

export interface BrainToolDefinition {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

// ─── Requests ────────────────────────────────────────────────────────────────

export interface BrainChatRequest {
  task: BrainTask;
  messages: BrainMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Structured generation: named JSON schema the output must satisfy. */
  responseFormat?: { name: string; schema: Record<string, unknown> };
  tools?: BrainToolDefinition[];
  /** Connection timeout (abort if no response headers within this window). */
  timeoutMs?: number;
  /** Retry attempts on retryable upstream statuses. Default 0 (single attempt). */
  maxRetries?: number;
}

export interface BrainEmbedRequest {
  texts: string[];
}

// ─── Results ─────────────────────────────────────────────────────────────────

export interface BrainUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Normalized reason the model stopped. Unknown provider vocabulary maps to
 * "other"; absent maps to null.
 */
export type BrainFinishReason =
  | "stop"
  | "length"
  | "content_filter"
  | "tool_calls"
  | "other"
  | null;

/**
 * Normalized upstream failure (the provider answered with an error).
 *
 * Error semantics across the gateway, chosen to mirror how every existing
 * call site already branches:
 *  - Upstream HTTP errors are returned as `{ ok: false, error }` values
 *    (the `if (!res.ok)` pattern).
 *  - Transport failures (network error, connection timeout) THROW, exactly
 *    as fetch/fetchWithRetry throw today; timeouts throw EmmaError("TIMEOUT").
 */
export interface BrainRequestError {
  /** HTTP-equivalent status of the upstream failure. */
  status: number;
  code: "BAD_REQUEST" | "AUTH_ERROR" | "RATE_LIMIT" | "OVERLOADED" | "TIMEOUT" | "UPSTREAM_ERROR";
  message: string;
  /** Truncated upstream response body, for logging only. */
  bodyPreview: string;
  retryable: boolean;
}

export type BrainChatResult =
  | {
      ok: true;
      /** Generated text ("" when the model returned no text content). */
      text: string;
      /** Tool invocations requested by the model ([] when none). */
      toolCalls: BrainToolCall[];
      finishReason: BrainFinishReason;
      usage: BrainUsage;
    }
  | { ok: false; error: BrainRequestError };

export type BrainEmbedResult =
  | {
      ok: true;
      /** One vector per input text, in input order. */
      embeddings: number[][];
      /** inputTokens is undefined when the provider did not report usage. */
      usage: { inputTokens?: number };
    }
  | { ok: false; error: BrainRequestError };

// ─── Streaming ───────────────────────────────────────────────────────────────

export type BrainStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; usage: BrainUsage; finishReason: BrainFinishReason };

/**
 * A live, provider-independent completion stream.
 *
 * `events()` yields incremental deltas and exactly one trailing `done` event
 * carrying final usage and finish reason — regardless of whether the provider
 * reports usage inline mid-stream (OpenRouter) or not (the provider
 * synthesizes the same trailing event either way). Transport failures
 * mid-stream throw from the generator.
 */
export interface BrainStream {
  events(): AsyncGenerator<BrainStreamEvent, void, unknown>;
  /** Abort the underlying provider stream (client disconnected). */
  cancel(): Promise<void>;
  /** Live snapshot of usage captured so far — for accounting on cancel. */
  readonly usage: BrainUsage;
}

export type BrainStreamResult =
  | { ok: true; stream: BrainStream }
  | { ok: false; error: BrainRequestError };

// ─── Capabilities ────────────────────────────────────────────────────────────

/**
 * Declared, queryable capabilities of a registered provider (ADR 0006).
 *
 * Boolean-per-capability, provider-level (not per-model) — every capability
 * the codebase exercises today is used as a hard yes/no gate at each call
 * site, so a negotiation protocol would be speculative machinery for a
 * distinction (partial capability support) that does not exist anywhere in
 * the current code (Technical Design §4.1).
 */
export interface CapabilitiesDescriptor {
  supportsStreaming: boolean;
  supportsVision: boolean;
  supportsToolCalling: boolean;
  supportsEmbeddings: boolean;
  /** responseFormat / json_schema generation. */
  supportsStructuredOutput: boolean;
  /** Conservative (minimum) context window across this provider's task-tier model set, in tokens. */
  contextWindowTokens: number;
}

// ─── Provider ────────────────────────────────────────────────────────────────

/**
 * A provider implementation speaks one backend's wire protocol and satisfies
 * the normalized contract. Providers are only reachable through the gateway —
 * never from application code (ADR 0003 Principle 1).
 */
export interface BrainProvider {
  readonly name: string;
  isConfigured(): boolean;
  chat(request: BrainChatRequest): Promise<BrainChatResult>;
  chatStream(request: BrainChatRequest): Promise<BrainStreamResult>;
  embed(request: BrainEmbedRequest): Promise<BrainEmbedResult>;
}
