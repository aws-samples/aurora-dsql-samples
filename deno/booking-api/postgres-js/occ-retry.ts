// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

/**
 * Optimistic Concurrency Control (OCC) retry handler for Aurora DSQL.
 *
 * Aurora DSQL aborts the losing transaction when concurrent transactions
 * conflict. The driver surfaces this as SQLSTATE 40001; the retry wrapper
 * retries with exponential backoff + jitter.
 *
 * See: https://docs.aws.amazon.com/aurora-dsql/latest/userguide/working-with-concurrency-control.html
 *
 * @module occ-retry
 */

export interface OccRetryOptions {
  /** Maximum retry attempts after the initial try. Default: 3. */
  maxRetries?: number;
  /** Base delay for exponential backoff in ms. Default: 1. */
  baseDelayMs?: number;
  /** Upper bound on the backoff delay in ms. Default: 2000. */
  maxDelayMs?: number;
}

/**
 * Wraps an async function with OCC retry logic.
 *
 * Retries when `fn` throws a retryable concurrency error (see `isOccError`).
 * Non-OCC errors propagate immediately. When retries are exhausted, the
 * last OCC error is re-thrown unchanged.
 *
 * @param fn - The database operation to retry
 * @param options - Optional retry configuration
 */
export async function withOccRetry<T>(
  fn: () => Promise<T>,
  options?: OccRetryOptions,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 1;
  const maxDelayMs = options?.maxDelayMs ?? 2000;
  const startTime = Date.now();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      if (!isOccError(error) || attempt === maxRetries) {
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

  // Unreachable — the loop always returns or throws.
  throw new Error("Unreachable: OCC retry loop exited without result");
}

/**
 * Checks whether an error is a retryable Aurora DSQL concurrency control
 * conflict.
 *
 * Aurora DSQL returns a PostgreSQL serialization failure with SQLSTATE
 * `40001` on concurrency control conflicts — both **data conflicts**
 * (`OC000`) and **schema conflicts** (`OC001`, catalog out of sync). The
 * OCxxx sub-code lives inside the error message; postgres.js surfaces
 * the SQLSTATE at `error.code`, so matching `40001` is sufficient.
 *
 * See: https://docs.aws.amazon.com/aurora-dsql/latest/userguide/working-with-concurrency-control.html
 */
export function isOccError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return (error as Record<string, unknown>).code === "40001";
}
