// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

/**
 * Sequential and parallel batch DELETE for Aurora DSQL.
 *
 * Deletes rows matching a condition in configurable-size batches, committing
 * each batch as a separate transaction to stay within the 3,000-row mutation
 * limit.
 */

const { executeWithRetry } = require("./occRetry");

/**
 * Delete rows in batches, committing each batch as a separate transaction.
 *
 * @param {import('pg').Pool} pool
 * @param {string} table
 * @param {string} condition - SQL WHERE clause (without `WHERE`).
 * @param {number} [batchSize=1000]
 * @param {number} [maxRetries=3]
 * @param {number} [baseDelay=0.1]
 * @returns {Promise<number>} Total rows deleted.
 */
async function batchDelete(pool, table, condition, batchSize = 1000, maxRetries = 3, baseDelay = 0.1) {
  let totalDeleted = 0;

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
        baseDelay
      );

      await client.query("COMMIT");
      totalDeleted += deleted;
      console.log(`Deleted ${deleted} rows (total: ${totalDeleted})`);

      if (deleted === 0) break;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
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
 * @param {number} [baseDelay=0.1]
 * @returns {Promise<number>} Total rows deleted.
 */
async function parallelBatchDelete(
  pool, table, condition, numWorkers = 4, batchSize = 1000, maxRetries = 3, baseDelay = 0.1
) {
  async function worker(workerId) {
    let totalDeleted = 0;
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
          baseDelay
        );

        await client.query("COMMIT");
        totalDeleted += deleted;
        console.log(`Worker ${workerId}: Deleted ${deleted} rows (total: ${totalDeleted})`);

        if (deleted === 0) break;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
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
  return total;
}

module.exports = { batchDelete, parallelBatchDelete };
