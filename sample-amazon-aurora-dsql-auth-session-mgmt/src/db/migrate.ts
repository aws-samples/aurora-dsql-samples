// ---------------------------------------------------------------------------
// Database Migrator
// ---------------------------------------------------------------------------
//
// Runs DDL statements to create the tables and indexes required by the
// authentication service. Aurora DSQL has a strict constraint: each DDL
// statement must execute in its own, separate transaction. You cannot batch
// multiple DDL statements or mix DDL with DML in a single transaction.
//
// This module executes each CREATE TABLE and CREATE INDEX statement in an
// independent transaction, committing after each one. All statements use
// IF NOT EXISTS / IF NOT EXISTS so the migrator is safe to run repeatedly
// (idempotent).
//
// Requirements:
//   9.1 — Users table schema
//   9.2 — Sessions table schema
//   9.8 — Each DDL in its own transaction
//   9.9 — No extensions, triggers, sequences, etc.
// ---------------------------------------------------------------------------

/**
 * Minimal interface for a connection pool. Using a narrow type instead of
 * the concrete `AuroraDSQLPool` class makes the migrator easy to test with
 * a lightweight mock — no AWS credentials required.
 */
export interface PoolLike {
  connect(): Promise<ClientLike>;
}

/**
 * Minimal interface for a database client obtained from the pool.
 */
export interface ClientLike {
  query(sql: string): Promise<unknown>;
  release(): void;
}

// ---------------------------------------------------------------------------
// DDL Statements
// ---------------------------------------------------------------------------

/**
 * Each string is a single DDL statement that will be executed inside its own
 * transaction. Order matters: tables must be created before their indexes.
 */
const DDL_STATEMENTS: string[] = [
  // 1. Users table
  `CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(72) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`,

  // 2. Sessions table
  `CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  client_metadata JSONB
)`,

  // 3. Index on sessions.user_id for fast lookups by user.
  //
  // Aurora DSQL requires ASYNC index creation — indexes are built in the
  // background without blocking reads or writes.
  //
  // IMPORTANT: `CREATE INDEX ASYNC` returns immediately; the index will
  // not be VALID until the background build completes. Reads against
  // `sessions.user_id` will fall back to a full scan until then. Wait for
  // index validity before relying on the index for performance —
  // see https://docs.aws.amazon.com/aurora-dsql/latest/userguide/working-with-postgresql-compatibility-supported-sql-features.html
  // for guidance on monitoring async index build status.
  //
  // Note: `sessions.token_hash` is intentionally NOT given an explicit
  // CREATE INDEX statement. The `UNIQUE` constraint declared in the
  // `sessions` table above already creates a backing unique index — adding
  // a second index on the same column is redundant and wastes write IOPS.
  `CREATE INDEX ASYNC IF NOT EXISTS idx_sessions_user_id ON sessions (user_id)`,
];

// ---------------------------------------------------------------------------
// Migration Runner
// ---------------------------------------------------------------------------

/**
 * Executes all DDL migrations against the provided connection pool.
 *
 * Each statement runs inside its own transaction (BEGIN → DDL → COMMIT) to
 * satisfy Aurora DSQL's one-DDL-per-transaction constraint. If any statement
 * fails, the transaction is rolled back and the error is re-thrown so the
 * caller can decide how to handle it.
 *
 * @param pool - A connection pool (or pool-like mock) that provides `connect()`.
 */
export async function runMigrations(pool: PoolLike): Promise<void> {
  for (const sql of DDL_STATEMENTS) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
    } catch (error) {
      // Best-effort rollback. If ROLLBACK itself throws (e.g. dead
      // connection), preserve the *original* error — the SQLSTATE from the
      // failed DDL is more useful for debugging than the rollback failure.
      try {
        await client.query('ROLLBACK');
      } catch {
        // swallow — re-throwing the original error below is more useful
      }
      throw error;
    } finally {
      client.release();
    }
  }
}
