/**
 * Model configuration — single source of truth.
 *
 * Brain (chat/NLU): Sonnet — needs persona reasoning, device control, expression selection
 * Vision:           Sonnet — needs multimodal image understanding
 * Utilities:        Haiku  — emotion extraction, memory extraction, summarization
 */

// Brain — main chat/NLU (persona + device control + expression)
export const MODEL_BRAIN = "claude-sonnet-4-20250514";

// Vision — scene analysis (needs strong multimodal)
export const MODEL_VISION = "claude-sonnet-4-20250514";

// Utility — emotion detection, memory extraction, summarization
export const MODEL_UTILITY = "claude-haiku-4-5-20251001";

// Convenience map for logging
export const MODEL_MAP = {
  brain: MODEL_BRAIN,
  vision: MODEL_VISION,
  utility: MODEL_UTILITY,
} as const;
