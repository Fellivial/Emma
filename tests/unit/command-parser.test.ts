import { describe, it, expect } from "vitest";
import { parseEmmaResponse, formatCommandLog } from "@/core/command-parser";

describe("parseEmmaResponse", () => {
  it("extracts plain text without tags", () => {
    const result = parseEmmaResponse("Hey baby, how are you?");
    expect(result.text).toBe("Hey baby, how are you?");
    expect(result.commands).toHaveLength(0);
    expect(result.routineId).toBeUndefined();
    expect(result.expression).toBeUndefined();
  });

  it("extracts [emotion: X] tag", () => {
    const result = parseEmmaResponse("Mmm. That's interesting. [emotion: smirk]");
    expect(result.text).toBe("Mmm. That's interesting.");
    expect(result.expression).toBe("smirk");
  });

  it("extracts [emotion: X] with spaces", () => {
    const result = parseEmmaResponse("Hey baby. [emotion: warm]");
    expect(result.expression).toBe("warm");
  });

  it("extracts [EMMA_CMD] block", () => {
    const raw = `Sure, I'll turn on the lights.

[EMMA_CMD]
{"action":"set","room":"bedroom","device":"lights","property":"power","value":"on"}
[/EMMA_CMD]

[emotion: warm]`;

    const result = parseEmmaResponse(raw);
    expect(result.commands).toHaveLength(1);
    expect(result.commands[0].room).toBe("bedroom");
    expect(result.commands[0].device).toBe("lights");
    expect(result.expression).toBe("warm");
    expect(result.text).not.toContain("[EMMA_CMD]");
    expect(result.text).not.toContain("[emotion:");
  });

  it("extracts [EMMA_ROUTINE] block", () => {
    const raw = `Running your morning routine now.
[EMMA_ROUTINE]good_morning[/EMMA_ROUTINE]
[emotion: warm]`;

    const result = parseEmmaResponse(raw);
    expect(result.routineId).toBe("good_morning");
    expect(result.expression).toBe("warm");
  });

  it("handles response with no special tags", () => {
    const result = parseEmmaResponse("Just a regular response.");
    expect(result.text).toBe("Just a regular response.");
    expect(result.commands).toHaveLength(0);
  });

  it("handles empty response", () => {
    const result = parseEmmaResponse("");
    expect(result.text).toBe("");
  });
});

describe("formatCommandLog", () => {
  it("formats a command for display", () => {
    const log = formatCommandLog({
      room: "bedroom",
      device: "lights",
      property: "brightness",
      value: 80,
    });
    expect(log).toContain("bedroom");
    expect(log).toContain("lights");
  });
});
