/**
 * provider-conformance.test.ts
 *
 * Runs the shared provider-conformance suite (Technical Design §19.3) against
 * every `BrainProvider` implementation that exists today:
 *   - OpenRouter (`providers/openrouter.ts`) — re-verifies its existing
 *     behavior is unchanged by Wave 6B's 529-relocation (§17.3).
 *   - The fake, test-only second provider (`fake-provider.ts`) — the concrete
 *     evidence closing ADR-0006's "n=1, proven only by inspection" risk.
 */

import { afterEach, beforeEach } from "vitest";
import { runProviderConformanceSuite } from "./provider-conformance";
import { createOpenRouterProvider } from "@/core/brain/providers/openrouter";
import { createFakeProvider } from "./fake-provider";
import type { CapabilitiesDescriptor } from "@/core/brain/types";

const CAPABILITIES: CapabilitiesDescriptor = {
  supportsStreaming: true,
  supportsVision: true,
  supportsToolCalling: true,
  supportsEmbeddings: true,
  supportsStructuredOutput: true,
  contextWindowTokens: 128_000,
};

const ORIGINAL_KEY = process.env.OPENROUTER_API_KEY;

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = "sk-test-conformance";
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = ORIGINAL_KEY;
});

runProviderConformanceSuite("openrouter", createOpenRouterProvider, CAPABILITIES);
runProviderConformanceSuite("fake (test-only)", createFakeProvider, CAPABILITIES);
