import { describe, it, expect } from "vitest";
import {
  applyFlagsToElevenLabsSettings,
  applyFlagsToWebSpeechParams,
  type ElevenLabsVoiceSettings,
  type WebSpeechVoiceParams,
} from "@/core/voice-behavior";
import type { BehaviorFlags } from "@/core/behavior-flags";

function flags(overrides: Partial<BehaviorFlags> = {}): BehaviorFlags {
  return {
    verbosity: "normal",
    emojiUsage: "minimal",
    teasingLevel: "playful",
    warmth: "standard",
    initiative: "forward",
    ...overrides,
  };
}

// The neutral ElevenLabs expression preset from the TTS route.
const EL_NEUTRAL: ElevenLabsVoiceSettings = {
  stability: 0.55,
  similarity_boost: 0.75,
  style: 0.0,
  speed: 1.0,
};

// The sad preset — already near the soft end, exercises the clamps.
const EL_SAD: ElevenLabsVoiceSettings = {
  stability: 0.3,
  similarity_boost: 0.75,
  style: 0.1,
  speed: 0.8,
};

const WS_NEUTRAL: WebSpeechVoiceParams = { rate: 0.95, pitch: 0.97, volume: 0.9 };
const WS_SAD: WebSpeechVoiceParams = { rate: 0.88, pitch: 0.93, volume: 0.75 };

describe("applyFlagsToElevenLabsSettings", () => {
  it("is identity at baseline flags", () => {
    const result = applyFlagsToElevenLabsSettings(EL_NEUTRAL, "mommy", flags());
    expect(result).toEqual(EL_NEUTRAL);
  });

  it("is identity without hints", () => {
    expect(applyFlagsToElevenLabsSettings(EL_NEUTRAL, "mommy")).toBe(EL_NEUTRAL);
  });

  it("elevated warmth softens delivery: slower, less clamped, more style", () => {
    const result = applyFlagsToElevenLabsSettings(
      EL_NEUTRAL,
      "mommy",
      flags({ warmth: "elevated" })
    );
    expect(result.speed).toBeLessThan(EL_NEUTRAL.speed);
    expect(result.stability).toBeLessThan(EL_NEUTRAL.stability);
    expect(result.style).toBeGreaterThan(EL_NEUTRAL.style);
    expect(result.similarity_boost).toBe(EL_NEUTRAL.similarity_boost);
  });

  it("clamps stay inside safe bounds on an already-soft preset", () => {
    const result = applyFlagsToElevenLabsSettings(
      EL_SAD,
      "mommy",
      flags({ warmth: "elevated", initiative: "reactive" })
    );
    expect(result.speed).toBeGreaterThanOrEqual(0.75);
    expect(result.stability).toBeGreaterThanOrEqual(0.2);
    expect(result.style).toBeLessThanOrEqual(0.6);
  });

  it("initiative below the persona baseline calms the pace", () => {
    // mommy baseline is "forward" — "balanced" is a lowering.
    const result = applyFlagsToElevenLabsSettings(
      EL_NEUTRAL,
      "mommy",
      flags({ initiative: "balanced" })
    );
    expect(result.speed).toBeLessThan(EL_NEUTRAL.speed);
  });

  it("initiative at the persona baseline changes nothing", () => {
    // neutral baseline is "balanced" — same value is not a lowering.
    const result = applyFlagsToElevenLabsSettings(
      EL_NEUTRAL,
      "neutral",
      flags({ initiative: "balanced" })
    );
    expect(result).toEqual(EL_NEUTRAL);
  });

  it("never raises energy: forward initiative does not speed up", () => {
    const result = applyFlagsToElevenLabsSettings(
      EL_NEUTRAL,
      "neutral",
      flags({ initiative: "forward" })
    );
    expect(result.speed).toBeLessThanOrEqual(EL_NEUTRAL.speed);
  });

  it("ignores unknown hint values from an untrusted request body", () => {
    const result = applyFlagsToElevenLabsSettings(EL_NEUTRAL, "mommy", {
      warmth: "MAXIMUM",
      initiative: 42,
    });
    expect(result).toEqual(EL_NEUTRAL);
  });
});

describe("applyFlagsToWebSpeechParams", () => {
  it("is identity at baseline flags", () => {
    const result = applyFlagsToWebSpeechParams(WS_NEUTRAL, "mommy", flags());
    expect(result).toEqual(WS_NEUTRAL);
  });

  it("is identity without hints", () => {
    expect(applyFlagsToWebSpeechParams(WS_NEUTRAL, "mommy")).toBe(WS_NEUTRAL);
  });

  it("elevated warmth softens: slower, quieter, pitch never above 1.0", () => {
    const result = applyFlagsToWebSpeechParams(WS_NEUTRAL, "mommy", flags({ warmth: "elevated" }));
    expect(result.rate).toBeLessThan(WS_NEUTRAL.rate);
    expect(result.volume).toBeLessThan(WS_NEUTRAL.volume);
    expect(result.pitch).toBeLessThanOrEqual(1.0);
  });

  it("rate never drops below the 0.88 WebSpeech prosody floor", () => {
    const result = applyFlagsToWebSpeechParams(
      WS_SAD,
      "mommy",
      flags({ warmth: "elevated", initiative: "reactive" })
    );
    expect(result.rate).toBeGreaterThanOrEqual(0.88);
  });

  it("initiative below the persona baseline calms the rate", () => {
    const result = applyFlagsToWebSpeechParams(
      WS_NEUTRAL,
      "mommy",
      flags({ initiative: "balanced" })
    );
    expect(result.rate).toBeLessThan(WS_NEUTRAL.rate);
  });

  it("determinism: same inputs give identical outputs", () => {
    const a = applyFlagsToWebSpeechParams(WS_NEUTRAL, "mommy", flags({ warmth: "elevated" }));
    const b = applyFlagsToWebSpeechParams(WS_NEUTRAL, "mommy", flags({ warmth: "elevated" }));
    expect(a).toEqual(b);
  });
});
