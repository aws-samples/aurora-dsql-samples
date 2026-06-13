// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

/**
 * Sequential and parallel batch DELETE for Aurora DSQL.
 *
 * Deletes rows matching a condition in configurable-size batches, committing
 * each batch as a separate transaction to stay within the 3,000-row mutation
 * limit.
 */

const { MaxRetriesExceededError, executeWithRetry } = require("./occRetry");

/** Stop retrying a batch after this many consecutive OCC exhaustions. */
const MAX_CONSECUTIVE_FAILURES = 10;

/**
 * Delete rows in batches, committing each batch as a separate transaction.
 *
 * If a single batch exhausts its OCC retries, the loop retries that batch
 * with a fresh connection (up to MAX_CONSECUTIVE_FAILURES times) instead
 * of aborting the entire operation.
 *
 * @param {import('pg').Pool} pool
 * @param {string} table
 * @param {string} condition - SQL WHERE clause (without `WHERE`).
 * @param {number} [batchSize=1000]
 * @param {number} [maxRetries=3]
 * @param {number} [baseDelayMs=100]
 * @returns {Promise<number>} Total rows deleted.
 */
async function batchDelete(pool, table, condition, batchSize = 1000, maxRetries = 3, baseDelayMs = 100) {
  let totalDeleted = 0;
  let consecutiveFailures = 0;

  while (true) {
    const client = await pool.connect();
    try {
      const sql = `DELETE FROM ${table} WHERE id IN (SELECT id FROM ${table} WHERE ${condition} LIMIT ${batchSize})`;

      const deleted = await executeWithRetry(
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
      totalDeleted += deleted;
      consecutiveFailures = 0;
      console.log(`Deleted ${deleted} rows (total: ${totalDeleted})`);

      if (deleted === 0) break;
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
      console.log(`WARNING: ${remaining} rows still match condition after deleting ${totalDeleted} rows`);
    }
  } finally {
    verifyClient.release();
  }

  return totalDeleted;
}

/**
 * Delete rows in parallel using multiple concurrent async workers.
 *
 * Partitions rows using `abs(hashtext(id::text)) % num_workers = worker_id`.
 *
 * @param {import('pg').Pool} pool
 * @param {string} table
 * @param {string} condition
 * @param {number} [numWorkers=4]
 * @param {number} [batchSize=1000]
 * @param {number} [maxRetries=3]
 * @param {number} [baseDelayMs=100]
 * @returns {Promise<number>} Total rows deleted.
 */
async function parallelBatchDelete(
  pool, table, condition, numWorkers = 4, batchSize = 1000, maxRetries = 3, baseDelayMs = 100
) {
  async function worker(workerId) {
    let totalDeleted = 0;
    let consecutiveFailures = 0;
    const partitionCondition =
      `${condition} AND abs(hashtext(id::text)) % ${numWorkers} = ${workerId}`;

    while (true) {
      const client = await pool.connect();
      try {
        const sql = `DELETE FROM ${table} WHERE id IN (SELECT id FROM ${table} WHERE ${partitionCondition} LIMIT ${batchSize})`;

        const deleted = await executeWithRetry(
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
        totalDeleted += deleted;
        consecutiveFailures = 0;
        console.log(`Worker ${workerId}: Deleted ${deleted} rows (total: ${totalDeleted})`);

        if (deleted === 0) break;
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

    return totalDeleted;
  }

  const workers = Array.from({ length: numWorkers }, (_, i) => worker(i));
  const results = await Promise.all(workers);
  const total = results.reduce((sum, n) => sum + n, 0);
  console.log(`Parallel delete complete: ${total} rows deleted by ${numWorkers} workers`);

  // Post-verification: ensure no matching rows remain (uses original condition, not partitioned)
  const verifyClient = await pool.connect();
  try {
    const res = await verifyClient.query(`SELECT COUNT(*) FROM ${table} WHERE ${condition}`);
    const remaining = parseInt(res.rows[0].count, 10);
    if (remaining > 0) {
      console.log(`WARNING: ${remaining} rows still match condition after deleting ${total} rows`);
    }
  } finally {
    verifyClient.release();
  }

  return total;
}

module.exports = { batchDelete, parallelBatchDelete };
