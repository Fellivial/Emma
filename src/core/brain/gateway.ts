/**
 * Brain Gateway — the single, provider-independent inference boundary (ADR 0003).
 *
 * Every request that requires a language-model provider — chat completions
 * (streaming or not), structured generation, vision analysis, embeddings —
 * goes through this module. Application code never constructs a provider
 * request, holds a provider URL or API key, or parses a provider-shaped
 * response.
 *
 * What the gateway does NOT own (application concerns that stay at call
 * sites): cost gating/accounting (`cost-gate.ts`), persona/prompt content,
 * memory ranking, behavior flags, `[emotion:]`/`[EMMA_ROUTINE]` conventions,
 * Sentry capture policy, and Emma's client-facing SSE envelope.
 *
 * Provider selection: OpenRouter is the sole provider today. Future providers
 * (Ollama, vLLM, LM Studio, an Emma-owned model) are added by implementing
 * `BrainProvider` and extending the selection below — never by touching
 * callers. Routing/registry logic is explicitly out of scope until a second
 * provider exists (ADR 0003, Out of Scope).
 */

import { createOpenRouterProvider } from "@/core/brain/providers/openrouter";
import type {
  BrainChatRequest,
  BrainChatResult,
  BrainEmbedRequest,
  BrainEmbedResult,
  BrainProvider,
  BrainStreamResult,
} from "@/core/brain/types";

export type {
  BrainChatRequest,
  BrainChatResult,
  BrainContentPart,
  BrainEmbedRequest,
  BrainEmbedResult,
  BrainFinishReason,
  BrainMessage,
  BrainProvider,
  BrainRequestError,
  BrainStream,
  BrainStreamEvent,
  BrainStreamResult,
  BrainTask,
  BrainToolCall,
  BrainToolDefinition,
  BrainUsage,
} from "@/core/brain/types";

const provider: BrainProvider = createOpenRouterProvider();

/** One-shot chat/structured/vision completion. */
export function brainChat(request: BrainChatRequest): Promise<BrainChatResult> {
  return provider.chat(request);
}

/** Streamed completion as normalized events (see BrainStream). */
export function brainChatStream(request: BrainChatRequest): Promise<BrainStreamResult> {
  return provider.chatStream(request);
}

/** Vector embeddings for one or more texts. */
export function brainEmbed(request: BrainEmbedRequest): Promise<BrainEmbedResult> {
  return provider.embed(request);
}

/** Whether an inference provider is configured in this environment. */
export function isBrainConfigured(): boolean {
  return provider.isConfigured();
}
