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
-- `IF NOT EXISTS` makes a re-run safe when a failed run left the index
-- behind: the module checks the existing index, passes if it is VALID and
-- waits if it is still building. An INVALID index has to be dropped first;
-- see limitation 3 in KNOWN_LIMITATIONS.md.

CREATE INDEX ASYNC IF NOT EXISTS idx_sessions_user_id
  ON sessions (user_id);
