# Background Workers Research: Vercel Limits & Alternatives

> **Status: RESEARCH ONLY — do not implement until instructed.**

**Date:** 2026-05-31
**Context:** Emma runs agent loops (up to 10 LLM steps, ~20s per task) via cron routes on Vercel. This doc captures execution limits and evaluates durable background job systems as alternatives or complements.

---

## 1. Vercel Execution Limits

### 1.1 Max Duration by Plan (Fluid Compute enabled — default as of 2026)

| Plan       | Default Duration | Maximum Duration | Notes                              |
| ---------- | ---------------- | ---------------- | ---------------------------------- |
| Hobby      | 300s (5 min)     | 300s (5 min)     | Hard ceiling; cannot be raised     |
| Pro        | 300s (5 min)     | 800s (~13 min)   | Set via `export const maxDuration` |
| Enterprise | 300s (5 min)     | 800s (~13 min)   | Same ceiling as Pro                |

**Historical context:** Before Fluid Compute, Hobby was capped at 10s and Pro at 60s. Fluid Compute (rolled out ~2024–2025, now default) dramatically raised these limits. The 60s/10s figures in Emma's original planning context are now outdated.

**What happens on timeout:** Vercel terminates the function and returns HTTP `504 FUNCTION_INVOCATION_TIMEOUT`. No partial-completion guarantee; the process is killed. Vercel does **not** retry cron jobs that fail or time out.

**Setting maxDuration in Next.js App Router:**

```ts
// app/api/emma/cron/scheduled-tasks/route.ts
export const maxDuration = 300; // up to 800 on Pro

export async function GET(request: NextRequest) { ... }
```

### 1.2 Cron-Specific Limits

Cron jobs invoke regular Vercel Functions — they share the same duration limits; there is no separate ceiling for cron.

| Plan       | Max Cron Jobs / Project | Minimum Interval | Scheduling Precision        |
| ---------- | ----------------------- | ---------------- | --------------------------- |
| Hobby      | 100                     | Once per day     | ±59 minutes (hourly window) |
| Pro        | 100                     | Once per minute  | Per-minute                  |
| Enterprise | 100                     | Once per minute  | Per-minute                  |

**Hobby-specific warning:** Cron expressions that would fire more than once per day (e.g. `*/30 * * * *`) fail at deploy time with the error "Hobby accounts are limited to daily cron jobs." This would block Emma's `scheduled-tasks` and `pattern-detection` routes if deployed on Hobby with sub-daily schedules.

**No automatic retries on cron failure:** If a cron-triggered function errors or times out, Vercel logs it and moves on. The next scheduled invocation is unaffected.

**Concurrency:** Vercel does not prevent concurrent cron invocations. If a job runs longer than its interval, two instances can overlap. Locking (e.g. Redis distributed lock) or idempotent design is required.

**Authentication:** Vercel sends `Authorization: Bearer <CRON_SECRET>` on every cron invocation — Emma already implements this correctly.

### 1.3 Other Relevant Limits

| Limit              | Value                                             |
| ------------------ | ------------------------------------------------- |
| Max memory (Hobby) | 2 GB / 1 vCPU                                     |
| Max memory (Pro)   | 4 GB / 2 vCPU (configurable)                      |
| Request body size  | 4.5 MB max                                        |
| Bundle size        | 250 MB (gzip compressed)                          |
| Edge runtime       | Must begin response within 25s; stream up to 300s |

### 1.4 Vercel Workflows (Native Alternative)

Vercel now offers **Workflows** — a native durable execution product built on the same infrastructure. Key properties:

- No duration limit (runs can span minutes to months)
- Pause/resume semantics
- Available on Pro and Enterprise (pricing not widely published as of research date)
- Uses the Workflow SDK (`@vercel/workflow`)

This is Vercel's own answer to Inngest/Trigger.dev. Not evaluated in depth here because it was still in limited availability and pricing is opaque.

---

## 2. Emma's Current Risk Assessment

Emma's three cron routes trigger agent loops. Risk is evaluated against the Vercel plan in use.

| Route                                | Expected Duration    | Hobby Risk      | Pro Risk        |
| ------------------------------------ | -------------------- | --------------- | --------------- |
| `/api/emma/cron/scheduled-tasks`     | ~20s (10 steps × 2s) | LOW (fits 300s) | LOW (fits 800s) |
| `/api/emma/cron/pattern-detection`   | ~10–30s (analysis)   | LOW (fits 300s) | LOW (fits 800s) |
| `/api/emma/cron/heartbeat` (planned) | < 2s                 | NONE            | NONE            |

**Current verdict:** Emma's 10-step × ~2s loop produces ~20s total execution, which fits comfortably within the updated 300s default on both Hobby and Pro. The original risk assessment (written when limits were 10s/60s) is now moot.

**Remaining real risks (not timeout, but durability):**

1. **Slow LLM responses:** If an OpenRouter call takes 10–15s under load or on large context, 10 steps could reach 100–150s. Still within 300s, but warrants a per-step timeout guard in the agent loop code.
2. **No retry on timeout:** If a cron job times out at step 7 of 10, steps 8–10 are lost. No rollback, no retry, no resume.
3. **No durability:** If Vercel kills the process mid-loop (deploy, timeout, memory pressure), all in-progress state is lost.
4. **Concurrency risk:** If a cron fires every minute and a job takes 90s, two instances can run simultaneously, potentially double-processing the same tasks.
5. **Hobby scheduling:** On Hobby, cron minimum is once per day. Sub-daily scheduling requires Pro.

---

## 3. Background Worker Alternatives

### 3.1 Inngest

**What it is:** A cloud-hosted durable workflow engine. Functions run as HTTP endpoints inside your app; Inngest orchestrates execution, retries, and scheduling externally.

**Next.js App Router setup:**

```ts
// src/app/api/inngest/route.ts
import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { agentLoopFunction } from "@/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [agentLoopFunction],
});
```

```ts
// src/inngest/client.ts
import { Inngest } from "inngest";
export const inngest = new Inngest({ id: "emma-app" });

// src/inngest/functions.ts
export const agentLoopFunction = inngest.createFunction(
  { id: "emma-agent-loop" },
  { cron: "0 * * * *" }, // or: { event: "emma/tasks.run" }
  async ({ event, step }) => {
    const tasks = await step.run("fetch-pending-tasks", async () => {
      return db.getPendingTasks();
    });

    for (const task of tasks) {
      await step.run(`process-task-${task.id}`, async () => {
        return runAgentStep(task);
      });
    }
  }
);
```

**Key primitives:**

- `step.run(id, fn)` — executes a unit; result is memoized. If the function is interrupted and retried, completed steps are skipped (state replay). This is what makes Inngest durable.
- `step.sleep(id, duration)` — pauses without consuming compute. Max 7 days on free tier, 1 year on paid.
- `step.waitForEvent(id, { event, timeout })` — suspends until a named event arrives.
- Each step is independently retried on failure; completed steps do not re-run.

**How it solves Vercel timeouts:** Each `step.run()` is a separate short Vercel function invocation. A 10-step agent loop becomes 10 HTTP calls (~2–3s each), each well within Vercel's limits. Inngest orchestrates the sequence externally and memoizes step outputs.

**Cron/schedule triggers:**

```ts
{
  cron: "TZ=UTC 0 8 * * *";
} // standard cron with optional timezone prefix
// with jitter (spreads load): { cron: "0 * * * *", jitter: "5m" }
```

**Retry behavior:** Configurable per-function and per-step. Default: exponential backoff, 3 attempts.

**Free tier (Hobby):**

- 50,000 function executions/month
- 5 concurrent steps
- 7-day sleep maximum
- 3 users

**Pro:** $75/month, 1M executions included, 100+ concurrent steps.

**Pricing math for Emma at 100 users × 10 tasks/day:**

- 100 users × 10 tasks × 10 steps = 10,000 steps/day = 300,000 steps/month
- Likely fits within free tier (50,000 "executions" — exact step vs execution mapping should be verified against current Inngest docs before relying on free tier).
- At 1,000 users, would need Pro at $75/month.

**Inngest important note on "executions" definition:** Inngest's pricing page uses "executions" as the unit. As of research date, one function run with multiple steps counts as one execution. Steps within a run are not individually billed. Verify this before assuming free tier coverage.

### 3.2 Trigger.dev

**What it is:** Open-source durable task platform (cloud-hosted or self-hostable). Tasks run in a **separate worker process** connected to Trigger.dev's platform — completely outside Vercel's function execution environment.

**Key architectural difference from Inngest:** Trigger.dev tasks do NOT run inside your Vercel functions. They run in a separate long-running worker (on Trigger.dev Cloud, Railway, Fly.io, etc.). Your Vercel function merely triggers the task; the worker executes it. This eliminates Vercel timeout concerns entirely but requires running a separate process.

**Next.js setup:**

```ts
// src/trigger/agent-loop.ts
import { schedules, task } from "@trigger.dev/sdk";

export const emmaAgentLoop = schedules.task({
  id: "emma-agent-loop",
  cron: { pattern: "0 * * * *", timezone: "UTC" },
  maxDuration: 300,
  retry: { maxAttempts: 3, factor: 1.8, minTimeoutInMs: 500 },
  run: async (payload) => {
    // runs in worker, not in Vercel — no timeout concern
    const tasks = await db.getPendingTasks();
    for (const t of tasks) {
      await runAgentStep(t);
    }
  },
});

// Trigger from Next.js API route (type-only import to avoid bundling task code):
import type { emmaAgentLoop } from "@/trigger/agent-loop";
import { tasks } from "@trigger.dev/sdk";
await tasks.trigger<typeof emmaAgentLoop>("emma-agent-loop", payload);
```

**Key primitives:**

- `task({ id, run, retry, maxDuration })` — standard task definition
- `schedules.task({ id, cron, run })` — scheduled (cron) task with IANA timezone support
- `wait.for({ seconds: N })` — pauses execution; waits over 5s do not consume compute (checkpointing)
- `schedules.create({ task, cron, timezone, externalId })` — create per-user schedules dynamically (ideal for per-user reminders)

**Retry:** Exponential backoff, highly configurable. Default 3 attempts.

**Free tier:**

- $5 free monthly usage credit
- 20 concurrent runs
- 10 schedules maximum
- 1-day log retention
- Dev runs are not charged

**Hobby plan: $10/month** — $10 credit, 50 concurrent runs, 100 schedules, 7-day logs.

**Pro plan: $50/month** — $50 credit, 200+ concurrent runs, 1,000+ schedules, 30-day logs.

**Compute pricing (charged on top of plan credit):**

- Small 1x machine: $0.0000338/second
- Per-invocation fee: $0.000025/run
- Example: 10-second task × 100 runs/day ≈ $1.09/month on Small 1x

**Pricing math for Emma at 100 users × 10 tasks/day:**

- 1,000 runs/day, avg 10s each
- Compute: 10,000s/day × $0.0000338 = $0.338/day = ~$10/month
- Invocations: 1,000/day × $0.000025 = $0.025/day = ~$0.75/month
- Total: ~$11/month — fits within free tier credit ($5) partially; Hobby plan ($10) covers it comfortably.

**Self-hosting:** Full open-source self-host available. Eliminates vendor lock-in if hosted bill grows.

### 3.3 Upstash QStash

**What it is:** A serverless HTTP message queue and scheduler. Not a workflow engine — it delivers HTTP messages with retries and schedules. QStash POSTs to your endpoint; your endpoint processes the message. Execution still happens inside Vercel functions (same timeout limits apply for raw QStash use).

**Core pattern (raw QStash):**

```ts
// Enqueue a background job (fast, non-blocking call from a Vercel function):
import { Client } from "@upstash/qstash";
const qstash = new Client({ token: process.env.QSTASH_TOKEN });

await qstash.publishJSON({
  url: "https://your-app.vercel.app/api/emma/agent/process",
  body: { taskId: "abc123", userId: "user_xyz" },
  delay: 0, // optional: delay in seconds before delivery
  retries: 3, // optional: retry on non-2xx response
});

// Receiving endpoint (regular Next.js route, still subject to Vercel limits):
export async function POST(request: NextRequest) {
  const { taskId, userId } = await request.json();
  await processAgentTask(taskId, userId); // must complete within Vercel maxDuration
  return Response.json({ ok: true });
}
```

**Upstash Workflow SDK (built on top of QStash — solves timeouts):**
The Workflow SDK adds step-based orchestration, similar to Inngest. Each step is a separate QStash message delivery, sidestepping Vercel timeouts:

```ts
import { serve } from "@upstash/workflow/nextjs";

export const { POST } = serve<{ taskId: string }>(async (context) => {
  const tasks = await context.run("fetch-tasks", async () => db.getTasks());
  await context.sleep("wait", 5); // seconds; no compute consumed
  const result = await context.run("process", async () => runAgentLoop(tasks));
});
```

**Key properties:**

- Raw QStash: delivers HTTP messages; your code runs in Vercel (same timeout limits)
- Workflow SDK: each `context.run()` is a separate QStash delivery; sidesteps Vercel timeouts
- Max message size: 1 MB
- Retries: automatic on non-2xx; configurable count

**Free tier (QStash):**

- 1,000 messages/day
- 10 active schedules
- 7-day max delay
- 3-day DLQ/log retention

**Paid pricing:** $1 per 100,000 messages (pay-as-you-go). Very cheap at low volume.

**Pricing math for Emma at 100 users × 10 tasks/day:**

- Raw QStash (1 message per task): 1,000 messages/day — hits free tier ceiling exactly
- Workflow SDK (1 message per step, 10 steps/task): 10,000 messages/day — exceeds free tier
- Pay-as-you-go at 10,000 messages/day × 30 days = 300,000 messages/month = **$3/month**

---

## 4. Comparison Table

| Dimension                          | Inngest                             | Trigger.dev                                  | QStash / Upstash Workflow                       |
| ---------------------------------- | ----------------------------------- | -------------------------------------------- | ----------------------------------------------- |
| **Type**                           | Cloud workflow engine               | Cloud/self-hosted durable tasks              | Message queue + optional workflow SDK           |
| **Execution environment**          | Inside your Vercel function         | Separate worker process                      | Vercel function (raw) / per-step (Workflow SDK) |
| **Solves Vercel timeouts**         | Yes — each step is a short call     | Yes — worker runs outside Vercel             | No (raw) / Yes (Workflow SDK)                   |
| **Durability (step memoization)**  | Yes                                 | Yes                                          | Yes (Workflow SDK only)                         |
| **Cron/schedule support**          | Yes, native + timezone + jitter     | Yes, native + per-user + IANA TZ             | Yes (QStash schedules)                          |
| **Retry on failure**               | Yes, per-step configurable          | Yes, per-task configurable                   | Yes (HTTP-level retries)                        |
| **Sleep without compute cost**     | Yes (`step.sleep`, 7d free/1y paid) | Yes (`wait.for`, checkpointing)              | Yes (`context.sleep` in Workflow SDK)           |
| **Free tier**                      | 50k executions/month                | $5 credit/month, 20 concurrent, 10 schedules | 1,000 messages/day, 10 schedules                |
| **Free tier adequacy for Emma**    | Sufficient at launch                | Tight (10 schedules limit)                   | Sufficient raw; tight for Workflow SDK          |
| **Paid plan entry**                | $75/month (Pro)                     | $10/month (Hobby) / $50 (Pro)                | ~$3/month pay-as-you-go                         |
| **Self-hosting**                   | No                                  | Yes (open source)                            | No (Upstash-only managed service)               |
| **Vendor lock-in risk**            | Medium                              | Low                                          | Medium                                          |
| **Next.js App Router support**     | First-class (`serve()` handler)     | First-class (separate worker)                | First-class (`serve()` for Workflow)            |
| **Migration complexity from cron** | Low–Medium                          | Medium (requires separate worker)            | Low (raw) / Medium (Workflow)                   |
| **Observability**                  | Good (trace UI, function logs)      | Good (dashboard, structured logs)            | Basic (DLQ, delivery logs)                      |
| **Open source**                    | No                                  | Yes (SDK + platform)                         | SDK open; platform proprietary                  |

---

## 5. Migration Sketch

### Current pattern (Vercel cron → Next.js API route):

```
Vercel cron scheduler
  → GET /api/emma/cron/scheduled-tasks (CRON_SECRET auth)
    → runs full 10-step agent loop sequentially
    → returns 200 OK when done
```

Problem: single function call; no durability; no retry on partial failure; timeout risk if LLM calls are slow.

### Option A — Inngest (recommended, lowest migration friction):

```
Inngest cron trigger (replaces Vercel cron)
  → Inngest function fires
    → step.run("fetch-tasks") → short Vercel invocation
    → step.run("process-task-1") → short Vercel invocation
    → step.run("process-task-2") → short Vercel invocation
    ... each step is independent; state memoized externally
  → failed steps retry independently; completed steps skip
```

Migration steps: add `src/app/api/inngest/route.ts` serve handler, move agent loop body into Inngest function, wrap each LLM call in `step.run()`, replace Vercel cron config with Inngest cron trigger (or keep Vercel cron and have it emit an Inngest event).

### Option B — Trigger.dev (recommended for scale and cost):

```
Vercel cron (or Trigger.dev schedule)
  → tasks.trigger("emma-agent-loop", payload) [fast, non-blocking]
    → Trigger.dev worker picks up task
    → full 10-step loop runs in worker (outside Vercel, no timeout)
    → retries on failure; logs in Trigger.dev dashboard
```

Migration steps: install Trigger.dev SDK, create `/trigger/` directory with task definitions, add `npx trigger.dev@latest dev` worker (for local), deploy worker to Railway or Trigger.dev Cloud (~$5/month for worker), replace cron route body with `tasks.trigger()` call.

### Option C — QStash raw (lowest cost, no durability improvement):

```
Vercel cron
  → POST to QStash (publishJSON) for each pending task
    → QStash delivers to /api/emma/agent/process (1 message per task)
    → function processes one task per message within Vercel limit
    → QStash retries on non-2xx
```

Migration steps: split the agent loop into per-task messages (1 QStash publish per task, not per step), add receiving endpoint, add QStash signature verification. Does not solve mid-loop timeout — each task must still complete within Vercel's limit.

---

## 6. Recommendation for Emma

**Recommended path: Stay on Vercel cron for now; add Inngest when the first reliability issue is hit or user count exceeds ~200.**

### Reasoning:

1. **Current limits are not the problem.** Emma's ~20s agent loop fits comfortably within Vercel's 300s default on Hobby and 800s ceiling on Pro. The original 10s/60s risk assessment was based on pre-Fluid-Compute limits that no longer apply.

2. **The real risk is durability, not timeout.** If a cron job crashes at step 7 of 10, steps 1–6 results are discarded and steps 8–10 never run. For < 50 users this is acceptable; for 100+ users processing production tasks, it is not.

3. **Inngest is the lowest-friction migration path.** The `serve()` handler drops into the existing Next.js App Router. Steps map directly to the existing agent loop structure. The free tier (50,000 executions/month) covers Emma's load through approximately 500 users at 10 tasks/day.

4. **Trigger.dev is better at scale and has self-hosting.** Worth revisiting at 500+ users, or when Inngest's $75/month Pro tier becomes the limiting factor. The separate worker process is an operational overhead tradeoff.

5. **QStash raw is useful for simple deferred tasks** (email after 24h, webhook retries) but is not a drop-in replacement for a multi-step agent loop without the Workflow SDK layer.

### Cost at 100 users × 10 tasks/day:

| Option                 | Monthly Cost Estimate | Durability | Notes                                   |
| ---------------------- | --------------------- | ---------- | --------------------------------------- |
| Vercel cron only       | $0 (included)         | None       | Current state; acceptable at low volume |
| + Inngest (free tier)  | $0                    | Full       | 300k steps/month; verify execution unit |
| + Trigger.dev Hobby    | ~$10–11/month         | Full       | Includes $10 credit + compute costs     |
| + QStash pay-as-you-go | ~$3/month             | Partial    | Workflow SDK; per-step HTTP delivery    |
| + Vercel Workflows     | Unknown               | Full       | In limited availability; pricing TBD    |

---

## Sources

- [Vercel Functions: Configuring Maximum Duration](https://vercel.com/docs/functions/configuring-functions/duration) — last updated 2026-05-14
- [Vercel Functions: Limits](https://vercel.com/docs/functions/limitations) — last updated 2026-05-14
- [Vercel Cron Jobs Overview](https://vercel.com/docs/cron-jobs) — last updated 2025-06-25
- [Vercel Cron Jobs: Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs) — last updated 2026-04-21
- [Vercel Cron Jobs: Usage and Pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing) — last updated 2026-03-04
- [Vercel Higher Defaults Changelog (Fluid Compute)](https://vercel.com/changelog/higher-defaults-and-limits-for-vercel-functions-running-fluid-compute)
- [Inngest Steps and Sequences](https://www.inngest.com/docs/steps)
- [Inngest Scheduled Functions](https://www.inngest.com/docs/guides/scheduled-functions)
- [Inngest Pricing](https://www.inngest.com/pricing)
- [Trigger.dev Tasks Overview](https://trigger.dev/docs/tasks/overview)
- [Trigger.dev Scheduled Tasks](https://trigger.dev/docs/tasks/scheduled)
- [Trigger.dev Pricing](https://trigger.dev/pricing)
- [Upstash QStash Background Jobs](https://upstash.com/docs/qstash/features/background-jobs)
- [Upstash Workflow SDK (GitHub)](https://github.com/upstash/workflow-js)
- [Upstash QStash Pricing](https://upstash.com/pricing/qstash)
- [HashBuilds: Next.js Background Jobs Comparison](https://www.hashbuilds.com/articles/next-js-background-jobs-inngest-vs-trigger-dev-vs-vercel-cron)
- [promptstoproduct: Inngest vs Trigger.dev](https://www.promptstoproduct.com/inngest-vs-trigger-dev)
- [BuildPilot: Trigger.dev vs Inngest vs Temporal (2026)](https://trybuildpilot.com/610-trigger-dev-vs-inngest-vs-temporal-2026)
