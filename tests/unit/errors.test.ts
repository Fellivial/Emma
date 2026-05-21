import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchWithRetry, EmmaError } from "@/lib/errors";

// Mock fetch that respects AbortSignal (like the real fetch does)
function makeHangingFetch() {
  return (_url: RequestInfo | URL, options?: RequestInit): Promise<Response> =>
    new Promise<Response>((_, reject) => {
      const signal = options?.signal;
      if (signal?.aborted) {
        reject(new DOMException("The operation was aborted.", "AbortError"));
        return;
      }
      signal?.addEventListener("abort", () => {
        reject(new DOMException("The operation was aborted.", "AbortError"));
      });
      // Never resolves — mimics a hung Anthropic connection
    });
}

describe("fetchWithRetry", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it(
    "throws EmmaError with status 504 when connectionTimeoutMs elapses before response",
    async () => {
      vi.spyOn(global, "fetch").mockImplementation(makeHangingFetch());

      await expect(
        fetchWithRetry(
          "https://api.anthropic.com/v1/messages",
          { method: "POST" },
          { maxRetries: 0, connectionTimeoutMs: 50 }
        )
      ).rejects.toMatchObject({
        name: "EmmaError",
        code: "TIMEOUT",
        status: 504,
      });
    },
    2000
  );

  it(
    "resolves normally when response arrives before timeout",
    async () => {
      const mockResponse = new Response(JSON.stringify({ ok: true }), { status: 200 });
      vi.spyOn(global, "fetch").mockResolvedValueOnce(mockResponse);

      const result = await fetchWithRetry(
        "https://api.anthropic.com/v1/messages",
        { method: "POST" },
        { maxRetries: 0, connectionTimeoutMs: 5000 }
      );

      expect(result.status).toBe(200);
    },
    2000
  );

  it(
    "does not retry on connection timeout — fetch called exactly once",
    async () => {
      const fetchSpy = vi
        .spyOn(global, "fetch")
        .mockImplementation(makeHangingFetch());

      await expect(
        fetchWithRetry(
          "https://api.anthropic.com/v1/messages",
          { method: "POST" },
          { maxRetries: 2, connectionTimeoutMs: 50 }
        )
      ).rejects.toMatchObject({ status: 504 });

      // Must not retry on AbortError — only one attempt
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    },
    2000
  );
});
