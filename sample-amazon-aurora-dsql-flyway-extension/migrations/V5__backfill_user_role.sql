-- V5__backfill_user_role.sql
-- Fifth migration: backfill existing users with the default role.
--
-- Separated from V4 (ADD COLUMN) because DSQL does not allow DDL and
-- DML in the same transaction. The users table is empty in this POC,
-- but the pattern mirrors what a real production backfill would look
-- like.

UPDATE users SET role = 'member' WHERE role IS NULL;
