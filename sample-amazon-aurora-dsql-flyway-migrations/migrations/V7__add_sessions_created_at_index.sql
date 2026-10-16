-- V7__add_sessions_created_at_index.sql
-- Seventh migration: add a secondary index on sessions.created_at.
--
-- Purpose: give the OCC reproduction script a real piece of pending work
-- that both parallel Flyway runs will try to apply at the same time.
--
-- What the race actually does, which is not a clean recovery:
--   - Both runs reach this file with the index missing, and both issue
--     CREATE INDEX ASYNC IF NOT EXISTS.
--   - Whichever loses then has two ways to fail. It can conflict on the
--     INSERT of the "V7 applied" row into flyway_schema_history (SQLSTATE
--     23505 on the primary key, or 40001 from optimistic concurrency
--     control). Or, worse, IF NOT EXISTS makes Aurora DSQL skip the build
--     because the index now exists, no job_id comes back, and
--     awaitAsyncIndexes fails the migration with "no job_id was found in
--     its result".
--   - Neither retry layer fixes the second case. occMaxRetries re-runs the
--     transaction and gets the same missing job_id; the shell retry in
--     scripts/run-flyway.sh re-runs Flyway and hits the same thing. The
--     schema is left needing `flyway repair`, and if the index was left
--     INVALID it has to be dropped by hand first.
--
-- That is the whole point of the demonstration: serialize migration runs.
-- See limitation 2 in KNOWN_LIMITATIONS.md.
--
-- The index itself is a reasonable thing to want on a sessions table:
-- "most recently created sessions" is a common query.

CREATE INDEX ASYNC IF NOT EXISTS idx_sessions_created_at
  ON sessions (created_at);
