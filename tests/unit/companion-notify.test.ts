/**
 * Companion notification copy (Phase 6) — behavior-flag gating and
 * lock-screen discretion.
 */
import { describe, it, expect } from "vitest";
import { buildTaskCompleteNotification, buildApprovalNotification } from "@/core/companion-notify";
import { deriveBehaviorFlags } from "@/core/behavior-flags";

const PLAYFUL = { teasingLevel: "playful", warmth: "standard" } as const;
const SOFT = { teasingLevel: "off", warmth: "standard" } as const;
const DISTRESS = { teasingLevel: "playful", warmth: "elevated" } as const;

describe("buildTaskCompleteNotification", () => {
  it("uses the playful bank only when teasing is fully allowed and warmth is standard", () => {
    const p = buildTaskCompleteNotification("triage my inbox", PLAYFUL);
    expect(p.body.startsWith("Mmm.")).toBe(true);
    expect(p.body).toContain("triage my inbox");
  });

  it("falls back soft when teasing is off, warmth is elevated, or flags are missing", () => {
    for (const flags of [SOFT, DISTRESS, null]) {
      const p = buildTaskCompleteNotification("triage my inbox", flags);
      expect(p.body.startsWith("Mmm.")).toBe(false);
      expect(p.body).toContain("triage my inbox");
      expect(p.body).toContain("ready whenever you are");
    }
  });

  it("stays lock-screen discreet — no pet names or emoji in any bank", () => {
    for (const flags of [PLAYFUL, SOFT, DISTRESS, null]) {
      const p = buildTaskCompleteNotification("plan the trip", flags);
      expect(p.title).toBe("Emma");
      expect(p.body).not.toMatch(/\bbaby\b/i);
      expect(p.body).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it("truncates long goals and collapses whitespace", () => {
    const long = "summarize   the entire quarterly report\nand every appendix in extreme detail";
    const p = buildTaskCompleteNotification(long, null);
    expect(p.body).toContain("summarize the entire quarterly report");
    expect(p.body).toContain("…");
    expect(p.body.length).toBeLessThan(120);
  });

  it("routes to /app", () => {
    expect(buildTaskCompleteNotification("x", null).url).toBe("/app");
  });

  it("real flag derivation drives the gate (ADR 0001 integration)", () => {
    const noTeasing = deriveBehaviorFlags({
      personaId: "mommy",
      memories: [
        {
          id: "m1",
          category: "preference",
          key: "teasing_preference",
          value: "don't tease me",
          confidence: 0.9,
          source: "explicit",
          timestamp: Date.now(),
        },
      ],
    });
    const p = buildTaskCompleteNotification("check flights", noTeasing);
    expect(p.body.startsWith("Mmm.")).toBe(false);
  });
});

describe("buildApprovalNotification", () => {
  it("is companion-voiced, fixed copy, and names the tool", () => {
    const p = buildApprovalNotification("send_email");
    expect(p.title).toBe("Emma");
    expect(p.body).toContain("send_email");
    expect(p.body).toContain("your okay");
    expect(p.url).toBe("/app");
  });
});
