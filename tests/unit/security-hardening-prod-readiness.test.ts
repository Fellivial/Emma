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
