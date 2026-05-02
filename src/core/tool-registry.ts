/**
 * Tool Registry — defines every action Emma can take autonomously.
 *
 * Each tool has:
 * - name: unique identifier
 * - description: what it does (shown to Claude for tool selection)
 * - inputSchema: JSON schema for parameters (used in Claude's tool_use)
 * - riskLevel: "safe" | "moderate" | "dangerous"
 *   - safe: executes immediately, no approval needed
 *   - moderate: logged prominently, auto-approved after 5min if no rejection
 *   - dangerous: ALWAYS pauses for explicit human approval
 * - handler: async function that executes the tool
 */

export type RiskLevel = "safe" | "moderate" | "dangerous";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  riskLevel: RiskLevel;
  handler: (input: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>;
}

export interface ToolContext {
  userId: string;
  clientId?: string;
  taskId: string;
}

export interface ToolResult {
  success: boolean;
  output: string;
  data?: Record<string, unknown>;
}

// ─── Registry ────────────────────────────────────────────────────────────────

const registry = new Map<string, ToolDefinition>();

export function registerTool(tool: ToolDefinition): void {
  registry.set(tool.name, tool);
}

export function getTool(name: string): ToolDefinition | undefined {
  return registry.get(name);
}

export function getAllTools(): ToolDefinition[] {
  return Array.from(registry.values());
}

/**
 * Get tool definitions formatted for Claude's tool_use API.
 */
export function getToolsForClaude(): Array<{
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}> {
  return getAllTools().map((t) => ({
    name: t.name,
    description: `${t.description} [Risk: ${t.riskLevel}]`,
    input_schema: t.inputSchema,
  }));
}

// ─── Built-in Tools ──────────────────────────────────────────────────────────

// Tool: generate_summary — Summarize information (safe)
registerTool({
  name: "generate_summary",
  description: "Generate a text summary or briefing from available context (memories, recent events, device states)",
  inputSchema: {
    type: "object",
    properties: {
      topic: { type: "string", description: "What to summarize" },
      style: { type: "string", enum: ["brief", "detailed", "bullet_points"], description: "Summary style" },
    },
    required: ["topic"],
  },
  riskLevel: "safe",
  handler: async (input) => {
    return {
      success: true,
      output: `Summary generated for topic: ${input.topic}`,
      data: { topic: input.topic, style: input.style || "brief" },
    };
  },
});

// Tool: set_device — Control a smart home device (safe)
registerTool({
  name: "web_search",
  description: "Search the web for current information on behalf of the user",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
    },
    required: ["query"],
  },
  riskLevel: "safe",
  handler: async (input) => {
    return {
      success: true,
      output: `Search results for: ${input.query}`,
      data: input,
    };
  },
});

// Tool: run_workflow — Execute a predefined workflow routine (moderate)
registerTool({
  name: "run_workflow",
  description: "Execute a named workflow routine (e.g., 'morning_standup', 'inbox_triage', 'focus_mode')",
  inputSchema: {
    type: "object",
    properties: {
      routine_id: { type: "string", description: "ID of the workflow routine to run" },
    },
    required: ["routine_id"],
  },
  riskLevel: "moderate",
  handler: async (input) => {
    return {
      success: true,
      output: `Workflow ${input.routine_id} executed`,
      data: { routineId: input.routine_id },
    };
  },
});

// Tool: send_notification — Send a notification to the user (safe)
registerTool({
  name: "send_notification",
  description: "Send a notification message to the user",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string" },
      message: { type: "string" },
      priority: { type: "string", enum: ["low", "medium", "high"] },
    },
    required: ["title", "message"],
  },
  riskLevel: "safe",
  handler: async (input) => {
    return {
      success: true,
      output: `Notification sent: ${input.title}`,
      data: input,
    };
  },
});

// Tool: send_email — Send an email (DANGEROUS — always requires approval)
registerTool({
  name: "send_email",
  description: "Send an email on behalf of the user. REQUIRES APPROVAL.",
  inputSchema: {
    type: "object",
    properties: {
      to: { type: "string", description: "Recipient email" },
      subject: { type: "string" },
      body: { type: "string" },
    },
    required: ["to", "subject", "body"],
  },
  riskLevel: "dangerous",
  handler: async (input, context) => {
    try {
      const { GmailAdapter } = await import("@/core/integrations/google");
      const adapter = new GmailAdapter();

      const isConfigured = await adapter.validate(context.clientId || "");
      if (!isConfigured) {
        return {
          success: false,
          output: "Gmail integration not connected. Go to Settings → Integrations to connect Gmail.",
        };
      }

      const result = await adapter.send(context.clientId || "", {
        to: input.to,
        subject: input.subject,
        body: input.body,
      });

      return result;
    } catch (err: any) {
      if (err.name === "IntegrationAuthExpiredError") {
        return {
          success: false,
          output: "Gmail auth expired. Go to Settings → Integrations to reconnect.",
        };
      }
      return { success: false, output: `Email failed: ${err.message}` };
    }
  },
});

// Tool: book_appointment — Book a calendar event (DANGEROUS)
registerTool({
  name: "book_appointment",
  description: "Book an appointment or calendar event. REQUIRES APPROVAL.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string" },
      date: { type: "string", description: "ISO date string" },
      time: { type: "string", description: "HH:mm format" },
      duration_minutes: { type: "number" },
      attendees: { type: "array", items: { type: "string" } },
    },
    required: ["title", "date", "time"],
  },
  riskLevel: "dangerous",
  handler: async (input, context) => {
    try {
      const { GoogleCalendarAdapter } = await import("@/core/integrations/google");
      const adapter = new GoogleCalendarAdapter();

      const isConfigured = await adapter.validate(context.clientId || "");
      if (!isConfigured) {
        return {
          success: false,
          output: "Google Calendar integration not connected. Go to Settings → Integrations to connect.",
        };
      }

      const result = await adapter.send(context.clientId || "", {
        title: input.title,
        date: input.date,
        time: input.time,
        duration_minutes: input.duration_minutes || 60,
        attendees: input.attendees,
      });

      return result;
    } catch (err: any) {
      if (err.name === "IntegrationAuthExpiredError") {
        return {
          success: false,
          output: "Google Calendar auth expired. Go to Settings → Integrations to reconnect.",
        };
      }
      return { success: false, output: `Calendar failed: ${err.message}` };
    }
  },
});

// Tool: query_memories — Read from the user's memory store (safe)
registerTool({
  name: "query_memories",
  description: "Search the user's stored memories and preferences",
  inputSchema: {
    type: "object",
    properties: {
      category: { type: "string", enum: ["preference", "routine", "personal", "episodic", "environment"] },
      keyword: { type: "string", description: "Keyword to search for" },
    },
  },
  riskLevel: "safe",
  handler: async (input, context) => {
    try {
      const { getMemoriesForUser } = await import("@/core/memory-db");
      const memories = await getMemoriesForUser(
        context.userId,
        input.category as any
      );

      // Filter by keyword if provided
      const keyword = (input.keyword as string || "").toLowerCase();
      const filtered = keyword
        ? memories.filter(
            (m) =>
              m.key.toLowerCase().includes(keyword) ||
              m.value.toLowerCase().includes(keyword)
          )
        : memories;

      if (filtered.length === 0) {
        return {
          success: true,
          output: "No memories found matching the query.",
          data: { count: 0, memories: [] },
        };
      }

      const summary = filtered
        .slice(0, 10) // Cap at 10 results to control token cost
        .map((m) => `[${m.category}] ${m.key}: ${m.value}`)
        .join("\n");

      return {
        success: true,
        output: `Found ${filtered.length} memories:\n${summary}`,
        data: { count: filtered.length, memories: filtered.slice(0, 10) },
      };
    } catch (err) {
      return {
        success: false,
        output: `Memory query failed: ${String(err)}`,
      };
    }
  },
});

// Tool: complete_task — Signal that the task is finished (safe)
registerTool({
  name: "complete_task",
  description: "Mark the current task as complete with a summary of what was accomplished",
  inputSchema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "Summary of what was done" },
    },
    required: ["summary"],
  },
  riskLevel: "safe",
  handler: async (input) => {
    return {
      success: true,
      output: input.summary as string,
      data: { completed: true, summary: input.summary },
    };
  },
});
