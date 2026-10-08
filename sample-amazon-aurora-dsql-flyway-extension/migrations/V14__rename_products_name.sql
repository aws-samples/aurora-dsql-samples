-- V14__rename_products_name.sql
-- Fourteenth migration: RENAME COLUMN.
--
-- Testing whether DSQL supports ALTER TABLE RENAME COLUMN.

ALTER TABLE products RENAME COLUMN name TO product_name;
