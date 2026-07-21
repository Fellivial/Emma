import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getDatabaseResources } from "@/core/account-deletion/registry";

/**
 * MANDATORY REGRESSION — Phase 5F WP5 (Production Readiness Review finding
 * R-17). Regression prevention for the exact class of bug Phase 5E found
 * live (document_chunks/personas/push_subscriptions/proactive_daily missing
 * on a validation project) and this phase found statically (chat_messages
 * missing from schema.sql entirely): the Registry's 32 database resources
 * were never cross-checked against schema.sql at merge time, only
 * occasionally by ad-hoc live-validation phases with no guaranteed cadence.
 *
 * Static-only by design — no live database, no Supabase credentials. This
 * confirms schema.sql *claims* to define every table the Registry expects;
 * it cannot confirm any particular deployed database actually applied
 * schema.sql (that's WP4's job, and ADR-0005's own disclosed Open Question).
 */
describe("Registry / schema.sql drift prevention", () => {
  const schemaSql = readFileSync(join(process.cwd(), "supabase/schema.sql"), "utf-8");

  // Matches `create table if not exists [public.]<name> (` — case-insensitive,
  // tolerant of the two conventions this file actually uses (some tables are
  // schema-qualified, some aren't — see user_files/user_mcp_servers).
  const CREATE_TABLE_RE = /create table if not exists (?:public\.)?(\w+)/gi;

  function tablesDefinedInSchemaSql(): Set<string> {
    const tables = new Set<string>();
    for (const match of schemaSql.matchAll(CREATE_TABLE_RE)) {
      tables.add(match[1]);
    }
    return tables;
  }

  it("defines every Registry database table in schema.sql", () => {
    const schemaTables = tablesDefinedInSchemaSql();
    const registryTables = getDatabaseResources().map((r) => r.table);

    const missing = registryTables.filter((table) => !schemaTables.has(table));

    expect(
      missing,
      missing.length > 0
        ? `Registry references ${missing.length} table(s) with no "create table" statement in supabase/schema.sql: ${missing.join(", ")}. ` +
            `Either schema.sql is stale (a migration was never folded in — see user_files/user_mcp_servers/chat_messages for precedent) ` +
            `or the Registry references a table that doesn't exist. Confirm against the actual target database's ` +
            `information_schema.tables before assuming schema.sql alone is authoritative (see docs/runbooks/account-deletion-deployment.md).`
        : undefined
    ).toEqual([]);
  });

  it("sanity-checks the parser itself against known-good tables", () => {
    // Guards against the regex silently matching nothing (e.g. if schema.sql
    // is ever reformatted) and the test above passing vacuously.
    const schemaTables = tablesDefinedInSchemaSql();
    expect(schemaTables.size).toBeGreaterThan(30);
    expect(schemaTables.has("profiles")).toBe(true);
    expect(schemaTables.has("chat_messages")).toBe(true);
  });
});
