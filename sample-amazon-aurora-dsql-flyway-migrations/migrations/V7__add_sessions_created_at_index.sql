-- V7__add_sessions_created_at_index.sql
-- Seventh migration: add a secondary index on sessions.created_at.
--
-- Purpose: give the OCC reproduction script a real piece of pending work
-- that both parallel Flyway runs will try to apply at the same time.
--
-- What the race does. Both runs can reach this file with the index missing
-- and both issue CREATE INDEX ASYNC IF NOT EXISTS. If the first one has
-- committed, the second finds the index and uses it, waiting only if it is
-- still building. If not, the second starts its own build and fails at commit
-- with 40001 (OC001, schema changed by another transaction); the module
-- retries it, and the retry finds the index. The loser then often fails on
-- the INSERT of the "V7 applied" row into flyway_schema_history, with
-- SQLSTATE 23505 on the primary key.
--
-- The shell retry in scripts/run-flyway.sh re-runs Flyway after a 23505,
-- which usually lets the run finish, but not always. Either way both runs
-- executed this migration. See limitation 2 in KNOWN_LIMITATIONS.md.
--
-- That is the whole point of the demonstration: serialize migration runs.
--
-- IF NOT EXISTS for the reason given in V3.
--
-- The index itself is a reasonable thing to want on a sessions table:
-- "most recently created sessions" is a common query.

CREATE INDEX ASYNC IF NOT EXISTS idx_sessions_created_at
  ON sessions (created_at);
