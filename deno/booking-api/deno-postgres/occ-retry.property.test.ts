// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Property-based tests for the OCC Retry Handler.
 *
 * These tests verify the core behavioral properties of `withOccRetry` and
 * `isOccError` without connecting to a real database. The OCC retry handler
 * is driver-agnostic — it only inspects error objects and manages retry
 * timing — so all properties can be tested with synthetic error objects
 * and mock async functions.
 *
 * @module occ-retry.property.test
 */

import fc from "fast-check";
import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { isOccError, withOccRetry } from "./occ-retry.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates an error object that mimics an Aurora DSQL OC000 error.
 * Supports both node-postgres style (`error.code`) and deno-postgres
 * style (`error.fields.code`).
 */
function makeOccError(style: "code" | "fields" = "code"): Error & Record<string, unknown> {
  const err = new Error("OC000: transaction conflict") as Error & Record<string, unknown>;
  if (style === "code") {
    err.code = "OC000";
  } else {
    err.fields = { code: "OC000" };
  }
  return err;
}

// ---------------------------------------------------------------------------
// Property 5: OCC error detection
// ---------------------------------------------------------------------------

/**
 * Feature: deno-aurora-dsql-samples, Property 5: OCC error detection
 *
 * For any error object, `isOccError` returns true if and only if the error
 * has a `code` property (or nested `fields.code` property) equal to "OC000".
 *
 * **Validates: Requirements 8.1**
 */
Deno.test("property: isOccError returns true only for OC000 errors", () => {
  fc.assert(
    fc.property(
      // Generate arbitrary error-like objects with random code values
      fc.record({
        code: fc.oneof(
          fc.constant("OC000"),
          fc.constant("23505"),
          fc.constant("42P01"),
          fc.string({ minLength: 0, maxLength: 10 }),
          fc.constant(undefined),
          fc.constant(null),
        ),
      }),
      (errorObj) => {
        const result = isOccError(errorObj);
        assertEquals(result, errorObj.code === "OC000");
      },
    ),
    { numRuns: 200 },
  );
});

Deno.test("property: isOccError detects OC000 in fields.code (deno-postgres style)", () => {
  fc.assert(
    fc.property(
      fc.record({
        fields: fc.record({
          code: fc.oneof(
            fc.constant("OC000"),
            fc.constant("23505"),
            fc.string({ minLength: 0, maxLength: 10 }),
          ),
        }),
      }),
      (errorObj) => {
        const result = isOccError(errorObj);
        assertEquals(result, errorObj.fields.code === "OC000");
      },
    ),
    { numRuns: 200 },
  );
});

Deno.test("property: isOccError returns false for non-object values", () => {
  fc.assert(
    fc.property(
      fc.oneof(
        fc.constant(null),
        fc.constant(undefined),
        fc.integer(),
        fc.string(),
        fc.boolean(),
      ),
      (value) => {
        assertEquals(isOccError(value), false);
      },
    ),
    { numRuns: 100 },
  );
});

// ---------------------------------------------------------------------------
// Property 6: OCC retry on conflict
// ---------------------------------------------------------------------------

/**
 * Feature: deno-aurora-dsql-samples, Property 6: OCC retry on conflict
 *
 * For any `maxRetries` (1–10) and function that throws OC000 exactly K times
 * before succeeding (K ≤ maxRetries), `withOccRetry` returns the successful
 * result after K+1 invocations.
 *
 * **Validates: Requirements 8.2**
 */
Deno.test("property: withOccRetry succeeds after K OCC failures (K <= maxRetries)", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 1, max: 10 }),  // maxRetries
      fc.integer({ min: 0, max: 10 }),  // K failures before success
      fc.anything(),                     // success value
      async (maxRetries, rawK, successValue) => {
        const K = Math.min(rawK, maxRetries); // ensure K <= maxRetries
        let callCount = 0;

        const fn = async () => {
          callCount++;
          if (callCount <= K) {
            throw makeOccError();
          }
          return successValue;
        };

        const result = await withOccRetry(fn, {
          maxRetries,
          baseDelayMs: 0,
          maxDelayMs: 0,
        });

        assertEquals(result, successValue);
        assertEquals(callCount, K + 1);
      },
    ),
    { numRuns: 100 },
  );
});

// ---------------------------------------------------------------------------
// Property 7: OCC retry exhaustion
// ---------------------------------------------------------------------------

/**
 * Feature: deno-aurora-dsql-samples, Property 7: OCC retry exhaustion
 *
 * For any `maxRetries` (1–10) and function that always throws OC000,
 * `withOccRetry` throws after exactly maxRetries+1 invocations, and the
 * thrown error message contains the original error message and attempt count.
 *
 * **Validates: Requirements 8.5**
 */
Deno.test("property: withOccRetry exhausts retries and throws descriptive error", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 1, max: 10 }),  // maxRetries
      fc.string({ minLength: 1, maxLength: 50 }),  // original error message
      async (maxRetries, originalMessage) => {
        let callCount = 0;

        const fn = async (): Promise<never> => {
          callCount++;
          const err = new Error(originalMessage) as Error & { code: string };
          err.code = "OC000";
          throw err;
        };

        const error = await assertRejects(
          () => withOccRetry(fn, { maxRetries, baseDelayMs: 0, maxDelayMs: 0 }),
          Error,
        );

        // Should have been called exactly maxRetries + 1 times
        assertEquals(callCount, maxRetries + 1);

        // Error message should contain the attempt count
        assertStringIncludes(error.message, `${maxRetries + 1} attempts`);

        // Error message should contain the original error message
        assertStringIncludes(error.message, originalMessage);
      },
    ),
    { numRuns: 100 },
  );
});

// ---------------------------------------------------------------------------
// Property 8: OCC pass-through for immediate success
// ---------------------------------------------------------------------------

/**
 * Feature: deno-aurora-dsql-samples, Property 8: OCC pass-through for immediate success
 *
 * For any value T and function that immediately returns T, `withOccRetry(fn)`
 * returns T with exactly one invocation.
 *
 * **Validates: Requirements 8.7**
 */
Deno.test("property: withOccRetry passes through immediate success unchanged", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.anything(),
      async (value) => {
        let callCount = 0;

        const fn = async () => {
          callCount++;
          return value;
        };

        const result = await withOccRetry(fn);
        assertEquals(result, value);
        assertEquals(callCount, 1);
      },
    ),
    { numRuns: 100 },
  );
});
