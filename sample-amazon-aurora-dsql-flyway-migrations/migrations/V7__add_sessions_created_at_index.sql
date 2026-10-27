-- V7__add_sessions_created_at_index.sql
-- Seventh migration: add a secondary index on sessions.created_at.
--
-- Purpose: give the OCC reproduction script a real piece of pending work
-- that both parallel Flyway runs will try to apply at the same time.
--
-- What the race actually does, which is not a clean recovery. Both runs reach
-- this file with the index missing and both issue CREATE INDEX ASYNC. The
-- loser fails on the INSERT of the "V7 applied" row into
-- flyway_schema_history, with SQLSTATE 23505 on the primary key or 40001 from
-- optimistic concurrency control, or on the index statement itself with 42P07
-- because the winner created it first.
--
-- No retry layer fixes this. occMaxRetries re-runs the transaction into the
-- same conflict, and the shell retry in scripts/run-flyway.sh re-runs Flyway
-- into the same state. Recovery is manual. See limitation 2 and limitation 3
-- in KNOWN_LIMITATIONS.md.
--
-- That is the whole point of the demonstration: serialize migration runs.
--
-- No IF NOT EXISTS here, for the reason given in V3.
--
-- The index itself is a reasonable thing to want on a sessions table:
-- "most recently created sessions" is a common query.

CREATE INDEX ASYNC idx_sessions_created_at
  ON sessions (created_at);
