-- user_files: tracks files uploaded to Anthropic Files API on behalf of a user.
-- file_id is the Anthropic-assigned identifier used to reference the file in messages.
CREATE TABLE IF NOT EXISTS user_files (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT        NOT NULL,
  file_id    TEXT        NOT NULL,
  name       TEXT        NOT NULL,
  media_type TEXT        NOT NULL,
  size_bytes BIGINT      NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, file_id)
);

CREATE INDEX IF NOT EXISTS idx_user_files_user_id ON user_files (user_id);

ALTER TABLE user_files ENABLE ROW LEVEL SECURITY;
