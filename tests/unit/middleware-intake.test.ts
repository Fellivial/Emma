import { describe, it, expect } from "vitest";

// Lightweight smoke test: verify /intake/ is in publicPaths without running middleware.

describe("middleware public paths include /intake/", () => {
  it("publicPaths array contains /intake/", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(path.resolve(process.cwd(), "src/middleware.ts"), "utf8");
    expect(src).toContain('"/intake/"');
  });

  it("publicPaths does not include /app (requires auth)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(path.resolve(process.cwd(), "src/middleware.ts"), "utf8");
    expect(src).not.toMatch(/publicPaths\s*=\s*\[[^\]]*"\/app"/);
  });
});
