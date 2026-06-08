/**
 * Inngest durable functions — mirrors existing Vercel cron jobs.
 *
 * Each function calls the corresponding cron endpoint via step.run(), which gives:
 * - Automatic retry on failure (configurable per function)
 * - Observability via Inngest dashboard (step timeline, logs, replay)
 * - Step-level memoization: if the function is interrupted and retried, completed
 *   steps are skipped (state replay) — eliminating double-processing.
 *
 * To enable Inngest in production:
 * 1. Set INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY env vars (from inngest.com dashboard)
 * 2. Optionally remove the matching Vercel cron entries from vercel.json once Inngest
 *    is confirmed stable (running both simultaneously is safe — idempotent routes handle it)
 *
 * For per-task step isolation on scheduled-tasks (maximum durability), refactor
 * scheduled-tasks/route.ts to expose a task-list endpoint and loop over tasks with
 * individual step.run() calls — see background-workers-research.md §5.
 */

import { inngest } from "./client";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

async function callCron(path: string): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET not set");
  const res = await fetch(`${APP_URL}${path}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Cron ${path} responded ${res.status}: ${body.slice(0, 200)}`);
  }
}

export const scheduledTasks = inngest.createFunction(
  { id: "emma-scheduled-tasks", retries: 2, triggers: [{ cron: "* * * * *" }] },
  async ({ step }) => {
    await step.run("run-pending-agent-tasks", () => callCron("/api/emma/cron/scheduled-tasks"));
  }
);

export const heartbeat = inngest.createFunction(
  { id: "emma-heartbeat", retries: 1, triggers: [{ cron: "*/30 * * * *" }] },
  async ({ step }) => {
    await step.run("heartbeat", () => callCron("/api/emma/cron/heartbeat"));
  }
);

export const connectionHealth = inngest.createFunction(
  { id: "emma-connection-health", retries: 1, triggers: [{ cron: "0 * * * *" }] },
  async ({ step }) => {
    await step.run("check-connection-health", () => callCron("/api/emma/cron/connection-health"));
  }
);

export const emailSequences = inngest.createFunction(
  { id: "emma-email-sequences", retries: 2, triggers: [{ cron: "*/15 * * * *" }] },
  async ({ step }) => {
    await step.run("process-email-sequences", () => callCron("/api/emma/cron/email-sequences"));
  }
);

export const approvalsExpiry = inngest.createFunction(
  { id: "emma-approvals-expiry", retries: 1, triggers: [{ cron: "*/5 * * * *" }] },
  async ({ step }) => {
    await step.run("expire-stale-approvals", () => callCron("/api/emma/cron/approvals-expiry"));
  }
);

export const patternDetection = inngest.createFunction(
  { id: "emma-pattern-detection", retries: 2, triggers: [{ cron: "TZ=UTC 0 2 * * *" }] },
  async ({ step }) => {
    await step.run("detect-patterns", () => callCron("/api/emma/cron/pattern-detection"));
  }
);

export const leadsCleanup = inngest.createFunction(
  { id: "emma-leads-cleanup", retries: 1, triggers: [{ cron: "TZ=UTC 0 3 * * *" }] },
  async ({ step }) => {
    await step.run("clean-leads", () => callCron("/api/emma/cron/leads-cleanup"));
  }
);

export const memoryPrune = inngest.createFunction(
  { id: "emma-memory-prune", retries: 1, triggers: [{ cron: "TZ=UTC 0 4 * * *" }] },
  async ({ step }) => {
    await step.run("prune-memories", () => callCron("/api/emma/cron/memory-prune"));
  }
);

export const reflection = inngest.createFunction(
  { id: "emma-reflection", retries: 2, triggers: [{ cron: "TZ=UTC 30 3 * * *" }] },
  async ({ step }) => {
    await step.run("memory-reflection", () => callCron("/api/emma/cron/reflection"));
  }
);
