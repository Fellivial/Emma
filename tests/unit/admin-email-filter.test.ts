// admin-email-filter.test.ts
//
// Tests the filter(Boolean) admin email logic that appears in proxy.ts and
// multiple API routes. The key invariant: an empty EMMA_ADMIN_EMAILS env var
// must NOT produce a truthy admin email list.
//
// This logic is duplicated across routes, so we test the JS expression itself
// and then verify each route uses the correct pattern via source text.
//
// Called by: test runner only. No production source imports this file.
// The existing proxy-waitlist-gate.test.ts only checks that 'EMMA_ADMIN_EMAILS'
// and 'isAdmin' appear in the source — it does not test the filter logic.

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// ── Pure logic tests (no imports needed) ─────────────────────────────────────
//
// Replicates the pattern used in proxy.ts:
//   (process.env.EMMA_ADMIN_EMAILS || "")
//     .split(",")
//     .map(e => e.trim().toLowerCase())
//     .filter(Boolean)
//
// Helper that mirrors the exact expression in the source files:

function parseAdminEmails(envValue: string | undefined): string[] {
  return (envValue || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function isAdminEmail(email: string, envValue: string | undefined): boolean {
  const adminEmails = parseAdminEmails(envValue);
  return adminEmails.length > 0 && adminEmails.includes(email.toLowerCase());
}

describe("admin email filter — filter(Boolean) invariants", () => {
  it("empty string produces no admin emails (no accidental admin grant)", () => {
    const result = parseAdminEmails("");
    expect(result.length).toBe(0);
    expect(result.length > 0).toBe(false);
  });

  it("undefined produces no admin emails", () => {
    const result = parseAdminEmails(undefined);
    expect(result.length).toBe(0);
  });

  it("commas-only string ',,,' produces no admin emails", () => {
    const result = parseAdminEmails(",,,");
    expect(result.length).toBe(0);
    expect(result.length > 0).toBe(false);
  });

  it("spaces-only string '   ' produces no admin emails", () => {
    const result = parseAdminEmails("   ");
    expect(result.length).toBe(0);
  });

  it("single valid email grants admin", () => {
    const result = parseAdminEmails("admin@example.com");
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain("admin@example.com");
  });

  it("two valid emails grants admin to both", () => {
    const result = parseAdminEmails("admin@a.com,user@b.com");
    expect(result.length).toBe(2);
    expect(result).toContain("admin@a.com");
    expect(result).toContain("user@b.com");
  });

  it("email with surrounding spaces is trimmed and matched", () => {
    const result = parseAdminEmails("  admin@example.com  ,  other@example.com  ");
    expect(result).toContain("admin@example.com");
    expect(result).toContain("other@example.com");
  });

  it("email matching is case-insensitive", () => {
    const result = parseAdminEmails("Admin@Example.COM");
    expect(result).toContain("admin@example.com");
  });
});

describe("admin email filter — isAdmin logic", () => {
  it("empty env var => isAdmin returns false for any email", () => {
    expect(isAdminEmail("admin@example.com", "")).toBe(false);
    expect(isAdminEmail("admin@example.com", undefined)).toBe(false);
    expect(isAdminEmail("admin@example.com", ",,,")).toBe(false);
  });

  it("matching email => isAdmin returns true", () => {
    expect(isAdminEmail("admin@example.com", "admin@example.com")).toBe(true);
    expect(isAdminEmail("admin@a.com", "admin@a.com,user@b.com")).toBe(true);
  });

  it("non-matching email => isAdmin returns false even with valid list", () => {
    expect(isAdminEmail("hacker@evil.com", "admin@example.com")).toBe(false);
  });

  it("case-insensitive match works", () => {
    expect(isAdminEmail("ADMIN@EXAMPLE.COM", "admin@example.com")).toBe(true);
  });
});

// ── Structural: source files must use filter(Boolean) pattern ─────────────────

describe("admin email filter — source files use filter(Boolean) (structural)", () => {
  const routesToCheck = [
    "src/proxy.ts",
    "src/app/api/admin/route.ts",
    "src/app/api/emma/waitlist-manage/route.ts",
  ];

  for (const routePath of routesToCheck) {
    const label = routePath.split("/").slice(-2).join("/");
    const src = fs.readFileSync(path.resolve(process.cwd(), routePath), "utf8");

    it(`${label}: uses .filter(Boolean) on admin email list`, () => {
      expect(src).toContain(".filter(Boolean)");
    });

    it(`${label}: checks adminEmails.length > 0 before granting access`, () => {
      expect(src).toContain("length > 0");
    });

    it(`${label}: splits on comma separator`, () => {
      expect(src).toContain('split(",")');
    });
  }
});
