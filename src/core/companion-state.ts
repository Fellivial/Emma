/**
 * Companion State — cross-session presence store (ADR 0002).
 *
 * One row per user, overwritten in place. This is NOT long-term memory:
 * it is the latest snapshot of "when did we last talk and how did it end",
 * consumed by the greeting engine (and later companion notifications).
 *
 * Security contract (docs/adr/0002-companion-state-persistence.md):
 * - last_mood / last_emotion / last_proactive_topic / presence_summary are
 *   encrypted at the field level (AES-256-GCM) before insert.
 * - Server-side only (service role). Client access goes through
 *   /api/emma/presence, which authenticates and decrypts.
 * - Fail-open: any read/write error yields "no presence state" — presence
 *   must never block or delay chat.
 * - State older than COMPANION_STATE_MAX_AGE_MS is treated as absent at
 *   read time (Emma should not claim presence across a month-long gap).
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { encrypt, decrypt } from "@/core/security/encryption";
import type { EmotionState } from "@/types/emma";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Snapshot of the last fused emotion — no source/timestamp, just the reading. */
export type EmotionSnapshot = Pick<EmotionState, "primary" | "valence" | "arousal" | "confidence">;

export interface CompanionState {
  /** Epoch ms of the user's last exchange with Emma. */
  lastInteractionAt: number | null;
  /** Greeting bucket last used (bounded enum, e.g. "morning", "quick_return"). */
  lastGreetingContext: string | null;
  /** Primary label of the last fused emotion (e.g. "stressed"). */
  lastMood: string | null;
  /** Last emotion snapshot. */
  lastEmotion: EmotionSnapshot | null;
  /** Topic of the last proactive/companion nudge, if any. */
  lastProactiveTopic: string | null;
  /** One short code-generated line of session context. */
  presenceSummary: string | null;
}

// ─── Pure helpers (exported for tests) ───────────────────────────────────────

/** State older than this is treated as absent at read time (ADR 0002). */
export const COMPANION_STATE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function isStaleCompanionState(
  lastInteractionAt: number | null,
  now: number = Date.now()
): boolean {
  if (lastInteractionAt === null) return true;
  return now - lastInteractionAt > COMPANION_STATE_MAX_AGE_MS;
}

/**
 * Builds the presence summary from bounded, code-controlled inputs only —
 * never from conversation text (ADR 0002 "What is NOT persisted").
 */
export function buildPresenceSummary(hour: number, mood: string | null): string | null {
  const daypart =
    hour >= 5 && hour < 12
      ? "morning"
      : hour >= 12 && hour < 17
        ? "afternoon"
        : hour >= 17 && hour < 21
          ? "evening"
          : hour >= 21 && hour < 24
            ? "night"
            : "late-night";
  if (!mood) return `${daypart} session`;
  return `${daypart} session, ended ${mood}`;
}

// ─── Row mapping ─────────────────────────────────────────────────────────────

interface CompanionStateRow {
  user_id: string;
  last_interaction_at: string | null;
  last_greeting_context: string | null;
  last_mood: string | null;
  last_emotion: string | null;
  last_proactive_topic: string | null;
  presence_summary: string | null;
}

function decryptOrNull(value: string | null): string | null {
  if (value === null) return null;
  try {
    const plain = decrypt(value);
    // decrypt() returns a sentinel instead of throwing on undecryptable input.
    return plain === "[decryption failed]" ? null : plain;
  } catch {
    return null;
  }
}

/** Exported for tests — maps a DB row to the decrypted CompanionState. */
export function rowToCompanionState(row: CompanionStateRow): CompanionState {
  let lastEmotion: EmotionSnapshot | null = null;
  const emotionJson = decryptOrNull(row.last_emotion);
  if (emotionJson) {
    try {
      const parsed = JSON.parse(emotionJson);
      if (parsed && typeof parsed.primary === "string") {
        lastEmotion = {
          primary: parsed.primary,
          valence: Number(parsed.valence) || 0,
          arousal: Number(parsed.arousal) || 0,
          confidence: Number(parsed.confidence) || 0,
        };
      }
    } catch {
      // Corrupt snapshot — treat as absent
    }
  }

  return {
    lastInteractionAt: row.last_interaction_at ? Date.parse(row.last_interaction_at) : null,
    lastGreetingContext: row.last_greeting_context,
    lastMood: decryptOrNull(row.last_mood),
    lastEmotion,
    lastProactiveTopic: decryptOrNull(row.last_proactive_topic),
    presenceSummary: decryptOrNull(row.presence_summary),
  };
}

// ─── Store ───────────────────────────────────────────────────────────────────

/**
 * Reads the user's companion state. Returns null when absent, stale,
 * or on any error (fail-open).
 */
export async function getCompanionState(userId: string): Promise<CompanionState | null> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from("companion_state")
      .select(
        "user_id,last_interaction_at,last_greeting_context,last_mood,last_emotion,last_proactive_topic,presence_summary"
      )
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) return null;

    const state = rowToCompanionState(data as CompanionStateRow);
    if (isStaleCompanionState(state.lastInteractionAt)) return null;
    return state;
  } catch {
    return null;
  }
}

export interface CompanionStatePatch {
  lastGreetingContext?: string | null;
  lastMood?: string | null;
  lastEmotion?: EmotionSnapshot | null;
  lastProactiveTopic?: string | null;
  presenceSummary?: string | null;
}

/**
 * Upserts the user's companion state (last-writer-wins, ADR 0002).
 * Always stamps last_interaction_at = now. Encrypts intimate fields.
 * Silent no-op on any error (fail-open).
 */
export async function saveCompanionState(
  userId: string,
  patch: CompanionStatePatch
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return;

    const row: Record<string, unknown> = {
      user_id: userId,
      last_interaction_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if ("lastGreetingContext" in patch) {
      row.last_greeting_context = patch.lastGreetingContext;
    }
    if ("lastMood" in patch) {
      row.last_mood = patch.lastMood === null ? null : encrypt(patch.lastMood ?? "");
    }
    if ("lastEmotion" in patch) {
      row.last_emotion =
        patch.lastEmotion === null ? null : encrypt(JSON.stringify(patch.lastEmotion));
    }
    if ("lastProactiveTopic" in patch) {
      row.last_proactive_topic =
        patch.lastProactiveTopic === null ? null : encrypt(patch.lastProactiveTopic ?? "");
    }
    if ("presenceSummary" in patch) {
      row.presence_summary =
        patch.presenceSummary === null ? null : encrypt(patch.presenceSummary ?? "");
    }

    await supabase.from("companion_state").upsert(row, { onConflict: "user_id" });
  } catch {
    // Fail-open — presence must never block chat.
  }
}
