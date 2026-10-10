import type { PoolClient } from "pg";
import { pool } from "./pool.js";

/**
 * Optimistic Concurrency Control (OCC) transaction wrapper.
 *
 * Aurora DSQL uses OCC instead of locking: transactions proceed without
 * blocking and conflicts are detected at COMMIT time, surfacing as a
 * serialization error (SQLSTATE 40001). Aurora DSQL distinguishes:
 *   - OC000: data conflict (two transactions wrote the same row)
 *   - OC001: schema conflict (e.g. an async index promoting mid-transaction)
 * Both are transient and should simply be retried.
 *
 * Rather than hand-roll a retry loop, we delegate to the Aurora DSQL
 * connector's built-in `AuroraDSQLPool.transaction()`, which wraps the
 * callback in BEGIN/COMMIT and retries on 40001 with exponential backoff and
 * jitter (configured on the pool in db/pool.ts).
 *
 * The callback MUST be idempotent -- it may run more than once. We generate
 * UUIDs before entering the transaction so retries reuse the same identifiers.
 */
export function withTransaction<T>(
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return pool.transaction(work);
}
