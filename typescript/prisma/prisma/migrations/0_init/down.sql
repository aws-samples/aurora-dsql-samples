-- Migration initially generated using the following command:
--
--      npx prisma migrate diff
--          --from-schema-datamodel prisma/veterinary-schema.prisma
--          --to-empty
--          --script
--          > prisma/migrations/0_init/down.sql
--
-- Manual changes were made based on the considerations mentioned in the project README.md file.

-- DropTable
BEGIN;
DROP TABLE IF EXISTS "owner";
COMMIT;

-- DropTable
BEGIN;
DROP TABLE IF EXISTS "pet";
COMMIT;

-- DropTable
BEGIN;
DROP TABLE IF EXISTS "specialty";
COMMIT;

-- DropTable
BEGIN;
DROP TABLE IF EXISTS "vet";
COMMIT;

-- DropTable
BEGIN;
DROP TABLE IF EXISTS "_SpecialtyToVet";
COMMIT;

BEGIN;
DROP TABLE IF EXISTS "_prisma_migrations";
COMMIT;