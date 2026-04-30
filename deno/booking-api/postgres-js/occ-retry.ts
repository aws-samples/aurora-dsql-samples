// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Optimistic Concurrency Control (OCC) Retry Handler for Aurora DSQL
 *
 * Aurora DSQL uses optimistic concurrency control (OCC) for transaction
 * isolation. When two transactions conflict — e.g. two users booking the
 * same room in the same window — Aurora DSQL aborts one with SQLSTATE
 * `OC000` (row conflict) or `OC001` (schema namespace conflict). The
 * application retries the aborted transaction.
 *
 * This module wraps an async transaction function with automatic retry
 * logic: it catches OC000/OC001 errors, applies exponential backoff with
 * jitter to reduce contention, and retries up to a configurable maximum.
 * Non-OCC errors are re-thrown immediately without retry.
 *
 * @module occ-retry
 */

/**
 * Configuration options for the OCC retry handler.
 *
 * @property maxRetries - Maximum retry attempts after the initial try.
 *   `maxRetries: 3` means up to 4 total attempts. Default: 3.
 * @property baseDelayMs - Base delay for exponential backoff. Default: 100.
 *   Actual delay is `baseDelayMs * 2^attempt + random jitter`.
 * @property maxDelayMs - Upper bound on the backoff delay. Default: 2000.
 */
export interface OccRetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

/**
 * Wraps an async function with OCC retry logic.
 *
 * The provided function `fn` is called. If it throws an error with
 * SQLSTATE `OC000` or `OC001`, the handler waits with exponential backoff
 * + jitter and retries. Non-OCC errors are re-thrown immediately.
 *
 * When retries are exhausted, a plain `Error` is thrown whose message
 * begins with "OCC retry exhausted" so callers can map it to HTTP 503.
 *
 * @typeParam T - The return type of the wrapped function
 * @param fn - An async function representing the database operation to retry
 * @param options - Optional retry configuration
 * @returns The result of the first successful invocation of `fn`
 * @throws {Error} If all retry attempts are exhausted, or if `fn` throws a
 *   non-OCC error
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

  // Unreachable — the loop always returns or throws.
  throw new Error("Unreachable: OCC retry loop exited without result");
}

/**
 * Checks whether an error is a retryable Aurora DSQL concurrency conflict.
 *
 * Retries on:
 *   - `OC000` — change conflicts with another transaction (row-level OCC)
 *   - `OC001` — schema has been updated by another transaction (namespace
 *     concurrency during index promotion, role creation, etc.)
 *
 * Both share SQLSTATE class 40001 (serialization_failure); both are safe
 * to retry because the conflicting transaction has already aborted.
 *
 * postgres.js puts the SQLSTATE code at `error.code` directly.
 */
export function isOccError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as Record<string, unknown>).code;
  return code === "OC000" || code === "OC001";
}
