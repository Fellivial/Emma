import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createCostGate, type CostGateDependencies } from "@/core/cost-gate";
import { interpretDistributedRateLimitResult } from "@/lib/ratelimit";

function dependencies(overrides: Partial<CostGateDependencies> = {}): CostGateDependencies {
  return {
    production: false,
    resolveIdentity: vi.fn(async (input) => ({
      userId: input.userId,
      clientId: input.clientId,
      planId: input.planId ?? "free",
      key: input.clientId ? `client:${input.clientId}` : `user:${input.userId}`,
    })),
    checkBudget: vi.fn(async () => ({ status: "ok" as const, planId: "free", allWindows: [] })),
    checkRate: vi.fn(async () => ({ allowed: true, resetAt: Date.now() + 60_000 })),
    recordUsage: vi.fn(async () => ({ success: true as const })),
    log: vi.fn(),
    ...overrides,
  };
}

describe("central cost gate", () => {
  it("fails closed when Upstash reports a timeout as successful", () => {
    expect(() =>
      interpretDistributedRateLimitResult({
        success: true,
        reset: Date.now() + 60_000,
        reason: "timeout",
      })
    ).toThrow(/timeout/i);
  });

  it("blocks before a provider call when the plan budget is exceeded", async () => {
    const provider = vi.fn();
    const deps = dependencies({
      checkBudget: vi.fn(async () => ({
        status: "blocked" as const,
        planId: "free",
        allWindows: [],
        message: "Budget exhausted",
      })),
    });
    const decision = await createCostGate(deps).enforce({
      operation: "vision",
      userId: "user-1",
    });
    if (decision.allowed) await provider();
    expect(decision).toMatchObject({ allowed: false, reason: "budget_exceeded", status: 429 });
    expect(provider).not.toHaveBeenCalled();
  });

  it("blocks a provider call when the production write probe fails", async () => {
    const provider = vi.fn();
    const deps = dependencies({
      production: true,
      recordUsage: vi.fn(async () => ({ success: false as const, reason: "rpc_error" as const })),
    });

    const decision = await createCostGate(deps).enforce({
      operation: "vision",
      userId: "user-1",
    });
    if (decision.allowed) await provider();

    expect(decision).toMatchObject({
      allowed: false,
      reason: "metering_unavailable",
      status: 503,
    });
    expect(provider).not.toHaveBeenCalled();
  });

  it("blocks future paid calls after reconciliation fails until a write probe succeeds", async () => {
    const persist = vi
      .fn()
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, reason: "rpc_error" })
      .mockResolvedValueOnce({ success: false, reason: "rpc_error" })
      .mockResolvedValueOnce({ success: true });
    const gate = createCostGate(dependencies({ production: true, recordUsage: persist }));

    const first = await gate.enforce({ operation: "chat", userId: "user-1" });
    expect(first.allowed).toBe(true);
    if (!first.allowed) return;
    const reconciliation = await gate.record(first, { inputTokens: 10, success: true });
    expect(reconciliation).toEqual({ success: false, reason: "rpc_error" });

    const blocked = await gate.enforce({ operation: "chat", userId: "user-1" });
    expect(blocked).toMatchObject({ allowed: false, reason: "metering_unavailable", status: 503 });

    const recovered = await gate.enforce({ operation: "chat", userId: "user-1" });
    expect(recovered.allowed).toBe(true);
  });

  it("fails closed when production distributed metering is unavailable", async () => {
    const deps = dependencies({
      production: true,
      checkRate: vi.fn(async () => {
        throw new Error("redis unavailable");
      }),
    });
    const decision = await createCostGate(deps).enforce({
      operation: "stt",
      userId: "user-1",
      planId: "starter",
    });
    expect(decision).toMatchObject({
      allowed: false,
      reason: "metering_unavailable",
      status: 503,
    });
  });

  it("allows bounded development behavior without production infrastructure", async () => {
    const decision = await createCostGate(dependencies()).enforce({
      operation: "emotion",
      userId: "dev-user",
    });
    expect(decision.allowed).toBe(true);
  });

  it("keeps development usable when the usage write probe is unavailable", async () => {
    const decision = await createCostGate(
      dependencies({
        production: false,
        recordUsage: vi.fn(async () => ({ success: false, reason: "unavailable" as const })),
      })
    ).enforce({ operation: "emotion", userId: "dev-user" });

    expect(decision.allowed).toBe(true);
  });

  it("records provider result usage and sanitized structured fields", async () => {
    const deps = dependencies();
    const gate = createCostGate(deps);
    const decision = await gate.enforce({ operation: "summarize", userId: "user-1" });
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    await gate.record(decision, { inputTokens: 120, outputTokens: 30, success: true });
    expect(deps.recordUsage).toHaveBeenNthCalledWith(1, decision.identity, 0, 0, 0);
    expect(deps.recordUsage).toHaveBeenNthCalledWith(2, decision.identity, 120, 30, 1);
    expect(deps.log).toHaveBeenCalledWith(
      expect.objectContaining({ event: "result", operation: "summarize", success: true })
    );
  });
});

describe("paid surface regression inventory", () => {
  const providerSurfaces = [
    "src/app/api/emma/route.ts",
    "src/app/api/emma/agent/route.ts",
    "src/app/api/emma/vision/route.ts",
    "src/app/api/emma/emotion/route.ts",
    "src/app/api/emma/summarize/route.ts",
    "src/app/api/emma/memory/route.ts",
    "src/app/api/emma/history/route.ts",
    "src/app/api/emma/persona/route.ts",
    "src/app/api/emma/stt/route.ts",
    "src/app/api/emma/tts/route.ts",
    "src/app/api/emma/ingest/document/route.ts",
    "src/app/api/emma/ingest/whatsapp/route.ts",
    "src/app/api/emma/cron/reflection/route.ts",
    "src/core/agent-loop.ts",
    "src/core/pattern-detector.ts",
    "src/core/task-summarizer.ts",
    "src/core/tool-registry.ts",
    "src/inngest/functions.ts",
  ];

  it.each(providerSurfaces)("requires shared cost enforcement in %s", (file) => {
    const source = readFileSync(resolve(process.cwd(), file), "utf8");
    expect(source).toMatch(/enforceCostGate|costGate\.enforce/);
  });

  it("gates both OpenRouter calls in the agent loop", () => {
    const source = readFileSync(resolve(process.cwd(), "src/core/agent-loop.ts"), "utf8");
    expect(source.match(/enforceCostGate\(/g)).toHaveLength(2);
    expect(source.match(/recordCostResult\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("uses exactly one OCR gate for the read-document image path", () => {
    const registry = readFileSync(resolve(process.cwd(), "src/core/tool-registry.ts"), "utf8");
    const imageBranch = registry.slice(
      registry.indexOf("if (input.image_url)"),
      registry.indexOf('return { success: false, output: "Provide either image_url or document_id."')
    );
    const integration = readFileSync(resolve(process.cwd(), "src/core/integrations/ocr.ts"), "utf8");

    expect(imageBranch).not.toMatch(/enforceCostGate|recordCostResult/);
    expect(imageBranch).toContain("extractTextFromImage");
    expect(integration).toMatch(/enforceCostGate\(\{ operation: "ocr"/);
  });

  it("records a failed chat stream in the stream error path", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/api/emma/route.ts"), "utf8");
    const streamCatch = source.slice(source.indexOf("} catch (err) {", source.indexOf("while (true)")));
    expect(source).toMatch(/const accountOnce[\s\S]*recordCostResult\(chatCostDecision/);
    expect(streamCatch).toContain("await accountOnce(false)");
    expect(streamCatch).toMatch(/async cancel\(\)[\s\S]*await accountOnce\(false\)/);
  });
});
