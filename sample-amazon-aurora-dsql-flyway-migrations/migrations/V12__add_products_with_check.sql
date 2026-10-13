-- V12__add_products_with_check.sql
-- Twelfth migration: new table with INLINE CHECK constraints.
--
-- CHECK constraints follow the same pattern as PK and FK on DSQL:
-- supported INLINE at CREATE TABLE time, not via ALTER TABLE ADD CONSTRAINT.

CREATE TABLE IF NOT EXISTS products (
  id          UUID         PRIMARY KEY,
  sku         VARCHAR(40)  NOT NULL,
  name        VARCHAR(200) NOT NULL,
  price_cents INTEGER      NOT NULL CHECK (price_cents > 0),
  category    VARCHAR(50)  NOT NULL CHECK (category IN ('book','music','video','game')),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (sku)
);
