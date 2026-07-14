import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const lemonSrc = readFileSync(resolve(process.cwd(), "src/app/api/lemon/webhook/route.ts"), "utf8");
const instrSrc = readFileSync(resolve(process.cwd(), "src/instrumentation.ts"), "utf8");

// ── CRIT-02 ──────────────────────────────────────────────────────────────────

describe("CRIT-02: order_created webhook idempotency", () => {
  it("checks for existing purchase_ref before inserting extra_packs", () => {
    // The dedup check must appear BEFORE the insert
    const dedupIdx = lemonSrc.indexOf("existingPack");
    const insertIdx = lemonSrc.indexOf('.from("extra_packs").insert');
    expect(dedupIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(-1);
    expect(dedupIdx).toBeLessThan(insertIdx);
  });

  it("uses maybeSingle() for the dedup query", () => {
    expect(lemonSrc).toContain("maybeSingle()");
  });

  it("breaks early if pack already exists", () => {
    const orderBlock = lemonSrc.slice(lemonSrc.indexOf("order_created"));
    expect(orderBlock).toContain("if (existingPack) break");
  });
});

// ── CRIT-04 instrumentation sanity ───────────────────────────────────────────

describe("CRIT-04: instrumentation.ts sanity", () => {
  it("register is async", () => {
    expect(instrSrc).toContain("export async function register");
  });
});

// ── HIGH-01 ──────────────────────────────────────────────────────────────────

const cronFiles: Array<{ path: string; slug: string; schedule: string }> = [
  {
    path: "src/app/api/emma/cron/email-sequences/route.ts",
    slug: "emma-cron-email-sequences",
    schedule: "*/15 * * * *",
  },
  {
    path: "src/app/api/emma/cron/scheduled-tasks/route.ts",
    slug: "emma-cron-scheduled-tasks",
    schedule: "* * * * *",
  },
  {
    path: "src/app/api/emma/cron/approvals-expiry/route.ts",
    slug: "emma-cron-approvals-expiry",
    schedule: "*/5 * * * *",
  },
  {
    path: "src/app/api/emma/cron/pattern-detection/route.ts",
    slug: "emma-cron-pattern-detection",
    schedule: "0 2 * * *",
  },
  {
    path: "src/app/api/emma/cron/memory-prune/route.ts",
    slug: "emma-cron-memory-prune",
    schedule: "0 4 * * *",
  },
  {
    path: "src/app/api/emma/cron/reflection/route.ts",
    slug: "emma-cron-reflection",
    schedule: "30 3 * * *",
  },
  {
    path: "src/app/api/emma/cron/connection-health/route.ts",
    slug: "emma-cron-connection-health",
    schedule: "0 * * * *",
  },
];

describe("HIGH-01: Sentry.withMonitor on all 7 remaining cron routes", () => {
  for (const { path, slug, schedule } of cronFiles) {
    const src = readFileSync(resolve(process.cwd(), path), "utf8");
    const label = path.split("/").slice(-2, -1)[0];

    it(`${label}: uses Sentry.withMonitor with correct slug`, () => {
      expect(src).toContain(`"${slug}"`);
      expect(src).toContain("Sentry.withMonitor");
    });

    it(`${label}: monitor has correct schedule`, () => {
      expect(src).toContain(`"${schedule}"`);
    });

    it(`${label}: auth check runs before withMonitor`, () => {
      // Files use either authOk(req) helper or inline authHeader check — both
      // always emit an "Unauthorized" early return before Sentry.withMonitor.
      const authIdx = src.indexOf("Unauthorized");
      const monitorIdx = src.indexOf("Sentry.withMonitor");
      expect(authIdx).toBeGreaterThan(-1);
      expect(monitorIdx).toBeGreaterThan(-1);
      expect(authIdx).toBeLessThan(monitorIdx);
    });
  }
});

// ── HIGH-06 ──────────────────────────────────────────────────────────────────

describe("HIGH-06: WhatsApp reply errors captured in Sentry", () => {
  const waSrc = readFileSync(
    resolve(process.cwd(), "src/app/api/emma/ingest/whatsapp/route.ts"),
    "utf8"
  );

  it("Sentry.captureException is called in the after() catch block", () => {
    const afterBlock = waSrc.slice(waSrc.indexOf("after(async"));
    expect(afterBlock).toContain("Sentry.captureException");
  });

  it("captures fromNumber for context without logging message contents", () => {
    const catchBlock = waSrc.slice(waSrc.indexOf("} catch (err)"));
    expect(catchBlock).toContain("fromNumber");
    expect(catchBlock).toContain("Sentry.captureException");
    // Ensure catch block doesn't capture message.text
    const beforeEndCatch = catchBlock.slice(0, catchBlock.indexOf("});"));
    expect(beforeEndCatch).not.toContain("message.text");
  });
});

describe("HIGH-03: scheduled task cron stays within timeout budget", () => {
  const scheduledSrc = readFileSync(
    resolve(process.cwd(), "src/app/api/emma/cron/scheduled-tasks/route.ts"),
    "utf8"
  );

  it("processes a single scheduled task per cron invocation", () => {
    expect(scheduledSrc).toContain("SCHEDULED_TASK_BATCH_SIZE = 1");
    expect(scheduledSrc).toContain(".limit(SCHEDULED_TASK_BATCH_SIZE)");
  });

  it("claims a scheduled task before running the agent loop", () => {
    const leaseIdx = scheduledSrc.indexOf("const leaseResult = await supabase");
    const runIdx = scheduledSrc.indexOf("await runAgentLoop(task)");
    expect(leaseIdx).toBeGreaterThan(-1);
    expect(runIdx).toBeGreaterThan(-1);
    expect(leaseIdx).toBeLessThan(runIdx);
  });

  it("checks the lease update result before running the agent loop", () => {
    const leaseCheckIdx = scheduledSrc.indexOf("if (leaseResult.error)");
    const runIdx = scheduledSrc.indexOf("await runAgentLoop(task)");
    expect(leaseCheckIdx).toBeGreaterThan(-1);
    expect(runIdx).toBeGreaterThan(-1);
    expect(leaseCheckIdx).toBeLessThan(runIdx);
  });

  it("does not execute the agent loop when the lease write fails", () => {
    const leaseFailureBlock = scheduledSrc.slice(
      scheduledSrc.indexOf("if (leaseResult.error)"),
      scheduledSrc.indexOf("await runAgentLoop(task)")
    );
    expect(leaseFailureBlock).toContain("Sentry.captureException");
    expect(leaseFailureBlock).toContain("failed++");
    expect(leaseFailureBlock).toContain("continue");
  });

  it("checks elapsed runtime before starting task execution", () => {
    const elapsedIdx = scheduledSrc.indexOf("Date.now() - startedAt");
    const rateIdx = scheduledSrc.indexOf("await checkRateLimit");
    expect(elapsedIdx).toBeGreaterThan(-1);
    expect(rateIdx).toBeGreaterThan(-1);
    expect(elapsedIdx).toBeLessThan(rateIdx);
  });
});

describe("HIGH-08: WhatsApp sender rate limit ordering", () => {
  const waSrc = readFileSync(
    resolve(process.cwd(), "src/app/api/emma/ingest/whatsapp/route.ts"),
    "utf8"
  );

  it("uses the distributed rate-limit infrastructure for per-sender limits", () => {
    expect(waSrc).toContain("checkDistributedRateLimit");
    expect(waSrc).toContain('namespace: "whatsapp_sender"');
    expect(waSrc).toContain("WHATSAPP_SENDER_RATE_LIMIT");
  });

  it("hashes sender numbers before constructing the rate-limit key", () => {
    expect(waSrc).toContain('createHash("sha256").update(fromNumber)');
  });

  it("checks sender rate before history loading, cost gate, and LLM call", () => {
    const replyFnBody = waSrc.slice(waSrc.indexOf("async function replyToWhatsApp"));
    const senderLimitIdx = replyFnBody.indexOf("checkWhatsAppSenderRateLimit");
    const historyIdx = replyFnBody.indexOf('.from("ingested_whatsapp")');
    const costIdx = replyFnBody.indexOf("enforceCostGate");
    const fetchIdx = replyFnBody.indexOf("brainChat(");
    expect(senderLimitIdx).toBeGreaterThan(-1);
    expect(historyIdx).toBeGreaterThan(-1);
    expect(costIdx).toBeGreaterThan(-1);
    expect(fetchIdx).toBeGreaterThan(-1);
    expect(senderLimitIdx).toBeLessThan(historyIdx);
    expect(senderLimitIdx).toBeLessThan(costIdx);
    expect(senderLimitIdx).toBeLessThan(fetchIdx);
  });
});
