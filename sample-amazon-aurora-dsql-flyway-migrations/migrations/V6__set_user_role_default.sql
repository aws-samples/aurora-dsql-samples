-- V6__set_user_role_default.sql
-- Sixth migration: set the default value for the role column.
--
-- Future inserts that do not supply a role will now get 'member'. This
-- is run after V5's backfill, so no existing rows have NULL role.
--
-- Kept as a standalone DDL migration because DSQL does not allow DDL +
-- DML in the same transaction.

ALTER TABLE users ALTER COLUMN role SET DEFAULT 'member';
