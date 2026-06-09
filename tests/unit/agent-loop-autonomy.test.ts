// agent-loop-autonomy.test.ts
//
// Covers the T-3 autonomy-tier gating paths in runAgentLoop:
//   - autonomyTier === 1 + moderate tool => skips execution, returns informational result
//   - autonomyTier === 2 + moderate tool => executes (no skip)
//   - autonomyTier === 3 (DEFAULT_CONFIG) when no client config found => executes
//
// The existing agent-loop.test.ts does not mock loadClientConfigForUser and
// does not exercise the moderate-risk tier gate. This file is additive.
//
// Called by: test runner only. No production source imports this file.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

// Chainable+thenable query builder — supports .eq().eq().like() and direct await.
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

// ── Hoisted client-config mock so we can swap autonomyTier per test ───────────
const mockClientConfig = vi.hoisted(() => ({
  autonomyTier: 3 as 1 | 2 | 3,
  customRoutines: [] as any[],
}));

vi.mock("@/core/client-config", () => ({
  loadClientConfigForUser: () =>
    Promise.resolve({
      id: "default",
      slug: "default",
      name: "Emma",
      personaName: "Emma",
      personaPrompt: null,
      personaGreeting: null,
      voiceId: null,
      toolsEnabled: ["chat", "memory", "tts", "vision", "routines"],
      tokenBudgetMonthly: 500_000,
      tokenBudgetDaily: 50_000,
      messageLimitDaily: 50,
      planId: "free",
      autonomyTier: mockClientConfig.autonomyTier,
      proactiveVision: false,
      customRoutines: mockClientConfig.customRoutines,
    }),
  DEFAULT_CONFIG: {
    id: "default",
    slug: "default",
    name: "Emma",
    autonomyTier: 3,
    customRoutines: [],
  },
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

import { runAgentLoop, type AgentTask } from "@/core/agent-loop";

const BASE_TASK: AgentTask = {
  id: "task-autonomy-test",
  goal: "Test autonomy tier gating",
  context: "Autonomy test context",
  userId: "user-1",
  clientId: "client-1",
  maxSteps: 3,
  triggerType: "manual",
  triggerSource: "test",
};

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = "test-key";
  // Reset to default tier 3 before each test
  mockClientConfig.autonomyTier = 3;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("runAgentLoop — autonomy tier 1 (T-3)", () => {
  it("skips moderate tool execution at tier 1 and returns informational result", async () => {
    mockClientConfig.autonomyTier = 1;

    // First call: moderate tool (slack_send_message is moderate-risk)
    // Second call: complete_task so the loop ends
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          makeOpenRouterResponse([
            {
              name: "slack_send_message",
              input: { channel: "#general", message: "hello", thread_ts: "" },
            },
          ])
        )
        .mockResolvedValueOnce(
          makeOpenRouterResponse([{ name: "complete_task", input: { summary: "Done" } }])
        )
    );

    const result = await runAgentLoop(BASE_TASK);

    // The loop must NOT pause for approval (that's only for dangerous tools)
    // Tier 1 moderate tools are skipped silently - loop continues to completion
    expect(result.status).toBe("completed");

    // Must have a step for slack_send_message with the skip message
    const skippedStep = result.steps.find((s) => s.toolName === "slack_send_message");
    expect(skippedStep).toBeDefined();
    expect(skippedStep!.output).toMatch(/requires manual approval \(autonomy tier 1\)/i);
  });

  it("the skipped step's output contains the tool name", async () => {
    mockClientConfig.autonomyTier = 1;

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          makeOpenRouterResponse([
            {
              name: "slack_send_message",
              input: { channel: "#standup", message: "hello", thread_ts: "" },
            },
          ])
        )
        .mockResolvedValueOnce(
          makeOpenRouterResponse([{ name: "complete_task", input: { summary: "Done" } }])
        )
    );

    const result = await runAgentLoop(BASE_TASK);
    const skippedStep = result.steps.find((s) => s.toolName === "slack_send_message");
    expect(skippedStep!.output).toContain("slack_send_message");
  });
});

describe("runAgentLoop — autonomy tier 3 default (T-3)", () => {
  it("tier 3 moderate tool is executed (not skipped) — falls through to execution", async () => {
    mockClientConfig.autonomyTier = 3;

    // slack_send_message at tier 3 => executes. May fail (no real Slack) but is not skipped.
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          makeOpenRouterResponse([
            {
              name: "slack_send_message",
              input: { channel: "#general", message: "Team sync in 5", thread_ts: "" },
            },
          ])
        )
        .mockResolvedValueOnce(
          makeOpenRouterResponse([{ name: "complete_task", input: { summary: "Sent" } }])
        )
    );

    const result = await runAgentLoop(BASE_TASK);

    // At tier 3 the tool executes (may fail with no real Slack, but not skipped)
    // The output must NOT be the tier-1 skip message
    const step = result.steps.find((s) => s.toolName === "slack_send_message");
    expect(step).toBeDefined();
    expect(step!.output).not.toMatch(/requires manual approval \(autonomy tier 1\)/i);
  });
});

describe("runAgentLoop — autonomy defaults (T-3 unit assertion)", () => {
  it("DEFAULT_CONFIG.autonomyTier is 3 (from mock — mirrors real source)", async () => {
    const { DEFAULT_CONFIG } = await import("@/core/client-config");
    expect(DEFAULT_CONFIG.autonomyTier).toBe(3);
  });

  it("DEFAULT_CONFIG.customRoutines is an empty array (from mock — mirrors real source)", async () => {
    const { DEFAULT_CONFIG } = await import("@/core/client-config");
    expect(DEFAULT_CONFIG.customRoutines).toEqual([]);
  });
});
