-- V8__add_users_last_login_at.sql
-- Eighth migration: add a last_login_at column to users.
--
-- DSQL rule reminder (same as V4): ADD COLUMN with inline constraint is
-- rejected. The column is added nullable here; V9 backfills it from the
-- sessions data.
--
-- The ALTER is a no-op data-wise: the new column is NULL for every existing
-- row until V9 runs.
--
-- Note on table contents: `make migrate` applies the migrations to an empty
-- schema, so users and sessions are empty here. The seed scripts
-- (scripts/seed-data.sh, scripts/bulk-seed-sessions.sh) are not part of the
-- migration path and are not run by `make migrate` or `make test`. Run them
-- by hand between migrations if you want to exercise these statements against
-- real rows.

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
