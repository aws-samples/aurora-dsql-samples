-- DropTable
BEGIN;
DROP TABLE IF EXISTS "order_items";
COMMIT;

-- DropTable
BEGIN;
DROP TABLE IF EXISTS "orders";
COMMIT;

BEGIN;
DROP TABLE IF EXISTS "_prisma_migrations";
COMMIT;
