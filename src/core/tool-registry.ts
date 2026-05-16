import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

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
  description:
    "Generate a text summary or briefing from available context (memories, recent events, device states)",
  inputSchema: {
    type: "object",
    properties: {
      topic: { type: "string", description: "What to summarize" },
      style: {
        type: "string",
        enum: ["brief", "detailed", "bullet_points"],
        description: "Summary style",
      },
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

// Tool: web_search — Search the web via Brave Search API (safe)
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
    const apiKey = process.env.BRAVE_SEARCH_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        output: "Web search unavailable: BRAVE_SEARCH_API_KEY environment variable is not set.",
      };
    }

    try {
      const url = new URL("https://api.search.brave.com/res/v1/web/search");
      url.searchParams.set("q", input.query as string);
      url.searchParams.set("count", "5");

      const res = await fetch(url.toString(), {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": apiKey,
        },
      });

      if (!res.ok) {
        return { success: false, output: `Search API error: ${res.status}` };
      }

      const data = await res.json();
      const results: Array<{ title: string; url: string; description?: string }> =
        data.web?.results || [];

      if (results.length === 0) {
        return { success: true, output: "No results found.", data: { results: [] } };
      }

      const formatted = results
        .slice(0, 5)
        .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.description || ""}`)
        .join("\n\n");

      return {
        success: true,
        output: `Search results for "${input.query}":\n\n${formatted}`,
        data: { results: results.slice(0, 5) },
      };
    } catch (err) {
      return { success: false, output: `Search failed: ${String(err)}` };
    }
  },
});

// Tool: run_workflow — Execute a predefined workflow routine (moderate)
registerTool({
  name: "run_workflow",
  description:
    "Execute a named workflow routine (e.g., 'morning_standup', 'inbox_triage', 'focus_mode')",
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
          output:
            "Gmail integration not connected. Go to Settings → Integrations to connect Gmail.",
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
          output:
            "Google Calendar integration not connected. Go to Settings → Integrations to connect.",
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
      category: {
        type: "string",
        enum: ["preference", "routine", "personal", "episodic", "environment"],
      },
      keyword: { type: "string", description: "Keyword to search for" },
    },
  },
  riskLevel: "safe",
  handler: async (input, context) => {
    try {
      const { getMemoriesForUser } = await import("@/core/memory-db");
      const memories = await getMemoriesForUser(context.userId, input.category as any);

      // Filter by keyword if provided
      const keyword = ((input.keyword as string) || "").toLowerCase();
      const filtered = keyword
        ? memories.filter(
            (m) => m.key.toLowerCase().includes(keyword) || m.value.toLowerCase().includes(keyword)
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

// Tool: hubspot_create_contact — Create a CRM contact (moderate)
registerTool({
  name: "hubspot_create_contact",
  description: "Create a new contact in HubSpot CRM. Requires HubSpot integration.",
  inputSchema: {
    type: "object",
    properties: {
      email: { type: "string", description: "Contact email address" },
      firstname: { type: "string" },
      lastname: { type: "string" },
      company: { type: "string" },
      phone: { type: "string" },
    },
    required: ["email"],
  },
  riskLevel: "moderate",
  handler: async (input, context) => {
    try {
      const { getIntegrationTokens } = await import("@/core/integrations/adapter");
      const { accessToken } = await getIntegrationTokens(context.clientId || "", "hubspot");

      const properties: Record<string, string> = { email: input.email as string };
      if (input.firstname) properties.firstname = input.firstname as string;
      if (input.lastname) properties.lastname = input.lastname as string;
      if (input.company) properties.company = input.company as string;
      if (input.phone) properties.phone = input.phone as string;

      const res = await fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ properties }),
      });

      if (!res.ok) {
        const errText = await res.text();
        return { success: false, output: `HubSpot API error ${res.status}: ${errText}` };
      }

      const data = await res.json();
      return {
        success: true,
        output: `Contact created with ID: ${data.id}`,
        data: { contactId: data.id, email: input.email },
      };
    } catch (err: any) {
      if (err.name === "IntegrationNotConfiguredError") {
        return {
          success: false,
          output:
            "HubSpot integration not connected. Go to Settings → Integrations to connect HubSpot.",
        };
      }
      if (err.name === "IntegrationAuthExpiredError") {
        return {
          success: false,
          output: "HubSpot auth expired. Go to Settings → Integrations to reconnect.",
        };
      }
      return { success: false, output: `HubSpot create contact failed: ${err.message}` };
    }
  },
});

// Tool: hubspot_log_activity — Log a note/activity against a contact (moderate)
registerTool({
  name: "hubspot_log_activity",
  description: "Log an activity or note against a HubSpot contact. Requires HubSpot integration.",
  inputSchema: {
    type: "object",
    properties: {
      contact_id: { type: "string", description: "HubSpot contact ID" },
      activity_type: {
        type: "string",
        enum: ["call", "email", "meeting"],
        description: "Type of activity",
      },
      note: { type: "string", description: "Activity details or notes" },
    },
    required: ["contact_id", "note"],
  },
  riskLevel: "moderate",
  handler: async (input, context) => {
    try {
      const { getIntegrationTokens } = await import("@/core/integrations/adapter");
      const { accessToken } = await getIntegrationTokens(context.clientId || "", "hubspot");

      const activityType = (input.activity_type as string) || "note";
      const noteBody = `[${activityType.toUpperCase()}] ${input.note as string}`.trim();

      const res = await fetch("https://api.hubapi.com/crm/v3/objects/notes", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          properties: {
            hs_note_body: noteBody,
            hs_timestamp: Date.now().toString(),
          },
          associations: [
            {
              to: { id: input.contact_id as string },
              // 202 = HUBSPOT_DEFINED contact association type for notes
              types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }],
            },
          ],
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        return { success: false, output: `HubSpot API error ${res.status}: ${errText}` };
      }

      const data = await res.json();
      return {
        success: true,
        output: `Activity logged successfully (note ID: ${data.id})`,
        data: { noteId: data.id, contactId: input.contact_id, activityType },
      };
    } catch (err: any) {
      if (err.name === "IntegrationNotConfiguredError") {
        return {
          success: false,
          output:
            "HubSpot integration not connected. Go to Settings → Integrations to connect HubSpot.",
        };
      }
      if (err.name === "IntegrationAuthExpiredError") {
        return {
          success: false,
          output: "HubSpot auth expired. Go to Settings → Integrations to reconnect.",
        };
      }
      return { success: false, output: `HubSpot log activity failed: ${err.message}` };
    }
  },
});

// Tool: slack_send_message — Send a Slack message (moderate)
registerTool({
  name: "slack_send_message",
  description: "Send a message to a Slack channel or thread. Requires Slack integration.",
  inputSchema: {
    type: "object",
    properties: {
      channel: { type: "string", description: "Slack channel ID or name (e.g. #general)" },
      message: { type: "string", description: "Message text to send" },
      thread_ts: {
        type: "string",
        description: "Thread timestamp to reply in a thread (optional)",
      },
    },
    required: ["channel", "message"],
  },
  riskLevel: "moderate",
  handler: async (input, context) => {
    try {
      const { SlackAdapter } = await import("@/core/integrations/slack");
      const adapter = new SlackAdapter();
      return adapter.send(context.clientId || "", {
        channel: input.channel as string,
        message: input.message as string,
        ...(input.thread_ts ? { thread_ts: input.thread_ts as string } : {}),
      });
    } catch (err: any) {
      if (err.name === "IntegrationNotConfiguredError") {
        return {
          success: false,
          output:
            "Slack integration not connected. Go to Settings → Integrations to connect Slack.",
        };
      }
      if (err.name === "IntegrationAuthExpiredError") {
        return {
          success: false,
          output: "Slack auth expired. Go to Settings → Integrations to reconnect.",
        };
      }
      return { success: false, output: `Slack send failed: ${err.message}` };
    }
  },
});

// Tool: drive_upload_file — Upload a file to Google Drive (moderate)
registerTool({
  name: "drive_upload_file",
  description: "Upload a text file to Google Drive. Requires Google Drive integration.",
  inputSchema: {
    type: "object",
    properties: {
      filename: { type: "string", description: "Name for the file (including extension)" },
      content: { type: "string", description: "File text content" },
      mime_type: {
        type: "string",
        description: "MIME type (default: text/plain, e.g. text/markdown, application/json)",
      },
      folder_id: {
        type: "string",
        description: "Google Drive folder ID to upload into (optional, defaults to root)",
      },
    },
    required: ["filename", "content"],
  },
  riskLevel: "moderate",
  handler: async (input, context) => {
    try {
      const { GoogleDriveAdapter } = await import("@/core/integrations/google");
      const adapter = new GoogleDriveAdapter();
      const isConfigured = await adapter.validate(context.clientId || "");
      if (!isConfigured) {
        return {
          success: false,
          output:
            "Google Drive not connected. Go to Settings → Integrations to connect Google Drive.",
        };
      }
      return adapter.uploadFile(context.clientId || "", input);
    } catch (err: any) {
      if (err.name === "IntegrationAuthExpiredError") {
        return {
          success: false,
          output: "Google Drive auth expired. Go to Settings → Integrations to reconnect.",
        };
      }
      return { success: false, output: `Drive upload failed: ${err.message}` };
    }
  },
});

// Tool: drive_list_files — List files in Google Drive (safe)
registerTool({
  name: "drive_list_files",
  description:
    "List files in Google Drive. Optionally filter by name or folder. Requires Google Drive integration.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search by filename (optional)" },
      folder_id: { type: "string", description: "List files in a specific folder ID (optional)" },
      page_size: { type: "number", description: "Max results to return (default 20)" },
    },
  },
  riskLevel: "safe",
  handler: async (input, context) => {
    try {
      const { GoogleDriveAdapter } = await import("@/core/integrations/google");
      const adapter = new GoogleDriveAdapter();
      const isConfigured = await adapter.validate(context.clientId || "");
      if (!isConfigured) {
        return {
          success: false,
          output:
            "Google Drive not connected. Go to Settings → Integrations to connect Google Drive.",
        };
      }
      return adapter.listFiles(context.clientId || "", input);
    } catch (err: any) {
      if (err.name === "IntegrationAuthExpiredError") {
        return {
          success: false,
          output: "Google Drive auth expired. Go to Settings → Integrations to reconnect.",
        };
      }
      return { success: false, output: `Drive list failed: ${err.message}` };
    }
  },
});

// Tool: drive_read_file — Read file content from Google Drive (safe)
registerTool({
  name: "drive_read_file",
  description:
    "Read the text content of a file from Google Drive by file ID. Requires Google Drive integration.",
  inputSchema: {
    type: "object",
    properties: {
      file_id: {
        type: "string",
        description: "Google Drive file ID (from drive_list_files results)",
      },
    },
    required: ["file_id"],
  },
  riskLevel: "safe",
  handler: async (input, context) => {
    try {
      const { GoogleDriveAdapter } = await import("@/core/integrations/google");
      const adapter = new GoogleDriveAdapter();
      const isConfigured = await adapter.validate(context.clientId || "");
      if (!isConfigured) {
        return {
          success: false,
          output:
            "Google Drive not connected. Go to Settings → Integrations to connect Google Drive.",
        };
      }
      return adapter.readFile(context.clientId || "", input);
    } catch (err: any) {
      if (err.name === "IntegrationAuthExpiredError") {
        return {
          success: false,
          output: "Google Drive auth expired. Go to Settings → Integrations to reconnect.",
        };
      }
      return { success: false, output: `Drive read failed: ${err.message}` };
    }
  },
});

// Tool: slack_list_channels — List Slack channels (safe)
registerTool({
  name: "slack_list_channels",
  description: "List public Slack channels in the connected workspace. Requires Slack integration.",
  inputSchema: {
    type: "object",
    properties: {
      limit: { type: "number", description: "Max channels to return (default 100, max 200)" },
    },
  },
  riskLevel: "safe",
  handler: async (input, context) => {
    try {
      const { SlackAdapter } = await import("@/core/integrations/slack");
      const adapter = new SlackAdapter();
      const isConfigured = await adapter.validate(context.clientId || "");
      if (!isConfigured) {
        return {
          success: false,
          output:
            "Slack integration not connected. Go to Settings → Integrations to connect Slack.",
        };
      }
      return adapter.listChannels(context.clientId || "", input);
    } catch (err: any) {
      if (err.name === "IntegrationAuthExpiredError") {
        return {
          success: false,
          output: "Slack auth expired. Go to Settings → Integrations to reconnect.",
        };
      }
      return { success: false, output: `Slack list channels failed: ${err.message}` };
    }
  },
});

// Tool: slack_upload_file — Upload a file to a Slack channel (moderate)
registerTool({
  name: "slack_upload_file",
  description: "Upload a text file to a Slack channel. Requires Slack integration.",
  inputSchema: {
    type: "object",
    properties: {
      channel: { type: "string", description: "Slack channel ID or name (e.g. #general)" },
      filename: { type: "string", description: "Filename to display in Slack" },
      content: { type: "string", description: "File text content" },
      mime_type: {
        type: "string",
        description: "MIME type (default: text/plain)",
      },
    },
    required: ["channel", "filename", "content"],
  },
  riskLevel: "moderate",
  handler: async (input, context) => {
    try {
      const { SlackAdapter } = await import("@/core/integrations/slack");
      const adapter = new SlackAdapter();
      const isConfigured = await adapter.validate(context.clientId || "");
      if (!isConfigured) {
        return {
          success: false,
          output:
            "Slack integration not connected. Go to Settings → Integrations to connect Slack.",
        };
      }
      return adapter.uploadFile(context.clientId || "", input);
    } catch (err: any) {
      if (err.name === "IntegrationAuthExpiredError") {
        return {
          success: false,
          output: "Slack auth expired. Go to Settings → Integrations to reconnect.",
        };
      }
      return { success: false, output: `Slack upload failed: ${err.message}` };
    }
  },
});

// Tool: notion_create_page — Create a Notion page (moderate)
registerTool({
  name: "notion_create_page",
  description: "Create a new page in Notion under a parent page. Requires Notion integration.",
  inputSchema: {
    type: "object",
    properties: {
      parent_page_id: { type: "string", description: "ID of the parent Notion page" },
      title: { type: "string", description: "Page title" },
      content: { type: "string", description: "Page body content (optional)" },
    },
    required: ["parent_page_id", "title"],
  },
  riskLevel: "moderate",
  handler: async (input, context) => {
    try {
      const { NotionAdapter } = await import("@/core/integrations/notion");
      const adapter = new NotionAdapter();
      return adapter.createPage(context.clientId || "", input);
    } catch (err: any) {
      if (err.name === "IntegrationNotConfiguredError") {
        return {
          success: false,
          output:
            "Notion integration not connected. Go to Settings → Integrations to connect Notion.",
        };
      }
      if (err.name === "IntegrationAuthExpiredError") {
        return {
          success: false,
          output: "Notion auth expired. Go to Settings → Integrations to reconnect.",
        };
      }
      return { success: false, output: `Notion create page failed: ${err.message}` };
    }
  },
});

// Tool: notion_search_pages — Search Notion pages (safe)
registerTool({
  name: "notion_search_pages",
  description: "Search for pages in Notion by keyword. Requires Notion integration.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query to find matching Notion pages" },
      page_size: { type: "number", description: "Number of results to return (default 10)" },
    },
    required: ["query"],
  },
  riskLevel: "safe",
  handler: async (input, context) => {
    try {
      const { NotionAdapter } = await import("@/core/integrations/notion");
      const adapter = new NotionAdapter();
      const isConfigured = await adapter.validate(context.clientId || "");
      if (!isConfigured) {
        return {
          success: false,
          output:
            "Notion integration not connected. Go to Settings → Integrations to connect Notion.",
        };
      }
      return adapter.searchPages(context.clientId || "", input);
    } catch (err: any) {
      if (err.name === "IntegrationAuthExpiredError") {
        return {
          success: false,
          output: "Notion auth expired. Go to Settings → Integrations to reconnect.",
        };
      }
      return { success: false, output: `Notion search failed: ${err.message}` };
    }
  },
});

// Tool: notion_update_page — Update an existing Notion page (moderate)
registerTool({
  name: "notion_update_page",
  description:
    "Update the title or append content to an existing Notion page. Requires Notion integration.",
  inputSchema: {
    type: "object",
    properties: {
      page_id: { type: "string", description: "ID of the Notion page to update" },
      title: { type: "string", description: "New page title (optional)" },
      content: { type: "string", description: "Content to append to the page (optional)" },
    },
    required: ["page_id"],
  },
  riskLevel: "moderate",
  handler: async (input, context) => {
    try {
      const { NotionAdapter } = await import("@/core/integrations/notion");
      const adapter = new NotionAdapter();
      return adapter.updatePage(context.clientId || "", input);
    } catch (err: any) {
      if (err.name === "IntegrationNotConfiguredError") {
        return {
          success: false,
          output:
            "Notion integration not connected. Go to Settings → Integrations to connect Notion.",
        };
      }
      if (err.name === "IntegrationAuthExpiredError") {
        return {
          success: false,
          output: "Notion auth expired. Go to Settings → Integrations to reconnect.",
        };
      }
      return { success: false, output: `Notion update page failed: ${err.message}` };
    }
  },
});

// Tool: send_whatsapp — Send a WhatsApp message via WhatsApp Business API (DANGEROUS — always requires approval)
registerTool({
  name: "send_whatsapp",
  description: "Send a WhatsApp message via WhatsApp Business API. REQUIRES APPROVAL.",
  inputSchema: {
    type: "object",
    properties: {
      to: {
        type: "string",
        description: "Recipient phone number in E.164 format (e.g. +6281234567890)",
      },
      message: { type: "string", description: "WhatsApp message body" },
    },
    required: ["to", "message"],
  },
  riskLevel: "dangerous",
  handler: async (input) => {
    try {
      const { WhatsAppAdapter } = await import("@/core/integrations/whatsapp");
      const adapter = new WhatsAppAdapter();
      return adapter.sendText(input.to as string, input.message as string);
    } catch (err: any) {
      return { success: false, output: `WhatsApp failed: ${err.message}` };
    }
  },
});

// Tool: generate_docx — Generate a DOCX document (safe)
registerTool({
  name: "generate_docx",
  description: "Generate a Microsoft Word (.docx) document with a title and content body.",
  inputSchema: {
    type: "object",
    properties: {
      filename: { type: "string", description: "Output filename (without extension)" },
      title: { type: "string", description: "Document title (heading 1)" },
      content: { type: "string", description: "Document body text (newlines become paragraphs)" },
    },
    required: ["filename", "title", "content"],
  },
  riskLevel: "safe",
  handler: async (input, context) => {
    try {
      const { generateDocx } = await import("@/core/integrations/docgen");
      const result = await generateDocx(
        context.taskId,
        input.filename as string,
        input.title as string,
        input.content as string,
        context.userId
      );
      return result;
    } catch (err: any) {
      return { success: false, output: `DOCX failed: ${err.message}` };
    }
  },
});

// Tool: generate_pdf — Generate a PDF document (safe)
registerTool({
  name: "generate_pdf",
  description: "Generate a PDF document with a title and content body.",
  inputSchema: {
    type: "object",
    properties: {
      filename: { type: "string", description: "Output filename (without extension)" },
      title: { type: "string", description: "Document title" },
      content: { type: "string", description: "Document body text" },
    },
    required: ["filename", "title", "content"],
  },
  riskLevel: "safe",
  handler: async (input, context) => {
    try {
      const { generatePdf } = await import("@/core/integrations/docgen");
      const result = await generatePdf(
        context.taskId,
        input.filename as string,
        input.title as string,
        input.content as string,
        context.userId
      );
      return result;
    } catch (err: any) {
      return { success: false, output: `PDF failed: ${err.message}` };
    }
  },
});

// Tool: trigger_webhook — Send an outbound webhook POST (DANGEROUS — always requires approval)
registerTool({
  name: "trigger_webhook",
  description:
    "Send a POST request to an external HTTPS webhook URL with a JSON payload. REQUIRES APPROVAL.",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "Webhook URL (must be a public HTTPS endpoint)" },
      payload: {
        type: "object",
        description: "JSON payload to send in the request body",
      },
    },
    required: ["url", "payload"],
  },
  riskLevel: "dangerous",
  handler: async (input) => {
    const rawUrl = input.url as string;
    if (!rawUrl.startsWith("https://")) {
      return { success: false, output: "Webhook URL must use HTTPS." };
    }

    // Block private/loopback/link-local addresses to prevent SSRF
    let hostname: string;
    try {
      hostname = new URL(rawUrl).hostname;
    } catch {
      return { success: false, output: "Invalid webhook URL." };
    }
    const privateRange =
      /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.0\.0\.0|::1$)/i;
    if (privateRange.test(hostname)) {
      return { success: false, output: "Webhook URL must point to a public host." };
    }

    // Cap outbound payload at 64 KB
    const serialized = JSON.stringify(input.payload);
    if (serialized.length > 65_536) {
      return { success: false, output: "Webhook payload exceeds 64 KB limit." };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(rawUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: serialized,
        signal: controller.signal,
      });

      const body = await res.text();
      return {
        success: res.ok,
        output: `Webhook responded ${res.status}: ${body.slice(0, 500)}`,
        data: { status: res.status },
      };
    } catch (err: any) {
      if (err.name === "AbortError") {
        return { success: false, output: "Webhook timed out after 10 seconds." };
      }
      return { success: false, output: `Webhook failed: ${err.message}` };
    } finally {
      clearTimeout(timeout);
    }
  },
});

// Tool: hubspot_create_deal — Create a CRM deal (moderate)
registerTool({
  name: "hubspot_create_deal",
  description: "Create a new deal in HubSpot CRM. Requires HubSpot integration.",
  inputSchema: {
    type: "object",
    properties: {
      dealname: { type: "string", description: "Deal name" },
      amount: { type: "string", description: "Deal amount (e.g. '50000')" },
      pipeline: { type: "string", description: "Pipeline ID (default: 'default')" },
      dealstage: { type: "string", description: "Deal stage ID (e.g. 'appointmentscheduled')" },
      contact_id: { type: "string", description: "HubSpot contact ID to associate with this deal" },
    },
    required: ["dealname"],
  },
  riskLevel: "moderate",
  handler: async (input, context) => {
    try {
      const { HubSpotAdapter } = await import("@/core/integrations/hubspot");
      const adapter = new HubSpotAdapter();
      return adapter.createDeal(context.clientId || "", input);
    } catch (err: any) {
      if (err.name === "IntegrationNotConfiguredError") {
        return {
          success: false,
          output:
            "HubSpot integration not connected. Go to Settings → Integrations to connect HubSpot.",
        };
      }
      if (err.name === "IntegrationAuthExpiredError") {
        return {
          success: false,
          output: "HubSpot auth expired. Go to Settings → Integrations to reconnect.",
        };
      }
      return { success: false, output: `HubSpot create deal failed: ${err.message}` };
    }
  },
});

// Tool: hubspot_update_deal_stage — Update a deal's pipeline stage (moderate)
registerTool({
  name: "hubspot_update_deal_stage",
  description:
    "Update the pipeline stage of an existing HubSpot deal. Requires HubSpot integration.",
  inputSchema: {
    type: "object",
    properties: {
      deal_id: { type: "string", description: "HubSpot deal ID" },
      dealstage: { type: "string", description: "New deal stage ID (e.g. 'closedwon')" },
      amount: { type: "string", description: "Updated deal amount (optional)" },
    },
    required: ["deal_id", "dealstage"],
  },
  riskLevel: "moderate",
  handler: async (input, context) => {
    try {
      const { HubSpotAdapter } = await import("@/core/integrations/hubspot");
      const adapter = new HubSpotAdapter();
      return adapter.updateDealStage(context.clientId || "", input);
    } catch (err: any) {
      if (err.name === "IntegrationNotConfiguredError") {
        return {
          success: false,
          output:
            "HubSpot integration not connected. Go to Settings → Integrations to connect HubSpot.",
        };
      }
      if (err.name === "IntegrationAuthExpiredError") {
        return {
          success: false,
          output: "HubSpot auth expired. Go to Settings → Integrations to reconnect.",
        };
      }
      return { success: false, output: `HubSpot update deal stage failed: ${err.message}` };
    }
  },
});

// Tool: read_ingested_document — Read extracted text from an ingested document (safe)
registerTool({
  name: "read_ingested_document",
  description:
    "Read the extracted text content of a previously ingested document (PDF, DOCX, or image).",
  inputSchema: {
    type: "object",
    properties: {
      document_id: { type: "string", description: "UUID of the ingested document" },
      query: {
        type: "string",
        description: "Specific keyword or topic to extract from the document (optional)",
      },
    },
    required: ["document_id"],
  },
  riskLevel: "safe",
  handler: async (input) => {
    const supabase = getSupabaseAdmin();
    if (!supabase) return { success: false, output: "Database not configured." };

    const { data, error } = await supabase
      .from("ingested_documents")
      .select("id, label, extracted_text, character_count")
      .eq("id", input.document_id as string)
      .single();

    if (error || !data) {
      return { success: false, output: `Document not found: ${input.document_id}` };
    }

    const text: string = data.extracted_text || "";
    let excerpt = text;

    if (input.query) {
      const kw = (input.query as string).toLowerCase();
      const idx = text.toLowerCase().indexOf(kw);
      if (idx !== -1) {
        const start = Math.max(0, idx - 500);
        const end = Math.min(text.length, idx + 1500);
        excerpt = text.slice(start, end);
      } else {
        excerpt = text.slice(0, 2000);
      }
    } else {
      excerpt = text.slice(0, 3000);
    }

    return {
      success: true,
      output: excerpt,
      data: { documentId: data.id, label: data.label, characterCount: data.character_count },
    };
  },
});

// Tool: read_recent_emails — Fetch recent inbound emails (safe)
registerTool({
  name: "read_recent_emails",
  description:
    "Fetch recent inbound emails captured by the email webhook. Optionally filter by keyword or unprocessed only.",
  inputSchema: {
    type: "object",
    properties: {
      limit: { type: "number", description: "Number of emails to return (default 5, max 20)" },
      keyword: { type: "string", description: "Filter by subject keyword (optional)" },
      unprocessed_only: {
        type: "boolean",
        description: "Only return unprocessed emails (optional)",
      },
    },
  },
  riskLevel: "safe",
  handler: async (input, context) => {
    const supabase = getSupabaseAdmin();
    if (!supabase) return { success: false, output: "Database not configured." };

    const limit = Math.min(Number(input.limit) || 5, 20);

    // Webhook-ingested emails have no user_id (no session at ingest time),
    // so we read the shared inbox rather than filtering by user.
    let query = supabase
      .from("ingested_emails")
      .select("*")
      .order("received_at", { ascending: false })
      .limit(limit);

    if (input.unprocessed_only) {
      query = query.eq("processed", false);
    }

    const { data: emails, error } = await query;
    if (error) return { success: false, output: `Failed to fetch emails: ${error.message}` };

    let filtered = (emails || []) as any[];
    if (input.keyword) {
      const kw = (input.keyword as string).toLowerCase();
      filtered = filtered.filter((e: any) => (e.subject || "").toLowerCase().includes(kw));
    }

    if (filtered.length === 0) {
      return { success: true, output: "No emails found.", data: { count: 0 } };
    }

    const ids = filtered.map((e: any) => e.id);
    await supabase.from("ingested_emails").update({ processed: true }).in("id", ids);

    const formatted = filtered
      .map(
        (e: any) =>
          `From: ${e.from_address}\nSubject: ${e.subject || "(no subject)"}\nPreview: ${(e.body_text || "").slice(0, 100)}\nReceived: ${e.received_at}`
      )
      .join("\n\n");

    return {
      success: true,
      output: formatted,
      data: { count: filtered.length },
    };
  },
});

// Tool: read_whatsapp_messages — Fetch recent inbound WhatsApp messages (safe)
registerTool({
  name: "read_whatsapp_messages",
  description: "Fetch recent inbound WhatsApp messages captured by the WhatsApp webhook.",
  inputSchema: {
    type: "object",
    properties: {
      limit: { type: "number", description: "Number of messages to return (default 5)" },
      from_number: { type: "string", description: "Filter by sender phone number (optional)" },
    },
  },
  riskLevel: "safe",
  handler: async (input, context) => {
    const supabase = getSupabaseAdmin();
    if (!supabase) return { success: false, output: "Database not configured." };

    const limit = Math.min(Number(input.limit) || 5, 50);

    // Webhook-ingested messages have no user_id, so we read the shared inbox.
    let query = supabase
      .from("ingested_whatsapp")
      .select("*")
      .order("received_at", { ascending: false })
      .limit(limit);

    if (input.from_number) {
      query = query.eq("from_number", input.from_number as string);
    }

    const { data: messages, error } = await query;
    if (error) return { success: false, output: `Failed to fetch messages: ${error.message}` };

    const msgs = (messages || []) as any[];
    if (msgs.length === 0) {
      return { success: true, output: "No WhatsApp messages found.", data: { count: 0 } };
    }

    const formatted = msgs
      .map(
        (m: any) => `From: ${m.from_number}\nMessage: ${m.body || ""}\nReceived: ${m.received_at}`
      )
      .join("\n\n");

    return { success: true, output: formatted, data: { count: msgs.length } };
  },
});

// Tool: ocr_image — Extract text from an image via OCR (safe)
registerTool({
  name: "ocr_image",
  description:
    "Extract text from an image using OCR. Provide either a public image URL or a document_id of an already-ingested image.",
  inputSchema: {
    type: "object",
    properties: {
      image_url: { type: "string", description: "Public URL of the image to OCR (optional)" },
      document_id: {
        type: "string",
        description: "UUID of an already-ingested image document (optional)",
      },
    },
  },
  riskLevel: "safe",
  handler: async (input) => {
    if (input.document_id) {
      const supabase = getSupabaseAdmin();
      if (!supabase) return { success: false, output: "Database not configured." };
      const { data, error } = await supabase
        .from("ingested_documents")
        .select("extracted_text, character_count, label")
        .eq("id", input.document_id as string)
        .single();
      if (error || !data)
        return { success: false, output: `Document not found: ${input.document_id}` };
      return {
        success: true,
        output: data.extracted_text || "",
        data: { documentId: input.document_id, label: data.label, confidence: null },
      };
    }

    if (input.image_url) {
      const rawUrl = input.image_url as string;
      if (!rawUrl.startsWith("https://")) {
        return { success: false, output: "image_url must use HTTPS." };
      }
      let hostname: string;
      try {
        hostname = new URL(rawUrl).hostname;
      } catch {
        return { success: false, output: "Invalid image URL." };
      }
      const privateRange =
        /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.0\.0\.0|::1$)/i;
      if (privateRange.test(hostname)) {
        return { success: false, output: "image_url must point to a public host." };
      }
      try {
        const res = await fetch(rawUrl);
        if (!res.ok) return { success: false, output: `Failed to fetch image: ${res.status}` };
        const buffer = Buffer.from(await res.arrayBuffer());
        const contentType = res.headers.get("content-type") || "image/jpeg";
        const mimeType = contentType.split(";")[0].trim();
        const { extractTextFromImage } = await import("@/core/integrations/ocr");
        const { text, confidence } = await extractTextFromImage(buffer, mimeType);
        return {
          success: true,
          output: text || "No text detected.",
          data: { confidence },
        };
      } catch (err: any) {
        return { success: false, output: `OCR failed: ${err.message}` };
      }
    }

    return { success: false, output: "Provide either image_url or document_id." };
  },
});

// Tool: calendar_get_upcoming — Get upcoming calendar events (safe)
registerTool({
  name: "calendar_get_upcoming",
  description: "Get upcoming Google Calendar events. Requires Google Calendar integration.",
  inputSchema: {
    type: "object",
    properties: {
      max_results: { type: "number", description: "Maximum events to return (default 10)" },
      days_ahead: { type: "number", description: "How many days ahead to look (default 7)" },
    },
  },
  riskLevel: "safe",
  handler: async (input, context) => {
    try {
      const { GoogleCalendarAdapter } = await import("@/core/integrations/google");
      const adapter = new GoogleCalendarAdapter();
      const isConfigured = await adapter.validate(context.clientId || "");
      if (!isConfigured) {
        return {
          success: false,
          output: "Google Calendar not connected. Go to Settings → Integrations to connect.",
        };
      }
      const daysAhead = Number(input.days_ahead) || 7;
      return adapter.getUpcomingEvents(context.clientId || "", {
        maxResults: Number(input.max_results) || 10,
        timeMax: new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString(),
      });
    } catch (err: any) {
      if (err.name === "IntegrationAuthExpiredError") {
        return {
          success: false,
          output: "Google Calendar auth expired. Reconnect in Settings → Integrations.",
        };
      }
      return { success: false, output: `Calendar read failed: ${err.message}` };
    }
  },
});

// Tool: calendar_get_today — Get today's calendar events (safe)
registerTool({
  name: "calendar_get_today",
  description: "Get all Google Calendar events for today. Requires Google Calendar integration.",
  inputSchema: { type: "object", properties: {} },
  riskLevel: "safe",
  handler: async (_input, context) => {
    try {
      const { GoogleCalendarAdapter } = await import("@/core/integrations/google");
      const adapter = new GoogleCalendarAdapter();
      const isConfigured = await adapter.validate(context.clientId || "");
      if (!isConfigured) {
        return {
          success: false,
          output: "Google Calendar not connected. Go to Settings → Integrations to connect.",
        };
      }
      return adapter.getTodayEvents(context.clientId || "");
    } catch (err: any) {
      if (err.name === "IntegrationAuthExpiredError") {
        return {
          success: false,
          output: "Google Calendar auth expired. Reconnect in Settings → Integrations.",
        };
      }
      return { success: false, output: `Calendar read failed: ${err.message}` };
    }
  },
});

// Tool: hubspot_get_contacts — List or search HubSpot contacts (safe)
registerTool({
  name: "hubspot_get_contacts",
  description: "List or search contacts in HubSpot CRM. Requires HubSpot integration.",
  inputSchema: {
    type: "object",
    properties: {
      limit: { type: "number", description: "Number of contacts to return (default 10, max 100)" },
      query: { type: "string", description: "Search contacts by name or email (optional)" },
    },
  },
  riskLevel: "safe",
  handler: async (input, context) => {
    try {
      const { HubSpotAdapter } = await import("@/core/integrations/hubspot");
      const adapter = new HubSpotAdapter();
      return adapter.getContacts(context.clientId || "", {
        limit: input.limit ? Number(input.limit) : 10,
        query: input.query as string | undefined,
      });
    } catch (err: any) {
      if (err.name === "IntegrationNotConfiguredError") {
        return {
          success: false,
          output: "HubSpot not connected. Go to Settings → Integrations to connect HubSpot.",
        };
      }
      return { success: false, output: `HubSpot get contacts failed: ${err.message}` };
    }
  },
});

// Tool: hubspot_get_deals — List HubSpot deals (safe)
registerTool({
  name: "hubspot_get_deals",
  description:
    "List deals in HubSpot CRM. Optionally filter by pipeline stage. Requires HubSpot integration.",
  inputSchema: {
    type: "object",
    properties: {
      limit: { type: "number", description: "Number of deals to return (default 10)" },
      stage: {
        type: "string",
        description: "Filter by deal stage ID (optional, e.g. 'appointmentscheduled')",
      },
    },
  },
  riskLevel: "safe",
  handler: async (input, context) => {
    try {
      const { HubSpotAdapter } = await import("@/core/integrations/hubspot");
      const adapter = new HubSpotAdapter();
      return adapter.getDeals(context.clientId || "", {
        limit: input.limit ? Number(input.limit) : 10,
        stage: input.stage as string | undefined,
      });
    } catch (err: any) {
      if (err.name === "IntegrationNotConfiguredError") {
        return {
          success: false,
          output: "HubSpot not connected. Go to Settings → Integrations to connect HubSpot.",
        };
      }
      return { success: false, output: `HubSpot get deals failed: ${err.message}` };
    }
  },
});

// Tool: hubspot_get_contact — Get a single HubSpot contact by ID (safe)
registerTool({
  name: "hubspot_get_contact",
  description: "Get full details for a single HubSpot contact by ID. Requires HubSpot integration.",
  inputSchema: {
    type: "object",
    properties: {
      contact_id: { type: "string", description: "HubSpot contact ID" },
    },
    required: ["contact_id"],
  },
  riskLevel: "safe",
  handler: async (input, context) => {
    try {
      const { HubSpotAdapter } = await import("@/core/integrations/hubspot");
      const adapter = new HubSpotAdapter();
      return adapter.getContactById(context.clientId || "", input.contact_id as string);
    } catch (err: any) {
      if (err.name === "IntegrationNotConfiguredError") {
        return {
          success: false,
          output: "HubSpot not connected. Go to Settings → Integrations to connect HubSpot.",
        };
      }
      return { success: false, output: `HubSpot get contact failed: ${err.message}` };
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
