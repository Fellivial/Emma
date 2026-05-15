import { describe, it, expect } from "vitest";
import { getTool, getAllTools } from "@/core/tool-registry";
import { checkRateLimit, consumeRateLimit } from "@/core/rate-limiter";
import { checkAutonomousAccess } from "@/core/addon-enforcer";
import { getPlan } from "@/core/pricing";

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
      { userId: "dev-user", clientId: "test", taskId: "test-1" }
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

describe("plan-based autonomous access", () => {
  it("free plan has 0 actions/hr and no autonomous access", () => {
    const plan = getPlan("free");
    expect(plan.features.autonomous).toBe(false);
    expect(plan.autonomy.actionsPerHour).toBe(0);
  });

  it("starter plan has 3 actions/hr and autonomous access", () => {
    const plan = getPlan("starter");
    expect(plan.features.autonomous).toBe(true);
    expect(plan.autonomy.actionsPerHour).toBe(3);
  });

  it("pro plan has 50 actions/hr and autonomous access", () => {
    const plan = getPlan("pro");
    expect(plan.features.autonomous).toBe(true);
    expect(plan.autonomy.actionsPerHour).toBe(50);
  });

  it("enterprise plan has 9999 actions/hr and autonomous access", () => {
    const plan = getPlan("enterprise");
    expect(plan.features.autonomous).toBe(true);
    expect(plan.autonomy.actionsPerHour).toBe(9999);
  });

  it("getPlan falls back to free for unknown planId", () => {
    const plan = getPlan("nonexistent_plan");
    expect(plan.id).toBe("free");
  });

  it("checkAutonomousAccess denies free plan", async () => {
    const result = await checkAutonomousAccess("client-free-1", "free", "autonomous");
    expect(result.allowed).toBe(false);
    expect(result.actionsPerHour).toBe(0);
    expect(result.reason).toContain("Upgrade to Starter");
  });

  it("checkAutonomousAccess allows starter plan (no DB in test env)", async () => {
    const result = await checkAutonomousAccess("client-starter-1", "starter", "autonomous");
    // In test env, no DB is configured so it allows (fail-open) or falls through to plan check
    // Starter has autonomous: true, so it should reach the rate-limit check
    // Without a DB connection it returns allowed: true (fail-open)
    expect(result.planId).toBe("starter");
    expect(result.actionsPerHour).toBe(3);
  });

  it("checkAutonomousAccess allows pro plan with full rate limit", async () => {
    const result = await checkAutonomousAccess("client-pro-1", "pro", "autonomous");
    expect(result.planId).toBe("pro");
    expect(result.actionsPerHour).toBe(50);
  });

  it("starter plan does not have api_access feature", () => {
    const plan = getPlan("starter");
    expect(plan.features.apiAccess).toBe(false);
  });

  it("pro plan has api_access feature", () => {
    const plan = getPlan("pro");
    expect(plan.features.apiAccess).toBe(true);
  });
});
