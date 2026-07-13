/**
 * Companion state (ADR 0002) — staleness, bounded presence summary,
 * encrypted row round-trip, and the encrypt-before-upsert contract.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const upsertSpy = vi.fn().mockResolvedValue({ error: null });
let adminClient: unknown = {
  from: vi.fn(() => ({ upsert: upsertSpy })),
};

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => adminClient,
}));

import {
  isStaleCompanionState,
  buildPresenceSummary,
  rowToCompanionState,
  saveCompanionState,
  COMPANION_STATE_MAX_AGE_MS,
} from "@/core/companion-state";
import { encrypt } from "@/core/security/encryption";
import { shouldMoodCheckIn } from "@/core/greeting-engine";

const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  vi.stubEnv("EMMA_ENCRYPTION_KEY", "a".repeat(64));
  upsertSpy.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isStaleCompanionState", () => {
  it("treats missing timestamps as stale", () => {
    expect(isStaleCompanionState(null)).toBe(true);
  });

  it("keeps recent state fresh and expires past the max age", () => {
    const now = Date.now();
    expect(isStaleCompanionState(now - 2 * HOUR, now)).toBe(false);
    expect(isStaleCompanionState(now - COMPANION_STATE_MAX_AGE_MS - 1, now)).toBe(true);
  });
});

describe("buildPresenceSummary", () => {
  it("is built from bounded inputs only — daypart and mood label", () => {
    expect(buildPresenceSummary(9, "stressed")).toBe("morning session, ended stressed");
    expect(buildPresenceSummary(23, null)).toBe("night session");
    expect(buildPresenceSummary(2, "calm")).toBe("late-night session, ended calm");
  });
});

describe("rowToCompanionState", () => {
  const baseRow = {
    user_id: "u1",
    last_interaction_at: "2026-07-13T08:00:00.000Z",
    last_greeting_context: "morning",
    last_mood: null,
    last_emotion: null,
    last_proactive_topic: null,
    presence_summary: null,
  };

  it("decrypts encrypted fields round-trip", () => {
    const state = rowToCompanionState({
      ...baseRow,
      last_mood: encrypt("stressed"),
      last_emotion: encrypt(
        JSON.stringify({ primary: "stressed", valence: -0.6, arousal: 0.7, confidence: 0.8 })
      ),
      presence_summary: encrypt("night session, ended stressed"),
    });

    expect(state.lastMood).toBe("stressed");
    expect(state.lastEmotion).toEqual({
      primary: "stressed",
      valence: -0.6,
      arousal: 0.7,
      confidence: 0.8,
    });
    expect(state.presenceSummary).toBe("night session, ended stressed");
    expect(state.lastInteractionAt).toBe(Date.parse("2026-07-13T08:00:00.000Z"));
    expect(state.lastGreetingContext).toBe("morning");
  });

  it("degrades corrupt ciphertext to null instead of throwing", () => {
    const state = rowToCompanionState({
      ...baseRow,
      last_mood: "enc:v1:deadbeef:deadbeef:deadbeef",
      last_emotion: encrypt("not json at all"),
    });
    expect(state.lastMood).toBeNull();
    expect(state.lastEmotion).toBeNull();
  });
});

describe("saveCompanionState", () => {
  it("encrypts intimate fields before upsert and stamps the interaction time", async () => {
    await saveCompanionState("u1", {
      lastMood: "stressed",
      lastEmotion: { primary: "stressed", valence: -0.6, arousal: 0.7, confidence: 0.8 },
      presenceSummary: "night session, ended stressed",
    });

    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const row = upsertSpy.mock.calls[0][0] as Record<string, string>;
    expect(row.user_id).toBe("u1");
    expect(row.last_interaction_at).toBeTruthy();
    // Ciphertext only — no plaintext mood anywhere in the stored row.
    expect(row.last_mood.startsWith("enc:v1:")).toBe(true);
    expect(row.last_emotion.startsWith("enc:v1:")).toBe(true);
    expect(row.presence_summary.startsWith("enc:v1:")).toBe(true);
    expect(JSON.stringify(row)).not.toContain("stressed");
  });

  it("fails open when the admin client is unavailable", async () => {
    const prev = adminClient;
    adminClient = null;
    await expect(saveCompanionState("u1", { lastMood: "happy" })).resolves.toBeUndefined();
    expect(upsertSpy).not.toHaveBeenCalled();
    adminClient = prev;
  });
});

describe("shouldMoodCheckIn (greeting integration)", () => {
  const presence = (mood: string | null) => ({ lastInteractionAt: null, lastMood: mood });

  it("checks in after a negative session within the window", () => {
    expect(shouldMoodCheckIn(presence("stressed"), 5)).toBe(true);
    expect(shouldMoodCheckIn(presence("sad"), 47)).toBe(true);
  });

  it("stays quiet for the same sitting, long gaps, and non-negative moods", () => {
    expect(shouldMoodCheckIn(presence("stressed"), 0.5)).toBe(false);
    expect(shouldMoodCheckIn(presence("stressed"), 100)).toBe(false);
    expect(shouldMoodCheckIn(presence("happy"), 5)).toBe(false);
    expect(shouldMoodCheckIn(presence(null), 5)).toBe(false);
    expect(shouldMoodCheckIn(null, 5)).toBe(false);
    expect(shouldMoodCheckIn(presence("stressed"), null)).toBe(false);
  });
});
