-- Drop tables in reverse order (items before orders due to logical dependency)
DROP TABLE IF EXISTS "order_items";
DROP TABLE IF EXISTS "orders";
