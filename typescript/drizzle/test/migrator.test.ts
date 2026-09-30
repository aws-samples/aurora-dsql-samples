import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { sql } from "drizzle-orm";
import { migrate, getMigrationStatus } from "@aws/aurora-dsql-drizzle";
import { createDsqlDb, type VeterinaryDb } from "../src/dsql-client";

jest.setTimeout(120000);

// Everything this suite creates is namespaced so teardown only ever touches its
// own objects — never the app's real `drizzle` schema or `public` tables.
const MIG_SCHEMA = "drizzle_mig_test";
const MIG_TABLE = "__drizzle_migrations";
const TABLES = [
  "mig_test_apply_a",
  "mig_test_apply_b",
  "mig_test_resume_a",
  "mig_test_resume_b",
  "mig_test_multi_c",
  "mig_test_multi_d",
];
const BP = "--> statement-breakpoint";

const migConfig = (dir: string) => ({
  migrationsFolder: dir,
  migrationsSchema: MIG_SCHEMA,
  migrationsTable: MIG_TABLE,
});

// Write a minimal but real Drizzle migration directory (journal + tagged .sql)
// so the public migrate() path exercises readMigrationFiles + real hashing.
function writeMigrationDir(opts: {
  sql: string;
  when: number;
  tag: string;
  breakpoints?: boolean;
}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsql-mig-"));
  fs.mkdirSync(path.join(dir, "meta"), { recursive: true });
  const journal = {
    version: "7",
    dialect: "postgresql",
    entries: [
      {
        idx: 0,
        version: "7",
        when: opts.when,
        tag: opts.tag,
        breakpoints: opts.breakpoints ?? true,
      },
    ],
  };
  fs.writeFileSync(
    path.join(dir, "meta", "_journal.json"),
    JSON.stringify(journal, null, 2),
  );
  fs.writeFileSync(path.join(dir, `${opts.tag}.sql`), opts.sql);
  return dir;
}

async function tableExists(db: VeterinaryDb, name: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${name}
    ) AS exists
  `);
  return result.rows[0]?.["exists"] === true;
}

async function cleanup(db: VeterinaryDb): Promise<void> {
  for (const t of TABLES) {
    await db.execute(sql.raw(`DROP TABLE IF EXISTS "${t}"`));
  }
  // Only ever the test tracking schema — never the app's `drizzle` schema.
  await db.execute(sql.raw(`DROP SCHEMA IF EXISTS ${MIG_SCHEMA} CASCADE`));
}

describe("DSQL migrator (live)", () => {
  let db: VeterinaryDb;

  beforeAll(async () => {
    db = createDsqlDb();
    await cleanup(db); // start from a clean slate if a prior run left objects
  });

  afterAll(async () => {
    await cleanup(db);
    await db.$client.end();
  });

  test("applies a fresh migration, is idempotent on re-run, and reports status", async () => {
    const dir = writeMigrationDir({
      when: 1810000000000,
      tag: "0000_apply",
      sql: [
        `CREATE TABLE "mig_test_apply_a" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid())`,
        `CREATE TABLE "mig_test_apply_b" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid())`,
      ].join(`\n${BP}\n`),
    });

    // First apply: both statements run.
    const first = await migrate(db, migConfig(dir));
    expect(first.success).toBe(true);
    expect(first.appliedStatements).toBe(2);
    expect(first.completedMigrations).toBe(1);
    expect(await tableExists(db, "mig_test_apply_a")).toBe(true);
    expect(await tableExists(db, "mig_test_apply_b")).toBe(true);

    // Re-run: nothing pending, nothing re-executed.
    const second = await migrate(db, migConfig(dir));
    expect(second.success).toBe(true);
    expect(second.appliedStatements).toBe(0);
    expect(second.totalStatements).toBe(0);

    // Status reflects a fully-applied migration.
    const status = await getMigrationStatus(db, migConfig(dir));
    expect(status).toEqual({
      appliedMigrations: 1,
      pendingMigrations: 0,
      appliedStatements: 2,
      pendingStatements: 0,
    });
  });

  test("resumes after a mid-migration failure without replaying applied statements", async () => {
    // v1: statement 1 is invalid, so the run fails after statement 0 commits
    // and is recorded.
    const badDir = writeMigrationDir({
      when: 1820000000000,
      tag: "0001_resume",
      sql: [
        `CREATE TABLE "mig_test_resume_a" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid())`,
        `THIS IS NOT VALID SQL`,
      ].join(`\n${BP}\n`),
    });

    const failed = await migrate(db, migConfig(badDir));
    expect(failed.success).toBe(false);
    if (!failed.success) {
      expect(failed.error.statementIndex).toBe(1);
    }
    expect(await tableExists(db, "mig_test_resume_a")).toBe(true);
    expect(await tableExists(db, "mig_test_resume_b")).toBe(false);

    // v2: same folderMillis/tag, statement 0 unchanged, statement 1 fixed. The
    // resume must skip statement 0 (already recorded) and apply only statement 1.
    const goodDir = writeMigrationDir({
      when: 1820000000000,
      tag: "0001_resume",
      sql: [
        `CREATE TABLE "mig_test_resume_a" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid())`,
        `CREATE TABLE "mig_test_resume_b" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid())`,
      ].join(`\n${BP}\n`),
    });

    const resumed = await migrate(db, migConfig(goodDir));
    expect(resumed.success).toBe(true);
    expect(resumed.appliedStatements).toBe(1);
    expect(await tableExists(db, "mig_test_resume_b")).toBe(true);
  });

  test("rejects a breakpoint-free multi-DDL migration before executing it", async () => {
    // No statement-breakpoint marker, so readMigrationFiles yields one chunk
    // with two DDLs. DSQL runs one DDL per transaction, so the migrator must
    // reject it up front and create neither table.
    const dir = writeMigrationDir({
      when: 1830000000000,
      tag: "0002_multi",
      breakpoints: false,
      sql: `CREATE TABLE "mig_test_multi_c" ("id" uuid PRIMARY KEY);\nCREATE TABLE "mig_test_multi_d" ("id" uuid PRIMARY KEY);`,
    });

    const result = await migrate(db, migConfig(dir));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toMatch(/multiple SQL statements/);
    }
    expect(await tableExists(db, "mig_test_multi_c")).toBe(false);
    expect(await tableExists(db, "mig_test_multi_d")).toBe(false);
  });
});
