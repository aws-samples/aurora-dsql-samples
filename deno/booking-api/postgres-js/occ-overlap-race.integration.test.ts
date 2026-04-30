// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Concurrency integration tests for the Booking API (postgres.js).
 *
 * These tests verify what Aurora DSQL's optimistic concurrency control
 * (OCC) catches for the overlap-detection query in `createBooking`. OCC
 * is row-based — two transactions that touch disjoint rows aren't
 * forced to serialize, even if their SELECT predicates describe
 * logically overlapping ranges.
 *
 * Tests here codify the real guarantees:
 *
 *   1. **Identical-window race (strong guarantee).** N parallel CREATEs
 *      for the same resource and the exact same time window result in
 *      exactly one 201 and N-1 409s. OCC plus the application's SELECT-
 *      then-INSERT pattern handle this reliably because every
 *      transaction reads the same physical row set.
 *
 *   2. **Disjoint-but-overlapping-ranges race (consideration for
 *      concurrent writes).** Two CREATEs for the same resource with
 *      different-but-overlapping time windows MAY both succeed. This
 *      test codifies the behavior so future changes to the overlap
 *      query are measured against it.
 *
 * Like `test/integration.test.ts`, these tests require `CLUSTER_ENDPOINT`
 * and `CLUSTER_USER` environment variables. They are shared-cluster
 * safe — rows are scoped by a unique `booked_by` prefix and cleaned up
 * at the end.
 *
 * @module occ-overlap-race.integration.test
 */

import { assertEquals } from "@std/assert";
import { handleRequest, type AppContext } from "./handlers.ts";
import { createClient } from "./db.ts";
import { cleanupTestRows, setupSchema } from "./schema.ts";

// ---------------------------------------------------------------------------
// Environment gate
// ---------------------------------------------------------------------------

const ENDPOINT = Deno.env.get("CLUSTER_ENDPOINT");
const USER = Deno.env.get("CLUSTER_USER");

const skip = !ENDPOINT || !USER;

if (skip) {
  console.log(
    "Skipping concurrency tests: CLUSTER_ENDPOINT and CLUSTER_USER are required",
  );
}

// ---------------------------------------------------------------------------
// Test-scoped identifiers
// ---------------------------------------------------------------------------

const RUN_ID = `test-occ-race-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

const sql = skip
  ? (null as unknown as ReturnType<typeof createClient>)
  : createClient({
    endpoint: ENDPOINT!,
    user: USER!,
    max: 12,
  });

const ctx: AppContext = { sql };

function makeCreateRequest(
  resourceName: string,
  startTime: string,
  endTime: string,
  bookedBy: string,
): Request {
  return new Request("http://localhost/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      resource_name: resourceName,
      start_time: startTime,
      end_time: endTime,
      booked_by: bookedBy,
    }),
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

Deno.test({
  name: "occ-race: schema setup",
  ignore: skip,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await setupSchema({
      endpoint: ENDPOINT!,
      user: USER!,
    });
  },
});

// ---------------------------------------------------------------------------
// Test 1 — Identical-window race
// ---------------------------------------------------------------------------
//
// 10 parallel CREATEs for the same resource + identical time window.
// Expected: exactly one 201. The nine losers must be either:
//   - 409: the retry's re-SELECT found the winning booking (app-layer
//          overlap check fires), or
//   - 503: the OCC retry budget was exhausted before the winning INSERT
//          became visible (transient service-busy).
//
// A non-409/503/201 response (especially 500) indicates a real bug.
// ---------------------------------------------------------------------------

Deno.test({
  name:
    "occ-race: 10 parallel CREATEs with identical window → exactly one persists",
  ignore: skip,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const resource = `occ-race-identical-${crypto.randomUUID().slice(0, 8)}`;
    const start = "2025-10-01T09:00:00Z";
    const end = "2025-10-01T10:00:00Z";
    const N = 10;

    const requests = Array.from({ length: N }, (_, i) =>
      makeCreateRequest(resource, start, end, `${RUN_ID}-identical-user${i}`),
    );

    const responses = await Promise.all(
      requests.map((req) => handleRequest(req, ctx)),
    );

    const statuses = responses.map((r) => r.status);
    const created = statuses.filter((s) => s === 201).length;
    const expected = statuses.filter((s) => s === 409 || s === 503).length;
    const unexpected = statuses.filter(
      (s) => s !== 201 && s !== 409 && s !== 503,
    );

    // Drain response bodies so Deno doesn't warn about unused bodies.
    await Promise.all(responses.map((r) => r.text()));

    assertEquals(
      unexpected.length,
      0,
      `Unexpected status codes (expected only 201/409/503): ${JSON.stringify(
        statuses,
      )}`,
    );
    assertEquals(
      created,
      1,
      `Expected exactly 1 successful create, got ${created}: ${JSON.stringify(
        statuses,
      )}`,
    );
    assertEquals(
      expected,
      N - 1,
      `Expected ${
        N - 1
      } 409 or 503 responses, got ${expected}: ${JSON.stringify(statuses)}`,
    );
  },
});

// ---------------------------------------------------------------------------
// Test 2 — Disjoint-but-overlapping race (consideration for concurrent writes)
// ---------------------------------------------------------------------------
//
// Two parallel CREATEs with different-but-overlapping windows on the same
// resource. Each transaction's SELECT reads a DIFFERENT set of rows (both
// sets are empty at SELECT time), so row-based OCC does not force them to
// serialize. Both can succeed, producing a double-booking.
//
// This test codifies the behavior. For strict serialization of overlapping
// writes, use either (a) a coarser grouping key enforced via unique index,
// or (b) an application-level row lock via `SELECT ... FOR UPDATE` on a
// parent row. See README "Concurrency model — what's serialized and what
// isn't" for the recommended production patterns.
// ---------------------------------------------------------------------------

Deno.test({
  name:
    "occ-race: overlapping-but-distinct windows are not serialized by OCC",
  ignore: skip,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const resource = `occ-race-disjoint-${crypto.randomUUID().slice(0, 8)}`;

    const reqA = makeCreateRequest(
      resource,
      "2025-10-02T09:00:00Z",
      "2025-10-02T09:45:00Z",
      `${RUN_ID}-disjoint-A`,
    );
    const reqB = makeCreateRequest(
      resource,
      "2025-10-02T09:30:00Z",
      "2025-10-02T10:15:00Z",
      `${RUN_ID}-disjoint-B`,
    );

    const [resA, resB] = await Promise.all([
      handleRequest(reqA, ctx),
      handleRequest(reqB, ctx),
    ]);

    const statuses = [resA.status, resB.status].sort();
    await resA.text();
    await resB.text();

    // We don't assert a double-booking here — this is a race, and sometimes
    // one wins first (giving 201 + 409). What we DO assert is that the
    // server does not produce a 5xx. If this test starts flaking on 5xx,
    // it's a real bug in retry handling.
    const hasServerError = statuses.some((s) => s >= 500);
    assertEquals(
      hasServerError,
      false,
      `Server returned 5xx under concurrent overlap race: ${statuses.join(", ")}`,
    );

    // Valid outcomes:
    //   [201, 201] — race lost, both persisted (documented in README)
    //   [201, 409] — OCC happened to serialize them
    //   [409, 201] — same, different order
    // 400/404 etc. are bugs.
    const unexpected = statuses.filter((s) => s !== 201 && s !== 409);
    assertEquals(
      unexpected.length,
      0,
      `Only 201 / 409 are expected outcomes, got: ${statuses.join(", ")}`,
    );
  },
});

// ---------------------------------------------------------------------------
// Scoped cleanup
// ---------------------------------------------------------------------------

Deno.test({
  name: "occ-race: scoped cleanup",
  ignore: skip,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await cleanupTestRows(
      { endpoint: ENDPOINT!, user: USER! },
      RUN_ID,
    );
    await sql.end({ timeout: 5 });
  },
});
