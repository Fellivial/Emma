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
 * Provider selection: OpenRouter is the sole registered provider today,
 * looked up through the Provider Registry (`registry.ts`, ADR 0006). Future
 * providers (Ollama, vLLM, LM Studio, an Emma-owned model) are added by
 * implementing `BrainProvider`, authoring a `CapabilitiesDescriptor`, and
 * registering both here — never by touching callers. This module's own
 * provider selection is still a direct Registry lookup, not yet a routing
 * decision (Wave 6C, ADR 0007, Technical Design §5, introduces the Routing
 * Engine that supersedes it).
 */

import { createProviderRegistry } from "@/core/brain/registry";
import { createOpenRouterProvider } from "@/core/brain/providers/openrouter";
import type {
  BrainChatRequest,
  BrainChatResult,
  BrainEmbedRequest,
  BrainEmbedResult,
  BrainProvider,
  BrainStreamResult,
  CapabilitiesDescriptor,
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
  CapabilitiesDescriptor,
} from "@/core/brain/types";
export type { ProviderRegistry, RegisteredProvider } from "@/core/brain/registry";

// Conservative (minimum) advertised context window across BRAIN_MODELS/
// VISION_MODELS/UTILITY_MODELS' fallback entries (Technical Design §4.3).
// Static, hand-maintained estimate, not derived from a live OpenRouter API
// call (out of scope for this phase — the "n=1" accepted risk every ADR in
// this initiative carries, ADR-0006 Consequences). See Technical Debt
// Register TD-6A-1 for the verification follow-up.
const OPENROUTER_CAPABILITIES: CapabilitiesDescriptor = {
  supportsStreaming: true,
  supportsVision: true,
  supportsToolCalling: true,
  supportsEmbeddings: true,
  supportsStructuredOutput: true,
  contextWindowTokens: 128_000,
};

const registry = createProviderRegistry();
registry.register(createOpenRouterProvider(), OPENROUTER_CAPABILITIES);

/**
 * Resolves the provider to invoke. Interim, pre-Routing-Engine lookup
 * (Wave 6C replaces this with `routeRequest()`, Technical Design §5) — a
 * direct, zero-behavior-change stand-in for today's module-level `const`.
 *
 * Falls through to the sole registered provider when none report
 * `isConfigured() === true`, so an unconfigured environment (e.g. no
 * `OPENROUTER_API_KEY` in dev) still reaches that provider's own
 * configuration error exactly as it did before this wave, rather than a
 * different Gateway-level error. Wave 6C's `PROVIDER_UNAVAILABLE` contract
 * (Technical Design §5.3, §17.1) is the intended long-term replacement for
 * this fallback, once a real routing decision (not just a lookup) exists.
 */
function selectedProvider(): BrainProvider {
  const [configured] = registry.getConfigured();
  if (configured) return configured.provider;
  const [fallback] = registry.list();
  return fallback.provider;
}

/** One-shot chat/structured/vision completion. */
export function brainChat(request: BrainChatRequest): Promise<BrainChatResult> {
  return selectedProvider().chat(request);
}

/** Streamed completion as normalized events (see BrainStream). */
export function brainChatStream(request: BrainChatRequest): Promise<BrainStreamResult> {
  return selectedProvider().chatStream(request);
}

/** Vector embeddings for one or more texts. */
export function brainEmbed(request: BrainEmbedRequest): Promise<BrainEmbedResult> {
  return selectedProvider().embed(request);
}

/** Whether an inference provider is configured in this environment. */
export function isBrainConfigured(): boolean {
  return registry.getConfigured().length > 0;
}
