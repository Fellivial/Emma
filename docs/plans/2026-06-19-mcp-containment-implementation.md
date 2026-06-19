# MCP Containment Implementation Plan

## 1. Establish regression tests

Add focused tests for feature-flag API gates, settings/navigation gating, URL
and DNS rejection, redirect validation, byte and discovery limits, and the
default-deny tool policy. Run the focused suite and confirm it fails before
production changes.

## 2. Add the server-only transport

Replace direct MCP `fetch` calls in `src/core/integrations/mcp-client.ts` with a
bounded HTTPS transport that validates URL syntax, DNS results, connection-time
addresses, redirects, payload size, timeout, and response size.

## 3. Enforce tool policy in the agent

Centralize the MCP allowlist policy. Treat missing, `null`, and empty lists as
deny-all. Register only explicitly allowed tools and retain dangerous risk
classification for every MCP tool.

## 4. Close configuration surfaces

Gate MCP APIs server-side while disabled. Hide settings navigation and make the
MCP settings route unavailable while disabled. Remove orphan
`src/app/api/emma/mcp/*` routes.

## 5. Mark legacy storage inert

Add a non-destructive Supabase migration comment for `user_mcp_servers` in the
new containment migration. Do not rewrite historical migrations or drop or
migrate legacy rows.

## 6. Verify

Run focused tests, `npm run lint`, `npm run test`, `npm run build`, and inspect
the final diff for accidental MCP enablement or unrelated changes.
