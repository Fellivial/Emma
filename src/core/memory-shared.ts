import type { MemoryEntry } from "@/types/emma";

/**
 * Serialize memories for prompt injection.
 * This file is client-safe — no fs imports.
 */
export function serializeMemories(entries: MemoryEntry[]): string {
  if (entries.length === 0) return "No memories stored yet.";

  const grouped: Record<string, MemoryEntry[]> = {};
  for (const e of entries) {
    if (!grouped[e.category]) grouped[e.category] = [];
    grouped[e.category].push(e);
  }

  const lines: string[] = [];
  for (const [cat, items] of Object.entries(grouped)) {
    lines.push(`[${cat.toUpperCase()}]`);
    for (const item of items) {
      lines.push(`  - ${item.key}: ${item.value}`);
    }
  }

  return lines.join("\n");
}

export const MEMORY_EXTRACTION_PROMPT = `Analyze the conversation and extract any facts worth remembering about the user. Return ONLY a JSON array of memory objects (no markdown, no backticks, no preamble).

Each object should have:
- "category": one of "preference", "routine", "personal", "episodic", "environment"
- "key": a short snake_case identifier (e.g., "favorite_color", "morning_wakeup_time")
- "value": the actual fact as a concise string
- "confidence": 0.0 to 1.0 — how confident you are this is a real, persistent fact

Rules:
- Only extract genuinely useful, persistent facts
- Don't extract transient statements like "I'm hungry right now"
- DO extract: preferences, habits, personal details, relationship info, environmental facts
- If nothing worth remembering, return an empty array: []
- confidence >= 0.7 for explicit statements, 0.4-0.6 for inferences

Example output:
[{"category":"preference","key":"favorite_music","value":"lo-fi hip hop","confidence":0.9}]`;
