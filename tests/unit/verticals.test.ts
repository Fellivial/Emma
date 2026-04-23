import { describe, it, expect } from "vitest";
import { getVertical, getAllVerticals, applyVertical, BASE_TEMPLATE } from "@/core/verticals/templates";

describe("vertical templates", () => {
  it("has 4 built-in verticals registered", () => {
    const all = getAllVerticals();
    expect(all.length).toBe(4);
  });

  it("can retrieve clinic vertical", () => {
    const clinic = getVertical("clinic");
    expect(clinic).toBeDefined();
    expect(clinic!.name).toBe("Healthcare / Clinic");
    expect(clinic!.personaPrompt).toContain("HIPAA");
  });

  it("can retrieve real_estate vertical", () => {
    const re = getVertical("real_estate");
    expect(re).toBeDefined();
    expect(re!.intakeQuestions.length).toBeGreaterThan(0);
  });

  it("can retrieve ecommerce vertical", () => {
    const ec = getVertical("ecommerce");
    expect(ec).toBeDefined();
    expect(ec!.personaPrompt).toContain("Order status");
  });

  it("can retrieve legal vertical", () => {
    const legal = getVertical("legal");
    expect(legal).toBeDefined();
    expect(legal!.personaPrompt).toContain("NOT a lawyer");
    expect(legal!.featuresEnabled).toContain("encryption");
  });

  it("returns undefined for unknown vertical", () => {
    expect(getVertical("crypto_trading")).toBeUndefined();
  });

  it("all verticals have required fields", () => {
    for (const v of getAllVerticals()) {
      expect(v.id.length).toBeGreaterThan(0);
      expect(v.name.length).toBeGreaterThan(0);
      expect(v.personaPrompt.length).toBeGreaterThan(0);
      expect(v.greeting.length).toBeGreaterThan(0);
      expect(v.intakeQuestions.length).toBeGreaterThan(0);
      expect(v.toolsEnabled.length).toBeGreaterThan(0);
      expect(v.memoryFocusAreas.length).toBeGreaterThan(0);
    }
  });

  it("all verticals include the base persona rules", () => {
    for (const v of getAllVerticals()) {
      expect(v.personaPrompt).toContain("never fabricate information");
      expect(v.personaPrompt).toContain("protect user privacy");
    }
  });
});

describe("applyVertical", () => {
  it("merges base + vertical intake questions", () => {
    const result = applyVertical("clinic");
    expect(result).not.toBeNull();

    // Should include both base questions (name, primary_use) + clinic questions
    const questionIds = result!.intake_questions.map((q) => q.id);
    expect(questionIds).toContain("user_name");       // from base
    expect(questionIds).toContain("clinic_name");     // from clinic
    expect(questionIds).toContain("clinic_specialty"); // from clinic
  });

  it("returns null for unknown vertical", () => {
    expect(applyVertical("doesnt_exist")).toBeNull();
  });

  it("returns vertical-specific persona prompt", () => {
    const result = applyVertical("real_estate");
    expect(result!.persona_prompt).toContain("Real Estate");
    expect(result!.persona_prompt).toContain("property");
  });

  it("returns vertical-specific tools", () => {
    const clinic = applyVertical("clinic");
    expect(clinic!.tools_enabled).toContain("agent");

    const ecommerce = applyVertical("ecommerce");
    expect(ecommerce!.tools_enabled).not.toContain("agent");
  });
});

describe("base template", () => {
  it("has default intake questions", () => {
    expect(BASE_TEMPLATE.intakeQuestions.length).toBeGreaterThanOrEqual(2);
  });

  it("has core tools enabled", () => {
    expect(BASE_TEMPLATE.toolsEnabled).toContain("chat");
    expect(BASE_TEMPLATE.toolsEnabled).toContain("memory");
  });
});
