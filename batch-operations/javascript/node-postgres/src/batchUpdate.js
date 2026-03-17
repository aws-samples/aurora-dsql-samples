// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

/**
 * Sequential and parallel batch UPDATE for Aurora DSQL.
 *
 * Updates rows matching a condition in configurable-size batches, committing
 * each batch as a separate transaction to stay within the 3,000-row mutation
 * limit. Uses a subquery to avoid reprocessing rows.
 */

const { executeWithRetry } = require("./occRetry");

/**
 * Update rows in batches, committing each batch as a separate transaction.
 *
 * @param {import('pg').Pool} pool
 * @param {string} table
 * @param {string} setClause - SQL SET expressions (without `SET`).
 * @param {string} condition - SQL WHERE clause (without `WHERE`).
 * @param {number} [batchSize=1000]
 * @param {number} [maxRetries=3]
 * @param {number} [baseDelay=0.1]
 * @returns {Promise<number>} Total rows updated.
 */
async function batchUpdate(pool, table, setClause, condition, batchSize = 1000, maxRetries = 3, baseDelay = 0.1) {
  let totalUpdated = 0;

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
        baseDelay
      );

      await client.query("COMMIT");
      totalUpdated += updated;
      console.log(`Updated ${updated} rows (total: ${totalUpdated})`);

      if (updated === 0) break;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
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
 * @param {number} [baseDelay=0.1]
 * @returns {Promise<number>} Total rows updated.
 */
async function parallelBatchUpdate(
  pool, table, setClause, condition, numWorkers = 4, batchSize = 1000, maxRetries = 3, baseDelay = 0.1
) {
  async function worker(workerId) {
    let totalUpdated = 0;
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
          baseDelay
        );

        await client.query("COMMIT");
        totalUpdated += updated;
        console.log(`Worker ${workerId}: Updated ${updated} rows (total: ${totalUpdated})`);

        if (updated === 0) break;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
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
  return total;
}

module.exports = { batchUpdate, parallelBatchUpdate };
