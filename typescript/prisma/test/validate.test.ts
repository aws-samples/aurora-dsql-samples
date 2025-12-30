import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
    validateSchema,
    formatValidationResult,
} from "../helpers/cli/validate";

describe("Schema Validator", () => {
    let tempDir: string;

    beforeAll(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "prisma-test-"));
    });

    afterAll(() => {
        fs.rmSync(tempDir, { recursive: true });
    });

    function createTempSchema(content: string): string {
        const schemaPath = path.join(tempDir, `schema-${Date.now()}.prisma`);
        fs.writeFileSync(schemaPath, content);
        return schemaPath;
    }

    describe("relationMode validation", () => {
        test("passes when relationMode = prisma is present", async () => {
            const schema = `
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
            const result = await validateSchema(createTempSchema(schema));
            const relationModeErrors = result.issues.filter((i) =>
                i.message.includes("relationMode"),
            );
            expect(relationModeErrors).toHaveLength(0);
        });

        test("fails when relationMode is missing", async () => {
            const schema = `
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id   String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name String
}
`;
            const result = await validateSchema(createTempSchema(schema));
            expect(result.valid).toBe(false);
            expect(
                result.issues.some((i) => i.message.includes("relationMode")),
            ).toBe(true);
        });
    });

    describe("autoincrement validation", () => {
        test("fails when autoincrement() is used", async () => {
            const schema = `
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
            const result = await validateSchema(createTempSchema(schema));
            expect(result.valid).toBe(false);
            expect(
                result.issues.some((i) => i.message.includes("autoincrement")),
            ).toBe(true);
        });
    });

    describe("ID field validation", () => {
        test("warns when Int @id is used without autoincrement", async () => {
            const schema = `
datasource db {
  provider     = "postgresql"
  url          = env("DATABASE_URL")
  relationMode = "prisma"
}

model User {
  id   Int    @id
  name String
}
`;
            const result = await validateSchema(createTempSchema(schema));
            expect(
                result.issues.some((i) => i.message.includes("Int @id")),
            ).toBe(true);
        });

        test("warns when gen_random_uuid is used without @db.Uuid", async () => {
            const schema = `
datasource db {
  provider     = "postgresql"
  url          = env("DATABASE_URL")
  relationMode = "prisma"
}

model User {
  id   String @id @default(dbgenerated("gen_random_uuid()"))
  name String
}
`;
            const result = await validateSchema(createTempSchema(schema));
            expect(
                result.issues.some((i) => i.message.includes("@db.Uuid")),
            ).toBe(true);
        });
    });

    describe("unsupported features", () => {
        test("fails when @db.Serial is used", async () => {
            const schema = `
datasource db {
  provider     = "postgresql"
  url          = env("DATABASE_URL")
  relationMode = "prisma"
}

model User {
  id   Int    @id @db.Serial
  name String
}
`;
            const result = await validateSchema(createTempSchema(schema));
            expect(result.valid).toBe(false);
            expect(
                result.issues.some((i) => i.message.includes("@db.Serial")),
            ).toBe(true);
        });

        test("fails when @db.SmallSerial is used", async () => {
            const schema = `
datasource db {
  provider     = "postgresql"
  url          = env("DATABASE_URL")
  relationMode = "prisma"
}

model User {
  id   Int    @id @db.SmallSerial
  name String
}
`;
            const result = await validateSchema(createTempSchema(schema));
            expect(result.valid).toBe(false);
            expect(
                result.issues.some((i) => i.message.includes("Serial types")),
            ).toBe(true);
        });

        test("fails when @db.BigSerial is used", async () => {
            const schema = `
datasource db {
  provider     = "postgresql"
  url          = env("DATABASE_URL")
  relationMode = "prisma"
}

model User {
  id   BigInt @id @db.BigSerial
  name String
}
`;
            const result = await validateSchema(createTempSchema(schema));
            expect(result.valid).toBe(false);
            expect(
                result.issues.some((i) => i.message.includes("Serial types")),
            ).toBe(true);
        });

        test("fails when @@fulltext is used", async () => {
            const schema = `
datasource db {
  provider     = "postgresql"
  url          = env("DATABASE_URL")
  relationMode = "prisma"
}

model User {
  id   String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name String

  @@fulltext([name])
}
`;
            const result = await validateSchema(createTempSchema(schema));
            expect(result.valid).toBe(false);
            expect(
                result.issues.some((i) => i.message.includes("@@fulltext")),
            ).toBe(true);
        });

        test("warns when BigInt @id is used", async () => {
            const schema = `
datasource db {
  provider     = "postgresql"
  url          = env("DATABASE_URL")
  relationMode = "prisma"
}

model User {
  id   BigInt @id
  name String
}
`;
            const result = await validateSchema(createTempSchema(schema));
            expect(
                result.issues.some((i) => i.message.includes("BigInt @id")),
            ).toBe(true);
        });
    });

    describe("valid schema", () => {
        test("passes for DSQL-compatible schema", async () => {
            const schema = `
datasource db {
  provider     = "postgresql"
  url          = env("DATABASE_URL")
  relationMode = "prisma"
}

model User {
  id    String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name  String  @db.VarChar(100)
  email String? @db.VarChar(255)
  posts Post[]
}

model Post {
  id       String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  title    String @db.VarChar(200)
  authorId String @db.Uuid
  author   User   @relation(fields: [authorId], references: [id])

  @@index([authorId])
}
`;
            const result = await validateSchema(createTempSchema(schema));
            expect(result.valid).toBe(true);
            expect(
                result.issues.filter((i) => i.type === "error"),
            ).toHaveLength(0);
        });
    });

    describe("formatValidationResult", () => {
        test("formats success message", async () => {
            const result = { valid: true, issues: [] };
            const output = formatValidationResult(result, "schema.prisma");
            expect(output).toContain("✓");
            expect(output).toContain("DSQL-compatible");
        });

        test("formats error messages with line numbers", async () => {
            const result = {
                valid: false,
                issues: [
                    {
                        type: "error" as const,
                        message: "Test error",
                        line: 10,
                        suggestion: "Fix it",
                    },
                ],
            };
            const output = formatValidationResult(result, "schema.prisma");
            expect(output).toContain("✗");
            expect(output).toContain("line 10");
            expect(output).toContain("Fix it");
        });
    });

    describe("file handling", () => {
        test("returns error for non-existent file", async () => {
            const result = await validateSchema("/nonexistent/schema.prisma");
            expect(result.valid).toBe(false);
            expect(result.issues[0]?.message).toContain("not found");
        });
    });
});
