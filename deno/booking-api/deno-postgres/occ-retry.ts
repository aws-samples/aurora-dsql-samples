// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Optimistic Concurrency Control (OCC) Retry Handler for Aurora DSQL
 *
 * Aurora DSQL uses optimistic concurrency control instead of traditional
 * pessimistic locking. When two transactions conflict — for example, two
 * users trying to book the same room at the same time — DSQL aborts one
 * transaction with SQLSTATE `OC000`. The application is expected to retry.
 *
 * This module wraps an async transaction function with automatic retry logic:
 * it catches `OC000` errors, applies exponential backoff with jitter to reduce
 * contention, and retries up to a configurable maximum. Non-OCC errors are
 * re-thrown immediately without retry.
 *
 * The retry logic is driver-agnostic — it only inspects the error object's
 * `code` property, which deno-postgres populates from the PostgreSQL error
 * response.
 *
 * @module occ-retry
 */

/**
 * Configuration options for the OCC retry handler.
 *
 * @property maxRetries - Maximum number of retry attempts after the initial
 *   try. For example, `maxRetries: 3` means up to 4 total attempts. Default: 3.
 * @property baseDelayMs - Base delay in milliseconds for exponential backoff.
 *   The actual delay is `baseDelayMs * 2^attempt + random jitter`. Default: 100.
 * @property maxDelayMs - Upper bound on the backoff delay to prevent
 *   excessively long waits. Default: 2000.
 */
export interface OccRetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

/**
 * Wraps an async function with OCC retry logic.
 *
 * On each invocation, the provided function `fn` is called. If it throws an
 * error with SQLSTATE `OC000` (Aurora DSQL optimistic concurrency conflict),
 * the handler waits with exponential backoff + jitter and retries. Non-OCC
 * errors are re-thrown immediately.
 *
 * @typeParam T - The return type of the wrapped function
 * @param fn - An async function representing the database transaction to retry
 * @param options - Optional retry configuration (maxRetries, baseDelayMs, maxDelayMs)
 * @returns The result of the first successful invocation of `fn`
 * @throws {Error} If all retry attempts are exhausted (message includes attempt
 *   count and original error), or if `fn` throws a non-OCC error
 *
 * @example
 * ```ts
 * const booking = await withOccRetry(async () => {
 *   const client = await createConnection(opts);
 *   try {
 *     await client.queryArray("BEGIN");
 *     // ... check overlaps, insert booking ...
 *     await client.queryArray("COMMIT");
 *     return booking;
 *   } finally {
 *     await client.end();
 *   }
 * });
 * ```
 */
export async function withOccRetry<T>(
  fn: () => Promise<T>,
  options?: OccRetryOptions,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 100;
  const maxDelayMs = options?.maxDelayMs ?? 2000;
  const startTime = Date.now();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const isOcc = isOccError(error);

      if (!isOcc || attempt === maxRetries) {
        if (isOcc) {
          throw new Error(
            `OCC retry exhausted after ${attempt + 1} attempts ` +
            `(${Date.now() - startTime}ms): ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
        throw error;
      }

      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt) + Math.random() * baseDelayMs,
        maxDelayMs,
      );

      console.log(
        `OCC conflict (attempt ${attempt + 1}/${maxRetries + 1}), ` +
        `retrying in ${Math.round(delay)}ms ` +
        `(elapsed: ${Date.now() - startTime}ms)`,
      );

      await new Promise((r) => setTimeout(r, delay));
    }
  }

  // Unreachable — the loop always returns or throws
  throw new Error("Unreachable: OCC retry loop exited without result");
}

/**
 * Checks whether an error is an Aurora DSQL OCC conflict (SQLSTATE `OC000`).
 *
 * `deno-postgres` (`jsr:@db/postgres`) attaches the SQLSTATE code at
 * `error.fields.code`. The function also checks `error.code` defensively
 * for forward-compatibility with other PostgreSQL drivers.
 *
 * @param error - The caught error object to inspect
 * @returns `true` if the error represents an OC000 optimistic concurrency
 *   conflict, `false` otherwise
 */
export function isOccError(error: unknown): boolean {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    // node-postgres puts SQLSTATE in error.code
    if (record.code === "OC000") return true;
    // deno-postgres puts SQLSTATE in error.fields.code
    const fields = record.fields;
    if (fields && typeof fields === "object") {
      return (fields as Record<string, unknown>).code === "OC000";
    }
  }
  return false;
}
