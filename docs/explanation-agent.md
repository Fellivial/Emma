# The Autonomous Agent: Design and Autonomy Tiers

Emma can do things on your behalf — send an email, create a calendar event, search the web, generate a spreadsheet. The autonomous agent is the system that lets Emma plan and execute multi-step tasks without a human approving each action.

---

## The Problem

A purely reactive AI waits for each user message, responds, then waits again. That works for Q&A but not for tasks like:

> "Research the top 5 CRM tools, compare their pricing, and send me a summary by end of day."

That task requires multiple tool calls (web search → web fetch → document generation → email), intermediate state, and potentially several minutes of execution. The user shouldn't have to stay present for every step.

The agent loop solves this: Emma plans the task, executes tools in sequence, handles partial failures, and delivers results when done.

---

## How the Agent Loop Works (`src/core/agent-loop.ts`)

The loop is a continuation-passing architecture around the Anthropic Messages API:

```
1. POST /api/emma/agent with task + tools + message history
2. Claude responds with either:
   a. tool_use block → execute the tool, append result, loop
   b. text response  → task complete, return to user
   c. pause_turn    → server-side tool still running (web_search, web_fetch),
                      resend the response to continue
3. Repeat until text response or max iterations
```

**`pause_turn` stop reason:** When Emma uses `web_search_20260209` or `web_fetch_20260209`, Anthropic runs the tool server-side. The API returns `stop_reason: "pause_turn"` while the search is executing. The agent loop detects this and immediately resends the current response as input, allowing the loop to continue once the server-side tool finishes. Without this handling, the agent silently stops mid-task.

**Tool execution:** Tools are executed inside the agent route, not client-side. The agent has access to:
- Anthropic-hosted: `web_search`, `web_fetch` (no key required)
- Native Anthropic: `memory` scratchpad for long sessions
- Integration tools: all tools registered in `tool-registry.ts` (Gmail, Calendar, Slack, Notion, HubSpot, Drive)
- User MCP tools: any server the user connected via `/settings/mcp`

**Max iterations:** The loop stops after a configurable maximum (default: 10 tool calls). This prevents runaway loops and controls cost.

---

## Autonomy Tiers

Not all actions are equal. Sending a test email is different from making a purchase. Emma's three autonomy tiers control how much human approval is needed.

### Tier 1 — Full Auto

Low-risk, reversible, routine actions. Emma executes silently and shows a brief auto-dismissing notification.

Examples: adjust notification settings, play a playlist, set a reminder, read calendar.

```
buildTierNotification(routine, "scheduler")
  → { type: "auto_action", autoExpire: 4000 }
```

The notification appears for 4 seconds and disappears. The user sees what Emma did but isn't blocked by it.

### Tier 2 — Suggest & Confirm

Moderate actions. Emma proposes and waits. The user sees approve / dismiss / snooze buttons.

Examples: draft and send an email, reorder a calendar event, create a new HubSpot deal, post to Slack.

```
buildTierNotification(routine, "scheduler")
  → { type: "suggestion", actions: ["Approve", "Dismiss", "Snooze 15m"] }
```

The routine doesn't execute until the user approves. Snooze pushes it 15 minutes into the future.

### Tier 3 — Inform & Wait

High-impact or irreversible actions. Emma provides full context and waits for explicit approval. No auto-dismiss.

Examples: purchase, send email to external contact, security configuration change, bulk data operation.

```
buildTierNotification(routine, "scheduler")
  → { type: "alert", tier: 3 }
```

The alert shows how many operations will be affected (`${routine.commands.length} device changes`). The user must explicitly approve before anything executes.

---

## Tool Risk Levels

Every tool in `src/core/tool-registry.ts` has a `riskLevel` of `safe`, `moderate`, or `dangerous`. This maps to the autonomy tier used when Emma calls that tool autonomously:

| Risk level | Autonomy tier | Example tools |
|------------|--------------|---------------|
| `safe` | Tier 1 (auto) | `web_search`, `calendar_get_upcoming`, `drive_list_files`, `hubspot_get_contacts` |
| `moderate` | Tier 2 (suggest) | `send_email`, `book_appointment`, `slack_send_message`, `notion_create_page`, `hubspot_create_contact` |
| `dangerous` | Tier 3 (alert) | `hubspot_create_deal`, `drive_upload_file`, `send_whatsapp` |

The tool registry uses `strict: true` on all tool definitions — Anthropic's grammar-constrained sampling guarantees tool inputs exactly match their JSON schema. Malformed inputs that would silently fail are caught before execution.

---

## Why Custom Agent Loop Instead of Managed Agents

Anthropic offers a Managed Agents platform (research preview) that would replace the custom agent loop entirely. Emma uses a custom loop for three reasons:

1. **Data sovereignty:** Managed Agents stores session history, events, and container state on Anthropic's servers. Emma's architecture keeps all user data in the user's own Supabase database.

2. **Not ZDR or HIPAA eligible:** Managed Agents doesn't offer Zero Data Retention. For enterprise customers with compliance requirements, the custom loop is the only option.

3. **Custom memory model:** Emma's AES-256-GCM encrypted memory engine is more private than Managed Agents Memory Stores (which are stored unencrypted on Anthropic's infrastructure).

The trade-off: the custom loop requires more code to maintain, doesn't get Anthropic's built-in container execution, and requires handling `pause_turn` manually. This is a deliberate choice that prioritizes user data control.

---

## Web Search in the Agent

Emma uses `web_search_20260209` and `web_fetch_20260209` — Anthropic's GA server-side tools — in both the brain route (chat) and the agent loop. No external API key is needed.

These are the same tools in both paths, which means:
- Web search results are consistent between chat and agentic tasks
- No cost for Brave Search or any third-party search API
- Anthropic handles rate limiting, result filtering, and content extraction

The `_20260209` version uses internal code execution to filter results before loading them into context, which reduces token waste compared to the earlier `_20250305` version.

---

## Scheduled Tasks

Autonomous tasks can be scheduled to run at a future time. The task scheduler (`/api/emma/cron/scheduled-tasks`) runs every minute via Vercel cron and picks up any tasks with `scheduled_at <= now()` and `status = 'pending'`.

Scheduled tasks are stored in the `tasks` Supabase table with `scheduled_at` set. The cron job authenticates via `Authorization: Bearer <CRON_SECRET>`.

---

## Related

- [Reference: API routes](reference-api.md) — `/api/emma/agent` and `/api/emma/tasks` spec
- [Reference: Plans and limits](reference-plans.md) — autonomous actions per plan
- [Explanation: Architecture](explanation-architecture.md) — how the agent fits in the overall system
