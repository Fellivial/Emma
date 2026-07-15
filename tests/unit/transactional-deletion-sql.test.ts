import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/20260716000001_transactional_deletion.sql"
);
const SCHEMA_PATH = resolve(process.cwd(), "supabase/schema.sql");

const migration = readFileSync(MIGRATION_PATH, "utf8");
const schema = readFileSync(SCHEMA_PATH, "utf8");

function extractFunctionBody(sql: string): string {
  const start = sql.search(/create or replace function public\.delete_user_owned_data_ordered/i);
  const grantIndex = sql
    .slice(start)
    .search(/grant execute on function public\.delete_user_owned_data_ordered/i);
  if (start === -1 || grantIndex === -1) {
    throw new Error("delete_user_owned_data_ordered definition not found");
  }
  return sql.slice(start, start + grantIndex).toLowerCase();
}

// Tolerates trailing whitespace / line-ending differences (CRLF vs LF,
// formatter-added trailing spaces) — the migration and schema.sql only need
// to agree on content, not on incidental whitespace.
function normalizeWhitespace(text: string): string {
  return text
    .split(/\r\n|\r|\n/)
    .map((line) => line.replace(/\s+$/, ""))
    .join("\n")
    .trim();
}

describe("delete_user_owned_data_ordered SQL — regression locks", () => {
  it("migration and schema.sql define the identical function (case-insensitive)", () => {
    // gdpr/route.ts's behavior depends on the deployed (migration) function;
    // schema.sql is the cumulative reference other environments bootstrap
    // from. A future edit to only one of them is a silent drift bug — this
    // test is the automated version of the manual diff this file's own
    // hardening work relied on.
    expect(normalizeWhitespace(extractFunctionBody(migration))).toBe(
      normalizeWhitespace(extractFunctionBody(schema))
    );
  });

  it("casts p_user_id to match each column's actual type instead of assuming uuid", () => {
    // Regression lock for the Phase 2.1 live-database finding: 4 of the 32
    // registry tables (audit_log, usage_windows, user_files,
    // user_mcp_servers) have a text-typed ownership column, not uuid.
    // Without this, the function fails with "operator does not exist: text
    // = uuid" on any of them — a failure mode no mocked unit test can catch,
    // since it depends on real Postgres type-checking.
    const body = extractFunctionBody(migration);
    expect(body).toContain("information_schema.columns");
    expect(body).toContain("p_user_id::text");
  });

  it("qualifies the column-type lookup so it can't collide with the RETURNS TABLE(table_name...) variable", () => {
    // Regression lock for the second Phase 2.1 finding: this function's own
    // RETURNS TABLE(table_name text, ...) makes "table_name" a plpgsql
    // variable in scope everywhere in the function body, so a later query
    // against information_schema.columns (which also has a table_name
    // column) must qualify it with a table alias or the call fails with
    // "column reference \"table_name\" is ambiguous".
    const body = extractFunctionBody(migration);
    expect(body).toMatch(/\bc\.table_name\b/);
  });

  it("the affiliate cascade resolves its ownership column dynamically, not hardcoded to user_id", () => {
    // Regression lock for the Task 1 hardening fix: the affiliates ->
    // affiliate_referrals cascade must use the same validated v_column
    // every other table's delete uses, not a hardcoded "where user_id = ...".
    const body = extractFunctionBody(migration);
    const affiliatesBlock = body.slice(
      body.indexOf("if v_table = 'affiliates'"),
      body.indexOf("if v_table = 'affiliates'") + 800
    );
    expect(affiliatesBlock).not.toMatch(/where\s+user_id\s*=\s*p_user_id/);
    expect(affiliatesBlock).toContain("%i");
  });

  it("validates table/column identifiers before using them in dynamic SQL", () => {
    const body = extractFunctionBody(migration);
    expect(body).toContain("^[a-za-z_][a-za-z0-9_]*$");
  });

  it("binds p_user_id via USING, never string-concatenates it into the query", () => {
    const body = extractFunctionBody(migration);
    // Every EXECUTE ... format(...) in this function must be paired with a
    // USING clause; format() only ever receives identifiers (%i), not the
    // value itself.
    const executeCalls = body.match(/execute format\([^;]*;/g) ?? [];
    expect(executeCalls.length).toBeGreaterThan(0);
    for (const call of executeCalls) {
      expect(call).toMatch(/using\s+p_user_id/);
    }
  });

  it("restricts EXECUTE to service_role only", () => {
    const body = migration.toLowerCase();
    expect(body).toContain("revoke all on function public.delete_user_owned_data_ordered");
    expect(body).toContain("from public, anon, authenticated");
    expect(body).toContain("grant execute on function public.delete_user_owned_data_ordered");
    expect(body).toContain("to service_role");
  });

  it("is SECURITY DEFINER with search_path locked down", () => {
    const body = migration.toLowerCase();
    expect(body).toContain("security definer");
    expect(body).toContain("set search_path = ''");
  });
});
