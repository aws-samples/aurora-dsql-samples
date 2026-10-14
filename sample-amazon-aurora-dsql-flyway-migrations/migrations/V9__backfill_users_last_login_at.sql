-- V9__backfill_users_last_login_at.sql
-- Ninth migration: backfill users.last_login_at from the most recent
-- sessions.created_at for each user.
--
-- Correlated subquery form; Aurora DSQL supports this.
--
-- The migration is intentionally separate from V8 (ADD COLUMN) because DSQL
-- rejects any transaction that mixes DDL and DML. V8 is DDL, V9 is DML.
--
-- Read the statement carefully, because it is not what a backfill should look
-- like. There is no WHERE clause, so it modifies EVERY row in users, setting
-- last_login_at to NULL for users with no sessions. Two consequences:
--
--   1. Rows that did not need changing are still rewritten, which counts
--      against the 3,000 modified rows per transaction cap. On a users table
--      with more than 3,000 rows this migration fails outright.
--   2. It is not idempotent in any useful sense; it just recomputes the same
--      values.
--
-- V10 is the version to copy. It joins against an aggregate and adds
-- `IS DISTINCT FROM`, so it only touches rows whose value actually changes.
-- This one is kept as the contrasting example, and because a real backfill
-- over a large table has to be batched outside Flyway anyway. See
-- limitation 6 in KNOWN_LIMITATIONS.md.

UPDATE users
   SET last_login_at = (
     SELECT MAX(created_at)
       FROM sessions
      WHERE sessions.user_id = users.id
   );
