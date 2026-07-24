/**
 * openrouter.test.ts
 *
 * Covers the OpenRouter provider's header/extraction paths
 * (src/core/brain/providers/openrouter.ts — relocated from the retired
 * src/lib/openrouter.ts during Phase 7B; assertions unchanged to prove
 * behavioral equivalence):
 *   - openRouterHeaders() throws when OPENROUTER_API_KEY is not set
 *   - openRouterHeaders() returns correct headers when key is present
 *   - extractText() returns content from a well-formed response
 *   - extractText() returns "" when choices/content are missing
 *   - extractUsage() returns token counts from usage field
 *   - extractUsage() returns 0s when usage is absent
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  openRouterHeaders,
  extractText,
  extractUsage,
  createOpenRouterProvider,
} from "@/core/brain/providers/openrouter";

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

describe("createOpenRouterProvider — 529 retry override (Wave 6B, §17.3)", () => {
  const ORIGINAL_KEY = process.env.OPENROUTER_API_KEY;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (ORIGINAL_KEY === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = ORIGINAL_KEY;
    }
  });

  it("retries a 529 response via its own provider-supplied retryOn override, unaffected by the shared default's 529 removal", async () => {
    process.env.OPENROUTER_API_KEY = "sk-test-529";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 529,
        text: () => Promise.resolve("overloaded"),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ choices: [{ message: { content: "ok" } }] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createOpenRouterProvider().chat({
      task: "utility",
      messages: [],
      maxRetries: 1,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
  }, 5000);
});
