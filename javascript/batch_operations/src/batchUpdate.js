// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

/**
 * Sequential and parallel batch UPDATE for Aurora DSQL.
 *
 * Updates rows matching a condition in configurable-size batches, committing
 * each batch as a separate transaction to stay within the 3,000-row mutation
 * limit. Uses a subquery to avoid reprocessing rows.
 */

const { MaxRetriesExceededError, executeWithRetry } = require("./occRetry");

/** Stop retrying a batch after this many consecutive OCC exhaustions. */
const MAX_CONSECUTIVE_FAILURES = 10;

/**
 * Update rows in batches, committing each batch as a separate transaction.
 *
 * If a single batch exhausts its OCC retries, the loop retries that batch
 * with a fresh connection (up to MAX_CONSECUTIVE_FAILURES times) instead
 * of aborting the entire operation.
 *
 * @param {import('pg').Pool} pool
 * @param {string} table
 * @param {string} setClause - SQL SET expressions (without `SET`).
 * @param {string} condition - SQL WHERE clause (without `WHERE`).
 * @param {number} [batchSize=1000]
 * @param {number} [maxRetries=3]
 * @param {number} [baseDelayMs=100]
 * @returns {Promise<number>} Total rows updated.
 */
async function batchUpdate(pool, table, setClause, condition, batchSize = 1000, maxRetries = 3, baseDelayMs = 100) {
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

      const updated = await executeWithRetry(
        client,
        async (c) => {
          await c.query("BEGIN");
          const result = await c.query(sql);
          return result.rowCount;
        },
        maxRetries,
        baseDelayMs
      );

      await client.query("COMMIT");
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
      console.log(`WARNING: ${remaining} rows still match condition after updating ${totalUpdated} rows`);
    }
  } finally {
    verifyClient.release();
  }

  return totalUpdated;
}

/**
 * Update rows in parallel using multiple concurrent async workers.
 *
 * Partitions rows using `abs(hashtext(id::text)) % num_workers = worker_id`.
 *
 * @param {import('pg').Pool} pool
 * @param {string} table
 * @param {string} setClause
 * @param {string} condition
 * @param {number} [numWorkers=4]
 * @param {number} [batchSize=1000]
 * @param {number} [maxRetries=3]
 * @param {number} [baseDelayMs=100]
 * @returns {Promise<number>} Total rows updated.
 */
async function parallelBatchUpdate(
  pool, table, setClause, condition, numWorkers = 4, batchSize = 1000, maxRetries = 3, baseDelayMs = 100
) {
  async function worker(workerId) {
    let totalUpdated = 0;
    let consecutiveFailures = 0;
    const partitionCondition =
      `${condition} AND abs(hashtext(id::text)) % ${numWorkers} = ${workerId}`;

    while (true) {
      const client = await pool.connect();
      try {
        const sql = `UPDATE ${table} SET ${setClause}, updated_at = NOW()
        WHERE id IN (
          SELECT id FROM ${table}
          WHERE ${partitionCondition}
          LIMIT ${batchSize}
        )`;

        const updated = await executeWithRetry(
          client,
          async (c) => {
            await c.query("BEGIN");
            const result = await c.query(sql);
            return result.rowCount;
          },
          maxRetries,
          baseDelayMs
        );

        await client.query("COMMIT");
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
  const results = await Promise.all(workers);
  const total = results.reduce((sum, n) => sum + n, 0);
  console.log(`Parallel update complete: ${total} rows updated by ${numWorkers} workers`);

  // Post-verification: ensure no matching rows remain (uses original condition, not partitioned)
  const verifyClient = await pool.connect();
  try {
    const res = await verifyClient.query(`SELECT COUNT(*) FROM ${table} WHERE ${condition}`);
    const remaining = parseInt(res.rows[0].count, 10);
    if (remaining > 0) {
      console.log(`WARNING: ${remaining} rows still match condition after updating ${total} rows`);
    }
  } finally {
    verifyClient.release();
  }

  return total;
}

module.exports = { batchUpdate, parallelBatchUpdate };
