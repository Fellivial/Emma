import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

// ── Source-level structural tests for the waitlist gate added to proxy.ts ──
// We test logic by reading the source text (like middleware-intake.test.ts does)
// because proxy.ts pulls in @supabase/ssr which is not available in the Node
// test environment without a full mock tree.

const proxySrc = fs.readFileSync(path.resolve(process.cwd(), "src/proxy.ts"), "utf8");

describe("proxy.ts — waitlist gate structure", () => {
  it("contains a waitlist gate block", () => {
    expect(proxySrc).toContain("Waitlist gate");
  });

  it("gates on app_metadata.waitlist_approved", () => {
    expect(proxySrc).toContain("waitlist_approved");
    expect(proxySrc).toContain("app_metadata");
  });

  it("redirects unapproved users to /waitlist (not /login)", () => {
    // The redirect for unapproved authenticated users must go to /waitlist
    expect(proxySrc).toContain('pathname = "/waitlist"');
  });

  it("admins bypass the waitlist gate (EMMA_ADMIN_EMAILS check present)", () => {
    expect(proxySrc).toContain("EMMA_ADMIN_EMAILS");
    expect(proxySrc).toContain("isAdmin");
  });

  it("waitlist gate only fires for non-API, non-public routes (isApi guard present)", () => {
    // The gate must check !isApi so API routes are not caught in the redirect loop
    const gateBlock = proxySrc.slice(
      proxySrc.indexOf("Waitlist gate"),
      proxySrc.indexOf("Waitlist gate") + 700
    );
    expect(gateBlock).toContain("!isApi");
    expect(gateBlock).toContain("!isPublic");
  });

  it("waitlist page itself is in publicPaths (no infinite redirect)", () => {
    expect(proxySrc).toContain('"/waitlist"');
    // It must appear inside publicPaths array
    const publicPathsBlock = proxySrc.slice(
      proxySrc.indexOf("publicPaths"),
      proxySrc.indexOf("isPublic")
    );
    expect(publicPathsBlock).toContain('"/waitlist"');
  });
});

// ── Register page — plan param forwarding ───────────────────────────────────

describe("register/page.tsx — plan param forwarding", () => {
  const registerSrc = fs.readFileSync(
    path.resolve(process.cwd(), "src/app/register/page.tsx"),
    "utf8"
  );

  it("accepts a plan search param", () => {
    expect(registerSrc).toContain("plan");
    expect(registerSrc).toContain("searchParams");
  });

  it("redirects to /waitlist when no plan is given", () => {
    expect(registerSrc).toContain('"/waitlist"');
  });

  it("forwards plan param to /waitlist?plan=... when present", () => {
    expect(registerSrc).toContain("plan=");
    expect(registerSrc).toContain("/waitlist");
  });

  it("no longer redirects to /landing#waitlist", () => {
    expect(registerSrc).not.toContain("/landing#waitlist");
  });
});
