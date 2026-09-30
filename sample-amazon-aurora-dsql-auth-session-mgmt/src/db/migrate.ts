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
// IF NOT EXISTS so the migrator is safe to run repeatedly (idempotent).
//
// `CREATE INDEX ASYNC` returns synchronously while the index continues
// building in the background. We capture the returned `job_id` and wait on
// `sys.wait_for_job($1)` so the application doesn't start serving traffic
// against a sequential scan. Skip the wait by passing `{ waitForAsyncJobs:
// false }` if you want migrations to be non-blocking.
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
 *
 * `CREATE INDEX ASYNC` returns a single row with a `job_id` column, so the
 * client must surface query results' `rows`. The `unknown` payload is
 * narrowed to `{ job_id: string }` only at the call site.
 */
export interface ClientLike {
  query(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
  release(): void;
}

// ---------------------------------------------------------------------------
// DDL Statements
// ---------------------------------------------------------------------------

/**
 * Each string is a single DDL statement that will be executed inside its own
 * transaction. Order matters: tables must be created before their indexes.
 *
 * `CREATE INDEX ASYNC` statements are flagged so the runner knows to capture
 * the resulting `job_id` and wait for the index to become VALID.
 */
interface DDLStatement {
  sql: string;
  /** True when the statement schedules a background async job. */
  isAsync: boolean;
}

const DDL_STATEMENTS: DDLStatement[] = [
  // 1. Users table
  {
    sql: `CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(72) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`,
    isAsync: false,
  },

  // 2. Sessions table
  //
  // Note: `token_hash` is `VARCHAR(64) NOT NULL UNIQUE` — the UNIQUE
  // constraint produces a backing unique index named `sessions_token_hash_key`
  // automatically. We deliberately do NOT add a second `CREATE INDEX ASYNC`
  // on `token_hash`; doing so would create a redundant index, double the
  // write cost on every INSERT, and consume an entry from the table's index
  // quota for no benefit.
  {
    sql: `CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  client_metadata TEXT
)`,
    isAsync: false,
  },

  // 3. Async index on sessions.user_id for fast lookups by user.
  //
  // `CREATE INDEX ASYNC` returns immediately with a `job_id`. We wait on
  // `sys.wait_for_job` below so the application doesn't start serving
  // traffic against a sequential scan.
  {
    sql: `CREATE INDEX ASYNC IF NOT EXISTS idx_sessions_user_id ON sessions (user_id)`,
    isAsync: true,
  },
];

// ---------------------------------------------------------------------------
// Migration Runner
// ---------------------------------------------------------------------------

/**
 * Optional knobs for the migrator.
 */
export interface RunMigrationsOptions {
  /**
   * When true (default), the migrator captures the `job_id` returned by each
   * `CREATE INDEX ASYNC` statement and blocks on `sys.wait_for_job` until
   * the index reaches `VALID`. Set to `false` for non-blocking migrations
   * (e.g. when you want the app to come up immediately and accept some
   * sequential scans during the index build).
   */
  waitForAsyncJobs?: boolean;
}

/**
 * Executes all DDL migrations against the provided connection pool.
 *
 * Each statement runs inside its own transaction (BEGIN → DDL → COMMIT) to
 * satisfy Aurora DSQL's one-DDL-per-transaction constraint. For statements
 * that schedule async work (`CREATE INDEX ASYNC`), the runner captures the
 * returned `job_id` and waits for it to finish before moving on.
 *
 * If any statement fails, the transaction is rolled back and the error is
 * re-thrown so the caller can decide how to handle it.
 *
 * @param pool    - A connection pool (or pool-like mock) that provides `connect()`.
 * @param options - Optional knobs (e.g. disable the async-job wait).
 */
export async function runMigrations(
  pool: PoolLike,
  options: RunMigrationsOptions = {},
): Promise<void> {
  const { waitForAsyncJobs = true } = options;

  for (const stmt of DDL_STATEMENTS) {
    const client = await pool.connect();
    let asyncJobId: string | undefined;
    try {
      await client.query('BEGIN');
      const result = await client.query(stmt.sql);
      await client.query('COMMIT');

      if (stmt.isAsync) {
        // CREATE INDEX ASYNC returns a single row with the job_id of the
        // background build. Pull it out so we can wait on it below.
        const row = result.rows[0];
        const jobId =
          row && typeof row.job_id === 'string' ? row.job_id : undefined;
        if (jobId) {
          asyncJobId = jobId;
        }
      }
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

    // If the previous statement scheduled an async job, wait on it now —
    // outside of the transaction that scheduled it. `sys.wait_for_job`
    // blocks until the index finishes building.
    if (waitForAsyncJobs && asyncJobId) {
      const waitClient = await pool.connect();
      try {
        // sys.wait_for_job is a procedure, not a function in DSQL, so it
        // must be invoked with CALL, not SELECT.
        await waitClient.query('CALL sys.wait_for_job($1)', [asyncJobId]);
      } finally {
        waitClient.release();
      }
    }
  }
}
