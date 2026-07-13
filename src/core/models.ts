/**
 * Model configuration — single source of truth.
 *
 * Brain (chat/NLU): Sonnet — needs persona reasoning, device control, expression selection
 * Vision:           Sonnet — needs multimodal image understanding
 * Utilities:        Haiku  — emotion extraction, memory extraction, summarization
 */

// Brain — main chat/NLU (persona + device control + expression)
// DEV: free tier. LAUNCH: anthropic/claude-sonnet-4-5
export const MODEL_BRAIN = "openai/gpt-oss-120b:free";

// Vision — scene analysis (needs strong multimodal / image_url support)
export const MODEL_VISION = "google/gemini-2.5-flash";

// Utility — emotion detection, memory extraction, summarization, agent intermediate steps
// DEV: free tier (same as brain — gpt-oss-20b doesn't support tool_calls). LAUNCH: google/gemini-2.5-flash
export const MODEL_UTILITY = "openai/gpt-oss-120b:free";

// Fallback arrays for OpenRouter — tried in order, first available wins.
// OpenRouter accepts "models" (array) as an alternative to "model" (string).
export const BRAIN_MODELS = [
  MODEL_BRAIN,
  "meta-llama/llama-3.3-70b-instruct:free", // free fallback
];

// Every entry here MUST support image_url input — text-only fallbacks would
// silently answer without seeing the frame.
export const VISION_MODELS = [
  MODEL_VISION,
  "google/gemini-2.5-flash-lite", // cheaper vision-capable fallback
];

// Vision calls carry a full screenshot payload; cap upstream latency so a
// stalled provider can't hold the request open indefinitely.
export const VISION_TIMEOUT_MS = 20_000;

export const UTILITY_MODELS = [
  MODEL_UTILITY,
  "meta-llama/llama-3.3-70b-instruct:free", // free fallback
];

// Convenience map for logging
export const MODEL_MAP = {
  brain: MODEL_BRAIN,
  vision: MODEL_VISION,
  utility: MODEL_UTILITY,
} as const;
