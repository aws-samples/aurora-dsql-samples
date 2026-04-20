/**
 * Custom migration runner for Aurora DSQL.
 *
 * Drizzle's built-in migrate() creates a tracking table using the SERIAL
 * pseudo-type, which is not available in Aurora DSQL. This module provides
 * a DSQL-compatible alternative that reads migration files from the
 * drizzle/ folder and tracks applied migrations using UUID primary keys.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Pool } from "pg";

const MIGRATIONS_TABLE = "__drizzle_migrations";

interface MigrationEntry {
    tag: string;
    sql: string;
}

/**
 * Apply pending migrations from the drizzle/ folder to the database.
 * Skips migrations that have already been applied.
 */
export async function applyMigrations(
    pool: Pool,
    migrationsFolder: string,
): Promise<void> {
    await ensureMigrationsTable(pool);

    const applied = await getAppliedMigrations(pool);
    const pending = readMigrationFiles(migrationsFolder).filter(
        (m) => !applied.has(m.tag),
    );

    for (const migration of pending) {
        console.log(`Applying migration: ${migration.tag}`);
        const statements = migration.sql
            .split("--> statement-breakpoint")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);

        for (const stmt of statements) {
            await pool.query(stmt);
        }

        await pool.query(
            `INSERT INTO "${MIGRATIONS_TABLE}" (id, hash, tag, created_at) VALUES ($1, $2, $3, $4)`,
            [
                crypto.randomUUID(),
                hashString(migration.sql),
                migration.tag,
                Date.now(),
            ],
        );
    }
}

async function ensureMigrationsTable(pool: Pool): Promise<void> {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            hash text NOT NULL,
            tag text NOT NULL,
            created_at bigint
        )
    `);
}

async function getAppliedMigrations(pool: Pool): Promise<Set<string>> {
    const result = await pool.query(
        `SELECT tag FROM "${MIGRATIONS_TABLE}" ORDER BY created_at`,
    );
    return new Set(result.rows.map((r: { tag: string }) => r.tag));
}

function readMigrationFiles(folder: string): MigrationEntry[] {
    const journalPath = path.join(folder, "meta", "_journal.json");
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8")) as {
        entries: Array<{ tag: string }>;
    };

    return journal.entries.map((entry) => {
        const sqlPath = path.join(folder, `${entry.tag}.sql`);
        return {
            tag: entry.tag,
            sql: fs.readFileSync(sqlPath, "utf-8"),
        };
    });
}

function hashString(s: string): string {
    return crypto.createHash("sha256").update(s).digest("hex");
}
