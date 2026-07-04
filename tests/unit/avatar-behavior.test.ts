import { describe, it, expect } from "vitest";
import { resolveBodyTapReaction, idleDelayScale } from "@/core/avatar-engine";

describe("resolveBodyTapReaction", () => {
  it("playful teasing keeps the flirty escalation", () => {
    expect(resolveBodyTapReaction("playful")).toEqual({ first: "skeptical", followUp: "flirty" });
  });

  it("light teasing softens the escalation to amused", () => {
    expect(resolveBodyTapReaction("light")).toEqual({ first: "skeptical", followUp: "amused" });
  });

  it("teasing off reacts reserved with no escalation", () => {
    expect(resolveBodyTapReaction("off")).toEqual({ first: "skeptical", followUp: null });
  });
});

describe("idleDelayScale", () => {
  it("forward initiative keeps the base idle cadence", () => {
    expect(idleDelayScale("forward")).toBe(1);
  });

  it("lower initiative stretches the idle cadence monotonically", () => {
    expect(idleDelayScale("balanced")).toBeGreaterThan(idleDelayScale("forward"));
    expect(idleDelayScale("reactive")).toBeGreaterThan(idleDelayScale("balanced"));
  });

  it("stays a light touch — never more than 2x", () => {
    for (const initiative of ["forward", "balanced", "reactive"] as const) {
      expect(idleDelayScale(initiative)).toBeLessThanOrEqual(2);
    }
  });
});
