# Autonomous & Proactive AI Systems Research

> **Status: RESEARCH ONLY — do not implement until instructed.**
> Sources: GitHub repos, Anthropic engineering docs, academic papers (Park et al. 2023), live browsing (2026-05-30).

---

## Emma's Current Autonomous Foundation

Before exploring what's possible, here's what already exists:

### Existing Infrastructure

| Component              | File                               | What it does                                           |
| ---------------------- | ---------------------------------- | ------------------------------------------------------ |
| Autonomy tier system   | `src/core/autonomy-engine.ts`      | Tier 1 (auto) / Tier 2 (suggest) / Tier 3 (alert)      |
| Agent loop             | `src/core/agent-loop.ts`           | `runAgentLoop()` — multi-step tool execution           |
| Scheduled task cron    | `/api/emma/cron/scheduled-tasks`   | Runs every minute, executes due `scheduled_tasks` rows |
| Pattern detection cron | `/api/emma/cron/pattern-detection` | Daily 02:00 UTC — detects recurring task patterns      |
| Approvals system       | `/api/emma/agent` — approve/reject | Human-in-the-loop gate for dangerous actions           |
| Rate limiter           | `src/core/rate-limiter.ts`         | Per-client limits on autonomous execution              |
| Addon enforcer         | `src/core/addon-enforcer.ts`       | Tier/plan gate for autonomous access                   |

### Gaps Identified

1. **No heartbeat / background proactivity** — Emma only acts when triggered by a scheduled task or user. No "I noticed something" self-initiated messages.
2. **No context-aware trigger** — pattern detection runs but doesn't yet create proactive suggestions surfaced to the user at the right moment.
3. **No interrupt model** — no logic for deciding when a proactive message is worth interrupting the user vs. staying silent.
4. **No user-state awareness** — the agent doesn't know if the user is busy, sleeping, or stressed.
5. **No memory consolidation loop** — memories are stored but never automatically reviewed for patterns or forgotten commitments.

---

## Definitions

### Reactive vs Proactive vs Autonomous

| Type           | Trigger                         | Example                                                              |
| -------------- | ------------------------------- | -------------------------------------------------------------------- |
| **Reactive**   | User asks → agent responds      | "Hey Emma, draft a reply to this email"                              |
| **Proactive**  | Agent notices → agent initiates | "I saw 3 unread emails from your client — want me to draft replies?" |
| **Autonomous** | Cron/event → agent acts         | "Scheduled: sent weekly digest at 09:00 Monday"                      |

### Autonomy Levels (Anthropic framing)

From Anthropic's _Building Effective Agents_ (Dec 2024):

- **Workflows** — LLMs and tools orchestrated through predefined code paths (deterministic, more reliable)
- **Agents** — LLMs dynamically direct their own processes and tool usage (flexible, higher cost/risk)

The distinction matters: workflows are more reliable and cheaper; agents are needed only when the subtask set can't be predicted upfront.

---

## Key Architectural Patterns

### Pattern 1: Heartbeat Loop

**Reference**: `heartbeat-agent-framework` (muxueqingze, Apr 2026, MIT)

An agent runs on a timed interval (every 30 minutes). Each cycle:

```
Step 0:   Assess user state (time, context, emotional signals)
Step 0.5: Check project priorities → make measurable progress
Step N:   Proactive care evaluation — should I message the user?
Final:    Log → reply gateway (HEARTBEAT_OK or proactive message)
```

**Key design decisions from the framework**:

- **Max 3 non-urgent messages per day** — aggressive restraint
- **Default: log only** — silent work is the default; no message = success
- **Only interrupt for**: verification needed, decision required, help blocked
- **Iron Laws**: per-task absolute constraints that halt execution immediately if violated
- **Log decay**: today = detailed (500 chars), yesterday = daily digest, last month = key events, last year = narrative (mimics human memory)

**Application to Emma**:

```
Emma Heartbeat (every 30min):
  1. Check scheduled_tasks table for due items
  2. Check pattern_suggestions for unsurfaced patterns
  3. Check integration inboxes (Gmail, Slack unread) for urgent items
  4. Decide: is any of this worth a proactive nudge?
  5. If yes: create a notification (Tier 2 — "should I...?")
  6. If no: log only, update heartbeat_log
```

**Trigger**: Vercel cron already supports 1-minute intervals. A new cron entry in `vercel.json` for 30-minute heartbeat.

---

### Pattern 2: Event-Driven Proactivity

**Reference**: AutoGPT platform (Significant-Gravitas, 185k stars), Concordia (DeepMind, 1.4k stars)

Instead of polling on a timer, the agent reacts to external events:

- **Email arrives** → check if high-priority → notify or draft reply
- **Calendar event approaching** → 15min warning with prep notes
- **Slack mention** → surface to user
- **Long inactivity** → "Hey, it's been quiet — is there anything you need?"
- **Anomaly detected** → vision/data anomaly → alert

**Trigger types in Emma's existing codebase**:

```typescript
// src/core/agent-loop.ts — triggerType field already supports:
triggerType: "manual" | "cron" | "webhook" | "event" | "proactive";
```

The `proactive` trigger type already exists in the type system — it just isn't used yet.

**Integration webhooks already present**: Gmail OAuth, Google Calendar OAuth, Slack OAuth, WhatsApp ingest, email ingest — all have OAuth routes and DB records. The missing piece is a monitoring loop that polls these.

---

### Pattern 3: Memory-Driven Proactivity

**Reference**: Letta (MemGPT) — 23k stars, Apache-2.0, TypeScript/Python SDK

The agent proactively surfaces things it "remembers" from previous conversations:

```
User: "I need to follow up with David about the contract."
[two weeks later]
Emma notices: "David's contract follow-up has been in memory for 14 days without resolution. Remind the user?"
```

**Letta's memory architecture**:

- `memory_blocks`: structured, labeled slots (human, persona, custom)
- Agents can read/write to their own memory — persistent state between sessions
- Stateful across sessions — no context loss between conversations
- REST API with TypeScript and Python SDKs

```typescript
// Letta TypeScript SDK example:
import Letta from "@letta-ai/letta-client";
const client = new Letta({ apiKey: process.env.LETTA_API_KEY });
const agent = await client.agents.create({
  model: "claude-sonnet-4-6",
  memory_blocks: [
    { label: "human", value: "User's name, goals, preferences..." },
    { label: "pending_followups", value: "[]" }, // auto-updated
  ],
  tools: ["web_search"],
});
```

**Emma's current memory**: AES-256-GCM encrypted in Supabase. Emma already stores memories. The missing piece is **scheduled memory review** — periodically scanning old memories for items that should be re-surfaced.

**Memory review schedule (from heartbeat framework)**:

```
30% chance each heartbeat to review 3-60 day old memories:
- "Did we make this mistake before?"
- "Was there something we said we'd do later but forgot?"
- Auto-surface if confidence > threshold
```

---

### Pattern 4: Generative Agent Architecture (Reflection + Planning)

**Reference**: Park et al. 2023 — "Generative Agents: Interactive Simulacra of Human Behavior" (21.4k stars, UIST '23)

The Stanford paper defines three core mechanisms for believable autonomous behavior:

1. **Memory stream** — append-only log of all observations and experiences
2. **Reflection** — periodically synthesizes memories into higher-level insights ("Isabella cares about climate change")
3. **Planning** — agent creates daily plans from reflections, adjusts based on new events

**The key insight**: Agents that reflect on their memories and create plans behave more believably and proactively than those that only react to immediate input.

**Emma application**:

| Mechanism     | Emma's current state               | Gap                                 |
| ------------- | ---------------------------------- | ----------------------------------- |
| Memory stream | Exists (Supabase `memories` table) | No automatic reflection             |
| Reflection    | Missing                            | Daily LLM synthesis of raw memories |
| Planning      | Partial (scheduled_tasks)          | No "Emma decides what to do today"  |

A **reflection cron** (daily) would:

1. Pull last 7 days of memories + conversation summaries
2. Ask Emma (via LLM): "What themes have you noticed? What commitments are pending?"
3. Store reflections as a new memory type (`reflection`)
4. Surface any "forgotten commitments" as Tier 2 suggestions

---

### Pattern 5: Evaluator-Optimizer Loop

**Reference**: Anthropic _Building Effective Agents_ (Dec 2024)

```
Generator LLM  →  draft output
Evaluator LLM  →  critiques the draft
Loop           →  until quality threshold met or max iterations
```

**Application to autonomous Emma tasks**: Before executing a scheduled task, an evaluator checks:

- Is the task still relevant? (conditions may have changed since it was set)
- Is the risk level appropriate for current context?
- Does the plan look coherent and safe?

This adds a self-checking layer before committing to external actions, reducing false-positive autonomous actions.

---

### Pattern 6: Orchestrator-Workers

**Reference**: Anthropic _Building Effective Agents_, AutoGPT platform

A central orchestrator LLM breaks down complex goals and dispatches sub-agents:

```
Orchestrator: "Send the weekly client digest"
  → Worker 1: Fetch last 7 days of activity (read-only)
  → Worker 2: Draft the digest email
  → Evaluator: Check tone and completeness
  → Approval gate (Tier 2): Send?
```

**Emma's current agent loop** (`core/agent-loop.ts`): single agent with up to 5 steps (`maxSteps: 5`). This pattern requires promoting it to an orchestrator that can spawn sub-tasks — significant architectural change, Phase 4 territory.

---

## Proactive Care: When to Interrupt

The hardest problem in proactive systems is **interrupt management**: deciding when to surface something vs. stay silent.

### The Message Discipline Model (Heartbeat framework)

```
Priority 1 (ALWAYS message): verification needed to proceed
Priority 2 (ALWAYS message): decision required (task blocked)
Priority 3 (ALWAYS message): help needed (unexpected error)
Priority 4 (EVALUATE):       useful but not urgent
Default:                      log only, never message
Hard cap:                     max 3 non-urgent messages per day
```

### The Attention Tax

Research: interruptions cost ~23 minutes of focus recovery (Gloria Mark, UC Irvine 2008). Good proactive agents should:

1. **Batch non-urgent items** — accumulate and surface at natural break points (end of conversation, morning)
2. **Respect quiet hours** — no interruptions outside working hours (configurable)
3. **Urgency classification** — time-sensitive (calendar in 15min) vs deferrable (email draft)
4. **Prefer push-then-pull** — send a notification, let the user pull full content when ready

### Emma's Tier System vs Best Practices

| Emma Tier           | Current action                   | Gap                                                   |
| ------------------- | -------------------------------- | ----------------------------------------------------- |
| Tier 1: auto_action | Execute + brief 4s notification  | Good for trusted ops; no quiet-hours check            |
| Tier 2: suggestion  | Propose + await approval         | Should batch deferrable suggestions to natural breaks |
| Tier 3: alert       | Full context + explicit go-ahead | Good for high-impact actions; add expiry UX           |

**Gaps**: No quiet hours, no batching of deferrable items, no per-day message cap.

---

## Trigger Taxonomy

All proactive triggers fall into four categories:

### Time-Based

- **Cron** — recurring schedule (already: `scheduled_tasks`, `pattern-detection`)
- **Deadline approaching** — N minutes before calendar event
- **Elapsed time** — "no activity in 3 days"
- **Time-of-day** — morning briefing, EOD summary

### Event-Based

- **Integration event** — new email, Slack message, HubSpot deal update
- **Webhook** — external service sends data (WhatsApp, Notion)
- **State change** — task completed, approval expired, usage threshold reached

### Context-Based

- **End of conversation** — "Before you go, I noticed X"
- **After completing a task** — "That's done — there's a related task you might want me to run"
- **Pattern match** — "You've asked me to do this 3 times; want me to automate it?"

### Memory-Based

- **Forgotten commitment** — "3 weeks ago you said you'd follow up with X"
- **Recurring mistake** — "Last time we did this, Y happened"
- **Goal drift** — "You set a goal of X but we haven't worked on it in 2 weeks"

---

## Implementation Ideas for Emma

### Idea A — Surface Pattern Suggestions at Login

The `pattern-detection` cron already generates suggestions. They just aren't surfaced.

When the user opens Emma (page mount in `src/app/app/page.tsx`):

1. Fetch `pattern_suggestions` where `shown_at IS NULL AND confidence > 0.7`
2. Show the top 1 as a Tier 2 notification: "I've noticed you often do X — want me to set up an automation?"
3. Mark as shown

**Risk**: Very low. Read-only + notification. Already 90% built.

### Idea B — End-of-Conversation Proactive Check

After the user goes idle (30s no input), Emma scans the last conversation for:

- Mentioned tasks ("I need to follow up with X")
- Unresolved questions Emma asked
- Time-sensitive items

If found: surface one Tier 2 suggestion before the user leaves.

**Risk**: Low-Medium. Adds an LLM call. Must have a daily cap to avoid annoyance.

### Idea C — Memory Reflection Cron

New cron (daily, 03:00 UTC):

1. Pull memories older than 7 days per user
2. Ask Emma: "What themes and unresolved commitments do you see?"
3. Store reflections as `memory_type: "reflection"`
4. Surface commitments pending > 14 days as Tier 2 suggestions

**Risk**: Low-Medium. LLM call + memory write. No external actions.

### Idea D — Morning Briefing Push

New cron at 08:00 local time (per user timezone):

1. Fetch today's calendar events (if Google Calendar connected)
2. Fetch pending approvals count
3. Fetch high-priority unread emails (if Gmail connected)
4. Generate a 2-3 sentence brief
5. Create Tier 1 notification (auto-show, brief)
6. Optionally: speak it via TTS if avatar is open

**Risk**: Low for read-only. Medium if it calls TTS (cost). Needs timezone awareness.

### Idea E — 30-Minute Heartbeat

New Vercel cron at `*/30 * * * *`:

1. Check `scheduled_tasks` for anything due in next 30 min (preview/warn)
2. Check for unsurfaced `pattern_suggestions`
3. Check integration inbox summaries (message counts, not content)
4. Evaluate: is anything above the interrupt threshold?
5. If yes: create one Tier 2 notification with summary
6. If no: write a heartbeat log entry, no notification

**Message discipline**: max 3 non-urgent notifications per day per user. Stored in DB and checked before each heartbeat notification.

**Risk**: Medium. Requires message cap enforcement in DB.

### Idea F — Iron Laws System

Before any autonomous action, check a per-workflow rules table:

```typescript
interface IronLaw {
  rule: string; // "Never send email without subject line"
  action: "halt" | "warn" | "require_approval";
  scope: "global" | "workflow_id";
}
```

Violation: immediate halt, log to `action_log`, Tier 3 notification.

**Risk**: Architecture change to `runAgentLoop`. Medium effort, high safety value.

---

## Proposed Implementation Roadmap

### Phase 1 — Surface What Already Exists (Low risk)

- Surface `pattern_suggestions` at conversation start / page mount
- Add quiet-hours check to notification delivery in `autonomy-engine.ts`
- End-of-conversation passive check for mentioned tasks

### Phase 2 — Memory Intelligence (Medium risk)

- Memory reflection cron (`/api/emma/cron/reflection/route.ts`)
- Forgotten commitments detection (query memories older than 14 days without resolution)
- Surface reflections as Tier 2 suggestions (morning or end-of-convo)

### Phase 3 — Heartbeat Proactivity (Medium risk)

- 30-minute heartbeat cron
- Integration inbox monitoring (Gmail/Slack unread count scan)
- Morning briefing push notification + optional TTS
- Message discipline enforcement (max 3/day cap, quiet hours)

### Phase 4 — Autonomous Background Work (Higher risk)

- Free-time task pool (idle heartbeats pick from predefined task list)
- Evaluator-optimizer loop before task execution
- Iron laws per-workflow guardrails
- Orchestrator → sub-task spawning

---

## Files to Modify / Create

| File                                        | Phase | Change                                         |
| ------------------------------------------- | ----- | ---------------------------------------------- |
| `src/app/app/page.tsx`                      | 1     | Check + surface pattern suggestions on mount   |
| `src/core/autonomy-engine.ts`               | 1     | Add quiet-hours + batch-deferred notifications |
| `src/app/api/emma/cron/heartbeat/route.ts`  | 3     | New — 30min heartbeat                          |
| `src/app/api/emma/cron/reflection/route.ts` | 2     | New — memory reflection                        |
| `src/core/memory-db.ts`                     | 2     | Add `reflection` memory type                   |
| `src/core/agent-loop.ts`                    | 4     | Iron laws pre-check                            |
| `vercel.json`                               | 3     | Add `*/30 * * * *` heartbeat cron              |

---

## Key Open Decisions

1. **Autonomy philosophy**: Pure assistant (reacts only) vs companion (proactively reaches out) vs autonomous agent (works in background)?
2. **Interrupt budget**: Max proactive messages per day? Heartbeat framework says 3.
3. **Quiet hours**: Should Emma respect user timezone working hours? Who configures this?
4. **Data scope for reflection**: Memory reflection touches all stored memories — confirm AES-256-GCM encrypted data is decrypted only server-side and never sent to LLM as-is.
5. **User presence detection**: Should Emma know if the tab is open/active before sending notifications?

---

## Sources

- `heartbeat-agent-framework` — muxueqingze, MIT, Apr 2026 — heartbeat loop, message discipline, iron laws, log decay
- Letta (MemGPT) — letta-ai, Apache-2.0, May 2026, 23k stars — stateful memory blocks, self-improving agents, TypeScript SDK
- Google DeepMind Concordia — google-deepmind, Apache-2.0, May 2026, 1.4k stars — entity+component model, game-master pattern, interrupt-driven agents
- AutoGPT — Significant-Gravitas, May 2026, 185k stars — event triggers, block-based workflow, continuous agent deployment
- Generative Agents — Park et al. UIST 2023, 21.4k stars — memory stream, reflection, planning loop
- Anthropic _Building Effective Agents_ — Dec 2024 — workflows vs agents, orchestrator-workers, evaluator-optimizer, tool ACI
- Anthropic Computer Use docs — agentic loop design, max_iterations guard, interrupt handling

---

## Updated Research — LangGraph Patterns, HITL, & Framework Landscape (2026-05-31 Browse)

> Sources: LangGraph official docs, OpenAI Agents SDK README, Microsoft Agent Framework, CrewAI docs, Letta README — all live-browsed May 31 2026.

---

### LangGraph Memory Architecture (Canonical Reference)

LangGraph's memory model is the most directly applicable to Emma. Two scopes:

**Short-term (thread-scoped)**

- Stored as checkpointed graph state within a single conversation session
- Persists to DB via a `checkpointer`; survives server restarts and failures
- State includes: message history, uploaded files, retrieved docs, generated artifacts
- Problem: full history doesn't fit in context window → needs trimming/summarization

**Long-term (cross-session)**

- Stored in a `Store` with custom namespaces, not tied to a thread_id
- Can be recalled in any thread at any time
- Namespace pattern: `(user_id, "memories")` — hierarchical like a file system
- Supports semantic search (embeddings) and content filtering

**Four memory types** (from CoALA cognitive architecture paper):

| Type           | What it stores              | Emma example                                         |
| -------------- | --------------------------- | ---------------------------------------------------- |
| **Semantic**   | Facts about world/user      | "User's name is Fel, prefers direct tone"            |
| **Episodic**   | Past agent actions/events   | "Last Tuesday we sent a client proposal"             |
| **Procedural** | Instructions / system rules | Emma's system prompt; self-modifiable via reflection |
| **Working**    | Current task context        | In-flight conversation state                         |

**Profile vs Collection for semantic memory**:

- **Profile**: Single JSON document with key-value facts. Easy to read; harder to update accurately as it grows. Good for user preferences.
- **Collection**: List of individual narrow-scope memory records. Better recall; requires deletion logic to avoid stale accumulation.

**Writing strategies**:

- **Hot-path**: Memory updated _during_ a response turn. Adds latency. Pattern: `save_memories` tool available to the LLM.
- **Background**: Memory written async after conversation. Zero latency. Common: trigger after N turns or via cron.

**Emma's memory gap**: Emma writes memories hot-path but has no background consolidation. The LangGraph pattern suggests a daily background consolidator that deduplicates, reconciles with existing profile, and elevates patterns to `semantic:profile` tier.

---

### LangGraph HITL: `interrupt()` — Directly Applicable to Emma

LangGraph's `interrupt()` is the canonical pattern for approval flows. It maps directly to Emma's Tier 2/3 system.

**Mechanics**:

```typescript
// Inside any graph node:
const approved = interrupt("Do you want to send this email?");
// Execution pauses here. State is checkpointed.
// Resume: graph.stream_events(Command(resume: true), config)
```

When `interrupt()` is called:

1. Graph execution suspends at that exact line
2. State is saved via checkpointer (durable across restarts)
3. Interrupt payload surfaces to caller on `stream.interrupts`
4. Execution waits indefinitely until `Command(resume=...)` is provided
5. The resume value becomes the return value of `interrupt()` in the node

**Pattern: approve or reject**:

```typescript
function approvalNode(state: State): Command {
  const isApproved = interrupt({
    question: "Do you want to proceed with this action?",
    details: state.actionDetails,
  });
  return Command({ goto: isApproved ? "proceed" : "cancel" });
}
```

**Pattern: parallel interrupts** (multiple branches pause simultaneously):

```typescript
// Resume all at once with a map of interrupt_id → response
resumed = graph.stream_events(
  Command({ resume: { [interrupt1.id]: true, [interrupt2.id]: false } }),
  config
);
```

**Critical rules for interrupts**:

1. Do NOT wrap `interrupt()` in try/except — it throws `GraphInterrupt` which must propagate
2. Do NOT reorder interrupt calls within a node between invocations
3. Side effects before an interrupt must be **idempotent** — the node restarts from the top when resumed

**Emma's current approval vs LangGraph `interrupt()`**:

| Aspect              | Emma (`agent/route.ts`)           | LangGraph `interrupt()`             |
| ------------------- | --------------------------------- | ----------------------------------- |
| State persistence   | `step_transcript` in DB (manual)  | Automatic checkpointing             |
| Resume mechanism    | Reconstructs loop from transcript | Resumes at exact paused line        |
| Expiry              | None                              | Metadata-based timeout possible     |
| Multiple concurrent | Not supported                     | Native — resume map by interrupt ID |

**Key insight**: Emma's current approval system re-runs the entire agent loop from a saved transcript. LangGraph's `interrupt()` resumes from the exact paused position — no replay divergence risk.

---

### Pattern: Evaluator-Optimizer (Code-Level Detail)

```typescript
interface Feedback {
  grade: "acceptable" | "needs_revision";
  feedback: string; // specific improvement instructions
}

// Generator produces a draft; evaluator grades it
function generator(state: State) {
  const msg = llm.invoke(
    state.feedback
      ? `Improve with feedback: ${state.feedback}\n\nDraft: ${state.draft}`
      : `Write: ${state.goal}`
  );
  return { draft: msg.content };
}

function evaluator(state: State) {
  const grade = evaluatorLLM.invoke(`Grade this: ${state.draft}`);
  return { grade: grade.grade, feedback: grade.feedback };
}
```

**Emma application — pre-execution task check**:

1. Generator: agent plans the task execution steps
2. Evaluator LLM: "Is this still relevant? Is the risk level appropriate for current context?"
3. If `needs_revision`: surface feedback to user (Tier 3 alert before proceeding)
4. If `acceptable`: execute

---

### Pattern: Orchestrator-Workers with LangGraph `Send()` API

```typescript
import { Send } from "@langchain/langgraph";

// Orchestrator assigns parallel workers dynamically
function assignWorkers(state: State): Send[] {
  return state.subtasks.map((task) => new Send("worker", { task, context: state.context }));
}

// Each worker writes to a shared accumulator (operator.add)
function worker(state: WorkerState) {
  const result = llm.invoke(state.task);
  return { results: [result.content] };
}
```

Workers run in parallel; all write to a shared `results` list the synthesizer merges.

**Emma Phase 4 use case** — "Prepare the weekly client digest":

- Worker 1: summarize last 7 days of conversations
- Worker 2: pull and summarize Gmail threads
- Worker 3: pull pending tasks
- Synthesizer: merge into one brief
- Approval gate: Tier 2 "send this?"

---

### Framework Landscape Update (May 2026)

| Framework                     | Stars | Verdict for Emma                                                    |
| ----------------------------- | ----- | ------------------------------------------------------------------- |
| **LangGraph** (LangChain)     | 33.4k | Best match — TypeScript-native, persistent interrupts, memory store |
| **OpenAI Agents SDK**         | 26.8k | Strong — Sandbox Agents, Sessions (Redis), provider-agnostic        |
| **CrewAI**                    | 52.5k | Best for multi-agent Crews; Flows for event-driven orchestration    |
| **Letta (MemGPT)**            | 23k   | Best for stateful memory blocks; API-first                          |
| **Microsoft Agent Framework** | 10.9k | AutoGen successor; time-travel checkpointing; Python+C#             |
| **AutoGPT**                   | 185k  | Too complex for Emma's use case; platform-level product             |

**Key new findings**:

1. **OpenAI Agents SDK — Sandbox Agents** (v0.14.0): agents that work in a container with a real filesystem over long time horizons — can run code, apply patches, persist workspace state. Relevant to Emma's autonomous task execution beyond pure LLM tool calls.

2. **CrewAI Flows**: Event-driven state machine via `@listen` decorator. Emma's equivalent: webhook handlers that trigger agent flows when an integration event arrives.

3. **Microsoft Agent Framework time-travel**: Checkpoint and replay agent state from any previous step. Emma's current approval resume (reconstructing from `step_transcript`) is a manual reimplementation — adopting checkpointing-first would be more robust.

4. **LangGraph "Durable Execution"**: Agents resume from exactly where they left off after failures, even across server restarts. Critical for Emma's long-running autonomous tasks — currently if the server restarts mid-task, the task is lost.

---

### Missing Pattern: Context Window Awareness

When a conversation gets long, the agent should:

1. Detect approaching context limits (~70% of model's token window)
2. Summarize and compress older conversation turns
3. Proactively inform the user: "This conversation is getting long — I've summarized earlier sections"

**Code pattern** (adapted from LangGraph short-term memory guide):

```typescript
function trimMessages(messages: Message[]): Message[] {
  const budget = 80_000; // tokens — adjust per model
  const system = messages.find((m) => m.role === "system");
  const recent = messages.filter((m) => m.role !== "system").slice(-20);
  return [system, summaryIfNeeded, ...recent];
}
```

Emma's `personas.ts` already builds the system prompt with conversation context. The trimming/summarization step should be added before the prompt is assembled.

---

### Urgency Classification (Refined 4-Tier Model)

Building on the message discipline model from the heartbeat framework:

```
U1 — Immediate (always interrupt):
  - Execution blocked (missing info, tool failed)
  - Action requires explicit approval (Emma Tier 3)
  - Time-sensitive decision (calendar in <15 min)

U2 — Soon (defer to next time user has Emma open):
  - Approval request that can wait (Emma Tier 2)
  - Pattern detection result that's actionable
  - Forgotten commitment > 7 days old

U3 — Batched (surface at morning briefing or EOD):
  - Pattern suggestions
  - Memory reflections
  - Non-urgent informational updates

U4 — Silent (never interrupt):
  - Background task completions (routine)
  - Heartbeat log entries
  - Low-confidence pattern detections (<0.7)
```

**Emma gap**: All notifications currently treat urgency uniformly. The U3/U4 distinction is critical — routine autonomous task completions should never surface as notifications by default.

---

## Updated Sources (2026-05-31)

- LangGraph docs (memory, interrupts, workflows) — langchain-ai.github.io/langgraph — live-browsed May 31 2026
- OpenAI Agents SDK — github.com/openai/openai-agents-python — 26.8k stars, May 30 2026
- Microsoft Agent Framework — github.com/microsoft/agent-framework — 10.9k stars, AutoGen successor
- CrewAI — github.com/crewAIInc/crewAI — 52.5k stars, Flows + Crews
- Anthropic Claude Cookbooks (agents) — github.com/anthropics/claude-cookbooks — evaluator-optimizer, orchestrator-workers notebooks
