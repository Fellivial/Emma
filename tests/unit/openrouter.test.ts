/**
 * openrouter.test.ts
 *
 * Covers every code path in src/lib/openrouter.ts:
 *   - openRouterHeaders() throws when OPENROUTER_API_KEY is not set
 *   - openRouterHeaders() returns correct headers when key is present
 *   - extractText() returns content from a well-formed response
 *   - extractText() returns "" when choices/content are missing
 *   - extractUsage() returns token counts from usage field
 *   - extractUsage() returns 0s when usage is absent
 */

import { describe, it, expect, afterEach } from "vitest";
import { openRouterHeaders, extractText, extractUsage } from "@/lib/openrouter";

describe("openRouterHeaders", () => {
  const ORIGINAL_KEY = process.env.OPENROUTER_API_KEY;

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = ORIGINAL_KEY;
    }
  });

  it("throws when OPENROUTER_API_KEY is not set", () => {
    delete process.env.OPENROUTER_API_KEY;
    expect(() => openRouterHeaders()).toThrow("OPENROUTER_API_KEY is not set");
  });

  it("returns headers with Authorization Bearer when key is present", () => {
    process.env.OPENROUTER_API_KEY = "sk-test-abc123";
    const headers = openRouterHeaders();
    expect(headers["Authorization"]).toBe("Bearer sk-test-abc123");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["HTTP-Referer"]).toBe("https://emma.app");
    expect(headers["X-Title"]).toBe("Emma");
  });

  it("includes all four required header keys", () => {
    process.env.OPENROUTER_API_KEY = "sk-test-xyz";
    const headers = openRouterHeaders();
    expect(Object.keys(headers)).toEqual(
      expect.arrayContaining(["Content-Type", "Authorization", "HTTP-Referer", "X-Title"])
    );
  });
});

describe("extractText", () => {
  it("returns content from a well-formed OpenRouter response", () => {
    const data = {
      choices: [{ message: { content: "Hello from the model" } }],
    };
    expect(extractText(data)).toBe("Hello from the model");
  });

  it("returns empty string when choices is absent", () => {
    expect(extractText({})).toBe("");
  });

  it("returns empty string when choices array is empty", () => {
    expect(extractText({ choices: [] })).toBe("");
  });

  it("returns empty string when message content is null", () => {
    const data = { choices: [{ message: { content: null } }] };
    expect(extractText(data)).toBe("");
  });

  it("returns empty string when message is absent", () => {
    const data = { choices: [{}] };
    expect(extractText(data)).toBe("");
  });
});

describe("extractUsage", () => {
  it("returns prompt_tokens and completion_tokens from usage field", () => {
    const data = {
      usage: { prompt_tokens: 42, completion_tokens: 17 },
    };
    const result = extractUsage(data);
    expect(result.inputTokens).toBe(42);
    expect(result.outputTokens).toBe(17);
  });

  it("returns 0 for both when usage is absent", () => {
    const result = extractUsage({});
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
  });

  it("returns 0 for missing individual fields", () => {
    const result = extractUsage({ usage: {} });
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
  });
});
