-- V11__add_audit_log_with_fk.sql
-- Eleventh migration: new table with an INLINE FOREIGN KEY.
--
-- Aurora DSQL supports FOREIGN KEY declared inline on CREATE TABLE, which is
-- what this migration does.
--
-- ALTER TABLE ADD CONSTRAINT is not simply unsupported, which is what an
-- earlier version of this comment claimed. The rule is narrower, measured on
-- a us-east-1 cluster:
--
--   ALTER TABLE t ADD CONSTRAINT c FOREIGN KEY (col) REFERENCES p(id);
--     -> ERROR: unsupported ALTER TABLE ADD CONSTRAINT statement
--
--   ALTER TABLE t ADD CONSTRAINT c FOREIGN KEY (col) REFERENCES p(id) NOT VALID;
--     -> accepted
--
-- The same holds for CHECK (see V12). NOT VALID is accepted because it only
-- records the constraint and applies it to subsequent writes, where the
-- validating form would have to scan the existing table. UNIQUE is rejected
-- either way, since UNIQUE does not take NOT VALID.
--
-- So adding a constraint to an existing table is possible, with two caveats:
-- existing rows are never checked, and there is no `VALIDATE CONSTRAINT` to
-- check them later. Declaring it inline at CREATE TABLE time, as here, is
-- still the only way to get a constraint you know holds for every row.

CREATE TABLE IF NOT EXISTS audit_log (
  id         UUID         PRIMARY KEY,
  user_id    UUID         NOT NULL REFERENCES users(id),
  event_type VARCHAR(50)  NOT NULL,
  payload    TEXT,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
