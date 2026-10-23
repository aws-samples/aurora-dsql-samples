-- V10__refresh_users_last_login_at.sql
-- Tenth migration: refresh users.last_login_at from current sessions.
--
-- This is the backfill pattern to copy, as opposed to V9.
--
-- Two differences, both of which matter on Aurora DSQL:
--   - It joins against an aggregate rather than running a correlated
--     subquery per row.
--   - `IS DISTINCT FROM` means only rows whose value actually changes are
--     modified. Unchanged rows cost nothing against the 3,000 modified rows
--     per transaction cap, and re-running the migration modifies nothing.
--     V9, with no WHERE at all, rewrites every row every time.
--
-- Note on table contents: `make migrate` runs against an empty schema, so
-- both users and sessions are empty here and this UPDATE touches zero rows.
-- The seed scripts are not part of the migration path. To see it do real
-- work, run scripts/seed-data.sh after V9 and before this migration
-- (migrate -target=9, seed, then migrate). Seeding earlier does nothing
-- visible here, because V9 already sets the same values.

UPDATE users u
   SET last_login_at = s.max_created_at
  FROM (
    SELECT user_id, MAX(created_at) AS max_created_at
      FROM sessions
     GROUP BY user_id
  ) s
 WHERE s.user_id = u.id
   AND (u.last_login_at IS DISTINCT FROM s.max_created_at);
