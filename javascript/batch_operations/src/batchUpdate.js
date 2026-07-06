// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

/**
 * Sequential and parallel batch UPDATE for Aurora DSQL.
 *
 * Updates rows matching a condition in configurable-size batches, committing
 * each batch as a separate transaction to stay within the 3,000-row mutation
 * limit. Uses a subquery to avoid reprocessing rows.
 *
 * NOTE: The `table`, `setClause`, and `condition` parameters are interpolated
 * directly into SQL. They must come from trusted, developer-controlled sources —
 * never from end-user input. Use parameterized queries ($1) for user-supplied
 * values within conditions.
 */

const { MaxRetriesExceededError, executeWithRetry } = require("./occRetry");

/** Stop retrying a batch after this many consecutive OCC exhaustions. */
const MAX_CONSECUTIVE_FAILURES = 10;

class IncompleteBatchError extends Error {
  constructor(remaining, totalAffected) {
    super(`${remaining} rows still match condition after updating ${totalAffected} rows`);
    this.name = "IncompleteBatchError";
    this.remaining = remaining;
    this.totalAffected = totalAffected;
  }
}

/**
 * Update rows in batches, committing each batch as a separate transaction.
 *
 * The COMMIT is inside the OCC retry scope so that commit-time serialization
 * failures (SQLSTATE 40001) are retried automatically.
 *
 * If a single batch exhausts its OCC retries, the loop retries that batch
 * with a fresh connection (up to MAX_CONSECUTIVE_FAILURES times) instead
 * of aborting the entire operation.
 *
 * @param {import('pg').Pool} pool
 * @param {string} table - Table name (trusted input only).
 * @param {string} setClause - SQL SET expressions without `SET` (trusted input only).
 * @param {string} condition - SQL WHERE clause without `WHERE` (trusted input only).
 * @param {number} [batchSize=1000]
 * @param {number} [maxRetries=3]
 * @param {number} [baseDelayMs=100]
 * @returns {Promise<number>} Total rows updated.
 */
async function batchUpdate(pool, table, setClause, condition, batchSize = 1000, maxRetries = 3, baseDelayMs = 100) {
  if (batchSize < 1) throw new RangeError("batchSize must be >= 1");

  let totalUpdated = 0;
  let consecutiveFailures = 0;

  while (true) {
    const client = await pool.connect();
    try {
      const sql = `UPDATE ${table} SET ${setClause}, updated_at = NOW()
        WHERE id IN (
          SELECT id FROM ${table}
          WHERE ${condition}
          LIMIT ${batchSize}
        )`;

      // BEGIN + DML + COMMIT all inside retry scope so commit-time 40001 is retried.
      const updated = await executeWithRetry(
        client,
        async (c) => {
          await c.query("BEGIN");
          const result = await c.query(sql);
          await c.query("COMMIT");
          return result.rowCount;
        },
        maxRetries,
        baseDelayMs
      );

      totalUpdated += updated;
      consecutiveFailures = 0;
      console.log(`Updated ${updated} rows (total: ${totalUpdated})`);

      if (updated === 0) break;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      if (err instanceof MaxRetriesExceededError) {
        consecutiveFailures++;
        console.log(
          `Batch OCC retries exhausted (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}), ` +
          `retrying batch with fresh connection`
        );
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) throw err;
      } else {
        throw err;
      }
    } finally {
      client.release();
    }
  }

  // Post-verification: ensure no matching rows remain
  const verifyClient = await pool.connect();
  try {
    const res = await verifyClient.query(`SELECT COUNT(*) FROM ${table} WHERE ${condition}`);
    const remaining = parseInt(res.rows[0].count, 10);
    if (remaining > 0) {
      throw new IncompleteBatchError(remaining, totalUpdated);
    }
  } finally {
    verifyClient.release();
  }

  return totalUpdated;
}

/**
 * Update rows in parallel using multiple concurrent async workers.
 *
 * Partitions rows using `abs(hashtext(id::text)::bigint) % num_workers = worker_id`.
 * The bigint cast prevents integer overflow when hashtext returns INT_MIN.
 *
 * Uses Promise.allSettled to collect partial progress from all workers before
 * reporting failures.
 *
 * @param {import('pg').Pool} pool
 * @param {string} table - Table name (trusted input only).
 * @param {string} setClause - SQL SET expressions without `SET` (trusted input only).
 * @param {string} condition - SQL WHERE clause without `WHERE` (trusted input only).
 * @param {number} [numWorkers=4]
 * @param {number} [batchSize=1000]
 * @param {number} [maxRetries=3]
 * @param {number} [baseDelayMs=100]
 * @returns {Promise<number>} Total rows updated.
 */
async function parallelBatchUpdate(
  pool, table, setClause, condition, numWorkers = 4, batchSize = 1000, maxRetries = 3, baseDelayMs = 100
) {
  if (numWorkers < 1) throw new RangeError("numWorkers must be >= 1");
  if (batchSize < 1) throw new RangeError("batchSize must be >= 1");

  async function worker(workerId) {
    let totalUpdated = 0;
    let consecutiveFailures = 0;
    // Cast hashtext to bigint before abs() to prevent overflow on INT_MIN.
    const partitionCondition =
      `(${condition}) AND abs(hashtext(id::text)::bigint) % ${numWorkers} = ${workerId}`;

    while (true) {
      const client = await pool.connect();
      try {
        const sql = `UPDATE ${table} SET ${setClause}, updated_at = NOW()
        WHERE id IN (
          SELECT id FROM ${table}
          WHERE ${partitionCondition}
          LIMIT ${batchSize}
        )`;

        // BEGIN + DML + COMMIT inside retry scope.
        const updated = await executeWithRetry(
          client,
          async (c) => {
            await c.query("BEGIN");
            const result = await c.query(sql);
            await c.query("COMMIT");
            return result.rowCount;
          },
          maxRetries,
          baseDelayMs
        );

        totalUpdated += updated;
        consecutiveFailures = 0;
        console.log(`Worker ${workerId}: Updated ${updated} rows (total: ${totalUpdated})`);

        if (updated === 0) break;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        if (err instanceof MaxRetriesExceededError) {
          consecutiveFailures++;
          console.log(
            `Worker ${workerId}: Batch OCC retries exhausted (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}), ` +
            `retrying batch with fresh connection`
          );
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) throw err;
        } else {
          throw err;
        }
      } finally {
        client.release();
      }
    }

    return totalUpdated;
  }

  const workers = Array.from({ length: numWorkers }, (_, i) => worker(i));
  const results = await Promise.allSettled(workers);

  let total = 0;
  const failures = [];
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === "fulfilled") {
      total += results[i].value;
    } else {
      failures.push({ workerId: i, error: results[i].reason });
    }
  }

  if (failures.length > 0) {
    console.log(`Partial progress: ${total} rows updated before failure`);
    for (const { workerId, error } of failures) {
      console.log(`  Worker ${workerId} failed: ${error.message}`);
    }
    throw failures[0].error;
  }

  console.log(`Parallel update complete: ${total} rows updated by ${numWorkers} workers`);

  // Post-verification: ensure no matching rows remain (uses original condition, not partitioned)
  const verifyClient = await pool.connect();
  try {
    const res = await verifyClient.query(`SELECT COUNT(*) FROM ${table} WHERE ${condition}`);
    const remaining = parseInt(res.rows[0].count, 10);
    if (remaining > 0) {
      throw new IncompleteBatchError(remaining, total);
    }
  } finally {
    verifyClient.release();
  }

  return total;
}

module.exports = { batchUpdate, parallelBatchUpdate, IncompleteBatchError };
