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
// DEV: free tier (Google AI Studio — supports image_url). LAUNCH: google/gemini-2.5-flash
export const MODEL_VISION = "google/gemma-4-31b-it:free";

// Utility — emotion detection, memory extraction, summarization, agent intermediate steps
// DEV: free tier (same as brain — gpt-oss-20b doesn't support tool_calls). LAUNCH: google/gemini-2.5-flash
export const MODEL_UTILITY = "openai/gpt-oss-120b:free";

// Convenience map for logging
export const MODEL_MAP = {
  brain: MODEL_BRAIN,
  vision: MODEL_VISION,
  utility: MODEL_UTILITY,
} as const;
