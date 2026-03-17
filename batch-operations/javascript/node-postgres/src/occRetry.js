// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

/**
 * OCC retry logic with exponential backoff for Aurora DSQL batch operations.
 */

class MaxRetriesExceededError extends Error {
  constructor(maxRetries) {
    super(`Max retries exceeded: failed after ${maxRetries} retries`);
    this.name = "MaxRetriesExceededError";
    this.maxRetries = maxRetries;
  }
}

function sleep(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

/**
 * Execute a database operation with OCC conflict retry and exponential backoff.
 *
 * Retries on SQLSTATE 40001 (serialization failure) with exponential backoff.
 * Each retry rolls back the current transaction before waiting.
 *
 * @param {import('pg').PoolClient} client - A node-postgres pool client.
 * @param {(client: import('pg').PoolClient) => Promise<*>} operation - Async
 *   function that performs database work. Should NOT commit.
 * @param {number} [maxRetries=3] - Maximum retry attempts.
 * @param {number} [baseDelay=0.1] - Base delay in seconds for backoff.
 * @returns {Promise<*>} The return value of `operation(client)`.
 */
async function executeWithRetry(client, operation, maxRetries = 3, baseDelay = 0.1) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation(client);
    } catch (e) {
      if (e.code === "40001") {
        await client.query("ROLLBACK");
        if (attempt >= maxRetries) {
          throw new MaxRetriesExceededError(maxRetries);
        }
        const delay = baseDelay * Math.pow(2, attempt);
        console.warn(
          `OCC conflict, retry ${attempt + 1}/${maxRetries} after ${delay.toFixed(1)}s`
        );
        await sleep(delay);
      } else {
        throw e;
      }
    }
  }
  throw new MaxRetriesExceededError(maxRetries);
}

module.exports = { MaxRetriesExceededError, executeWithRetry, sleep };
