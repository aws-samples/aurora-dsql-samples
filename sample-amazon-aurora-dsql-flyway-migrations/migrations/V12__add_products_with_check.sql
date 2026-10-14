-- V12__add_products_with_check.sql
-- Twelfth migration: new table with INLINE CHECK constraints.
--
-- CHECK constraints follow the same pattern as PK and FK on Aurora DSQL:
-- declared inline at CREATE TABLE time, as below.
--
-- Adding one to an existing table needs NOT VALID. Measured on a us-east-1
-- cluster:
--
--   ALTER TABLE products ADD CONSTRAINT c CHECK (price_cents > 0);
--     -> ERROR: unsupported ALTER TABLE ADD CONSTRAINT statement
--
--   ALTER TABLE products ADD CONSTRAINT c CHECK (price_cents > 0) NOT VALID;
--     -> accepted, but existing rows are never checked
--
-- See V11 for the full rule, including why UNIQUE cannot be added this way.

CREATE TABLE IF NOT EXISTS products (
  id          UUID         PRIMARY KEY,
  sku         VARCHAR(40)  NOT NULL,
  name        VARCHAR(200) NOT NULL,
  price_cents INTEGER      NOT NULL CHECK (price_cents > 0),
  category    VARCHAR(50)  NOT NULL CHECK (category IN ('book','music','video','game')),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (sku)
);
