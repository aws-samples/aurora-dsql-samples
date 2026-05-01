// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

/**
 * Integration tests for the Booking API (deno-postgres).
 *
 * These tests exercise the full CRUD flow against a real Aurora DSQL cluster
 * by calling `handleRequest` directly — no HTTP server is started. The tests
 * require `CLUSTER_ENDPOINT` and `CLUSTER_USER` environment variables to be
 * set; if either is missing the entire suite is skipped.
 *
 * Shared-cluster safety:
 *   - Setup uses `CREATE TABLE IF NOT EXISTS` and is idempotent.
 *   - Teardown uses `cleanupTestRows` with a run-scoped `booked_by` prefix
 *     instead of `DROP TABLE`. The table survives the test run, so a parallel
 *     booking-API server or another test suite on the same cluster is
 *     unaffected.
 *
 * The suite runs the following sequence:
 *   1. Create a booking
 *   2. List bookings (verify it's present)
 *   3. Get booking by ID
 *   4. Update the booking
 *   5. Test overlap conflict (409)
 *   6. Delete the booking
 *   7. Verify deleted (404)
 *
 * @module integration.test
 */

import { assertEquals } from "@std/assert";
import { handleRequest, type AppContext } from "../handlers.ts";
import { createClient } from "../db.ts";
import { cleanupTestRows, setupSchema } from "../schema.ts";

// ---------------------------------------------------------------------------
// Environment gate — skip if cluster credentials are not configured
// ---------------------------------------------------------------------------

const ENDPOINT = Deno.env.get("CLUSTER_ENDPOINT");
const USER = Deno.env.get("CLUSTER_USER");

const skip = !ENDPOINT || !USER;

if (skip) {
  console.log(
    "Skipping integration tests: CLUSTER_ENDPOINT and CLUSTER_USER are required",
  );
}

// When !skip we've proven both env vars are defined. Narrow once so downstream
// sites reference a typed `config` object instead of sprinkling non-null
// assertions. When skip, tests are all gated by `ignore: skip` so `config`
// is never read at runtime; the assertions below are safe.
const config = { endpoint: ENDPOINT!, user: USER! };

// ---------------------------------------------------------------------------
// Test-scoped identifiers — used to clean up only our rows on shared clusters
// ---------------------------------------------------------------------------

/** Unique-per-run prefix so parallel test runs don't collide. */
const RUN_ID = `test-integration-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

/** Also unique-per-run so overlap detection does not trip on other tests. */
const RESOURCE_NAME = `integration-room-${crypto.randomUUID().slice(0, 8)}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sql: ReturnType<typeof createClient> | null = skip
  ? null
  : createClient({ ...config, max: 2 });

const ctx: AppContext = { sql: sql as ReturnType<typeof createClient> };

/** Build a Request targeting the handler directly (no real server). */
function makeRequest(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Request {
  const init: RequestInit = { method };
  if (body) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return new Request(`http://localhost${path}`, init);
}

// Shared state across ordered test steps
let bookingId: string;

// ---------------------------------------------------------------------------
// Schema setup (idempotent on shared clusters)
// ---------------------------------------------------------------------------

Deno.test({
  name: "integration: schema setup",
  ignore: skip,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await setupSchema(config);
  },
});

// ---------------------------------------------------------------------------
// 1. Create a booking
// ---------------------------------------------------------------------------

Deno.test({
  name: "integration: POST /bookings — create a booking",
  ignore: skip,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const res = await handleRequest(
      makeRequest("POST", "/bookings", {
        resource_name: RESOURCE_NAME,
        start_time: "2025-09-01T09:00:00Z",
        end_time: "2025-09-01T10:00:00Z",
        booked_by: `${RUN_ID}-creator`,
      }),
      ctx,
    );

    assertEquals(res.status, 201);
    const body = await res.json();
    assertEquals(typeof body.id, "string");
    assertEquals(body.resource_name, RESOURCE_NAME);
    assertEquals(body.booked_by, `${RUN_ID}-creator`);
    bookingId = body.id;
  },
});

// ---------------------------------------------------------------------------
// 2. List bookings
// ---------------------------------------------------------------------------

Deno.test({
  name: "integration: GET /bookings — list includes created booking",
  ignore: skip,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const res = await handleRequest(makeRequest("GET", "/bookings"), ctx);

    assertEquals(res.status, 200);
    const body = await res.json();
    const found = body.some(
      (b: Record<string, unknown>) => b.id === bookingId,
    );
    assertEquals(found, true, "Created booking should appear in list");
  },
});

// ---------------------------------------------------------------------------
// 3. Get booking by ID
// ---------------------------------------------------------------------------

Deno.test({
  name: "integration: GET /bookings/:id — fetch by ID",
  ignore: skip,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const res = await handleRequest(
      makeRequest("GET", `/bookings/${bookingId}`),
      ctx,
    );

    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.id, bookingId);
    assertEquals(body.resource_name, RESOURCE_NAME);
  },
});

// ---------------------------------------------------------------------------
// 4. Update the booking
// ---------------------------------------------------------------------------

Deno.test({
  name: "integration: PUT /bookings/:id — update booking",
  ignore: skip,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const res = await handleRequest(
      makeRequest("PUT", `/bookings/${bookingId}`, {
        end_time: "2025-09-01T11:00:00Z",
        booked_by: `${RUN_ID}-updater`,
      }),
      ctx,
    );

    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.id, bookingId);
    assertEquals(body.booked_by, `${RUN_ID}-updater`);
  },
});

// ---------------------------------------------------------------------------
// 5. Overlap conflict
// ---------------------------------------------------------------------------

Deno.test({
  name: "integration: POST /bookings — overlap conflict returns 409",
  ignore: skip,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const res = await handleRequest(
      makeRequest("POST", "/bookings", {
        resource_name: RESOURCE_NAME,
        start_time: "2025-09-01T10:00:00Z",
        end_time: "2025-09-01T11:30:00Z",
        booked_by: `${RUN_ID}-conflict`,
      }),
      ctx,
    );

    assertEquals(res.status, 409);
    const body = await res.json();
    assertEquals(typeof body.error, "string");
    assertEquals(body.conflicting_id, bookingId);
  },
});

// ---------------------------------------------------------------------------
// 6. Delete the booking
// ---------------------------------------------------------------------------

Deno.test({
  name: "integration: DELETE /bookings/:id — delete booking",
  ignore: skip,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const res = await handleRequest(
      makeRequest("DELETE", `/bookings/${bookingId}`),
      ctx,
    );

    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.id, bookingId);
  },
});

// ---------------------------------------------------------------------------
// 7. Verify deleted
// ---------------------------------------------------------------------------

Deno.test({
  name: "integration: GET /bookings/:id — verify deleted returns 404",
  ignore: skip,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const res = await handleRequest(
      makeRequest("GET", `/bookings/${bookingId}`),
      ctx,
    );

    assertEquals(res.status, 404);
  },
});

// ---------------------------------------------------------------------------
// Scoped cleanup — deletes only rows tagged with our run id.
// The table, index, and role survive so a concurrent booking-API server or
// another test run on the same cluster is unaffected.
// ---------------------------------------------------------------------------

Deno.test({
  name: "integration: scoped cleanup",
  ignore: skip,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await cleanupTestRows(
      config,
      RUN_ID,
    );
    // `sql` is non-null when this test runs (gated by `ignore: skip`).
    await sql!.end({ timeout: 5 });
  },
});
