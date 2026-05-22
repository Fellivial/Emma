-- user_mcp_servers: stores user-configured remote MCP server endpoints.
-- auth_token is AES-256-GCM encrypted at the application layer.
CREATE TABLE IF NOT EXISTS user_mcp_servers (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT        NOT NULL,
  name         TEXT        NOT NULL,
  url          TEXT        NOT NULL,
  auth_token   TEXT,                          -- encrypted; NULL = no auth
  allowed_tools TEXT[]     NOT NULL DEFAULT '{}',
  blocked_tools TEXT[]     NOT NULL DEFAULT '{}',
  enabled      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, url)
);

CREATE INDEX IF NOT EXISTS user_mcp_servers_user_id_idx ON user_mcp_servers(user_id);

ALTER TABLE user_mcp_servers ENABLE ROW LEVEL SECURITY;
