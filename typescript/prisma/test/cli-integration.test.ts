/**
 * CLI Integration Tests
 *
 * These tests run the actual CLI commands from the README to verify
 * the golden path workflow works end-to-end.
 */
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("CLI Integration", () => {
    let tempDir: string;

    beforeAll(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "prisma-cli-test-"));
    });

    afterAll(() => {
        fs.rmSync(tempDir, { recursive: true });
    });

    describe("README golden path workflow", () => {
        test("prisma migrate diff | dsql-transform produces valid output", () => {
            // This is the exact command from the README:
            // npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script | npm run dsql-transform
            const output = execSync(
                "npx prisma migrate diff --from-empty --to-schema-datamodel prisma/veterinary-schema.prisma --script | npm run dsql-transform -- --no-header 2>/dev/null",
                { cwd: path.join(__dirname, ".."), encoding: "utf-8" },
            );

            // Verify DSQL compatibility transformations were applied
            expect(output).toContain("BEGIN;");
            expect(output).toContain("COMMIT;");
            expect(output).toContain("CREATE INDEX ASYNC");

            // Verify no foreign keys remain (veterinary schema has relations)
            expect(output).not.toContain("FOREIGN KEY");
            expect(output).not.toContain("ADD CONSTRAINT");
            expect(output).not.toMatch(/REFERENCES.*ON DELETE/);

            // Verify tables are present
            expect(output).toContain('CREATE TABLE "owner"');
            expect(output).toContain('CREATE TABLE "pet"');
        });

        test("validator catches invalid schema", () => {
            // Create an invalid schema with autoincrement
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
            const schemaPath = path.join(tempDir, "invalid.prisma");
            fs.writeFileSync(schemaPath, invalidSchema);

            // Run validator - should exit with code 1
            try {
                execSync(`npm run validate ${schemaPath}`, {
                    cwd: path.join(__dirname, ".."),
                    encoding: "utf-8",
                    stdio: "pipe",
                });
                fail("Expected validator to fail");
            } catch (error: unknown) {
                const execError = error as { stdout?: string; status?: number };
                expect(execError.stdout).toContain("autoincrement");
                expect(execError.status).toBe(1);
            }
        });

        test("validator passes valid schema", () => {
            const validSchema = `
datasource db {
  provider     = "postgresql"
  url          = env("DATABASE_URL")
  relationMode = "prisma"
}

model User {
  id   String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name String
}
`;
            const schemaPath = path.join(tempDir, "valid.prisma");
            fs.writeFileSync(schemaPath, validSchema);

            // Run validator - should exit with code 0
            const output = execSync(`npm run validate ${schemaPath}`, {
                cwd: path.join(__dirname, ".."),
                encoding: "utf-8",
            });

            expect(output).toContain("DSQL-compatible");
        });

        test("transform from file works", () => {
            // Create a sample migration file
            const migration = `CREATE TABLE "user" ("id" UUID);
CREATE INDEX "user_idx" ON "user"("id");`;
            const inputPath = path.join(tempDir, "input.sql");
            const outputPath = path.join(tempDir, "output.sql");
            fs.writeFileSync(inputPath, migration);

            // Run transform with file I/O
            execSync(
                `npm run dsql-transform ${inputPath} -- -o ${outputPath} --no-header`,
                {
                    cwd: path.join(__dirname, ".."),
                    encoding: "utf-8",
                },
            );

            const output = fs.readFileSync(outputPath, "utf-8");
            expect(output).toContain("BEGIN;");
            expect(output).toContain("CREATE INDEX ASYNC");
        });
    });
});
