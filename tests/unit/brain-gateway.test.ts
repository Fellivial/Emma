/**
 * brain-gateway.test.ts
 *
 * Brain Gateway foundation (ADR 0003):
 *   - request translation: task tier → provider fallback array, max_tokens,
 *     temperature, tools, response_format, stream flag
 *   - response normalization: text, toolCalls, finishReason, usage
 *   - error normalization: HTTP status → { ok:false, error } with stable codes
 *   - transport failures throw (network) — mirrors pre-gateway semantics
 *   - streaming: normalized delta/done events, malformed-chunk skipping,
 *     [DONE] skipping, usage capture, cancel
 *   - embeddings: payload shape, index ordering, usage fallback
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { brainChat, brainChatStream, brainEmbed, isBrainConfigured } from "@/core/brain/gateway";

const ORIGINAL_KEY = process.env.OPENROUTER_API_KEY;

function mockFetchOnce(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fn = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    ...response,
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function sseBody(lines: string[]): ReadableStream<Uint8Array<ArrayBuffer>> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line) as Uint8Array<ArrayBuffer>);
      }
      controller.close();
    },
  });
}

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = "sk-test-gateway";
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_KEY === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = ORIGINAL_KEY;
});

// ─── brainChat: request translation ──────────────────────────────────────────

describe("brainChat request translation", () => {
  it("sends the provider fallback array for the requested task tier", async () => {
    const fetchMock = mockFetchOnce({
      json: () => Promise.resolve({ choices: [{ message: { content: "hi" } }] }),
    });

    await brainChat({ task: "utility", messages: [{ role: "user", content: "x" }] });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(Array.isArray(body.models)).toBe(true);
    expect(body.models.length).toBeGreaterThan(0);
    expect(body.messages).toEqual([{ role: "user", content: "x" }]);
    expect(body.stream).toBeUndefined();
  });

  it("translates maxTokens, temperature, tools, and responseFormat to wire fields", async () => {
    const fetchMock = mockFetchOnce({
      json: () => Promise.resolve({ choices: [{ message: { content: "" } }] }),
    });

    await brainChat({
      task: "brain",
      messages: [{ role: "user", content: "x" }],
      maxTokens: 128,
      temperature: 0,
      tools: [{ type: "function", function: { name: "t", parameters: {} } }],
      responseFormat: { name: "shape", schema: { type: "object" } },
    });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.max_tokens).toBe(128);
    expect(body.temperature).toBe(0);
    expect(body.tools).toHaveLength(1);
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "shape", schema: { type: "object" } },
    });
  });

  it("sends auth and attribution headers", async () => {
    const fetchMock = mockFetchOnce({
      json: () => Promise.resolve({ choices: [] }),
    });

    await brainChat({ task: "utility", messages: [] });

    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer sk-test-gateway");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["HTTP-Referer"]).toBe("https://emma.app");
    expect(headers["X-Title"]).toBe("Emma");
  });

  it("throws when no provider key is configured", async () => {
    delete process.env.OPENROUTER_API_KEY;
    await expect(brainChat({ task: "utility", messages: [] })).rejects.toThrow(
      "OPENROUTER_API_KEY is not set"
    );
  });
});

// ─── brainChat: response + error normalization ───────────────────────────────

describe("brainChat response normalization", () => {
  it("normalizes a well-formed response", async () => {
    mockFetchOnce({
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: "Hello",
                tool_calls: [
                  { id: "c1", type: "function", function: { name: "f", arguments: "{}" } },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
    });

    const result = await brainChat({ task: "brain", messages: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.text).toBe("Hello");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].function.name).toBe("f");
    expect(result.finishReason).toBe("tool_calls");
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  it("returns empty text/toolCalls and zero usage for a sparse response", async () => {
    mockFetchOnce({ json: () => Promise.resolve({}) });

    const result = await brainChat({ task: "utility", messages: [] });
    if (!result.ok) throw new Error("expected ok");
    expect(result.text).toBe("");
    expect(result.toolCalls).toEqual([]);
    expect(result.finishReason).toBeNull();
    expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it("maps unknown finish reasons to 'other'", async () => {
    mockFetchOnce({
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: "x" }, finish_reason: "weird_provider_reason" }],
        }),
    });

    const result = await brainChat({ task: "utility", messages: [] });
    if (!result.ok) throw new Error("expected ok");
    expect(result.finishReason).toBe("other");
  });

  it.each([
    [400, "BAD_REQUEST"],
    [401, "AUTH_ERROR"],
    [429, "RATE_LIMIT"],
    [500, "UPSTREAM_ERROR"],
    [504, "TIMEOUT"],
    [529, "OVERLOADED"],
  ])("normalizes HTTP %i to code %s as a value, not a throw", async (status, code) => {
    mockFetchOnce({
      ok: false,
      status,
      text: () => Promise.resolve("upstream body"),
    });

    const result = await brainChat({ task: "utility", messages: [] });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.status).toBe(status);
    expect(result.error.code).toBe(code);
    expect(result.error.bodyPreview).toBe("upstream body");
  });

  it("propagates transport failures as throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(brainChat({ task: "utility", messages: [] })).rejects.toThrow("fetch failed");
  });
});

// ─── brainChatStream ─────────────────────────────────────────────────────────

describe("brainChatStream", () => {
  it("yields normalized deltas and a trailing done event with usage + finish reason", async () => {
    mockFetchOnce({
      body: sseBody([
        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n',
        'data: {"choices":[{"delta":{"content":"lo"}}]}\n',
        "this line is not SSE\n",
        "data: not-json\n",
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":7,"completion_tokens":3}}\n',
        "data: [DONE]\n",
      ]),
    });

    const result = await brainChatStream({ task: "brain", messages: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    const events = [];
    for await (const ev of result.stream.events()) events.push(ev);

    expect(events).toEqual([
      { type: "delta", text: "Hel" },
      { type: "delta", text: "lo" },
      {
        type: "done",
        usage: { inputTokens: 7, outputTokens: 3 },
        finishReason: "stop",
      },
    ]);
    expect(result.stream.usage).toEqual({ inputTokens: 7, outputTokens: 3 });
  });

  it("requests stream:true on the wire", async () => {
    const fetchMock = mockFetchOnce({ body: sseBody(["data: [DONE]\n"]) });
    await brainChatStream({ task: "brain", messages: [] });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.stream).toBe(true);
  });

  it("emits a done event even when the provider never reported usage", async () => {
    mockFetchOnce({
      body: sseBody(['data: {"choices":[{"delta":{"content":"x"}}]}\n']),
    });

    const result = await brainChatStream({ task: "brain", messages: [] });
    if (!result.ok) throw new Error("expected ok");
    const events = [];
    for await (const ev of result.stream.events()) events.push(ev);
    expect(events[events.length - 1]).toEqual({
      type: "done",
      usage: { inputTokens: 0, outputTokens: 0 },
      finishReason: null,
    });
  });

  it("returns pre-stream HTTP errors as values", async () => {
    mockFetchOnce({ ok: false, status: 429, text: () => Promise.resolve("slow down") });
    const result = await brainChatStream({ task: "brain", messages: [] });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("RATE_LIMIT");
  });

  it("cancel() aborts the underlying reader without throwing", async () => {
    mockFetchOnce({
      body: sseBody(['data: {"choices":[{"delta":{"content":"x"}}]}\n']),
    });
    const result = await brainChatStream({ task: "brain", messages: [] });
    if (!result.ok) throw new Error("expected ok");
    await expect(result.stream.cancel()).resolves.toBeUndefined();
  });
});

// ─── brainEmbed ──────────────────────────────────────────────────────────────

describe("brainEmbed", () => {
  it("sends the embeddings payload and returns vectors sorted by index", async () => {
    const fetchMock = mockFetchOnce({
      json: () =>
        Promise.resolve({
          data: [
            { embedding: [0.2], index: 1 },
            { embedding: [0.1], index: 0 },
          ],
          usage: { prompt_tokens: 9 },
        }),
    });

    const result = await brainEmbed({ texts: ["a", "b"] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/embeddings");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.input).toEqual(["a", "b"]);
    expect(typeof body.model).toBe("string");

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.embeddings).toEqual([[0.1], [0.2]]);
    expect(result.usage.inputTokens).toBe(9);
  });

  it("leaves usage undefined when the provider reports none", async () => {
    mockFetchOnce({
      json: () => Promise.resolve({ data: [{ embedding: [1], index: 0 }] }),
    });
    const result = await brainEmbed({ texts: ["a"] });
    if (!result.ok) throw new Error("expected ok");
    expect(result.usage.inputTokens).toBeUndefined();
  });

  it("returns HTTP failures as normalized errors", async () => {
    mockFetchOnce({ ok: false, status: 500, text: () => Promise.resolve("boom") });
    const result = await brainEmbed({ texts: ["a"] });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("UPSTREAM_ERROR");
    expect(result.error.bodyPreview).toBe("boom");
  });
});

// ─── isBrainConfigured ───────────────────────────────────────────────────────

describe("isBrainConfigured", () => {
  it("reflects provider key presence", () => {
    process.env.OPENROUTER_API_KEY = "sk-x";
    expect(isBrainConfigured()).toBe(true);
    delete process.env.OPENROUTER_API_KEY;
    expect(isBrainConfigured()).toBe(false);
  });
});
