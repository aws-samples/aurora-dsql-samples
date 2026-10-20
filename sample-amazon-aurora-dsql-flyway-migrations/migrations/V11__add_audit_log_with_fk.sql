-- V11__add_audit_log_with_fk.sql
-- Eleventh migration: new table with an INLINE FOREIGN KEY.
--
-- Aurora DSQL supports FOREIGN KEY declared inline on CREATE TABLE, which is
-- what this migration does.
--
-- Adding a foreign key to an EXISTING table is also possible, in two steps.
-- Measured on a us-east-1 cluster:
--
--   ALTER TABLE t ADD CONSTRAINT c FOREIGN KEY (col) REFERENCES p(id);
--     -> ERROR: unsupported ALTER TABLE ADD CONSTRAINT statement
--
--   ALTER TABLE t ADD CONSTRAINT c FOREIGN KEY (col) REFERENCES p(id) NOT VALID;
--     -> accepted, but existing rows are not checked yet
--
--   ALTER TABLE ASYNC t VALIDATE CONSTRAINT c;
--     -> accepted, returns a job_id; pg_constraint.convalidated becomes true
--        once sys.wait_for_job reports success
--
-- Note ALTER TABLE ASYNC, not plain ALTER TABLE: the plain form is rejected
-- with "unsupported ALTER TABLE VALIDATE CONSTRAINT statement". Validation
-- scans the table, so like an index build it runs as an async job, with the
-- same waiting problem described in limitation 3.
--
-- The same two steps work for CHECK (see V12). UNIQUE needs a different
-- route, also in V12.
--
-- Declaring the constraint inline at CREATE TABLE time, as below, is still
-- simpler when you are creating the table anyway: it is one statement and
-- there is no job to wait on.

CREATE TABLE IF NOT EXISTS audit_log (
  id         UUID         PRIMARY KEY,
  user_id    UUID         NOT NULL REFERENCES users(id),
  event_type VARCHAR(50)  NOT NULL,
  payload    TEXT,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
