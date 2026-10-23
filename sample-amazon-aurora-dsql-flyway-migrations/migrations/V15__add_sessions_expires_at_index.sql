-- V15__add_sessions_expires_at_index.sql
-- Fifteenth migration: add a secondary index on sessions.expires_at.
--
-- With flyway.dsql.awaitAsyncIndexes=true, which this sample sets, this
-- migration does not complete when the async job is merely scheduled. The
-- module reads the job_id returned by CREATE INDEX ASYNC and blocks on
-- sys.wait_for_job until the build finishes, so V16 cannot start against an
-- index that is still building. No Java migration is needed for that.
--
-- With the setting off, which is the upstream default, the migration would
-- return as soon as the job was scheduled and queries would fall back to a
-- sequential scan until the index reached VALID.
--
-- Note on table contents: `make migrate` runs against an empty schema, so
-- sessions is empty here and the build is near-instant. To index a table with
-- real data, run scripts/seed-data.sh, then scripts/bulk-seed-sessions.sh,
-- before this migration. bulk-seed-sessions.sh derives its rows from the
-- users table, so on its own it inserts nothing. The seed scripts are not
-- part of the migration path.

-- No IF NOT EXISTS here, for the reason given in V3.

CREATE INDEX ASYNC idx_sessions_expires_at
  ON sessions (expires_at);
