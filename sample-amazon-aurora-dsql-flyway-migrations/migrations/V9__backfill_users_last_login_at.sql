-- V9__backfill_users_last_login_at.sql
-- Ninth migration: backfill users.last_login_at from the most recent
-- sessions.created_at for each user.
--
-- This is a real backfill: it touches every row in users that has at least
-- one session. Correlated subquery form; DSQL supports this.
--
-- The migration is intentionally separate from V8 (ADD COLUMN) because DSQL
-- rejects any transaction that mixes DDL and DML. V8 is DDL, V9 is DML.

UPDATE users
   SET last_login_at = (
     SELECT MAX(created_at)
       FROM sessions
      WHERE sessions.user_id = users.id
   );
