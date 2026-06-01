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
  client_metadata TEXT
)`,

  // 3. Index on sessions.user_id for fast lookups by user
  // Aurora DSQL requires ASYNC index creation — indexes are built in the
  // background without blocking reads or writes.
  `CREATE INDEX ASYNC IF NOT EXISTS idx_sessions_user_id ON sessions (user_id)`,

  // 4. Index on sessions.token_hash for fast token validation
  `CREATE INDEX ASYNC IF NOT EXISTS idx_sessions_token_hash ON sessions (token_hash)`,
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
      // Roll back the failed transaction so the connection is left in a
      // clean state before being returned to the pool.
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
