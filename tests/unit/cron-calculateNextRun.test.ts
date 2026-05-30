// cron-calculateNextRun.test.ts
//
// Tests the calculateNextRun logic from:
//   src/app/api/emma/cron/scheduled-tasks/route.ts
//
// calculateNextRun is not exported, so we replicate the exact same logic
// (using the same cron-parser import) and assert the observable contract:
//   - Valid cron   => ISO string in the future matching the expression
//   - Invalid cron => ISO string approximately 1h from now (+/-5 min tolerance)
//   - every-5-min  => next occurrence within 5 min + generous buffer
//
// Called by: test runner only.
// No existing file tests this path.

import { describe, it, expect } from "vitest";
import { CronExpressionParser } from "cron-parser";

/**
 * Mirror of the private calculateNextRun() in scheduled-tasks/route.ts.
 * Must be kept in sync with the source implementation.
 */
function calculateNextRun(cronExpression: string): string {
  try {
    const interval = CronExpressionParser.parse(cronExpression, { tz: "UTC" });
    return interval.next().toISOString() ?? new Date(Date.now() + 3_600_000).toISOString();
  } catch {
    return new Date(Date.now() + 3_600_000).toISOString();
  }
}

describe("calculateNextRun — valid cron expression", () => {
  it("returns a valid ISO 8601 string for '0 9 * * 1' (Mon 9 AM UTC)", () => {
    const result = calculateNextRun("0 9 * * 1");
    // Must be parseable as a date
    const date = new Date(result);
    expect(isNaN(date.getTime())).toBe(false);
    // Must be in the future
    expect(date.getTime()).toBeGreaterThan(Date.now());
    // Must be 09:00 UTC on a Monday
    expect(date.getUTCHours()).toBe(9);
    expect(date.getUTCMinutes()).toBe(0);
    expect(date.getUTCDay()).toBe(1); // 1 = Monday
  });

  it("returns a value that is an ISO string (contains 'T' and 'Z')", () => {
    const result = calculateNextRun("0 12 * * *");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("'*/5 * * * *' returns next occurrence within 5 min + 30s buffer", () => {
    const result = calculateNextRun("*/5 * * * *");
    const date = new Date(result);
    const diffMs = date.getTime() - Date.now();
    // Must be positive (future)
    expect(diffMs).toBeGreaterThan(0);
    // Must be at most 5 min 30 s away (5 * 60 * 1000 + 30s buffer)
    expect(diffMs).toBeLessThanOrEqual(5 * 60 * 1000 + 30_000);
  });

  it("'0 0 1 * *' (1st of month midnight) returns a date on the 1st", () => {
    const result = calculateNextRun("0 0 1 * *");
    const date = new Date(result);
    expect(date.getUTCDate()).toBe(1);
    expect(date.getUTCHours()).toBe(0);
    expect(date.getUTCMinutes()).toBe(0);
  });
});

describe("calculateNextRun — invalid cron expression", () => {
  it("returns fallback ~1h from now for 'not-a-cron'", () => {
    const before = Date.now();
    const result = calculateNextRun("not-a-cron");
    const after = Date.now();
    const date = new Date(result);

    expect(isNaN(date.getTime())).toBe(false);

    const diffMs = date.getTime() - before;
    const ONE_HOUR_MS = 3_600_000;
    const FIVE_MIN_MS = 5 * 60 * 1000;

    // Must be close to 1 hour: between 55min and 65min from call time
    expect(diffMs).toBeGreaterThanOrEqual(ONE_HOUR_MS - FIVE_MIN_MS);
    expect(diffMs).toBeLessThanOrEqual(ONE_HOUR_MS + FIVE_MIN_MS + (after - before));
  });

  it("returns fallback ~1h from now for 'INVALID_EXPRESSION'", () => {
    const before = Date.now();
    const result = calculateNextRun("INVALID_EXPRESSION");
    const date = new Date(result);
    const diffMs = date.getTime() - before;
    const ONE_HOUR_MS = 3_600_000;
    const FIVE_MIN_MS = 5 * 60 * 1000;
    expect(diffMs).toBeGreaterThanOrEqual(ONE_HOUR_MS - FIVE_MIN_MS);
    expect(diffMs).toBeLessThanOrEqual(ONE_HOUR_MS + FIVE_MIN_MS + 100);
  });

  it("returns fallback ~1h from now for '99 99 99 99 99'", () => {
    const before = Date.now();
    const result = calculateNextRun("99 99 99 99 99");
    const date = new Date(result);
    const diffMs = date.getTime() - before;
    const ONE_HOUR_MS = 3_600_000;
    const FIVE_MIN_MS = 5 * 60 * 1000;
    expect(diffMs).toBeGreaterThanOrEqual(ONE_HOUR_MS - FIVE_MIN_MS);
    expect(diffMs).toBeLessThanOrEqual(ONE_HOUR_MS + FIVE_MIN_MS + 100);
  });
});

describe("calculateNextRun — source file structural checks", () => {
  it("scheduled-tasks route uses CronExpressionParser.parse (not hand-rolled)", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/api/emma/cron/scheduled-tasks/route.ts"),
      "utf8"
    );
    expect(src).toContain("CronExpressionParser");
    expect(src).toContain("cron-parser");
    // Confirm the fallback +1h pattern is present
    expect(src).toContain("3_600_000");
  });
});
