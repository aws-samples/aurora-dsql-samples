// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

/**
 * Repopulate test data for Aurora DSQL batch operation samples.
 */

const { executeWithRetry } = require("./occRetry");

const INSERT_SQL =
  "INSERT INTO batch_test (category, status, value) " +
  "SELECT " +
  "  (ARRAY['electronics','clothing','food','books','toys'])" +
  "[floor(random() * 5 + 1)], " +
  "  'active', " +
  "  round((random() * 1000)::numeric, 2) " +
  "FROM generate_series(1, $1)";

/**
 * Insert test rows into batch_test in batches.
 *
 * @param {import('pg').Pool} pool
 * @param {number} [rowCount=5000]
 * @param {number} [batchSize=1000]
 * @param {number} [maxRetries=3]
 * @param {number} [baseDelay=0.1]
 * @returns {Promise<number>} Total rows inserted.
 */
async function repopulateTestData(pool, rowCount = 5000, batchSize = 1000, maxRetries = 3, baseDelay = 0.1) {
  let totalInserted = 0;
  let remaining = rowCount;

  while (remaining > 0) {
    const currentBatch = Math.min(batchSize, remaining);
    const client = await pool.connect();
    try {
      const inserted = await executeWithRetry(
        client,
        async (c) => {
          await c.query("BEGIN");
          const result = await c.query(INSERT_SQL, [currentBatch]);
          return result.rowCount;
        },
        maxRetries,
        baseDelay
      );

      await client.query("COMMIT");
      totalInserted += inserted;
      remaining -= inserted;
      console.log(`Inserted ${inserted} rows (total: ${totalInserted})`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  console.log(`Repopulation complete: ${totalInserted} rows inserted`);
  return totalInserted;
}

module.exports = { repopulateTestData };
