// ---------------------------------------------------------------------------
// DSQL Connection Pool
// ---------------------------------------------------------------------------
//
// Wraps the official AWS Aurora DSQL connector for node-postgres. The
// connector extends the standard `pg.Pool` with automatic IAM token
// generation and refresh, so we don't need to manage credentials manually.
//
// The pool is created lazily on the first call to `getPool()` and reused for
// the lifetime of the process. Call `closePool()` during graceful shutdown to
// release all connections.
//
// Requirements:
//   9.6 — Use the official DSQL connector for connection management
//   9.7 — IAM-based database authentication (handled by the connector)
//  12.3 — Connection pool with bounded size
//  12.4 — Idle timeout well below the 1-hour DSQL connection limit
// ---------------------------------------------------------------------------

import { AuroraDSQLPool } from '@aws/aurora-dsql-node-postgres-connector';

/**
 * Singleton pool instance. Created on the first call to `getPool()`.
 */
let pool: AuroraDSQLPool | null = null;

/**
 * Returns the shared DSQL connection pool, creating it on first access.
 *
 * The pool is configured with:
 * - `host`               — read from the `DSQL_ENDPOINT` environment variable
 * - `user`               — `'admin'` (DSQL's default IAM-authenticated user)
 * - `database`           — `'postgres'` (DSQL's fixed database name)
 * - `max`                — 10 concurrent connections
 * - `idleTimeoutMillis`  — 300 000 ms (5 minutes), well under the 1-hour
 *                           DSQL connection timeout so connections are
 *                           recycled before they expire
 * - `maxLifetimeSeconds` — 3 300 s (55 minutes), so each connection retires
 *                           ahead of DSQL's hard 1-hour cap
 *
 * @throws {Error} If `DSQL_ENDPOINT` is not set in the environment.
 */
export function getPool(): AuroraDSQLPool {
  if (pool) {
    return pool;
  }

  const host = process.env.DSQL_ENDPOINT;
  if (!host) {
    throw new Error(
      'DSQL_ENDPOINT environment variable is required but not set'
    );
  }

  pool = new AuroraDSQLPool({
    host,
    user: 'admin',
    database: 'postgres',
    max: 10,
    idleTimeoutMillis: 300_000, // 5 minutes
    // Aurora DSQL closes any single connection at 1 hour. Recycle each
    // connection at 55 minutes so a request never lands on a connection
    // that the cluster is about to close.
    maxLifetimeSeconds: 3300,
  });

  return pool;
}

/**
 * Closes the connection pool and releases all connections.
 *
 * Safe to call multiple times — subsequent calls are no-ops once the pool
 * has been shut down. Typically invoked from a SIGTERM / SIGINT handler
 * during graceful shutdown.
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
