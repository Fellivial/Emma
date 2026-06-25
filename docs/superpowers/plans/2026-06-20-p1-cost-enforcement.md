# P1 Cost Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every paid or potentially expensive Emma operation passes shared identity, plan-budget, distributed-rate, and usage-result enforcement before reaching a provider or expensive worker.

**Architecture:** Add one server-only cost gate that resolves user/client plan ownership, checks the existing five-hour budget, enforces operation-specific distributed request caps, and emits structured attempt/result logs. Paid routes and background workers call the gate immediately before expensive work; production blocks when metering or distributed rate infrastructure is unavailable, while development/test use bounded in-memory counters.

**Tech Stack:** Next.js route handlers, TypeScript, Supabase usage windows, Upstash Redis rate limiting, Vitest.

## Global Constraints

- Do not add product features or change pricing plan entitlements.
- Do not touch MCP code or configuration.
- Do not weaken any existing usage limit.
- Production metering and distributed-rate failures must never fail open.
- Provider payloads, API keys, and user content must not appear in cost logs.

---

### Task 1: Central cost gate and failure policy

**Files:**
- Create: `src/core/cost-gate.ts`
- Modify: `src/core/usage-enforcer.ts`
- Modify: `src/lib/ratelimit.ts`
- Test: `tests/unit/cost-enforcement.test.ts`

**Interfaces:**
- Produces: `enforceCostGate({ operation, userId, clientId?, planId? })` returning an allow/block decision and resolved identity.
- Produces: `recordCostResult(decision, { inputTokens?, outputTokens?, units?, success })`.
- Produces: operation-specific limits for chat, agent, vision, emotion, summarize, memory, STT, TTS, OCR, embeddings, document ingest, and background work.

- [ ] **Step 1: Write failing tests** for budget blocking, production failure closure, missing-Upstash production closure, bounded development fallback, and structured result recording.
- [ ] **Step 2: Run `npx vitest run tests/unit/cost-enforcement.test.ts`** and confirm failures are caused by the missing shared gate.
- [ ] **Step 3: Implement the central gate** with dependency seams for tests, shared plan resolution, existing usage-window checks, cached per-operation Upstash limiters, development/test in-memory limits, and sanitized JSON logs.
- [ ] **Step 4: Make `checkUsage` production-safe**: missing credentials or query/RPC errors block paid work in production and remain usable in development/test.
- [ ] **Step 5: Re-run the focused test** and confirm it passes.

### Task 2: Interactive paid routes

**Files:**
- Modify: `src/app/api/emma/route.ts`
- Modify: `src/app/api/emma/agent/route.ts`
- Modify: `src/app/api/emma/vision/route.ts`
- Modify: `src/app/api/emma/emotion/route.ts`
- Modify: `src/app/api/emma/summarize/route.ts`
- Modify: `src/app/api/emma/memory/route.ts`
- Modify: `src/app/api/emma/history/route.ts`
- Modify: `src/app/api/emma/persona/route.ts`
- Modify: `src/app/api/emma/stt/route.ts`
- Modify: `src/app/api/emma/tts/route.ts`

**Interfaces:**
- Consumes: `enforceCostGate`, `costGateResponse`, and `recordCostResult` from Task 1.
- Produces: no provider request before an allowed decision; actual provider usage recorded where available and conservative units elsewhere.

- [ ] **Step 1: Add source-regression assertions** listing every interactive provider surface and requiring a cost-gate call.
- [ ] **Step 2: Run the focused test** and confirm it fails on currently unmetered routes.
- [ ] **Step 3: Gate each route immediately before provider access**, preserve existing auth/plan gates, return 429 for quota/rate exhaustion and 503 for unavailable production enforcement, and record success/failure results.
- [ ] **Step 4: Re-run focused route and enforcement tests**.

### Task 3: Background, autonomous, OCR, embedding, and ingest paths

**Files:**
- Modify: `src/core/agent-loop.ts`
- Modify: `src/core/pattern-detector.ts`
- Modify: `src/core/task-summarizer.ts`
- Modify: `src/core/tool-registry.ts`
- Modify: `src/app/api/emma/cron/reflection/route.ts`
- Modify: `src/app/api/emma/cron/scheduled-tasks/route.ts`
- Modify: `src/app/api/emma/ingest/document/route.ts`
- Modify: `src/app/api/emma/ingest/whatsapp/route.ts`
- Modify: `src/inngest/functions.ts`
- Modify: `src/lib/embeddings.ts`
- Modify: `src/core/integrations/ocr.ts`

**Interfaces:**
- Consumes: the Task 1 gate with user/client identity propagated through jobs and agent tasks.
- Produces: per-provider-call agent enforcement and per-stage document/OCR/embedding enforcement, including durable Inngest execution.

- [ ] **Step 1: Add failing regression tests** for autonomous/background and document-worker coverage.
- [ ] **Step 2: Run the focused test** and confirm the background bypass is detected.
- [ ] **Step 3: Thread cost identity through background entry points** and gate each OpenRouter, embedding, OCR, and TTS execution before work starts.
- [ ] **Step 4: Remove fail-open embedding behavior in production** while preserving safe no-embedding degradation only when the gate explicitly permits and the provider itself fails.
- [ ] **Step 5: Re-run focused tests**.

### Task 4: Cost safety documentation and production configuration

**Files:**
- Create: `docs/reference-cost-safety.md`
- Modify: `docs/reference-env-vars.md`
- Modify: `src/core/env-validation.ts`
- Modify: `tests/unit/env-validation.test.ts`

**Interfaces:**
- Documents every metered operation, status behavior, and required Upstash variables.
- Makes missing Upstash configuration a production validation error or equivalent hard cost-gate block.

- [ ] **Step 1: Add failing production-env tests** for missing Upstash credentials.
- [ ] **Step 2: Implement production validation and documentation** without changing plan pricing or entitlements.
- [ ] **Step 3: Run `npx vitest run tests/unit/env-validation.test.ts tests/unit/cost-enforcement.test.ts`**.

### Task 5: Full verification and handoff

**Files:**
- Review all files changed by Tasks 1-4.

- [ ] **Step 1: Run `npm run lint`.**
- [ ] **Step 2: Run `npm run test`.**
- [ ] **Step 3: Run `npm run build`.**
- [ ] **Step 4: Run `git diff --check`.**
- [ ] **Step 5: Run `git status --short --branch` and inspect the complete diff for accidental MCP or pricing changes.**
- [ ] **Step 6: Report the paid-surface audit, enforcement behavior, validation evidence, remaining risks, and commit recommendation.**

### Task 6: Release-blocker accounting hardening

**Files:**
- Modify: `src/core/usage-enforcer.ts`
- Modify: `src/core/cost-gate.ts`
- Modify: `src/app/api/emma/route.ts`
- Modify: `src/app/api/emma/persona/route.ts`
- Modify: `src/core/tool-registry.ts`
- Test: `tests/unit/usage-enforcer.test.ts`
- Test: `tests/unit/cost-enforcement.test.ts`

**Interfaces:**
- `recordUsage(...)` returns an explicit persistence result and accepts an explicit message increment.
- `enforceCostGate(...)` performs a zero-unit write probe before provider work and returns 503 when it fails.
- `recordCostResult(...)` returns persistence success/failure; a failed result makes the identity unhealthy until a later write probe succeeds.

- [ ] **Step 1: Add failing tests** for Supabase RPC errors and unavailable persistence.
- [ ] **Step 2: Implement explicit persistence results** without logging user content or secrets.
- [ ] **Step 3: Add failing gate tests** for pre-call write probes and post-call unhealthy lockout.
- [ ] **Step 4: Implement gate preflight and reconciliation health state.**
- [ ] **Step 5: Add route and OCR regressions** for persona status propagation, stream failure recording, and one OCR boundary.
- [ ] **Step 6: Implement the route and OCR fixes, update cost-safety documentation, and run the full validation bundle.**
