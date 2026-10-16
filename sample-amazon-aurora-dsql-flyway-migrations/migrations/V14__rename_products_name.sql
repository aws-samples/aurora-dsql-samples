-- V14__rename_products_name.sql
-- Fourteenth migration: RENAME COLUMN.
--
-- Aurora DSQL supports ALTER TABLE RENAME COLUMN.
--
-- Note there is no IF EXISTS form for RENAME COLUMN, so unlike most
-- migrations here this one is not re-runnable: a second attempt fails with
-- "column \"name\" does not exist". That is the normal situation for renames
-- and the reason a rename belongs in a file of its own.

ALTER TABLE products RENAME COLUMN name TO product_name;
