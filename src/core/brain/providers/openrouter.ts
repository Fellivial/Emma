/**
 * OpenRouter provider — the only Provider Layer implementation today (ADR 0003).
 *
 * This file is the single place in the codebase permitted to know what
 * OpenRouter looks like on the wire: its URLs, auth headers, request payload
 * shape (including the OpenRouter-specific `models: [...]` fallback array),
 * response shape, SSE chunk framing, and status-code vocabulary (529).
 *
 * Model-tier → fallback-array mapping lives here: fallback is a provider
 * capability, not a caller concern. `src/core/models.ts` remains the single
 * source of truth for the model IDs themselves.
 */

import { BRAIN_MODELS, VISION_MODELS, UTILITY_MODELS } from "@/core/models";
import { fetchWithRetry } from "@/lib/errors";
import type {
  BrainChatRequest,
  BrainChatResult,
  BrainEmbedRequest,
  BrainEmbedResult,
  BrainFinishReason,
  BrainProvider,
  BrainRequestError,
  BrainStream,
  BrainStreamEvent,
  BrainStreamResult,
  BrainTask,
  BrainUsage,
} from "@/core/brain/types";

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings";

// Embedding model is provider configuration, not caller configuration.
const EMBEDDING_MODEL = "openai/text-embedding-3-small";

const TASK_MODELS: Record<BrainTask, string[]> = {
  brain: BRAIN_MODELS,
  vision: VISION_MODELS,
  utility: UTILITY_MODELS,
};

// 529 is an Anthropic-via-OpenRouter "overloaded" status — provider-specific
// vocabulary that stays inside this Adapter Layer rather than the shared,
// genuinely-cross-provider retry default (Wave 6B, Technical Design §17.3).
const OPENROUTER_RETRY_ON = [429, 500, 502, 503, 529];

export function openRouterHeaders(): Record<string, string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error("OPENROUTER_API_KEY is not set — cannot make LLM calls");
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
    "HTTP-Referer": "https://emma.app",
    "X-Title": "Emma",
  };
}

// ─── Response shape (OpenRouter / OpenAI-compatible) ─────────────────────────

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

type OpenRouterStreamChunk = {
  choices?: Array<{
    delta?: { content?: string | null };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

type EmbeddingResponse = {
  data: Array<{ embedding: number[]; index: number }>;
  usage?: { prompt_tokens?: number; total_tokens?: number };
};

export function extractText(data: unknown): string {
  return (data as OpenRouterResponse).choices?.[0]?.message?.content ?? "";
}

export function extractUsage(data: unknown): BrainUsage {
  const usage = (data as OpenRouterResponse).usage;
  return {
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
  };
}

// ─── Normalization ───────────────────────────────────────────────────────────

const KNOWN_FINISH_REASONS = new Set(["stop", "length", "content_filter", "tool_calls"]);

function normalizeFinishReason(reason: string | null | undefined): BrainFinishReason {
  if (reason == null) return null;
  return KNOWN_FINISH_REASONS.has(reason) ? (reason as BrainFinishReason) : "other";
}

// 529 is an Anthropic-via-OpenRouter "overloaded" status — a provider-specific
// vocabulary item normalized here, at the boundary, so callers never see it.
function normalizeHttpError(status: number, bodyPreview: string): BrainRequestError {
  const code =
    status === 400
      ? "BAD_REQUEST"
      : status === 401
        ? "AUTH_ERROR"
        : status === 429
          ? "RATE_LIMIT"
          : status === 529
            ? "OVERLOADED"
            : status === 504
              ? "TIMEOUT"
              : "UPSTREAM_ERROR";
  return {
    status,
    code,
    message: `Inference provider error ${status}`,
    bodyPreview,
    retryable: status === 429 || status >= 500,
  };
}

// ─── Request translation ─────────────────────────────────────────────────────

function buildChatBody(request: BrainChatRequest, stream: boolean): Record<string, unknown> {
  return {
    models: TASK_MODELS[request.task],
    messages: request.messages,
    ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
    ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    ...(request.tools ? { tools: request.tools } : {}),
    ...(request.responseFormat
      ? {
          response_format: {
            type: "json_schema",
            json_schema: {
              name: request.responseFormat.name,
              schema: request.responseFormat.schema,
            },
          },
        }
      : {}),
    ...(stream ? { stream: true } : {}),
  };
}

async function sendChatRequest(request: BrainChatRequest, stream: boolean): Promise<Response> {
  return fetchWithRetry(
    OPENROUTER_URL,
    {
      method: "POST",
      headers: openRouterHeaders(),
      body: JSON.stringify(buildChatBody(request, stream)),
    },
    {
      maxRetries: request.maxRetries ?? 0,
      retryOn: OPENROUTER_RETRY_ON,
      ...(request.timeoutMs !== undefined ? { connectionTimeoutMs: request.timeoutMs } : {}),
    }
  );
}

// ─── Streaming ───────────────────────────────────────────────────────────────

class OpenRouterStream implements BrainStream {
  private captured: BrainUsage = { inputTokens: 0, outputTokens: 0 };
  private finishReason: BrainFinishReason = null;

  constructor(private reader: ReadableStreamDefaultReader<Uint8Array>) {}

  get usage(): BrainUsage {
    return this.captured;
  }

  async cancel(): Promise<void> {
    await this.reader.cancel().catch(() => {});
  }

  async *events(): AsyncGenerator<BrainStreamEvent, void, unknown> {
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await this.reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") continue;

        let chunk: OpenRouterStreamChunk;
        try {
          chunk = JSON.parse(raw) as OpenRouterStreamChunk;
        } catch {
          continue; // skip malformed chunks — matches pre-gateway behavior
        }

        // OpenRouter attaches usage/finish_reason to whichever chunk carries
        // them (typically the last). Capture, then normalize into the trailing
        // done event so callers never depend on inline-usage transport.
        if (chunk.usage) {
          this.captured = {
            inputTokens: chunk.usage.prompt_tokens || 0,
            outputTokens: chunk.usage.completion_tokens || 0,
          };
        }
        const finish = chunk.choices?.[0]?.finish_reason;
        if (finish) this.finishReason = normalizeFinishReason(finish);

        const delta = chunk.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) {
          yield { type: "delta", text: delta };
        }
      }
    }

    yield { type: "done", usage: this.captured, finishReason: this.finishReason };
  }
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function createOpenRouterProvider(): BrainProvider {
  return {
    name: "openrouter",

    isConfigured(): boolean {
      return Boolean(process.env.OPENROUTER_API_KEY);
    },

    async chat(request: BrainChatRequest): Promise<BrainChatResult> {
      const res = await sendChatRequest(request, false);

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, error: normalizeHttpError(res.status, body.slice(0, 500)) };
      }

      const data = (await res.json()) as OpenRouterResponse;
      const message = data.choices?.[0]?.message;
      return {
        ok: true,
        text: message?.content ?? "",
        toolCalls: message?.tool_calls ?? [],
        finishReason: normalizeFinishReason(data.choices?.[0]?.finish_reason),
        usage: extractUsage(data),
      };
    },

    async chatStream(request: BrainChatRequest): Promise<BrainStreamResult> {
      const res = await sendChatRequest(request, true);

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, error: normalizeHttpError(res.status, body.slice(0, 500)) };
      }

      const reader = res.body?.getReader();
      if (!reader) {
        return {
          ok: false,
          error: {
            status: 502,
            code: "UPSTREAM_ERROR",
            message: "Inference provider returned no stream body",
            bodyPreview: "",
            retryable: true,
          },
        };
      }

      return { ok: true, stream: new OpenRouterStream(reader) };
    },

    async embed(request: BrainEmbedRequest): Promise<BrainEmbedResult> {
      const res = await fetchWithRetry(
        OPENROUTER_EMBEDDINGS_URL,
        {
          method: "POST",
          headers: openRouterHeaders(),
          body: JSON.stringify({ model: EMBEDDING_MODEL, input: request.texts }),
        },
        { maxRetries: 0, retryOn: OPENROUTER_RETRY_ON }
      );

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, error: normalizeHttpError(res.status, body.slice(0, 200)) };
      }

      const json = (await res.json()) as EmbeddingResponse;
      return {
        ok: true,
        embeddings: json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding),
        usage: { inputTokens: json.usage?.prompt_tokens ?? json.usage?.total_tokens },
      };
    },
  };
}
