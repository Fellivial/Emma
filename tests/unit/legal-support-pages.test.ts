import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("public legal and support pages", () => {
  const routes = [
    ["privacy", "src/app/privacy/page.tsx"],
    ["terms", "src/app/terms/page.tsx"],
    ["beta", "src/app/beta/page.tsx"],
    ["support", "src/app/support/page.tsx"],
    ["billing FAQ", "src/app/billing-faq/page.tsx"],
    ["known limitations", "src/app/known-limitations/page.tsx"],
  ] as const;
  const publicRouteHrefs = routes.map(([label]) =>
    `/${label === "billing FAQ" ? "billing-faq" : label.replace(" ", "-")}`
  );

  it("defines customer-facing routes for launch readiness documentation", () => {
    for (const [, path] of routes) {
      expect(existsSync(join(root, path)), `${path} should exist`).toBe(true);
    }
  });

  it("keeps footer navigation linked to real public pages", () => {
    const footer = read("src/components/landing/Footer.tsx");

    for (const href of publicRouteHrefs) {
      expect(footer).toContain(`href: "${href}"`);
    }
  });

  it("keeps legal and support documentation routes public in the auth proxy", () => {
    const proxy = read("src/proxy.ts");
    const publicPathsBlock = proxy.slice(
      proxy.indexOf("const publicPaths"),
      proxy.indexOf("] as const")
    );

    for (const href of publicRouteHrefs) {
      expect(publicPathsBlock).toContain(`"${href}"`);
    }

    expect(publicPathsBlock).toContain('"/login"');
    expect(publicPathsBlock).toContain('"/register"');
    expect(publicPathsBlock).toContain('"/waitlist"');
    expect(publicPathsBlock).toContain('"/api/emma/unsubscribe"');
  });

  it("includes legal-review and support-email configuration caveats", () => {
    const privacy = read("src/app/privacy/page.tsx");
    const terms = read("src/app/terms/page.tsx");
    const support = read("src/app/support/page.tsx");

    expect(privacy).toContain("reviewed by qualified counsel");
    expect(terms).toContain("reviewed by qualified counsel");
    expect(support).toContain("No dedicated support email is configured yet");
  });
});
