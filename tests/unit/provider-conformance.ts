/**
 * Provider conformance suite (Technical Design §19.3, ADR-0006).
 *
 * A shared test factory any `BrainProvider` implementation must pass. This is
 * the mechanism that closes ADR-0006's "n=1, provider-neutrality proven only
 * by inspection" risk by construction: it exercises `chat`/`chatStream`/
 * `embed`/`isConfigured` against a mocked global `fetch`, asserting only the
 * shape every `BrainChatResult`/`BrainStreamResult`/`BrainEmbedResult` must
 * satisfy — never a provider-specific wire value — so the exact same suite
 * runs unmodified against OpenRouter and against the fake, test-only second
 * provider (Wave 6B) that exists solely to give this suite (and Wave 6C's
 * Routing Layer 2) something other than n=1 to run against.
 *
 * Not itself a `*.test.ts` file — it exports a factory invoked from a real
 * test file for each provider under test (`provider-conformance.test.ts`).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import type { BrainProvider, CapabilitiesDescriptor } from "@/core/brain/types";

function sseBody(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line));
      controller.close();
    },
  });
}

export function runProviderConformanceSuite(
  providerName: string,
  createProvider: () => BrainProvider,
  capabilities: CapabilitiesDescriptor
): void {
  describe(`provider conformance: ${providerName}`, () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("isConfigured() returns a boolean", () => {
      expect(typeof createProvider().isConfigured()).toBe("boolean");
    });

    it("name is a non-empty string", () => {
      expect(typeof createProvider().name).toBe("string");
      expect(createProvider().name.length).toBeGreaterThan(0);
    });

    describe("chat()", () => {
      it("returns a well-formed BrainChatResult on a successful upstream response", async () => {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ choices: [{ message: { content: "hi" } }] }),
          })
        );

        const result = await createProvider().chat({ task: "utility", messages: [] });

        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error("expected ok:true");
        expect(typeof result.text).toBe("string");
        expect(Array.isArray(result.toolCalls)).toBe(true);
        expect(typeof result.usage.inputTokens).toBe("number");
        expect(typeof result.usage.outputTokens).toBe("number");
      });

      it("normalizes a non-ok upstream response into { ok:false, error }", async () => {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockResolvedValue({
            ok: false,
            status: 500,
            text: () => Promise.resolve("boom"),
          })
        );

        const result = await createProvider().chat({ task: "utility", messages: [] });

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected ok:false");
        expect(result.error).toEqual(
          expect.objectContaining({
            status: expect.any(Number),
            code: expect.any(String),
            message: expect.any(String),
            bodyPreview: expect.any(String),
            retryable: expect.any(Boolean),
          })
        );
      });

      it("propagates a transport failure as a throw, never a value return", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network failure")));

        await expect(createProvider().chat({ task: "utility", messages: [] })).rejects.toThrow();
      });
    });

    describe("chatStream()", () => {
      it("yields events ending in exactly one trailing done event", async () => {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            body: sseBody(["data: [DONE]\n"]),
          })
        );

        const result = await createProvider().chatStream({ task: "brain", messages: [] });
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error("expected ok:true");

        const events = [];
        for await (const ev of result.stream.events()) events.push(ev);

        expect(events.length).toBeGreaterThanOrEqual(1);
        const last = events[events.length - 1];
        expect(last.type).toBe("done");
        expect(events.filter((e) => e.type === "done")).toHaveLength(1);
      });

      it("normalizes a non-ok upstream response into { ok:false, error }", async () => {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockResolvedValue({
            ok: false,
            status: 429,
            text: () => Promise.resolve("slow down"),
          })
        );

        const result = await createProvider().chatStream({ task: "brain", messages: [] });
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected ok:false");
        expect(result.error).toEqual(
          expect.objectContaining({
            status: 429,
            code: expect.any(String),
            retryable: expect.any(Boolean),
          })
        );
      });
    });

    describe("embed()", () => {
      it("returns a well-formed BrainEmbedResult on a successful upstream response", async () => {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
              }),
          })
        );

        const result = await createProvider().embed({ texts: ["hello"] });
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error("expected ok:true");
        expect(Array.isArray(result.embeddings)).toBe(true);
        expect(Array.isArray(result.embeddings[0])).toBe(true);
      });

      it("normalizes a non-ok upstream response into { ok:false, error }", async () => {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockResolvedValue({
            ok: false,
            status: 401,
            text: () => Promise.resolve("unauthorized"),
          })
        );

        const result = await createProvider().embed({ texts: ["hello"] });
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected ok:false");
        expect(result.error).toEqual(
          expect.objectContaining({ status: 401, code: expect.any(String) })
        );
      });
    });

    describe("capabilities descriptor", () => {
      it("declares every required boolean field", () => {
        expect(typeof capabilities.supportsStreaming).toBe("boolean");
        expect(typeof capabilities.supportsVision).toBe("boolean");
        expect(typeof capabilities.supportsToolCalling).toBe("boolean");
        expect(typeof capabilities.supportsEmbeddings).toBe("boolean");
        expect(typeof capabilities.supportsStructuredOutput).toBe("boolean");
      });

      it("declares a positive integer contextWindowTokens", () => {
        expect(Number.isInteger(capabilities.contextWindowTokens)).toBe(true);
        expect(capabilities.contextWindowTokens).toBeGreaterThan(0);
      });
    });
  });
}
