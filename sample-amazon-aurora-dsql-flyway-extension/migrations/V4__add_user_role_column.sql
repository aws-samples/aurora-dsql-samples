-- V4__add_user_role_column.sql
-- Fourth migration: add the `role` column to the users table.
--
-- DSQL rules at play here:
--   1. ALTER TABLE ADD COLUMN cannot carry inline constraints like
--      NOT NULL or DEFAULT (SQLSTATE 0A000). Add the column plain here
--      and set the default separately in V6.
--   2. DSQL does NOT allow DDL and DML in the same transaction. Keep
--      this file to a single ALTER statement; put the UPDATE backfill
--      in its own migration (V5).
--
-- Rule of thumb for Flyway + DSQL migrations: one logical change per
-- file, and never mix DDL and DML. This keeps each statement in its own
-- transaction and makes failures easy to recover from.

ALTER TABLE users ADD COLUMN role VARCHAR(30);
