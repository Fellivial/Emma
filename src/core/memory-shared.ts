import type { MemoryEntry } from "@/types/emma";

/**
 * Serialize memories for prompt injection.
 * This file is client-safe — no fs imports.
 */
function confidenceLabel(confidence: number): string {
  if (confidence >= 0.85) return "";
  if (confidence >= 0.65) return " (likely)";
  return " (uncertain)";
}

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
      lines.push(`  - ${item.key}: ${item.value}${confidenceLabel(item.confidence)}`);
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
  0.65–0.84 Clearly implied but not stated outright
  0.55–0.64 Reasonable inference from context
  0.20–0.54 Weak inference or speculation — do not extract

Minimum to extract: 0.55. If you're unsure, assign lower and it will be filtered.

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
Extract: []  ← question about Emma, not a fact about the user

User: "I have a presentation tomorrow, I'm really stressed."
Extract: []  ← transient state and one-time context; even if a fact could be inferred, confidence would fall below 0.55

User: "I'm vegetarian and my partner Alex is vegan."
Extract:
  { "category": "constraint", "key": "dietary_restriction", "value": "vegetarian", "confidence": 0.95 }
  { "category": "relationship", "key": "partner_name", "value": "Alex", "confidence": 0.95 }
  { "category": "relationship", "key": "partner_diet", "value": "Alex is vegan", "confidence": 0.9 }

User: "ok thanks!"
Extract: []  ← filler
</examples>

Now extract from the following conversation turn. Return only the JSON array.`;
