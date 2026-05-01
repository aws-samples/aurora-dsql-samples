// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

/**
 * Test helpers for property-based tests that don't hit the database.
 *
 * @module test/mocks
 */

import type { AppContext } from "./handlers.ts";

/**
 * Builds a minimal `AppContext` whose `sql` throws on every query.
 *
 * Router/response/validation property tests only need to verify that
 * `handleRequest` dispatches correctly and formats responses, not that
 * the database works. Using a real postgres.js client pointed at a fake
 * endpoint triggers exponential connection backoff (observed to reach
 * ~19s per attempt), making property tests with 100+ iterations
 * effectively hang.
 *
 * The mock `sql` throws a synthetic Error on any query call; the handler's
 * try/catch converts it to a 500 response, which is still `!== 404` for
 * valid routes. Routes do not reach the query step, so their behavior
 * is unaffected.
 */
export function makeMockAppContext(): AppContext {
  const mockSql = function () {
    throw new Error("Mock DB client — this test should not hit the DB");
  } as unknown as AppContext["sql"];

  // `handleRequest` uses `sql.begin(...)` inside createBooking/updateBooking.
  // Provide a stub that simply invokes the callback with the same mock
  // `sql` (so the callback itself throws) and propagates.
  (mockSql as unknown as {
    begin: (fn: (tx: unknown) => unknown) => Promise<unknown>;
  }).begin = async (fn) => {
    return await fn(mockSql);
  };

  // `sql.end()` is called during shutdown; make it a no-op.
  (mockSql as unknown as { end: () => Promise<void> }).end = async () => {};

  return { sql: mockSql };
}
