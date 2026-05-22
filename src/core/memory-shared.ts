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

export const MEMORY_EXTRACTION_PROMPT = `Analyze the conversation and extract any facts worth remembering about the user.

Each memory needs:
- category: preference | routine | personal | episodic | environment
- key: short snake_case identifier (e.g. favorite_color, morning_wakeup_time)
- value: the actual fact as a concise string
- confidence: 0.0–1.0 — use ≥0.7 for explicit statements, 0.4–0.6 for inferences

Only extract genuinely useful, persistent facts. Do not extract transient statements like "I'm hungry right now". If nothing is worth remembering, return an empty memories array.`;
