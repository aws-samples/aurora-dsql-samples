// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Integration tests for the Booking API (deno-postgres).
 *
 * These tests exercise the full CRUD flow against a real Aurora DSQL cluster
 * by calling `handleRequest` directly — no HTTP server is started. The tests
 * require `CLUSTER_ENDPOINT` and `CLUSTER_USER` environment variables to be
 * set; if either is missing the entire suite is skipped.
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
import { setupSchema, teardownSchema } from "../schema.ts";

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ctx: AppContext = {
  endpoint: ENDPOINT ?? "",
  user: USER ?? "",
};

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
// Schema setup / teardown
// ---------------------------------------------------------------------------

Deno.test({
  name: "integration: schema setup",
  ignore: skip,
  async fn() {
    await setupSchema({
      endpoint: ENDPOINT!,
      user: USER!,
      isAdmin: true,
    });
  },
});

// ---------------------------------------------------------------------------
// 1. Create a booking
// ---------------------------------------------------------------------------

Deno.test({
  name: "integration: POST /bookings — create a booking",
  ignore: skip,
  async fn() {
    const res = await handleRequest(
      makeRequest("POST", "/bookings", {
        resource_name: "Integration Test Room",
        start_time: "2025-09-01T09:00:00Z",
        end_time: "2025-09-01T10:00:00Z",
        booked_by: "integration-test",
      }),
      ctx,
    );

    assertEquals(res.status, 201);
    const body = await res.json();
    assertEquals(typeof body.id, "string");
    assertEquals(body.resource_name, "Integration Test Room");
    assertEquals(body.booked_by, "integration-test");
    bookingId = body.id;
  },
});

// ---------------------------------------------------------------------------
// 2. List bookings
// ---------------------------------------------------------------------------

Deno.test({
  name: "integration: GET /bookings — list includes created booking",
  ignore: skip,
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
  async fn() {
    const res = await handleRequest(
      makeRequest("GET", `/bookings/${bookingId}`),
      ctx,
    );

    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.id, bookingId);
    assertEquals(body.resource_name, "Integration Test Room");
  },
});

// ---------------------------------------------------------------------------
// 4. Update the booking
// ---------------------------------------------------------------------------

Deno.test({
  name: "integration: PUT /bookings/:id — update booking",
  ignore: skip,
  async fn() {
    const res = await handleRequest(
      makeRequest("PUT", `/bookings/${bookingId}`, {
        end_time: "2025-09-01T11:00:00Z",
        booked_by: "integration-updated",
      }),
      ctx,
    );

    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.id, bookingId);
    assertEquals(body.booked_by, "integration-updated");
  },
});

// ---------------------------------------------------------------------------
// 5. Overlap conflict
// ---------------------------------------------------------------------------

Deno.test({
  name: "integration: POST /bookings — overlap conflict returns 409",
  ignore: skip,
  async fn() {
    const res = await handleRequest(
      makeRequest("POST", "/bookings", {
        resource_name: "Integration Test Room",
        start_time: "2025-09-01T10:00:00Z",
        end_time: "2025-09-01T11:30:00Z",
        booked_by: "conflict-test",
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
  async fn() {
    const res = await handleRequest(
      makeRequest("GET", `/bookings/${bookingId}`),
      ctx,
    );

    assertEquals(res.status, 404);
  },
});

// ---------------------------------------------------------------------------
// Schema teardown
// ---------------------------------------------------------------------------

Deno.test({
  name: "integration: schema teardown",
  ignore: skip,
  async fn() {
    await teardownSchema({
      endpoint: ENDPOINT!,
      user: USER!,
      isAdmin: true,
    });
  },
});
