-- V8__add_users_last_login_at.sql
-- Eighth migration: add a last_login_at column to users.
--
-- DSQL rule reminder (same as V4): ADD COLUMN with inline constraint is
-- rejected. The column is added nullable here; V9 backfills it from the
-- sessions data.
--
-- This migration is the first in the POC that runs AGAINST A POPULATED
-- TABLE. V1-V7 ran against an empty schema, so the extension is now being
-- exercised in a more realistic situation (DSQL applies the ALTER against
-- existing rows). The ALTER itself is a no-op data-wise -- the new column
-- is simply NULL for every existing row until V9 runs.

ALTER TABLE users ADD COLUMN last_login_at TIMESTAMPTZ;
