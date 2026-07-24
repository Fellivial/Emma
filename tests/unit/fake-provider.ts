/**
 * Fake, test-only second `BrainProvider` implementation (Wave 6B, ADR-0006).
 *
 * Exists solely to give the provider-conformance suite (and, in Wave 6C,
 * Routing Layer 2's capability matching) something other than n=1 to run
 * against — this is the mechanism ADR-0006's Consequences names as the way
 * to close the "provider-neutrality proven only by inspection" risk without
 * needing a real second backend. NEVER registered in `gateway.ts`, NEVER
 * shipped to production — imported only from test files.
 *
 * Deliberately speaks the same OpenAI-compatible wire shape the conformance
 * suite mocks (and that OpenRouter already speaks), rather than inventing a
 * distinct wire format — its purpose is to be a second, independent
 * implementation of the `BrainProvider` contract, not to model any specific
 * real backend's wire quirks.
 */

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
  BrainUsage,
} from "@/core/brain/types";

const FAKE_CHAT_URL = "https://fake-provider.test/v1/chat/completions";
const FAKE_EMBEDDINGS_URL = "https://fake-provider.test/v1/embeddings";

type FakeResponse = {
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

type FakeStreamChunk = {
  choices?: Array<{ delta?: { content?: string | null }; finish_reason?: string | null }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

type FakeEmbeddingResponse = {
  data: Array<{ embedding: number[]; index: number }>;
  usage?: { prompt_tokens?: number };
};

const KNOWN_FINISH_REASONS = new Set(["stop", "length", "content_filter", "tool_calls"]);

function normalizeFinishReason(reason: string | null | undefined): BrainFinishReason {
  if (reason == null) return null;
  return KNOWN_FINISH_REASONS.has(reason) ? (reason as BrainFinishReason) : "other";
}

function normalizeHttpError(status: number, bodyPreview: string): BrainRequestError {
  const code =
    status === 400
      ? "BAD_REQUEST"
      : status === 401
        ? "AUTH_ERROR"
        : status === 429
          ? "RATE_LIMIT"
          : status === 504
            ? "TIMEOUT"
            : "UPSTREAM_ERROR";
  return {
    status,
    code,
    message: `Fake provider error ${status}`,
    bodyPreview,
    retryable: status === 429 || status >= 500,
  };
}

class FakeProviderStream implements BrainStream {
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

        let chunk: FakeStreamChunk;
        try {
          chunk = JSON.parse(raw) as FakeStreamChunk;
        } catch {
          continue;
        }

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

export function createFakeProvider(): BrainProvider {
  return {
    name: "fake",

    isConfigured(): boolean {
      return true;
    },

    async chat(request: BrainChatRequest): Promise<BrainChatResult> {
      const res = await fetchWithRetry(
        FAKE_CHAT_URL,
        { method: "POST", body: JSON.stringify(request) },
        { maxRetries: request.maxRetries ?? 0 }
      );

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, error: normalizeHttpError(res.status, body.slice(0, 500)) };
      }

      const data = (await res.json()) as FakeResponse;
      const message = data.choices?.[0]?.message;
      return {
        ok: true,
        text: message?.content ?? "",
        toolCalls: message?.tool_calls ?? [],
        finishReason: normalizeFinishReason(data.choices?.[0]?.finish_reason),
        usage: {
          inputTokens: data.usage?.prompt_tokens ?? 0,
          outputTokens: data.usage?.completion_tokens ?? 0,
        },
      };
    },

    async chatStream(request: BrainChatRequest): Promise<BrainStreamResult> {
      const res = await fetchWithRetry(
        FAKE_CHAT_URL,
        { method: "POST", body: JSON.stringify(request) },
        { maxRetries: request.maxRetries ?? 0 }
      );

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
            message: "Fake provider returned no stream body",
            bodyPreview: "",
            retryable: true,
          },
        };
      }

      return { ok: true, stream: new FakeProviderStream(reader) };
    },

    async embed(request: BrainEmbedRequest): Promise<BrainEmbedResult> {
      const res = await fetchWithRetry(
        FAKE_EMBEDDINGS_URL,
        { method: "POST", body: JSON.stringify({ input: request.texts }) },
        { maxRetries: 0 }
      );

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, error: normalizeHttpError(res.status, body.slice(0, 200)) };
      }

      const json = (await res.json()) as FakeEmbeddingResponse;
      return {
        ok: true,
        embeddings: json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding),
        usage: { inputTokens: json.usage?.prompt_tokens },
      };
    },
  };
}
