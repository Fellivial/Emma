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
