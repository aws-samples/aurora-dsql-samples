-- Migration initially generated using the following command:
--
--      npx prisma migrate diff
--          --from-empty
--          --to-schema prisma/veterinary-schema.prisma
--          --script
--          > prisma/migrations/0_init/migration.sql
--
-- Manual changes were made based on the considerations mentioned in the project README.md file.

-- CreateTable
BEGIN;
CREATE TABLE "owner" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(30) NOT NULL,
    "city" VARCHAR(80) NOT NULL,
    "telephone" VARCHAR(20),

    CONSTRAINT "owner_pkey" PRIMARY KEY ("id")
);
COMMIT;

-- CreateTable
BEGIN;
CREATE TABLE "pet" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(30) NOT NULL,
    "birthDate" DATE NOT NULL,
    "ownerId" UUID,

    CONSTRAINT "pet_pkey" PRIMARY KEY ("id")
);
COMMIT;

-- CreateTable
BEGIN;
CREATE TABLE "specialty" (
    "name" VARCHAR(80) NOT NULL,

    CONSTRAINT "specialty_pkey" PRIMARY KEY ("name")
);
COMMIT;

-- CreateTable
BEGIN;
CREATE TABLE "vet" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(30) NOT NULL,

    CONSTRAINT "vet_pkey" PRIMARY KEY ("id")
);
COMMIT;

-- CreateTable
BEGIN;
CREATE TABLE "_SpecialtyToVet" (
    "A" VARCHAR(80) NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_SpecialtyToVet_AB_pkey" PRIMARY KEY ("A","B")
);
COMMIT;

-- CreateIndex
BEGIN;
CREATE INDEX ASYNC "pet_ownerId_idx" ON "pet"("ownerId");
COMMIT;

-- CreateIndex
BEGIN;
CREATE INDEX ASYNC "_SpecialtyToVet_B_index" ON "_SpecialtyToVet"("B");
COMMIT;

