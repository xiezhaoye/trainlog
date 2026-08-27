ALTER TABLE users ADD COLUMN mcp_key_hash TEXT;
ALTER TABLE users ADD COLUMN mcp_key_created_at TEXT;
CREATE INDEX idx_users_mcp_key_hash ON users(mcp_key_hash);
