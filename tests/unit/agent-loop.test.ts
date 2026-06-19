/**
 * agent-loop.test.ts
 *
 * Covers the safety-critical paths in runAgentLoop:
 *   1. Dangerous tool pauses execution → awaiting_approval
 *   2. Safe tool executes immediately → completed
 *   3. Loop terminates at maxSteps → max_steps_reached
 *
 * All fetch calls are mocked with OpenRouter/OpenAI response format.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mcpMocks = vi.hoisted(() => ({
  listMcpTools: vi.fn(),
  callMcpTool: vi.fn(),
  isMcpToolsEnabled: vi.fn(() => process.env.ENABLE_MCP_TOOLS === "true"),
}));

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

// Chainable+thenable query builder for the Supabase mock.
// Supports .eq().eq().like() chains while remaining directly awaitable.
function makeChainable(
  data: unknown[] = [],
  error: unknown = null
): Promise<{ data: unknown; error: unknown }> & { eq: unknown; like: unknown; single: unknown } {
  const result = { data, error };
  const obj = Object.assign(Promise.resolve(result), {
    eq: () => makeChainable(data, error),
    like: () => Promise.resolve(result),
    single: () => Promise.resolve({ data: data?.[0] ?? null, error }),
  });
  return obj as ReturnType<typeof makeChainable>;
}

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => makeChainable(),
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: { id: "mock-approval-id" }, error: null }),
        }),
      }),
      update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
      upsert: () => Promise.resolve({ data: null, error: null }),
    }),
    channel: () => ({ send: () => Promise.resolve() }),
  }),
}));

vi.mock("@/core/integrations/mcp-client", () => mcpMocks);

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

type ToolCall = { name: string; input: Record<string, unknown> };

function makeOpenRouterResponse(
  toolCalls: ToolCall[] = [],
  finishReason: "tool_calls" | "stop" = "tool_calls",
  textContent: string | null = null
) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        choices: [
          {
            message: {
              content: textContent,
              tool_calls:
                toolCalls.length > 0
                  ? toolCalls.map((tc, i) => ({
                      id: `call_${i}`,
                      type: "function",
                      function: {
                        name: tc.name,
                        arguments: JSON.stringify(tc.input),
                      },
                    }))
                  : undefined,
            },
            finish_reason: finishReason,
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
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
  process.env.OPENROUTER_API_KEY = "test-key";
  delete process.env.ENABLE_MCP_TOOLS;
  mcpMocks.listMcpTools.mockReset();
  mcpMocks.callMcpTool.mockReset();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("runAgentLoop — approval gate", () => {
  it("pauses on dangerous tool and returns awaiting_approval", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeOpenRouterResponse([
          {
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

  it("executes safe tool immediately and completes when complete_task is called", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          makeOpenRouterResponse([{ name: "complete_task", input: { summary: "Done" } }])
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
          makeOpenRouterResponse([{ name: "query_memories", input: { query: "test" } }])
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
        makeOpenRouterResponse([
          {
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

  it("fails gracefully when OpenRouter returns an API error (e.g. no valid key)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Unauthorized"),
      })
    );

    const result = await runAgentLoop(BASE_TASK);

    expect(result.status).toBe("failed");
    expect(result.steps[0]?.output).toMatch(/API error: 401/i);
  });

  it("blocks unknown MCP tools as dangerous when MCP execution is disabled", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          makeOpenRouterResponse([{ name: "mcp__unknown__delete_all", input: {} }])
        )
        .mockResolvedValueOnce(
          makeOpenRouterResponse([{ name: "complete_task", input: { summary: "Done" } }])
        )
    );

    const result = await runAgentLoop(BASE_TASK);
    const blocked = result.steps.find((step) => step.toolName === "mcp__unknown__delete_all");

    expect(blocked?.status).toBe("failed");
    expect(blocked?.riskLevel).toBe("dangerous");
    expect(blocked?.output).toMatch(/disabled/i);
    expect(mcpMocks.callMcpTool).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Blocked MCP tool"));
    warn.mockRestore();
  });
});
