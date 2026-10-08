-- V11__add_audit_log_with_fk.sql
-- Eleventh migration: new table with an INLINE FOREIGN KEY.
--
-- DSQL supports FOREIGN KEY constraints when declared inline on CREATE TABLE.
-- (ALTER TABLE ADD CONSTRAINT is still unsupported, so we must declare the
-- FK at table-creation time, same pattern as the PRIMARY KEY in the Flyway
-- schema-history override.)
--
-- Blog claim this test validates: "DSQL supports FKs" is accurate when
-- the FK is defined at CREATE TABLE time.

CREATE TABLE IF NOT EXISTS audit_log (
  id         UUID         PRIMARY KEY,
  user_id    UUID         NOT NULL REFERENCES users(id),
  event_type VARCHAR(50)  NOT NULL,
  payload    TEXT,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
