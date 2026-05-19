/**
 * agent-loop.test.ts
 *
 * Covers the safety-critical paths in runAgentLoop:
 *   1. Dangerous tool pauses execution → awaiting_approval
 *   2. Safe tool executes immediately → completed
 *   3. Loop terminates at maxSteps → max_steps_reached
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: null }),
          eq: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: { id: "mock-approval-id" }, error: null }),
        }),
      }),
      update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
      upsert: () => Promise.resolve({ data: null, error: null }),
    }),
  }),
}));

vi.mock("@/core/integrations/mcp", () => ({
  getMcpServersForClient: () => Promise.resolve([]),
}));

vi.mock("@/core/rate-limiter", () => ({
  checkRateLimit: () => Promise.resolve({ allowed: true }),
  consumeRateLimit: () => Promise.resolve(),
}));

vi.mock("@/core/provenance", () => ({
  startChain: () => ({ id: "chain-1", steps: [] }),
  addStep: (chain: any, step: any) => ({ ...chain, steps: [...chain.steps, step] }),
  completeChain: (chain: any) => chain,
  persistChain: () => Promise.resolve(),
}));

vi.mock("@/core/task-context", () => ({
  loadContext: () => Promise.resolve({ taskId: "test-task", variables: {} }),
  updateContext: (ctx: any) => ctx,
  resolveInputVariables: (input: any) => input,
  persistContext: () => Promise.resolve(),
}));

vi.mock("@/core/task-summarizer", () => ({
  summarizeTask: () => Promise.resolve("Task completed."),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAnthropicResponse(content: any[], stopReason = "tool_use") {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        content,
        stop_reason: stopReason,
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
  } as any;
}

// Import after mocks are registered
import { runAgentLoop, type AgentTask } from "@/core/agent-loop";

const BASE_TASK: AgentTask = {
  id: "task-test",
  goal: "Test goal",
  context: "Test context",
  userId: "user-1",
  clientId: "client-1",
  maxSteps: 5,
  triggerType: "manual",
  triggerSource: "test",
};

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-key";
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("runAgentLoop — approval gate", () => {
  it("pauses on dangerous tool and returns awaiting_approval", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeAnthropicResponse([
          {
            type: "tool_use",
            id: "toolu_01",
            name: "send_email",
            input: { to: "test@example.com", subject: "Hi", body: "Hello" },
          },
        ])
      )
    );

    const result = await runAgentLoop(BASE_TASK);

    expect(result.status).toBe("awaiting_approval");
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].toolName).toBe("send_email");
    expect(result.steps[0].status).toBe("awaiting_approval");
    expect(result.steps[0].riskLevel).toBe("dangerous");
  });

  it("executes safe tool immediately and completes when Claude signals end_turn", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          makeAnthropicResponse(
            [
              {
                type: "tool_use",
                id: "toolu_02",
                name: "complete_task",
                input: { summary: "Done" },
              },
            ],
            "tool_use"
          )
        )
        .mockResolvedValueOnce(
          makeAnthropicResponse([{ type: "text", text: "All done." }], "end_turn")
        )
    );

    const result = await runAgentLoop(BASE_TASK);

    expect(result.status).toBe("completed");
    expect(result.steps.some((s) => s.toolName === "complete_task")).toBe(true);
  });

  it("terminates at maxSteps and returns max_steps_reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          makeAnthropicResponse([
            { type: "tool_use", id: "toolu_03", name: "query_memories", input: { query: "test" } },
          ])
        )
    );

    const result = await runAgentLoop({ ...BASE_TASK, maxSteps: 3 });

    expect(result.status).toBe("max_steps_reached");
    expect(result.steps.length).toBeLessThanOrEqual(3);
  });

  it("trigger_webhook is dangerous and pauses for approval", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeAnthropicResponse([
          {
            type: "tool_use",
            id: "toolu_04",
            name: "trigger_webhook",
            input: { url: "https://example.com", method: "POST", payload: {} },
          },
        ])
      )
    );

    const result = await runAgentLoop(BASE_TASK);

    expect(result.status).toBe("awaiting_approval");
    const step = result.steps.find((s) => s.toolName === "trigger_webhook");
    expect(step).toBeDefined();
    expect(step?.riskLevel).toBe("dangerous");
  });

  it("fails gracefully when ANTHROPIC_API_KEY is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const result = await runAgentLoop(BASE_TASK);

    expect(result.status).toBe("failed");
    expect(result.summary).toMatch(/API key/i);
  });
});
