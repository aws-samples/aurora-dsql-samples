-- V7__add_sessions_created_at_index.sql
-- Seventh migration: add a secondary index on sessions.created_at.
--
-- Purpose: give the OCC reproduction script a real piece of pending work
-- that both parallel Flyway runs will try to apply at the same time.
--
-- Why this migration is a safe race target:
--   - CREATE INDEX ASYNC IF NOT EXISTS is idempotent: whichever run gets
--     there first creates the index; the other run finds it already
--     present and moves on without error.
--   - The race, and the OCC conflict, happens at the next step: both
--     runs independently try to INSERT the "V7 applied" row into
--     flyway_schema_history. DSQL's optimistic concurrency control
--     lets one commit succeed and raises SQLSTATE 40001 on the other.
--     The retry loop in scripts/run-flyway.sh catches the failure,
--     waits, and reruns. On the second attempt the losing run finds
--     V7 already recorded and exits cleanly.
--
-- The index itself is a reasonable thing to want on a sessions table:
-- "most recently created sessions" is a common query.

CREATE INDEX ASYNC IF NOT EXISTS idx_sessions_created_at
  ON sessions (created_at);
