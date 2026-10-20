-- V12__add_products_with_check.sql
-- Twelfth migration: new table with INLINE CHECK constraints.
--
-- CHECK constraints follow the same pattern as PK and FK on Aurora DSQL:
-- declared inline at CREATE TABLE time, as below.
--
-- Adding a CHECK to an existing table is the same two steps as V11:
--
--   ALTER TABLE products ADD CONSTRAINT c CHECK (price_cents > 0);
--     -> ERROR: unsupported ALTER TABLE ADD CONSTRAINT statement
--   ALTER TABLE products ADD CONSTRAINT c CHECK (price_cents > 0) NOT VALID;
--     -> accepted
--   ALTER TABLE ASYNC products VALIDATE CONSTRAINT c;
--     -> accepted, returns a job_id
--
-- UNIQUE takes a different route, because it does not accept NOT VALID.
-- Build the index first, wait for it, then attach it:
--
--   ALTER TABLE products ADD CONSTRAINT c_sku UNIQUE (sku);
--     -> ERROR: unsupported ALTER TABLE ADD CONSTRAINT statement
--   CREATE UNIQUE INDEX ASYNC idx_sku ON products (sku);
--     -> returns a job_id; wait for it with CALL sys.wait_for_job(...)
--   ALTER TABLE products ADD CONSTRAINT c_sku UNIQUE USING INDEX idx_sku;
--     -> accepted, and enforces: a duplicate INSERT then fails with 23505
--
-- The index must be VALID before you attach it. Attaching one that is still
-- building fails with "index <name> is not valid", which is a complaint about
-- the index state rather than the syntax, so give the job time to finish.

CREATE TABLE IF NOT EXISTS products (
  id          UUID         PRIMARY KEY,
  sku         VARCHAR(40)  NOT NULL,
  name        VARCHAR(200) NOT NULL,
  price_cents INTEGER      NOT NULL CHECK (price_cents > 0),
  category    VARCHAR(50)  NOT NULL CHECK (category IN ('book','music','video','game')),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (sku)
);
