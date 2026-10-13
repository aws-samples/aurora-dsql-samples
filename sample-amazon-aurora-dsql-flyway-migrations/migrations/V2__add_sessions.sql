-- V2__add_sessions.sql
-- Second migration: create the sessions table.
-- Note: application-level link to users.id (Aurora DSQL supports foreign
-- keys as of 2026, so you could also use REFERENCES users(id)).

CREATE TABLE IF NOT EXISTS sessions (
  id            UUID         PRIMARY KEY,
  user_id       UUID         NOT NULL,
  token_hash    VARCHAR(64)  NOT NULL,
  expires_at    TIMESTAMPTZ  NOT NULL,
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
