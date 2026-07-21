import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// MANDATORY REGRESSION — Phase 5F WP1 (Production Readiness Review finding
// R-15): the retry_pending status message previously claimed deletion "will
// retry automatically," which was false — nothing advances a retry_pending
// deletion_requests row except a fresh POST /api/emma/gdpr call (see
// workflow.ts's resumeStartStatus/STATE_ORDER — there is no cron, queue, or
// scheduler that touches this table). This test locks the corrected copy so
// a future edit can't reintroduce the same false claim.
describe("Privacy settings — retry_pending copy accuracy", () => {
  const source = readFileSync(join(process.cwd(), "src/app/settings/privacy/page.tsx"), "utf-8");

  it("does not claim deletion retries automatically", () => {
    expect(source).not.toMatch(/retr(y|ies)\s+automatically/i);
    expect(source).not.toMatch(/will retry/i);
  });

  it("instructs the user to retry the action themselves", () => {
    expect(source).toMatch(/click delete again/i);
  });
});
