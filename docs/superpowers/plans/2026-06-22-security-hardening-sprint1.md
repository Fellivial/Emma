# Security Hardening Sprint 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix six security findings (CRIT-01, CRIT-02, CRIT-03, HIGH-01, HIGH-02, HIGH-03) identified in the 2026-06-22 security audit before any production traffic.

**Architecture:** Targeted surgical edits to four existing files plus one new Supabase migration. No new modules, no architectural changes. Each task is independently testable.

**Tech Stack:** Next.js 14 App Router (TypeScript), Supabase (RLS policies), @upstash/ratelimit (sliding window), Vitest (structural source-text tests).

## Global Constraints

- Minimal diffs — do not touch code outside the finding's scope
- No new npm packages
- No new database tables or columns
- No API contract changes (same request/response shapes)
- Production-safe — every change must be safe to deploy to a live instance
- Tests use the existing structural/source-text pattern (no Supabase mocks needed)
- Migration filename must sort after `20260619000003_legacy_chat_migration_ledger.sql`

---

## Pre-flight: create the branch

```bash
git checkout -b fix/p1-security-hardening
```

---

## Task 1: CRIT-01 — Prevent cross-tenant approval hijack

**Root cause:** `src/app/api/emma/agent/route.ts` filters the `approve` and `reject` approval
queries using **only** `client_id`. Any member of the same client can approve or reject another
member's approval. Scheduled tasks have `user_id = "system"`, so we cannot add a plain
`.eq("user_id", userId)` — the query must allow both the requesting user and `"system"`.

**Files:**

- Modify: `src/app/api/emma/agent/route.ts` (lines 124–136 and 243–259)
- Create: `tests/unit/security-hardening-sprint1.test.ts`

**Interfaces:**

- No change to request/response shape
- Supabase `.or()` syntax: `.or("user_id.eq.LITERAL,user_id.eq.system")` — column filter on the already-filtered query

- [ ] **Step 1: Write the failing structural test**

Create `tests/unit/security-hardening-sprint1.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run tests/unit/security-hardening-sprint1.test.ts
```

Expected: CRIT-01 × 4, CRIT-03 × 1, HIGH-01 × 1, HIGH-02 × 2, HIGH-03 × 1 fail. CRIT-02 passes (already fixed).

- [ ] **Step 3: Fix the approve action (lines 124–136 in agent/route.ts)**

In `src/app/api/emma/agent/route.ts`, replace the `approve` query block:

```typescript
// OLD (lines 124–136):
const updateQuery = supabase
  .from("approvals")
  .update({
    status: "approved",
    decided_by: userId,
    decided_at: new Date().toISOString(),
  })
  .eq("id", body.approvalId)
  .eq("status", "pending")
  .select("*, action_log(*), tasks(*, step_transcript)");
const { data: approval } = await (
  clientId ? updateQuery.eq("client_id", clientId) : updateQuery.eq("user_id", userId)
).single();
```

Replace with:

```typescript
// Atomic claim: update status='approved' WHERE pending and owned by this user.
// system exemption: scheduled tasks carry user_id="system" but a valid client_id;
// allow those through the client_id + or() path.
let updateQuery = supabase
  .from("approvals")
  .update({
    status: "approved",
    decided_by: userId,
    decided_at: new Date().toISOString(),
  })
  .eq("id", body.approvalId)
  .eq("status", "pending")
  .select("*, action_log(*), tasks(*, step_transcript)");
if (clientId) {
  updateQuery = updateQuery.eq("client_id", clientId).or(`user_id.eq.${userId},user_id.eq.system`);
} else {
  updateQuery = updateQuery.eq("user_id", userId);
}
const { data: approval } = await updateQuery.single();
```

- [ ] **Step 4: Fix the reject fetch + update (lines 243–259 in agent/route.ts)**

Replace the two reject queries:

```typescript
// OLD (lines 243–259):
const rejectQuery = supabase
  .from("approvals")
  .select("action_log_id, task_id")
  .eq("id", body.approvalId);
const { data: approval } = await (
  clientId ? rejectQuery.eq("client_id", clientId) : rejectQuery.eq("user_id", userId)
).single();

const rejectBase = supabase
  .from("approvals")
  .update({
    status: "rejected",
    decided_by: userId,
    decided_at: new Date().toISOString(),
  })
  .eq("id", body.approvalId);
await (clientId ? rejectBase.eq("client_id", clientId) : rejectBase.eq("user_id", userId));
```

Replace with:

```typescript
// Fetch the approval to get downstream IDs — scoped to owning user within tenant.
let rejectFetch = supabase
  .from("approvals")
  .select("action_log_id, task_id")
  .eq("id", body.approvalId);
if (clientId) {
  rejectFetch = rejectFetch.eq("client_id", clientId).or(`user_id.eq.${userId},user_id.eq.system`);
} else {
  rejectFetch = rejectFetch.eq("user_id", userId);
}
const { data: approval } = await rejectFetch.single();

let rejectUpdate = supabase
  .from("approvals")
  .update({
    status: "rejected",
    decided_by: userId,
    decided_at: new Date().toISOString(),
  })
  .eq("id", body.approvalId);
if (clientId) {
  rejectUpdate = rejectUpdate
    .eq("client_id", clientId)
    .or(`user_id.eq.${userId},user_id.eq.system`);
} else {
  rejectUpdate = rejectUpdate.eq("user_id", userId);
}
await rejectUpdate;
```

- [ ] **Step 5: Run CRIT-01 tests**

```bash
npx vitest run tests/unit/security-hardening-sprint1.test.ts --reporter=verbose 2>&1 | grep -A1 "CRIT-01"
```

Expected: 4 CRIT-01 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/emma/agent/route.ts tests/unit/security-hardening-sprint1.test.ts
git commit -m "security: CRIT-01 — scope approvals to owning user within tenant"
```

---

## Task 2: CRIT-02 — Verify SSRF protection is already in place

**Finding:** `listMcpTools` → `postMcpJsonRpc` → `validateMcpUrl` (already validates URL before
outbound request). The `mcp-containment.test.ts` suite already covers this. No code change needed.

- [ ] **Step 1: Run existing MCP containment tests**

```bash
npx vitest run tests/unit/mcp-containment.test.ts --reporter=verbose
```

Expected: ALL 12 tests pass (private IPs, loopback, IPv6, metadata, redirect following, oversized).

- [ ] **Step 2: Confirm CRIT-02 block passes in the new test file**

```bash
npx vitest run tests/unit/security-hardening-sprint1.test.ts --reporter=verbose 2>&1 | grep -A4 "CRIT-02"
```

Expected: 3 CRIT-02 tests pass.

- [ ] **Step 3: Commit the test**

```bash
git add tests/unit/security-hardening-sprint1.test.ts
git commit -m "security: CRIT-02 — verify SSRF protection pre-existing in MCP transport layer"
```

---

## Task 3: CRIT-03 — Remove unsubscribe HMAC encryption-key fallback

**Root cause:** `src/app/api/emma/unsubscribe/route.ts` line 35:
`const key = process.env.EMMA_UNSUBSCRIBE_SECRET ?? process.env.EMMA_ENCRYPTION_KEY;`
The unsubscribe route is a public path. The `if (!key)` block at lines 36–44 already returns
500 when the key is absent — the fallback just silently bypasses it.

**Files:**

- Modify: `src/app/api/emma/unsubscribe/route.ts` (line 35 only)

- [ ] **Step 1: Apply the one-line fix**

In `src/app/api/emma/unsubscribe/route.ts`, replace line 35:

```typescript
// OLD:
const key = process.env.EMMA_UNSUBSCRIBE_SECRET ?? process.env.EMMA_ENCRYPTION_KEY;

// NEW:
const key = process.env.EMMA_UNSUBSCRIBE_SECRET;
```

The existing `if (!key)` handler already returns 500 with "The server is not configured correctly."

- [ ] **Step 2: Run CRIT-03 tests**

```bash
npx vitest run tests/unit/security-hardening-sprint1.test.ts --reporter=verbose 2>&1 | grep -A3 "CRIT-03"
```

Expected: 2 CRIT-03 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/emma/unsubscribe/route.ts
git commit -m "security: CRIT-03 — require EMMA_UNSUBSCRIBE_SECRET, remove encryption key fallback"
```

---

## Task 4: HIGH-01 — Per-user rate limit on POST /api/emma

**Root cause:** No per-request frequency limit. Cost gate enforces 5-hour window budgets,
not short-burst limits. `checkDistributedRateLimit` exists in `src/lib/ratelimit.ts` with
Upstash sliding window. Cost-gate namespaces: `"chat"`, `"agent"`, etc. New namespace: `"req:brain"`.

**Files:**

- Modify: `src/app/api/emma/route.ts`

- [ ] **Step 1: Add the import**

In `src/app/api/emma/route.ts`, add to the existing import block (alongside line ~24):

```typescript
import { checkDistributedRateLimit } from "@/lib/ratelimit";
```

- [ ] **Step 2: Add the rate limit guard after sessionUserId is set**

After `sessionUserId = sessionUser.id;` (around line 117) and before `const body = (await req.json())`, add:

```typescript
// Per-user sliding-window guard: 20 requests / 60 s.
// checkDistributedRateLimit throws in production when Upstash is unconfigured (fail-closed).
if (sessionUserId) {
  const rl = await checkDistributedRateLimit({
    key: sessionUserId,
    namespace: "req:brain",
    limit: 20,
    windowSeconds: 60,
  });
  if (!rl.allowed) {
    return Response.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
        },
      }
    );
  }
}
```

The block must appear **inside** the outer `try { ... }` of `POST`, after `sessionUserId = sessionUser.id;` is set, and before `const body = (await req.json()) as EmmaApiRequest;`.

- [ ] **Step 3: Run HIGH-01 tests**

```bash
npx vitest run tests/unit/security-hardening-sprint1.test.ts --reporter=verbose 2>&1 | grep -A3 "HIGH-01"
```

Expected: 2 HIGH-01 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/emma/route.ts
git commit -m "security: HIGH-01 — per-user sliding-window rate limit on POST /api/emma (20 req/60s)"
```

---

## Task 5: HIGH-02 — Per-user rate limit on POST /api/emma/agent

**Root cause:** Each `create` action spawns `runAgentLoop` synchronously (up to 5 LLM calls).
No per-user request-frequency limit. Same infrastructure as HIGH-01. Namespace: `"req:agent"`.

**Files:**

- Modify: `src/app/api/emma/agent/route.ts`

- [ ] **Step 1: Add the import**

In `src/app/api/emma/agent/route.ts`, add to the existing import block:

```typescript
import { checkDistributedRateLimit } from "@/lib/ratelimit";
```

- [ ] **Step 2: Add the rate limit guard inside case "create"**

Inside `case "create":`, after the `if (!access.allowed)` early return (around line 58),
add before `const cost = await enforceCostGate(...)`:

```typescript
// Per-user guard: 5 creates / 60 s (each create may run up to 5 LLM calls).
const agentRl = await checkDistributedRateLimit({
  key: userId,
  namespace: "req:agent",
  limit: 5,
  windowSeconds: 60,
});
if (!agentRl.allowed) {
  return NextResponse.json(
    { error: "Too many agent requests. Please try again later." },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil((agentRl.resetAt - Date.now()) / 1000)),
      },
    }
  );
}
```

- [ ] **Step 3: Run HIGH-02 tests**

```bash
npx vitest run tests/unit/security-hardening-sprint1.test.ts --reporter=verbose 2>&1 | grep -A4 "HIGH-02"
```

Expected: 3 HIGH-02 tests pass (import, namespace, placement before runAgentLoop).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/emma/agent/route.ts
git commit -m "security: HIGH-02 — per-user sliding-window rate limit on agent creates (5 req/60s)"
```

---

## Task 6: HIGH-03 — Restrict audit_log INSERT policy

**Root cause:** `supabase/schema.sql` line 686: `with check (true)` on `audit_log` INSERT lets
any authenticated session insert rows with any `user_id`. All legitimate writes use `service_role`
(bypasses RLS). Setting `with check (false)` blocks only authenticated-role inserts.

**Files:**

- Create: `supabase/migrations/20260622000001_restrict_audit_log_insert.sql`
- Modify: `supabase/schema.sql` (line 686 only)

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/20260622000001_restrict_audit_log_insert.sql`:

```sql
-- HIGH-03: restrict audit_log INSERT to service_role only.
--
-- All legitimate audit writes use the service_role client (src/core/security/audit.ts).
-- service_role bypasses RLS entirely — this change has zero effect on production audit logging.
--
-- Before: any authenticated session could insert rows with arbitrary user_id values.
-- After:  only service_role inserts are permitted.

drop policy if exists "Service inserts audit" on public.audit_log;
create policy "Service inserts audit" on public.audit_log
  for insert
  with check (false);
```

- [ ] **Step 2: Update schema.sql to match**

In `supabase/schema.sql` line 686, change:

```sql
-- OLD:
create policy "Service inserts audit" on public.audit_log for insert with check (true);

-- NEW:
create policy "Service inserts audit" on public.audit_log for insert with check (false);
```

- [ ] **Step 3: Run HIGH-03 tests**

```bash
npx vitest run tests/unit/security-hardening-sprint1.test.ts --reporter=verbose 2>&1 | grep -A3 "HIGH-03"
```

Expected: 2 HIGH-03 tests pass.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260622000001_restrict_audit_log_insert.sql supabase/schema.sql
git commit -m "security: HIGH-03 — restrict audit_log INSERT to service_role (revoke from authenticated)"
```

---

## Task 7: Full verification

- [ ] **Step 1: Run all new security tests**

```bash
npx vitest run tests/unit/security-hardening-sprint1.test.ts --reporter=verbose
```

Expected: ALL 16 tests pass across 6 findings.

- [ ] **Step 2: Run full test suite**

```bash
npm test
```

Expected: All existing tests pass.

- [ ] **Step 3: Typecheck**

```bash
npm run build 2>&1 | tail -20
```

Expected: Zero type errors.

- [ ] **Step 4: Lint**

```bash
npm run lint
```

Expected: No new lint errors.

---

## Self-Review

| Finding                           | Task   | Coverage                                              |
| --------------------------------- | ------ | ----------------------------------------------------- |
| CRIT-01 cross-tenant approval     | Task 1 | 4 structural tests                                    |
| CRIT-02 SSRF MCP URL              | Task 2 | 3 structural tests (pre-existing protection verified) |
| CRIT-03 unsubscribe HMAC fallback | Task 3 | 2 structural tests                                    |
| HIGH-01 brain route rate limit    | Task 4 | 2 structural tests                                    |
| HIGH-02 agent route rate limit    | Task 5 | 3 structural tests                                    |
| HIGH-03 audit_log INSERT policy   | Task 6 | 2 structural tests                                    |
| Typecheck                         | Task 7 | `npm run build`                                       |
| Lint                              | Task 7 | `npm run lint`                                        |
| Full regression                   | Task 7 | `npm test`                                            |
