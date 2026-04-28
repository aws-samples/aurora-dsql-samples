-- Drop tables in reverse order (items before orders due to logical dependency)
BEGIN;
DROP TABLE IF EXISTS "order_items";
COMMIT;

BEGIN;
DROP TABLE IF EXISTS "orders";
COMMIT;
