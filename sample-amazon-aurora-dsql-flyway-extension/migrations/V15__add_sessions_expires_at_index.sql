-- V15__add_sessions_expires_at_index.sql
-- Fifteenth migration: add a secondary index on sessions.expires_at.
--
-- Context (big-table test): sessions has ~42K rows at the time this runs,
-- so CREATE INDEX ASYNC actually has work to do. The migration itself
-- returns as soon as the async job is scheduled (DSQL returns a job_id
-- row and the migration completes). The index continues building in the
-- background; applications querying sessions.expires_at would use a
-- sequential scan until the index reaches VALID state.
--
-- Production pattern: capture the returned job_id and poll
-- `CALL sys.wait_for_job(<literal>)` from a Java-based Flyway migration
-- (BaseJavaMigration), so the pipeline doesn't move to V16 until the
-- index is actually usable. The blog documents this pattern separately.

CREATE INDEX ASYNC IF NOT EXISTS idx_sessions_expires_at
  ON sessions (expires_at);
