-- V3__add_sessions_user_id_index.sql
-- Third migration: add a secondary index to the sessions table.
--
-- Aurora DSQL creates secondary indexes asynchronously. `CREATE INDEX ASYNC`
-- returns a `job_id` row immediately; the index build then runs in the
-- background. You can poll completion with `CALL sys.wait_for_job(<job_id>)`.
--
-- DSQL + Flyway nuance (why we don't wait here):
--   DSQL does NOT accept a subquery as a CALL argument. In a plain SQL
--   migration, there's no portable way to capture the `job_id` emitted by
--   CREATE INDEX ASYNC and pass it as a literal to sys.wait_for_job in
--   the same script. Attempting:
--
--     CALL sys.wait_for_job((SELECT job_id FROM sys.jobs ...));
--
--   fails with SQLSTATE 0A000: "cannot use subquery in CALL argument".
--
-- Options when you need the wait semantics:
--   1. The sessions table is empty at this point in the migration pipeline,
--      so the index build completes in milliseconds. Skipping the explicit
--      wait is safe here.
--   2. In production, when adding an index to a populated table, use a
--      Java-based Flyway migration (BaseJavaMigration). From Java you can
--      executeQuery("CREATE INDEX ASYNC ...") -> read job_id from the
--      ResultSet -> execute("CALL sys.wait_for_job('<literal>')").
--      This is the production-grade pattern the blog documents.

CREATE INDEX ASYNC IF NOT EXISTS idx_sessions_user_id
  ON sessions (user_id);
