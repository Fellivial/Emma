import { describe, it, expect } from "vitest";

// Regression: /devex-review 2026-05-23 found 5 expired beta headers causing every
// chat message to 502. This test validates the live header set before they rot again.
//
// Requires ANTHROPIC_API_KEY in the environment. Skipped automatically when missing
// (safe in CI — set the secret to enable). Run locally: ANTHROPIC_API_KEY=sk-ant-...
// npx vitest run tests/integration/anthropic-beta-headers.test.ts

const BETA_HEADERS = [
  "compact-2026-01-12",
  "files-api-2025-04-14",
  "mcp-client-2025-11-20",
  "cache-diagnosis-2026-04-07",
  "code-execution-2025-08-25",
];

const TOOL_TYPES = [
  "tool_search_tool_bm25_20251119",
  "web_search_20260209",
  "web_fetch_20260209",
];

const MODEL = "claude-sonnet-4-6";

async function probe(betaHeader: string): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY!;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": betaHeader,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 5,
      messages: [{ role: "user", content: "hi" }],
    }),
  });
  if (res.ok) return { ok: true };
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  return { ok: false, error: body?.error?.message };
}

async function probeToolType(type: string): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY!;
  const tool: Record<string, unknown> = { type, name: type.replace(/_\d{8}$/, "").replace(/_20\d+$/, "") };
  if (type.includes("web_fetch")) tool.max_content_tokens = 100;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": BETA_HEADERS.join(","),
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 5,
      messages: [{ role: "user", content: "hi" }],
      tools: [tool],
    }),
  });
  if (res.ok) return { ok: true };
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  const msg = body?.error?.message ?? "";
  if (msg.includes(type)) return { ok: false, error: msg };
  return { ok: true };
}

describe.skipIf(!process.env.ANTHROPIC_API_KEY)("Anthropic beta header validity", () => {
  for (const header of BETA_HEADERS) {
    it(`beta header "${header}" is accepted by the API`, async () => {
      const result = await probe(header);
      expect(result.ok, `Header "${header}" rejected: ${result.error}`).toBe(true);
    }, 15_000);
  }
});

describe.skipIf(!process.env.ANTHROPIC_API_KEY)("Anthropic tool type validity", () => {
  for (const type of TOOL_TYPES) {
    it(`tool type "${type}" is accepted by the API`, async () => {
      const result = await probeToolType(type);
      expect(result.ok, `Tool type "${type}" rejected: ${result.error}`).toBe(true);
    }, 15_000);
  }
});
