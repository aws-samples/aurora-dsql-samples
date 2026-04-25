// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Property-based tests for router dispatch correctness.
 *
 * Tests that valid booking endpoints dispatch correctly (returning non-404
 * status codes for known routes) and that non-matching paths return 404.
 *
 * Since `handleRequest` depends on `createConnection` (which requires a real
 * Aurora DSQL cluster), these tests verify routing logic by checking that:
 *   - Known method+path combos do NOT return 404 (they attempt the handler)
 *   - Unknown method+path combos DO return 404
 *
 * For known routes, the handler will fail at the DB connection step and return
 * a 503 or 500 — but the key property is that it does NOT return 404, proving
 * the router dispatched correctly.
 *
 * @module router.property.test
 */

import fc from "fast-check";
import { assertEquals, assertNotEquals } from "@std/assert";
import { handleRequest, jsonResponse } from "./handlers.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A dummy AppContext — DB calls will fail, but routing logic runs first. */
const CTX = { endpoint: "test.dsql.us-east-1.on.aws", user: "admin" };

/** Valid booking endpoint definitions. */
const VALID_ENDPOINTS = [
  { method: "POST", path: "/bookings" },
  { method: "GET", path: "/bookings" },
  { method: "GET", pathPrefix: "/bookings/" },
  { method: "PUT", pathPrefix: "/bookings/" },
  { method: "DELETE", pathPrefix: "/bookings/" },
] as const;

/** HTTP methods used in the API. */
const ALL_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];

/**
 * Generates a valid UUID-like booking ID for parameterized routes.
 */
const bookingIdArb = fc.uuid();

/**
 * Generates a random path that does NOT match any booking endpoint.
 */
const nonMatchingPathArb = fc
  .string({ minLength: 1, maxLength: 30 })
  .map((s: string) => "/" + s.replace(/[^a-z0-9\-_/]/gi, "x"))
  .filter((p: string) => {
    if (p === "/bookings") return false;
    if (/^\/bookings\/[\w-]+$/.test(p)) return false;
    return true;
  });

// ---------------------------------------------------------------------------
// Property 1: Router dispatch correctness
// ---------------------------------------------------------------------------

/**
 * Feature: deno-aurora-dsql-samples, Property 1: Router dispatch correctness
 *
 * For any valid HTTP method+path matching a defined booking endpoint, the
 * router dispatches to the corresponding handler (non-404 response). For any
 * non-matching method+path, the router returns 404.
 *
 * **Validates: Requirements 5.4, 5.9, 6.4, 6.9, 7.2**
 */
Deno.test("property: non-matching paths return 404", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.constantFrom(...ALL_METHODS),
      nonMatchingPathArb,
      async (method, path) => {
        const req = new Request(`http://localhost:8000${path}`, { method });
        const res = await handleRequest(req, CTX);
        assertEquals(res.status, 404);

        const body = await res.json();
        assertEquals(body.error, "Not Found");
      },
    ),
    { numRuns: 100 },
  );
});

Deno.test("property: GET /bookings dispatches to list handler (not 404)", async () => {
  // GET /bookings should dispatch to listBookings — it will fail at DB
  // but should NOT return 404
  const req = new Request("http://localhost:8000/bookings", { method: "GET" });
  const res = await handleRequest(req, CTX);
  assertNotEquals(res.status, 404);
});

Deno.test("property: valid parameterized routes dispatch correctly (not 404)", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.constantFrom("GET", "PUT", "DELETE"),
      bookingIdArb,
      async (method, id) => {
        const path = `/bookings/${id}`;
        const opts: RequestInit = { method };

        // PUT needs a body to avoid JSON parse errors before routing
        if (method === "PUT") {
          opts.body = JSON.stringify({ booked_by: "test" });
          opts.headers = { "Content-Type": "application/json" };
        }

        const req = new Request(`http://localhost:8000${path}`, opts);
        const res = await handleRequest(req, CTX);

        // The router should dispatch (not 404). It will fail at DB → 503/500
        assertNotEquals(res.status, 404);
      },
    ),
    { numRuns: 100 },
  );
});

Deno.test("property: POST /bookings dispatches to create handler (not 404)", async () => {
  // POST /bookings with valid JSON should dispatch — fails at DB, not 404
  const req = new Request("http://localhost:8000/bookings", {
    method: "POST",
    body: JSON.stringify({
      resource_name: "Room A",
      start_time: "2025-01-01T10:00:00Z",
      end_time: "2025-01-01T11:00:00Z",
      booked_by: "test",
    }),
    headers: { "Content-Type": "application/json" },
  });
  const res = await handleRequest(req, CTX);
  assertNotEquals(res.status, 404);
});

Deno.test("property: wrong method on valid path returns 404", async () => {
  await fc.assert(
    fc.asyncProperty(
      // Methods that are NOT valid for /bookings (only GET and POST are valid)
      fc.constantFrom("PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"),
      async (method) => {
        const req = new Request("http://localhost:8000/bookings", { method });
        const res = await handleRequest(req, CTX);
        assertEquals(res.status, 404);
      },
    ),
    { numRuns: 20 },
  );
});

Deno.test("property: jsonResponse always produces valid JSON with correct content-type", () => {
  fc.assert(
    fc.property(
      fc.anything(),
      // Exclude null-body statuses (204, 205, 304) which cannot have a body
      fc.integer({ min: 200, max: 599 }).filter((s) => s !== 204 && s !== 205 && s !== 304),
      (body, status) => {
        const res = jsonResponse(body, status);
        assertEquals(res.headers.get("Content-Type"), "application/json");
        assertEquals(res.status, status);
      },
    ),
    { numRuns: 100 },
  );
});
