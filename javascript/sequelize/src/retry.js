/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Base delay for exponential backoff (50 ms).
const BASE_DELAY_MS = 50;

// SQLSTATE code for serialization failure (OCC conflict) in Aurora DSQL.
const OCC_SQLSTATE = '40001';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Check whether an error is an Aurora DSQL optimistic concurrency control (OCC) conflict.
 *
 * Uses structured SQLSTATE inspection first. Sequelize wraps driver errors, so the
 * pg error object is typically found on `error.parent` or `error.original`. We fall
 * back to matching the DSQL-specific OCC error codes in the message text.
 */
function isOccError(error) {
  if (!error) {
    return false;
  }

  // Structured inspection: the pg driver sets `.code` to the SQLSTATE.
  // Sequelize exposes the underlying pg error on `.parent` and `.original`.
  const sqlState =
    error.code ||
    (error.parent && error.parent.code) ||
    (error.original && error.original.code);
  if (sqlState === OCC_SQLSTATE) {
    return true;
  }

  // Fallback for wrapped exceptions. Match DSQL-specific OCC error codes to avoid
  // false positives from unrelated messages.
  const message = String(error.message || error);
  return (
    message.includes('SQLSTATE 40001') ||
    message.includes('OC000') ||
    message.includes('OC001')
  );
}

/**
 * Retry an async operation on OCC conflict with exponential backoff and jitter.
 *
 * @param {() => Promise<T>} fn - operation to run; it MUST re-read state on each
 *   invocation so retries act on the latest data.
 * @param {number} maxRetries - number of retries after the first attempt (default 3,
 *   i.e. up to 4 total attempts).
 * @returns {Promise<T>}
 */
async function withOccRetry(fn, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (isOccError(error) && attempt < maxRetries) {
        // Exponential backoff (50 ms, 100 ms, 200 ms, ...) with random jitter to
        // avoid the thundering herd problem when concurrent retries collide.
        const backoff = BASE_DELAY_MS * 2 ** attempt;
        const jitter = Math.random() * backoff;
        await sleep(backoff + jitter);
      } else {
        throw error;
      }
    }
  }
}

export { withOccRetry, isOccError, OCC_SQLSTATE, BASE_DELAY_MS };
