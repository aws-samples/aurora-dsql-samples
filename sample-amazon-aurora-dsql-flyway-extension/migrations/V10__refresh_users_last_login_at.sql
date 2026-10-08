-- V10__refresh_users_last_login_at.sql
-- Tenth migration: refresh users.last_login_at from current sessions.
--
-- Context (populated-table test):
--   V8 added users.last_login_at (nullable).
--   V9 ran a backfill, but at that point sessions was empty, so every
--     user got last_login_at = NULL.
--   This migration re-runs the backfill. By now sessions has ~200 rows
--     across ~50 users, so this UPDATE should actually touch rows.
--
-- The WHERE clause is intentionally defensive: skip users with no
-- sessions (keeps last_login_at NULL for them), only update rows where
-- the derived value differs from the current one.

UPDATE users u
   SET last_login_at = s.max_created_at
  FROM (
    SELECT user_id, MAX(created_at) AS max_created_at
      FROM sessions
     GROUP BY user_id
  ) s
 WHERE s.user_id = u.id
   AND (u.last_login_at IS DISTINCT FROM s.max_created_at);
