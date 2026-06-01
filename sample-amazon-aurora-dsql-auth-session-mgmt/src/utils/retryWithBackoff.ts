// ---------------------------------------------------------------------------
// OCC Retry Wrapper with Exponential Backoff
// ---------------------------------------------------------------------------
//
// Aurora DSQL uses Optimistic Concurrency Control (OCC). Transactions may fail
// at commit time with a PostgreSQL serialization error (SQLSTATE 40001) when
// concurrent modifications conflict. This utility retries the *entire*
// operation with exponential backoff and random jitter to spread out retries
// and reduce repeated contention.
//
// Usage:
//   const result = await retryWithBackoff(() => insertUser(pool, user));
//
// See: https://docs.aws.amazon.com/aurora-dsql/latest/userguide/working-with-concurrency-control.html
// ---------------------------------------------------------------------------

import { ServiceUnavailableError } from './errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Configuration for the retry behaviour.
 *
 * All fields are optional — sensible defaults are applied when omitted.
 */
export interface RetryOptions {
  /** Maximum number of retry attempts after the initial failure (default: 3). */
  maxRetries: number;
  /** Base delay in milliseconds before the first retry (default: 50). */
  baseDelayMs: number;
  /** Upper bound on the computed delay in milliseconds (default: 2 000). */
  maxDelayMs: number;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 50,
  maxDelayMs: 2000,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * PostgreSQL serialization error SQLSTATE code.
 *
 * The `pg` library attaches a `code` property to error objects that maps to
 * the five-character SQLSTATE value. `40001` means "serialization_failure".
 */
const SERIALIZATION_ERROR_CODE = '40001';

/**
 * Returns `true` when the error is a PostgreSQL serialization failure.
 *
 * The `pg` library sets `error.code` to the SQLSTATE string. We check for
 * `40001` which indicates an OCC conflict in Aurora DSQL.
 */
export function isSerializationError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === SERIALIZATION_ERROR_CODE
  );
}

/**
 * Compute the backoff delay for a given attempt.
 *
 * Formula: min(baseDelayMs × 2^attempt + random_jitter, maxDelayMs)
 *
 * The jitter is a random value in [0, baseDelayMs) which helps spread out
 * retries from multiple concurrent callers.
 */
export function computeDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  const exponentialPart = baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * baseDelayMs;
  return Math.min(exponentialPart + jitter, maxDelayMs);
}

/**
 * Sleep for the given number of milliseconds.
 *
 * Exported for testing purposes (allows mocking to speed up tests).
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Main retry function
// ---------------------------------------------------------------------------

/**
 * Execute `operation` and transparently retry on OCC serialization errors.
 *
 * The operation should represent a *complete* transaction — on retry the
 * entire operation is re-executed from scratch.
 *
 * @param operation - An async function that performs the database work.
 * @param options   - Optional overrides for retry behaviour.
 * @returns The value returned by a successful execution of `operation`.
 * @throws {ServiceUnavailableError} When all retry attempts are exhausted.
 * @throws The original error when it is *not* a serialization failure.
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options?: Partial<RetryOptions>,
): Promise<T> {
  const { maxRetries, baseDelayMs, maxDelayMs } = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  let lastError: unknown;

  // attempt 0 is the initial try; attempts 1..maxRetries are retries
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: unknown) {
      // Only retry on serialization (OCC) errors — everything else propagates
      if (!isSerializationError(error)) {
        throw error;
      }

      lastError = error;

      // Log the conflict for observability (Requirement 11.4)
      console.warn(
        `[OCC conflict] Serialization error on attempt ${attempt + 1}/${maxRetries + 1}. ` +
          (attempt < maxRetries
            ? 'Retrying…'
            : 'Max retries exhausted.'),
      );

      // If we still have retries left, back off before the next attempt
      if (attempt < maxRetries) {
        const delay = computeDelay(attempt, baseDelayMs, maxDelayMs);
        await sleep(delay);
      }
    }
  }

  // All retries exhausted — surface a user-friendly 503 error
  throw new ServiceUnavailableError(
    'Transaction failed after maximum retry attempts due to concurrent modification conflicts',
  );
}
