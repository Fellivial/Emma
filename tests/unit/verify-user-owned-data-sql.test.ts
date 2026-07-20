import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/20260720000001_verify_user_owned_data_deleted.sql"
);
const SCHEMA_PATH = resolve(process.cwd(), "supabase/schema.sql");

const migration = readFileSync(MIGRATION_PATH, "utf8");
const schema = readFileSync(SCHEMA_PATH, "utf8");

function extractFunctionBody(sql: string): string {
  const start = sql.search(/create or replace function public\.verify_user_owned_data_deleted/i);
  const grantIndex = sql
    .slice(start)
    .search(/grant execute on function public\.verify_user_owned_data_deleted/i);
  if (start === -1 || grantIndex === -1) {
    throw new Error("verify_user_owned_data_deleted definition not found");
  }
  return sql.slice(start, start + grantIndex).toLowerCase();
}

// Same tolerance rationale as transactional-deletion-sql.test.ts: the
// migration and schema.sql only need to agree on content, not incidental
// whitespace (CRLF vs LF, formatter-added trailing spaces).
function normalizeWhitespace(text: string): string {
  return text
    .split(/\r\n|\r|\n/)
    .map((line) => line.replace(/\s+$/, ""))
    .join("\n")
    .trim();
}

describe("verify_user_owned_data_deleted SQL — regression locks (Phase 5B, not yet called by any application code)", () => {
  it("migration and schema.sql define the identical function (case-insensitive)", () => {
    expect(normalizeWhitespace(extractFunctionBody(migration))).toBe(
      normalizeWhitespace(extractFunctionBody(schema))
    );
  });

  it("casts p_user_id to match each column's actual type instead of assuming uuid", () => {
    // Same discipline as delete_user_owned_data_ordered — mirrors, not
    // reuses, the identical type-casting fix Phase 2.1's live validation
    // found necessary (TDD §3.5).
    const body = extractFunctionBody(migration);
    expect(body).toContain("information_schema.columns");
    expect(body).toContain("p_user_id::text");
  });

  it("qualifies the column-type lookup so it can't collide with the RETURNS TABLE(table_name...) variable", () => {
    const body = extractFunctionBody(migration);
    expect(body).toMatch(/\bc\.table_name\b/);
  });

  it("validates table/column identifiers before using them in dynamic SQL", () => {
    const body = extractFunctionBody(migration);
    expect(body).toContain("^[a-za-z_][a-za-z0-9_]*$");
  });

  it("binds p_user_id via USING, never string-concatenates it into the query", () => {
    const body = extractFunctionBody(migration);
    const executeCalls = body.match(/execute format\([^;]*;/g) ?? [];
    expect(executeCalls.length).toBeGreaterThan(0);
    for (const call of executeCalls) {
      expect(call).toMatch(/using\s+p_user_id/);
    }
  });

  it("restricts EXECUTE to service_role only", () => {
    const body = migration.toLowerCase();
    expect(body).toContain("revoke all on function public.verify_user_owned_data_deleted");
    expect(body).toContain("from public, anon, authenticated");
    expect(body).toContain("grant execute on function public.verify_user_owned_data_deleted");
    expect(body).toContain("to service_role");
  });

  it("is SECURITY DEFINER with search_path locked down", () => {
    const body = migration.toLowerCase();
    expect(body).toContain("security definer");
    expect(body).toContain("set search_path = ''");
  });

  it("is read-only — contains no DELETE, UPDATE, or INSERT statement anywhere in the function body", () => {
    // The whole point of this function is that it never mutates data (TDD
    // §2.4: "Mutates data: No — read-only"). A verification function that
    // could write would defeat the "re-verify, don't trust" design goal.
    const body = extractFunctionBody(migration);
    expect(body).not.toMatch(/\bdelete\s+from\b/);
    expect(body).not.toMatch(/\bupdate\s+public\./);
    expect(body).not.toMatch(/\binsert\s+into\b/);
    expect(body).toContain("select count(*)");
  });

  it("catches a per-table failure without aborting the whole call (unlike the delete function)", () => {
    // TDD §3.5's deliberate divergence from delete_user_owned_data_ordered:
    // the per-table BEGIN/EXCEPTION block must sit inside the loop, not
    // wrap the malformed-identifier check (which stays a whole-call abort).
    const body = extractFunctionBody(migration);
    const exceptionBlocks = body.match(/exception when others then/g) ?? [];
    expect(exceptionBlocks.length).toBe(1);
    expect(body).toContain("checked := false");
    expect(body).toContain("error_detail := sqlerrm");
  });

  it("aborts the whole call on a malformed identifier (matches the delete function's behaviour)", () => {
    const body = extractFunctionBody(migration);
    const malformedCheckIndex = body.indexOf("invalid table identifier");
    const firstBeginIndex = body.indexOf("\n    begin");
    expect(malformedCheckIndex).toBeGreaterThan(-1);
    expect(firstBeginIndex).toBeGreaterThan(-1);
    // The malformed-identifier RAISE EXCEPTION must appear before the
    // per-table BEGIN block that catches everything else.
    expect(malformedCheckIndex).toBeLessThan(firstBeginIndex);
  });
});
