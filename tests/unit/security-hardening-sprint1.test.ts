import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PRODUCTION_REQUIRED_ENV } from "@/core/env-validation";

const agentSrc = readFileSync(resolve(process.cwd(), "src/app/api/emma/agent/route.ts"), "utf8");
const unsubSrc = readFileSync(
  resolve(process.cwd(), "src/app/api/emma/unsubscribe/route.ts"),
  "utf8"
);
const emmaSrc = readFileSync(resolve(process.cwd(), "src/app/api/emma/route.ts"), "utf8");
const schemaSrc = readFileSync(resolve(process.cwd(), "supabase/schema.sql"), "utf8");
const mcpSrc = readFileSync(resolve(process.cwd(), "src/core/integrations/mcp-client.ts"), "utf8");

// ── CRIT-01 ──────────────────────────────────────────────────────────────────

describe("CRIT-01: approval ownership isolation", () => {
  it("approve action filters by user_id (system exemption present)", () => {
    const approveBlock = agentSrc.slice(
      agentSrc.indexOf('case "approve"'),
      agentSrc.indexOf('case "reject"')
    );
    expect(approveBlock).toMatch(/\.or\(`user_id\.eq\.\$\{userId\},user_id\.eq\.system`\)/);
  });

  it("reject block filters by user_id (system exemption present)", () => {
    const rejectBlock = agentSrc.slice(
      agentSrc.indexOf('case "reject"'),
      agentSrc.indexOf('case "status"')
    );
    expect(rejectBlock).toMatch(/\.or\(`user_id\.eq\.\$\{userId\},user_id\.eq\.system`\)/);
  });

  it("does not use clientId-only ternary in approve block", () => {
    const approveBlock = agentSrc.slice(
      agentSrc.indexOf('case "approve"'),
      agentSrc.indexOf('case "reject"')
    );
    expect(approveBlock).not.toContain("clientId ? updateQuery.eq");
  });

  it("does not use clientId-only ternary in reject block", () => {
    const rejectBlock = agentSrc.slice(
      agentSrc.indexOf('case "reject"'),
      agentSrc.indexOf('case "status"')
    );
    expect(rejectBlock).not.toContain("clientId ? rejectQuery.eq");
    expect(rejectBlock).not.toContain("clientId ? rejectBase.eq");
  });
});

// ── CRIT-02 ──────────────────────────────────────────────────────────────────

describe("CRIT-02: SSRF protection in MCP transport (pre-existing, verified)", () => {
  it("mcp-client exports validateMcpUrl", () => {
    expect(mcpSrc).toContain("export async function validateMcpUrl");
  });

  it("postMcpJsonRpc calls validateMcpUrl before any outbound send", () => {
    const postFnBody = mcpSrc.slice(
      mcpSrc.indexOf("async function postMcpJsonRpc"),
      mcpSrc.indexOf("export async function listMcpTools")
    );
    const validateIdx = postFnBody.indexOf("validateMcpUrl");
    const sendIdx = postFnBody.indexOf("send(");
    expect(validateIdx).toBeGreaterThan(-1);
    expect(sendIdx).toBeGreaterThan(-1);
    expect(validateIdx).toBeLessThan(sendIdx);
  });

  it("listMcpTools delegates to postMcpJsonRpc (inherits SSRF protection)", () => {
    const listFnBody = mcpSrc.slice(mcpSrc.indexOf("export async function listMcpTools"));
    expect(listFnBody).toContain("postMcpJsonRpc");
  });
});

// ── CRIT-03 ──────────────────────────────────────────────────────────────────

describe("CRIT-03: unsubscribe HMAC does not fall back to encryption key", () => {
  it("does not reference EMMA_ENCRYPTION_KEY", () => {
    expect(unsubSrc).not.toContain("EMMA_ENCRYPTION_KEY");
  });

  it("reads only EMMA_UNSUBSCRIBE_SECRET for the HMAC key", () => {
    expect(unsubSrc).toContain("EMMA_UNSUBSCRIBE_SECRET");
  });
});

// ── HIGH-01 ──────────────────────────────────────────────────────────────────

describe("HIGH-01: per-user rate limit on POST /api/emma", () => {
  it("imports checkDistributedRateLimit", () => {
    expect(emmaSrc).toContain("checkDistributedRateLimit");
  });

  it("uses req:brain namespace", () => {
    expect(emmaSrc).toContain('"req:brain"');
  });
});

// ── HIGH-02 ──────────────────────────────────────────────────────────────────

describe("HIGH-02: per-user rate limit on POST /api/emma/agent", () => {
  it("imports checkDistributedRateLimit", () => {
    expect(agentSrc).toContain("checkDistributedRateLimit");
  });

  it("uses req:agent namespace", () => {
    expect(agentSrc).toContain('"req:agent"');
  });

  it("rate limit guard appears before runAgentLoop call", () => {
    const beforeLoop = agentSrc.slice(0, agentSrc.indexOf("runAgentLoop(task)"));
    expect(beforeLoop).toContain('"req:agent"');
  });
});

// ── HIGH-03 ──────────────────────────────────────────────────────────────────

describe("HIGH-03: audit_log INSERT policy is restrictive", () => {
  it("does not have 'with check (true)' on audit_log insert", () => {
    const auditBlock = schemaSrc.slice(
      schemaSrc.indexOf("-- Audit Log"),
      schemaSrc.indexOf("-- Referrals")
    );
    expect(auditBlock).not.toContain("with check (true)");
  });

  it("audit_log insert policy uses 'with check (false)'", () => {
    const auditBlock = schemaSrc.slice(
      schemaSrc.indexOf("-- Audit Log"),
      schemaSrc.indexOf("-- Referrals")
    );
    expect(auditBlock).toContain("with check (false)");
  });
});

// ── HIGH-04 ──────────────────────────────────────────────────────────────────

describe("HIGH-04: task detail approvals are user-scoped", () => {
  const taskDetailSrc = readFileSync(
    resolve(process.cwd(), "src/app/api/emma/tasks/[id]/route.ts"),
    "utf8"
  );

  it("approvals query includes user_id ownership filter", () => {
    expect(taskDetailSrc).toMatch(/\.or\(`user_id\.eq\.\$\{user\.id\},user_id\.eq\.system`\)/);
  });

  it("task ownership is verified before any sub-query (user_id anchor)", () => {
    // The .eq("user_id", user.id) on the tasks query must appear BEFORE the approvals query
    const taskQueryIdx = taskDetailSrc.indexOf('.eq("user_id", user.id)');
    const approvalsIdx = taskDetailSrc.indexOf('.from("approvals")');
    expect(taskQueryIdx).toBeGreaterThan(-1);
    expect(approvalsIdx).toBeGreaterThan(-1);
    expect(taskQueryIdx).toBeLessThan(approvalsIdx);
  });

  it("action_log and agent_task_summaries are NOT given user_id filter (no such column)", () => {
    const actionLogBlock = taskDetailSrc.slice(
      taskDetailSrc.indexOf('.from("action_log")'),
      taskDetailSrc.indexOf('.from("agent_task_summaries")')
    );
    expect(actionLogBlock).not.toContain("user_id");

    const summaryBlock = taskDetailSrc.slice(
      taskDetailSrc.indexOf('.from("agent_task_summaries")'),
      taskDetailSrc.indexOf('.from("approvals")')
    );
    expect(summaryBlock).not.toContain("user_id");
  });
});

// ── LB-01 ────────────────────────────────────────────────────────────────────

describe("LB-01: pattern_detections allows connection_expiry pattern type", () => {
  it("schema.sql constraint includes connection_expiry", () => {
    expect(schemaSrc).toContain("'connection_expiry'");
  });

  it("migration file exists and contains connection_expiry", () => {
    const migSrc = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260622000002_pattern_type_connection_expiry.sql"
      ),
      "utf8"
    );
    expect(migSrc).toContain("connection_expiry");
  });
});

// ── CRIT-01 + HIGH-05 ────────────────────────────────────────────────────────

describe("CRIT-01 + HIGH-05: production env validation covers Inngest and email", () => {
  it("INNGEST_SIGNING_KEY is in PRODUCTION_REQUIRED_ENV", () => {
    expect(PRODUCTION_REQUIRED_ENV).toContain("INNGEST_SIGNING_KEY");
  });

  it("RESEND_API_KEY is in PRODUCTION_REQUIRED_ENV", () => {
    expect(PRODUCTION_REQUIRED_ENV).toContain("RESEND_API_KEY");
  });

  it("EMAIL_FROM is in PRODUCTION_REQUIRED_ENV", () => {
    expect(PRODUCTION_REQUIRED_ENV).toContain("EMAIL_FROM");
  });
});

// ── CRIT-04 ──────────────────────────────────────────────────────────────────

describe("CRIT-04: instrumentation.ts exists and calls validateProductionEnvironment", () => {
  const instrSrc = readFileSync(resolve(process.cwd(), "src/instrumentation.ts"), "utf8");

  it("exports a register function", () => {
    expect(instrSrc).toContain("export async function register");
  });

  it("imports validateProductionEnvironment", () => {
    expect(instrSrc).toContain("validateProductionEnvironment");
  });

  it("throws when validation fails", () => {
    expect(instrSrc).toContain("throw new Error");
  });

  it("is a no-op outside production", () => {
    expect(instrSrc).toContain('process.env.NODE_ENV !== "production"');
    expect(instrSrc).toMatch(/NODE_ENV.*production.*return|return.*NODE_ENV.*production/s);
  });
});
