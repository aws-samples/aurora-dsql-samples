import path from "node:path";
import { Pool } from "pg";
import { applyMigrations } from "../src/migrate";

function createMigrationPool() {
    const statements: string[] = [];
    const applied = new Set<string>();

    const pool = {
        query: jest.fn(async (sql: string, params?: unknown[]) => {
            statements.push(sql);
            if (/^SELECT tag FROM/.test(sql)) {
                return {
                    rows: [...applied].map((tag) => ({ tag })),
                };
            }
            if (/^CALL sys\.wait_for_job/.test(sql)) {
                return { rows: [{ succeeded: true }] };
            }
            if (/^INSERT INTO/.test(sql) && params?.[2]) {
                applied.add(String(params[2]));
            }
            return { rows: [] };
        }),
    };

    return { pool, statements };
}

describe("committed migrations", () => {
    test("creates foreign keys in the initial table definitions", async () => {
        const { pool, statements } = createMigrationPool();

        await applyMigrations(
            pool as unknown as Pool,
            path.resolve(process.cwd(), "drizzle"),
        );

        const petTable = statements.find((sql) =>
            sql.startsWith('CREATE TABLE "pet"'),
        );
        const joinTable = statements.find((sql) =>
            sql.startsWith('CREATE TABLE "_SpecialtyToVet"'),
        );

        expect(petTable).toMatch(
            /FOREIGN KEY \("owner_id"\)\s+REFERENCES "owner"\("id"\)/,
        );
        expect(joinTable).toMatch(
            /FOREIGN KEY \("A"\)\s+REFERENCES "specialty"\("name"\)/,
        );
        expect(joinTable).toMatch(
            /FOREIGN KEY \("B"\)\s+REFERENCES "vet"\("id"\)/,
        );
        expect(statements.some((sql) => /^ALTER TABLE/i.test(sql))).toBe(false);
    });
});
