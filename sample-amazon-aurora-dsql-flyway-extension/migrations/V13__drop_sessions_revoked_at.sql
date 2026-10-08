-- V13__drop_sessions_revoked_at.sql
-- Thirteenth migration: DROP COLUMN sessions.revoked_at.
--
-- Testing whether DSQL supports ALTER TABLE DROP COLUMN. On vanilla
-- PostgreSQL this is routine; on DSQL some ALTER TABLE operations are
-- restricted. If this fails, document in the blog as a known limitation
-- and recommend creating a new table + copying data as the workaround.
--
-- Why drop revoked_at: pretend we moved revocation to a separate table.
-- This is a destructive change for anything that queried the column, so
-- in a real codebase, deployment ordering matters (app code must stop
-- reading the column before this migration runs).

ALTER TABLE sessions DROP COLUMN revoked_at;
