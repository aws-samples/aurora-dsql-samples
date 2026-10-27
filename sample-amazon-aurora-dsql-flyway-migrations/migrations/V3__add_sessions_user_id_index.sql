-- V3__add_sessions_user_id_index.sql
-- Third migration: add a secondary index to the sessions table.
--
-- Aurora DSQL has no synchronous index creation. `CREATE INDEX ASYNC` returns
-- a `job_id` row immediately and the build runs in the background, so the
-- index is not usable the moment the statement returns.
--
-- The module handles the wait. With flyway.dsql.awaitAsyncIndexes=true, which
-- this sample sets, it reads the returned job_id and blocks on
-- sys.wait_for_job until the build finishes, so this migration does not
-- complete until the index is VALID. You do not need a Java migration for
-- this, and you do not need to call sys.wait_for_job yourself. Calling it
-- inside a migration would in fact fail, because Aurora DSQL rejects
-- `CALL sys.wait_for_job` inside a transaction block.
--
-- Deliberately NOT `IF NOT EXISTS`, which is the opposite of the advice for
-- every other migration here. `IF NOT EXISTS` makes Aurora DSQL skip the build
-- when the index already exists, and a skipped build returns no job_id, so the
-- module fails the migration with nothing to wait on. That failure is not
-- recoverable by re-running: the index survives, so every retry skips again.
--
-- Without it, a re-run fails immediately and legibly with 42P07, "relation
-- already exists", which tells you to drop the index. See limitation 3 in
-- KNOWN_LIMITATIONS.md for the recovery procedure.

CREATE INDEX ASYNC idx_sessions_user_id
  ON sessions (user_id);
