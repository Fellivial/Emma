import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// ── Structural tests for the cron auth hardening (localhost bypass removed) ──
// All three cron routes had the same change: replace host-header localhost check
// with NODE_ENV !== "development". Verified via source text to avoid needing
// full Supabase mock trees.

const cronRoutes = [
  "src/app/api/emma/cron/approvals-expiry/route.ts",
  "src/app/api/emma/cron/email-sequences/route.ts",
  "src/app/api/emma/cron/scheduled-tasks/route.ts",
  "src/app/api/emma/cron/pattern-detection/route.ts",
  "src/app/api/emma/cron/leads-cleanup/route.ts",
];

describe("cron routes — NODE_ENV auth guard (replaces localhost bypass)", () => {
  for (const routePath of cronRoutes) {
    const src = fs.readFileSync(path.resolve(process.cwd(), routePath), "utf8");
    const label = routePath.split("/").slice(-2, -1)[0]; // e.g. "approvals-expiry"

    it(`${label}: uses NODE_ENV !== 'development' guard (not localhost header)`, () => {
      expect(src).toContain(`NODE_ENV !== "development"`);
    });

    it(`${label}: no longer uses isLocalhost host-header bypass`, () => {
      expect(src).not.toContain("isLocalhost");
      expect(src).not.toContain('includes("localhost")');
      expect(src).not.toContain('includes("127.0.0.1")');
    });

    it(`${label}: still requires Bearer token when not in development`, () => {
      expect(src).toContain("CRON_SECRET");
      expect(src).toContain("Bearer");
      expect(src).toContain("Unauthorized");
    });
  }
});

// ── auth/callback — waitlist gate structural checks ───────────────────────

describe("auth/callback/route.ts — waitlist gate", () => {
  const src = fs.readFileSync(
    path.resolve(process.cwd(), "src/app/auth/callback/route.ts"),
    "utf8"
  );

  it("checks app_metadata.waitlist_approved before allowing sign-in", () => {
    expect(src).toContain("waitlist_approved");
    expect(src).toContain("app_metadata");
  });

  it("signs the user out and redirects to /waitlist?blocked=1 if not approved", () => {
    expect(src).toContain("signOut");
    expect(src).toContain("/waitlist?blocked=1");
  });

  it("stamps waitlist_approved=true after first valid sign-in", () => {
    expect(src).toContain("updateUserById");
    expect(src).toContain("waitlist_approved: true");
  });

  it("accepts users with status=converted (no valid invite needed)", () => {
    expect(src).toContain('"converted"');
    expect(src).toContain("isApproved");
  });

  it("accepts users with an unexpired invite (inviteValid check present)", () => {
    expect(src).toContain("inviteValid");
    expect(src).toContain("invite_expires_at");
  });

  it("rejects users whose invite has expired", () => {
    // Confirmed by: new Date(entry.invite_expires_at) > new Date()
    expect(src).toContain("new Date(entry.invite_expires_at)");
    expect(src).toContain("new Date()");
  });
});

// ── waitlist-manage — stamps waitlist_approved on invite ─────────────────

describe("waitlist-manage/route.ts — stamps waitlist_approved on invite dispatch", () => {
  const src = fs.readFileSync(
    path.resolve(process.cwd(), "src/app/api/emma/waitlist-manage/route.ts"),
    "utf8"
  );

  it("calls updateUserById with waitlist_approved:true when generating invite link", () => {
    expect(src).toContain("updateUserById");
    expect(src).toContain("waitlist_approved: true");
  });

  it("only stamps when linkData.user.id is present (null-safe guard)", () => {
    expect(src).toContain("linkData?.user?.id");
  });
});

// ── waitlist/route.ts — stamps waitlist_approved for immediate access ──────

describe("waitlist/route.ts — stamps waitlist_approved for immediate access", () => {
  const src = fs.readFileSync(path.resolve(process.cwd(), "src/app/api/waitlist/route.ts"), "utf8");

  it("calls updateUserById with waitlist_approved:true when spot is available", () => {
    expect(src).toContain("updateUserById");
    expect(src).toContain("waitlist_approved: true");
  });

  it("only stamps when linkData.user.id is present (null-safe guard)", () => {
    expect(src).toContain("linkData?.user?.id");
  });
});
