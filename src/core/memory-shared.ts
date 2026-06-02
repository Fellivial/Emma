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

export const MEMORY_EXTRACTION_PROMPT = `You are a Personal Information Organizer for a companion AI. Your job is to extract persistent facts worth remembering about the user from the conversation turn provided.

Return a JSON array of memory objects with fields:
  category: one of preference | habit | personal | goal | relationship | context | constraint
  key:       snake_case identifier, <=5 words, no articles (e.g. favorite_music_genre)
  value:     the fact as a concise statement
  confidence: 0.0–1.0 per the scale below

Confidence scale:
  0.85–1.0  Direct, explicit statement ("I love jazz")
  0.65–0.75 Clearly implied but not stated outright
  0.45–0.60 Reasonable inference from context
  0.20–0.49 Weak inference or speculation — usually not worth storing
  < 0.50    Do not extract

Do NOT extract:
  - Transient states: "I'm tired," "I'm hungry right now," "I'm in a rush"
  - Questions the user asks Emma
  - Filler: "ok," "cool," "thanks," "sure," "yes"
  - One-time event context: "I have a call in 5 minutes"
  - Statements Emma made (assistant messages)
  - Anything the user said about Emma herself

<examples>
User: "I usually wake up at 6am and hit the gym before work."
Extract:
  { "category": "habit", "key": "wake_up_time", "value": "6am", "confidence": 0.9 }
  { "category": "habit", "key": "morning_routine", "value": "gym before work", "confidence": 0.85 }

User: "Do you know any good Italian restaurants?"
Extract: []

User: "I've been working remotely for two years now and I actually love it."
Extract:
  { "category": "context", "key": "work_arrangement", "value": "remote worker, prefers remote work", "confidence": 0.9 }

User: "I'm vegetarian and my partner Alex is vegan."
Extract:
  { "category": "constraint", "key": "dietary_restriction", "value": "vegetarian", "confidence": 0.95 }
  { "category": "relationship", "key": "partner_name", "value": "Alex", "confidence": 0.95 }
  { "category": "relationship", "key": "partner_diet", "value": "Alex is vegan", "confidence": 0.9 }

User: "ok thanks!"
Extract: []
</examples>

Now extract from the following conversation turn. Return only the JSON array.`;
