/**
 * Parser for the memory-extraction LLM response.
 *
 * Official contract: a single JSON object `{ "memories": [...] }`, matching
 * MEMORY_EXTRACTION_PROMPT and the response_format schema sent alongside it
 * in src/app/api/emma/memory/route.ts. The utility-tier model in use does
 * not honor response_format/strict constrained decoding (verified live via
 * direct A/B probing against the OpenRouter API), so this parser never
 * trusts JSON.parse() success alone: it validates shape, tolerates a bare
 * array as a fallback, and never throws on malformed model output.
 */
import type { MemoryCategory } from "@/types/emma";

const VALID_CATEGORIES = new Set<MemoryCategory>([
  "preference",
  "habit",
  "personal",
  "goal",
  "relationship",
  "context",
  "constraint",
]);

export interface ExtractedMemoryCandidate {
  category: MemoryCategory;
  key: string;
  value: string;
  confidence: number;
}

function isValidCandidate(item: unknown): item is ExtractedMemoryCandidate {
  if (typeof item !== "object" || item === null) return false;
  const obj = item as Record<string, unknown>;
  return (
    typeof obj.category === "string" &&
    VALID_CATEGORIES.has(obj.category as MemoryCategory) &&
    typeof obj.key === "string" &&
    obj.key.trim().length > 0 &&
    typeof obj.value === "string" &&
    obj.value.trim().length > 0 &&
    typeof obj.confidence === "number" &&
    Number.isFinite(obj.confidence) &&
    obj.confidence >= 0 &&
    obj.confidence <= 1
  );
}

export function parseMemoryExtraction(rawText: string): ExtractedMemoryCandidate[] {
  let value: unknown;
  try {
    value = JSON.parse(rawText);
  } catch {
    console.error("[MemoryExtractor] response was not valid JSON", {
      rawText: rawText.slice(0, 500),
    });
    return [];
  }

  let candidates: unknown;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const memories = (value as Record<string, unknown>).memories;
    if (Array.isArray(memories)) {
      candidates = memories;
    } else {
      console.error("[MemoryExtractor] response object missing memories array", {
        rawText: rawText.slice(0, 500),
      });
      return [];
    }
  } else if (Array.isArray(value)) {
    // Fallback tolerance: some providers/models ignore response_format
    // entirely and return a bare array despite the prompt and schema both
    // specifying the {memories: [...]} contract. Accept it rather than
    // crash, but log so contract drift stays observable.
    console.warn(
      "[MemoryExtractor] response was a bare array, not {memories: [...]} — contract drift"
    );
    candidates = value;
  } else {
    console.error("[MemoryExtractor] unrecognized extraction response shape", {
      rawText: rawText.slice(0, 500),
    });
    return [];
  }

  return (candidates as unknown[]).filter(isValidCandidate);
}
