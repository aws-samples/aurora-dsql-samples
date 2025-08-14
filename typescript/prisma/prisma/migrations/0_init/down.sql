-- npx prisma migrate diff --from-schema-datamodel prisma/veterinary-schema.prisma --to-empty --script > prisma/migrations/0_init/down.sql

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