# MCP Containment Design

## Decision

`client_integrations` is the sole MCP runtime configuration model. The
`user_mcp_servers` table and `/api/emma/mcp/*` routes are legacy and must not
participate in discovery or execution.

MCP remains disabled unless `ENABLE_MCP_TOOLS` is exactly `true`. While it is
disabled, users cannot configure, discover, or execute MCP tools.

## Runtime Boundary

All outbound MCP traffic goes through one server-only transport. It accepts
HTTPS URLs only, resolves DNS before connecting, rejects non-public addresses,
pins connection-time DNS lookup to validated public addresses, handles a small
number of redirects manually, and validates every destination.

Cross-origin redirects are rejected so bearer credentials cannot be forwarded
to another host. Redirects that do not preserve the POST body are rejected.

## Resource Limits

- Request payload: bounded before network I/O.
- Request deadline: bounded across the entire redirect chain.
- Redirect count: bounded.
- Response body: streamed with a byte limit; `Content-Length` is checked early.
- Discovery result: bounded tool count and bounded metadata size.
- Tool output: bounded before it is returned to the agent context.

## Tool Policy

MCP uses default deny. A missing, `null`, or empty allowlist exposes no tools.
Only exact tool names in a non-empty allowlist may be registered. Unknown tools
are blocked. Every MCP tool remains classified as dangerous; this sprint does
not implement a production approval workflow. Tool execution remains hard-
blocked even if the feature flag is manually enabled and a caller fabricates an
approval-shaped object.

## Configuration and UI

The settings page and navigation entry are hidden while MCP is disabled. Every
MCP API endpoint independently checks the server-side feature flag. The UI is
not a security boundary.

Configuration remains client-scoped in `client_integrations`. Browser code may
not create new MCP configuration while the feature is disabled. RLS blocks
authenticated direct writes to `mcp_*` rows; future configuration must use a
gated server route with service-role access.

## Legacy Data

The orphan `user_mcp_servers` routes are removed. Its table is retained without
runtime consumers pending a production data audit. A non-destructive migration
comment records that status; no rows are migrated or deleted automatically.

## Non-goals

- Enabling MCP
- Adding integrations or user-visible MCP functionality
- Implementing the final per-action approval workflow
- Claiming MCP is production-safe
