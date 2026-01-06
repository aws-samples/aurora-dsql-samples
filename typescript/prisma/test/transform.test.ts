import {
    transformMigration,
    formatTransformStats,
    TransformResult,
} from "../helpers/cli/transform";

describe("Migration Transformer", () => {
    describe("basic transformations", () => {
        test("wraps single CREATE TABLE in BEGIN/COMMIT", () => {
            const input = `CREATE TABLE "user" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100),
    PRIMARY KEY ("id")
);`;

            const result = transformMigration(input);

            expect(result.sql).toContain("BEGIN;");
            expect(result.sql).toContain("COMMIT;");
            expect(result.sql).toContain('CREATE TABLE "user"');
            expect(result.stats.statementsProcessed).toBe(1);
        });

        test("wraps multiple statements separately", () => {
            const input = `CREATE TABLE "user" (
    "id" UUID NOT NULL,
    PRIMARY KEY ("id")
);

CREATE TABLE "post" (
    "id" UUID NOT NULL,
    PRIMARY KEY ("id")
);`;

            const result = transformMigration(input);

            // Count BEGIN/COMMIT pairs
            const beginCount = (result.sql.match(/BEGIN;/g) || []).length;
            const commitCount = (result.sql.match(/COMMIT;/g) || []).length;

            expect(beginCount).toBe(2);
            expect(commitCount).toBe(2);
            expect(result.stats.statementsProcessed).toBe(2);
        });

        test("preserves comments before statements", () => {
            const input = `-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL,
    PRIMARY KEY ("id")
);`;

            const result = transformMigration(input);

            expect(result.sql).toContain("-- CreateTable");
            expect(result.sql).toContain("BEGIN;");
        });
    });

    describe("CREATE INDEX transformation", () => {
        test("converts CREATE INDEX to CREATE INDEX ASYNC", () => {
            const input = `CREATE INDEX "user_email_idx" ON "user"("email");`;

            const result = transformMigration(input);

            expect(result.sql).toContain("CREATE INDEX ASYNC");
            expect(result.sql).not.toMatch(/CREATE\s+INDEX\s+"/);
            expect(result.stats.indexesConverted).toBe(1);
        });

        test("converts CREATE UNIQUE INDEX to CREATE UNIQUE INDEX ASYNC", () => {
            const input = `CREATE UNIQUE INDEX "user_email_key" ON "user"("email");`;

            const result = transformMigration(input);

            expect(result.sql).toContain("CREATE UNIQUE INDEX ASYNC");
            expect(result.stats.indexesConverted).toBe(1);
        });

        test("does not double-convert already ASYNC indexes", () => {
            const input = `CREATE INDEX ASYNC "user_email_idx" ON "user"("email");`;

            const result = transformMigration(input);

            // Should not have "ASYNC ASYNC"
            expect(result.sql).not.toContain("ASYNC ASYNC");
            expect(result.sql).toContain("CREATE INDEX ASYNC");
            expect(result.stats.indexesConverted).toBe(0);
        });

        test("handles multiple indexes", () => {
            const input = `CREATE INDEX "idx1" ON "user"("email");
CREATE INDEX "idx2" ON "user"("name");
CREATE UNIQUE INDEX "idx3" ON "user"("username");`;

            const result = transformMigration(input, { includeHeader: false });

            expect(result.stats.indexesConverted).toBe(3);
            // 2 regular indexes + 1 unique index = 3 total ASYNC conversions
            expect((result.sql.match(/INDEX\s+ASYNC/g) || []).length).toBe(3);
        });
    });

    describe("foreign key removal", () => {
        test("removes ALTER TABLE ADD FOREIGN KEY statements", () => {
            const input = `CREATE TABLE "post" (
    "id" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    PRIMARY KEY ("id")
);

ALTER TABLE "post" ADD CONSTRAINT "post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id");`;

            const result = transformMigration(input);

            expect(result.sql).not.toContain("FOREIGN KEY");
            expect(result.sql).not.toContain("REFERENCES");
            expect(result.sql).toContain('CREATE TABLE "post"');
            expect(result.stats.foreignKeysRemoved).toBe(1);
        });

        test("removes inline REFERENCES constraints", () => {
            const input = `ALTER TABLE "post" ADD CONSTRAINT "fk_author" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE;`;

            const result = transformMigration(input);

            expect(result.sql).not.toContain("REFERENCES");
            expect(result.stats.foreignKeysRemoved).toBe(1);
        });

        test("removes DROP CONSTRAINT for foreign keys", () => {
            const input = `ALTER TABLE "Pet" DROP CONSTRAINT "Pet_ownerId_fkey";`;

            const result = transformMigration(input);

            expect(result.sql).not.toContain("DROP CONSTRAINT");
            expect(result.stats.foreignKeysRemoved).toBe(1);
        });

        test("emits warning when foreign keys are removed", () => {
            const input = `ALTER TABLE "post" ADD CONSTRAINT "fk" FOREIGN KEY ("authorId") REFERENCES "user"("id");`;

            const result = transformMigration(input);

            expect(result.warnings).toHaveLength(1);
            expect(result.warnings[0]).toContain("relationMode");
            expect(result.warnings[0]).toContain("application-layer");
        });

        test("no warning when no foreign keys present", () => {
            const input = `CREATE TABLE "user" ("id" UUID);`;

            const result = transformMigration(input);

            expect(result.warnings).toHaveLength(0);
        });
    });

    describe("already wrapped statements", () => {
        test("does not double-wrap statements already in BEGIN/COMMIT", () => {
            const input = `BEGIN;
CREATE TABLE "user" (
    "id" UUID NOT NULL,
    PRIMARY KEY ("id")
);
COMMIT;`;

            const result = transformMigration(input);

            // Should only have one BEGIN/COMMIT pair
            const beginCount = (result.sql.match(/BEGIN;/g) || []).length;
            expect(beginCount).toBe(1);
        });
    });

    describe("DROP statements (down migrations)", () => {
        test("wraps DROP TABLE statements", () => {
            const input = `DROP TABLE IF EXISTS "user";
DROP TABLE IF EXISTS "post";`;

            const result = transformMigration(input);

            expect(result.stats.statementsProcessed).toBe(2);
            expect((result.sql.match(/BEGIN;/g) || []).length).toBe(2);
        });

        test("wraps DROP INDEX statements", () => {
            const input = `DROP INDEX IF EXISTS "user_email_idx";`;

            const result = transformMigration(input);

            expect(result.sql).toContain("BEGIN;");
            expect(result.sql).toContain("DROP INDEX");
            expect(result.sql).toContain("COMMIT;");
        });
    });

    describe("real-world Prisma output", () => {
        test("transforms typical Prisma migrate diff output", () => {
            const input = `-- CreateTable
CREATE TABLE "owner" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(30) NOT NULL,
    "city" VARCHAR(80) NOT NULL,

    CONSTRAINT "owner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(30) NOT NULL,
    "ownerId" UUID,

    CONSTRAINT "pet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pet_ownerId_idx" ON "pet"("ownerId");

-- AddForeignKey
ALTER TABLE "pet" ADD CONSTRAINT "pet_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "owner"("id") ON DELETE SET NULL ON UPDATE CASCADE;`;

            const result = transformMigration(input);

            // Should have 3 statements (2 tables + 1 index, FK removed)
            expect(result.stats.statementsProcessed).toBe(3);
            expect(result.stats.indexesConverted).toBe(1);
            expect(result.stats.foreignKeysRemoved).toBe(1);

            // Verify structure
            expect(result.sql).toContain("-- CreateTable");
            expect(result.sql).toContain("CREATE INDEX ASYNC");
            expect(result.sql).not.toContain("FOREIGN KEY");
            expect(result.sql).not.toContain("AddForeignKey");
        });
    });

    describe("header comment", () => {
        test("includes header by default", () => {
            const input = `CREATE TABLE "user" ("id" UUID);`;

            const result = transformMigration(input);

            expect(result.sql).toContain("Transformed for Aurora DSQL");
        });

        test("can exclude header", () => {
            const input = `CREATE TABLE "user" ("id" UUID);`;

            const result = transformMigration(input, { includeHeader: false });

            expect(result.sql).not.toContain("Transformed for Aurora DSQL");
        });
    });

    describe("formatTransformStats", () => {
        test("formats stats correctly", () => {
            const stats: TransformResult["stats"] = {
                statementsProcessed: 5,
                indexesConverted: 2,
                foreignKeysRemoved: 1,
            };

            const output = formatTransformStats(stats);

            expect(output).toContain("5 statement(s)");
            expect(output).toContain("2 index(es)");
            expect(output).toContain("1 foreign key");
        });

        test("omits zero counts", () => {
            const stats: TransformResult["stats"] = {
                statementsProcessed: 3,
                indexesConverted: 0,
                foreignKeysRemoved: 0,
            };

            const output = formatTransformStats(stats);

            expect(output).toContain("3 statement(s)");
            expect(output).not.toContain("index");
            expect(output).not.toContain("foreign key");
        });

        test("includes warnings when provided", () => {
            const stats: TransformResult["stats"] = {
                statementsProcessed: 1,
                indexesConverted: 0,
                foreignKeysRemoved: 1,
            };
            const warnings = ["Test warning message"];

            const output = formatTransformStats(stats, warnings);

            expect(output).toContain("⚠ Test warning message");
        });
    });

    describe("edge cases", () => {
        test("handles empty input", () => {
            const result = transformMigration("");

            expect(result.sql.trim()).toBe("");
            expect(result.stats.statementsProcessed).toBe(0);
        });

        test("handles input with only comments", () => {
            const input = "-- This is a comment\n-- Another comment";

            const result = transformMigration(input);

            expect(result.stats.statementsProcessed).toBe(0);
        });

        test("handles statements without trailing semicolon", () => {
            const input = `CREATE TABLE "user" ("id" UUID)`;

            const result = transformMigration(input);

            expect(result.sql).toContain("BEGIN;");
            expect(result.sql).toContain("COMMIT;");
            // Should add semicolon
            expect(result.sql).toMatch(/\);?\s*\nCOMMIT;/);
        });

        test("handles mixed wrapped and unwrapped statements", () => {
            const input = `BEGIN;
CREATE TABLE "user" ("id" UUID);
COMMIT;

CREATE TABLE "post" ("id" UUID);`;

            const result = transformMigration(input, { includeHeader: false });

            // Should have 2 statements total
            expect(result.stats.statementsProcessed).toBe(2);
            // Should have 2 BEGIN/COMMIT pairs (one original, one added)
            expect((result.sql.match(/BEGIN;/g) || []).length).toBe(2);
        });

        test("handles partially transformed indexes", () => {
            const input = `CREATE INDEX ASYNC "idx1" ON "user"("email");
CREATE INDEX "idx2" ON "user"("name");`;

            const result = transformMigration(input, { includeHeader: false });

            // Only idx2 should be converted
            expect(result.stats.indexesConverted).toBe(1);
            // Both should be wrapped
            expect(result.stats.statementsProcessed).toBe(2);
        });

        test("preserves non-FK ALTER TABLE statements", () => {
            const input = `ALTER TABLE "user" ADD COLUMN "email" VARCHAR(255);`;

            const result = transformMigration(input, { includeHeader: false });

            expect(result.sql).toContain("ALTER TABLE");
            expect(result.sql).toContain("ADD COLUMN");
            expect(result.stats.statementsProcessed).toBe(1);
            expect(result.stats.foreignKeysRemoved).toBe(0);
        });

        test("handles compound ALTER TABLE with DROP/ADD CONSTRAINT for pkey", () => {
            // Prisma generates this when comparing against live database
            const input = `ALTER TABLE "vet" DROP CONSTRAINT "vet_pkey",
ADD COLUMN     "phone" VARCHAR(20),
ADD CONSTRAINT "vet_pkey" PRIMARY KEY ("id");`;

            // Without --force, should report unsupported statements
            // ADD CONSTRAINT for same PK is also skipped (paired with DROP)
            const result = transformMigration(input, { includeHeader: false });

            expect(result.unsupportedStatements).toHaveLength(1);
            expect(result.unsupportedStatements[0]).toContain(
                "DROP CONSTRAINT",
            );
            // Only ADD COLUMN should be in output (ADD CONSTRAINT skipped since paired with DROP)
            expect(result.sql).toContain("ADD COLUMN");
            expect(result.sql).not.toContain("ADD CONSTRAINT");
            expect(result.sql).not.toContain("PRIMARY KEY");
        });

        test("with --force, removes DROP/ADD CONSTRAINT and keeps ADD COLUMN", () => {
            const input = `ALTER TABLE "vet" DROP CONSTRAINT "vet_pkey",
ADD COLUMN     "phone" VARCHAR(20),
ADD CONSTRAINT "vet_pkey" PRIMARY KEY ("id");`;

            const result = transformMigration(input, {
                includeHeader: false,
                force: true,
            });

            // Should keep ADD COLUMN but remove DROP/ADD CONSTRAINT
            expect(result.sql).toContain("ADD COLUMN");
            expect(result.sql).toContain("phone");
            expect(result.sql).not.toContain("DROP CONSTRAINT");
            expect(result.sql).not.toContain("PRIMARY KEY");
            expect(result.stats.statementsProcessed).toBe(1);
            expect(result.unsupportedStatements).toHaveLength(1); // Still tracked
        });

        test("removes empty ALTER TABLE after filtering with --force", () => {
            // If only DROP/ADD CONSTRAINT, statement should be removed entirely
            const input = `ALTER TABLE "vet" DROP CONSTRAINT "vet_pkey",
ADD CONSTRAINT "vet_pkey" PRIMARY KEY ("id");`;

            const result = transformMigration(input, {
                includeHeader: false,
                force: true,
            });

            expect(result.sql.trim()).toBe("");
            expect(result.stats.statementsProcessed).toBe(0);
        });

        test("without --force, skips paired ADD CONSTRAINT", () => {
            // Without force, we skip ADD CONSTRAINT that's paired with DROP
            // This avoids outputting partial SQL that would fail anyway
            const input = `ALTER TABLE "vet" DROP CONSTRAINT "vet_pkey",
ADD CONSTRAINT "vet_pkey" PRIMARY KEY ("id");`;

            const result = transformMigration(input, { includeHeader: false });

            // DROP is tracked as unsupported
            expect(result.unsupportedStatements).toHaveLength(1);
            // Statement is empty after filtering, so nothing in output
            expect(result.sql.trim()).toBe("");
            expect(result.stats.statementsProcessed).toBe(0);
        });

        test("handles table/column names containing reserved words", () => {
            const input = `CREATE TABLE "references" ("foreign_key" VARCHAR(100));`;

            const result = transformMigration(input, { includeHeader: false });

            // Should NOT be removed - it's a table, not an FK constraint
            expect(result.sql).toContain('CREATE TABLE "references"');
            expect(result.stats.statementsProcessed).toBe(1);
            expect(result.stats.foreignKeysRemoved).toBe(0);
        });
    });
});
