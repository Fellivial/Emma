import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import { resolve } from "path";

// Regression: ISSUE-001 — Next.js 16.2.4 crashes when both middleware.ts and proxy.ts exist
// Found by /qa on 2026-05-23
// Report: .gstack/qa-reports/qa-report-localhost-2026-05-23.md
//
// Next.js 16 treats src/proxy.ts as a first-class "proxy" construct.
// Having both src/middleware.ts AND src/proxy.ts causes an Unhandled Rejection
// at startup, leaving the server bound to the port but unable to serve requests.
// Fix: keep src/proxy.ts (the logic), remove src/middleware.ts (the re-exporter).

describe("Next.js middleware/proxy file invariant", () => {
  const srcDir = resolve(process.cwd(), "src");

  it("src/proxy.ts must exist (auth and subdomain routing logic)", () => {
    expect(existsSync(resolve(srcDir, "proxy.ts"))).toBe(true);
  });

  it("src/middleware.ts must NOT exist alongside proxy.ts (Next.js 16 conflict)", () => {
    expect(existsSync(resolve(srcDir, "middleware.ts"))).toBe(false);
  });

  it("proxy.ts exports a function named proxy (Next.js 16 convention)", async () => {
    const mod = await import("@/proxy");
    expect(typeof mod.proxy).toBe("function");
  });

  it("proxy.ts exports a config matcher (route filtering)", async () => {
    const mod = await import("@/proxy");
    expect(mod.config).toBeDefined();
    expect(Array.isArray(mod.config.matcher)).toBe(true);
    expect(mod.config.matcher.length).toBeGreaterThan(0);
  });
});
