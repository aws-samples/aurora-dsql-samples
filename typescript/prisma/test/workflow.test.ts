/**
 * Workflow tests for the Prisma DSQL tooling.
 *
 * These tests verify the recommended workflow:
 * 1. Validate schema for DSQL compatibility
 * 2. Transform Prisma migration output for DSQL
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { validateSchema } from "../helpers/cli/validate";
import { transformMigration } from "../helpers/cli/transform";

describe("Prisma DSQL Workflow", () => {
    let tempDir: string;

    beforeAll(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "prisma-workflow-"));
    });

    afterAll(() => {
        fs.rmSync(tempDir, { recursive: true });
    });

    function createTempSchema(content: string): string {
        const schemaPath = path.join(tempDir, `schema-${Date.now()}.prisma`);
        fs.writeFileSync(schemaPath, content);
        return schemaPath;
    }

    describe("valid schema workflow", () => {
        const validSchema = `
datasource db {
  provider     = "postgresql"
  url          = env("DATABASE_URL")
  relationMode = "prisma"
}

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["driverAdapters"]
}

model Owner {
  id    String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name  String @db.VarChar(30)
  city  String @db.VarChar(80)
  pets  Pet[]
}

model Pet {
  id      String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name    String  @db.VarChar(30)
  ownerId String? @db.Uuid
  owner   Owner?  @relation(fields: [ownerId], references: [id])

  @@index([ownerId])
}
`;

        // Simulated Prisma migrate diff output for the schema above
        const prismaMigrationOutput = `-- CreateTable
CREATE TABLE "Owner" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(30) NOT NULL,
    "city" VARCHAR(80) NOT NULL,

    CONSTRAINT "Owner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pet" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(30) NOT NULL,
    "ownerId" UUID,

    CONSTRAINT "Pet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Pet_ownerId_idx" ON "Pet"("ownerId");

-- AddForeignKey
ALTER TABLE "Pet" ADD CONSTRAINT "Pet_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
`;

        test("step 1: schema passes validation", async () => {
            const schemaPath = createTempSchema(validSchema);
            const result = await validateSchema(schemaPath);

            expect(result.valid).toBe(true);
            expect(
                result.issues.filter((i) => i.type === "error"),
            ).toHaveLength(0);
        });

        test("step 2: migration transforms correctly", () => {
            const result = transformMigration(prismaMigrationOutput);

            // Verify transformations applied
            expect(result.stats.statementsProcessed).toBe(3); // 2 tables + 1 index
            expect(result.stats.indexesConverted).toBe(1);
            expect(result.stats.foreignKeysRemoved).toBe(1);

            // Verify output structure
            expect(result.sql).toContain("BEGIN;");
            expect(result.sql).toContain("COMMIT;");
            expect(result.sql).toContain("CREATE INDEX ASYNC");
            expect(result.sql).not.toContain("FOREIGN KEY");

            // Verify warning about FK removal
            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.warnings[0]).toContain("relationMode");
        });

        test("full workflow produces valid DSQL migration", async () => {
            // Step 1: Validate
            const schemaPath = createTempSchema(validSchema);
            const validationResult = await validateSchema(schemaPath);
            expect(validationResult.valid).toBe(true);

            // Step 2: Transform (simulating prisma migrate diff output)
            const transformResult = transformMigration(prismaMigrationOutput);

            // Verify final output is DSQL-compatible
            const output = transformResult.sql;

            // Each DDL should be in its own transaction
            const beginCount = (output.match(/BEGIN;/g) || []).length;
            const commitCount = (output.match(/COMMIT;/g) || []).length;
            expect(beginCount).toBe(3);
            expect(commitCount).toBe(3);

            // No foreign keys
            expect(output).not.toContain("FOREIGN KEY");
            expect(output).not.toContain("REFERENCES");

            // Indexes are async
            expect(output).toContain("CREATE INDEX ASYNC");
            expect(output).not.toMatch(/CREATE\s+INDEX\s+"/);
        });
    });

    describe("invalid schema workflow", () => {
        test("schema with autoincrement fails validation", async () => {
            const invalidSchema = `
datasource db {
  provider     = "postgresql"
  url          = env("DATABASE_URL")
  relationMode = "prisma"
}

model User {
  id   Int    @id @default(autoincrement())
  name String
}
`;
            const schemaPath = createTempSchema(invalidSchema);
            const result = await validateSchema(schemaPath);

            expect(result.valid).toBe(false);
            expect(
                result.issues.some((i) => i.message.includes("autoincrement")),
            ).toBe(true);
        });

        test("schema missing relationMode fails validation", async () => {
            const invalidSchema = `
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id   String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name String
}
`;
            const schemaPath = createTempSchema(invalidSchema);
            const result = await validateSchema(schemaPath);

            expect(result.valid).toBe(false);
            expect(
                result.issues.some((i) => i.message.includes("relationMode")),
            ).toBe(true);
        });
    });

    describe("transformer handles edge cases from real Prisma output", () => {
        test("handles down migration (DROP statements)", () => {
            const downMigration = `-- DropForeignKey
ALTER TABLE "Pet" DROP CONSTRAINT "Pet_ownerId_fkey";

-- DropIndex
DROP INDEX "Pet_ownerId_idx";

-- DropTable
DROP TABLE "Pet";

-- DropTable
DROP TABLE "Owner";
`;

            const result = transformMigration(downMigration);

            // DROP CONSTRAINT for FK should be removed
            expect(result.sql).not.toContain("DROP CONSTRAINT");

            // Other drops should be wrapped
            expect(result.sql).toContain("DROP INDEX");
            expect(result.sql).toContain('DROP TABLE "Pet"');
            expect(result.sql).toContain('DROP TABLE "Owner"');

            // Each statement in its own transaction
            const beginCount = (result.sql.match(/BEGIN;/g) || []).length;
            expect(beginCount).toBe(3); // 1 index + 2 tables
        });

        test("handles schema with multiple indexes", () => {
            const migration = `CREATE TABLE "User" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "name" VARCHAR(100),
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_name_idx" ON "User"("name");
`;

            const result = transformMigration(migration);

            expect(result.stats.indexesConverted).toBe(2);
            expect(result.sql).toContain("CREATE UNIQUE INDEX ASYNC");
            expect(result.sql).toContain("CREATE INDEX ASYNC");
        });
    });
});
