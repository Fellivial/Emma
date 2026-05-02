import { describe, it, expect } from "vitest";
import { getTool, getAllTools } from "@/core/tool-registry";
import { checkRateLimit, consumeRateLimit } from "@/core/rate-limiter";

describe("tool-registry", () => {
  it("has built-in tools registered", () => {
    const tools = getAllTools();
    expect(tools.length).toBeGreaterThanOrEqual(7);
  });

  it("can retrieve a tool by name", () => {
    const tool = getTool("send_email");
    expect(tool).toBeDefined();
    expect(tool!.name).toBe("send_email");
  });

  it("returns undefined for unknown tool", () => {
    expect(getTool("nonexistent")).toBeUndefined();
  });

  it("marks send_email as dangerous/high risk", () => {
    const tool = getTool("send_email")!;
    expect(["dangerous", "high"]).toContain(tool.riskLevel);
  });

  it("marks book_appointment as dangerous/high risk", () => {
    const tool = getTool("book_appointment")!;
    expect(["dangerous", "high"]).toContain(tool.riskLevel);
  });

  it("all tools have descriptions", () => {
    for (const tool of getAllTools()) {
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  it("all tools have handlers", () => {
    for (const tool of getAllTools()) {
      expect(typeof tool.handler).toBe("function");
    }
  });

  it("send_notification executes without error", async () => {
    const tool = getTool("send_notification")!;
    const result = await tool.handler(
      { title: "Test", message: "Hello" },
      { clientId: "test", taskId: "test-1" }
    );
    expect(result.success).toBe(true);
  });
});

describe("rate-limiter", () => {
  it("allows requests under limit", async () => {
    const result = await checkRateLimit("test-client-1");
    expect(result.allowed).toBe(true);
    expect(result.current.tasks).toBe(0);
  });

  it("tracks consumption", async () => {
    const clientId = "test-client-consume-" + Date.now();
    await consumeRateLimit(clientId, 1, 5000);
    const result = await checkRateLimit(clientId);
    expect(result.current.tasks).toBe(1);
    expect(result.current.tokens).toBe(5000);
  });

  it("blocks when task limit exceeded", async () => {
    const clientId = "test-client-block-" + Date.now();
    await consumeRateLimit(clientId, 25, 0);
    const result = await checkRateLimit(clientId);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("task_limit");
  });

  it("blocks when token limit exceeded", async () => {
    const clientId = "test-client-tokens-" + Date.now();
    await consumeRateLimit(clientId, 1, 150_000);
    const result = await checkRateLimit(clientId);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("token_limit");
  });

  it("includes reset time", async () => {
    const clientId = "test-client-reset-" + Date.now();
    const result = await checkRateLimit(clientId);
    expect(result.resetsAt).toBeGreaterThan(Date.now());
  });
});
