-- V13__drop_sessions_revoked_at.sql
-- Thirteenth migration: DROP COLUMN sessions.revoked_at.
--
-- Aurora DSQL supports ALTER TABLE DROP COLUMN. Some other ALTER TABLE
-- operations are restricted (see V11 on ADD CONSTRAINT), but this one behaves
-- as it does on PostgreSQL.
--
-- Why drop revoked_at: pretend we moved revocation to a separate table.
-- This is a destructive change for anything that queried the column, so
-- in a real codebase, deployment ordering matters (app code must stop
-- reading the column before this migration runs).

ALTER TABLE sessions DROP COLUMN IF EXISTS revoked_at;
