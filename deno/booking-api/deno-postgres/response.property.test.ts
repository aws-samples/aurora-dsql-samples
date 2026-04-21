// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Property-based tests for JSON response format.
 *
 * Verifies that for any HTTP request to any booking API path, the response
 * always has `Content-Type: application/json` and a valid JSON body.
 *
 * Since DB-dependent handlers will fail at connection time, they return
 * error JSON (503/500). The routing layer catches all errors and returns
 * JSON. This test verifies that invariant holds across all paths and methods.
 *
 * @module response.property.test
 */

import fc from "fast-check";
import { assertEquals } from "@std/assert";
import { handleRequest } from "./handlers.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CTX = { endpoint: "test.dsql.us-east-1.on.aws", user: "admin" };

const ALL_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];

/**
 * Generates random URL paths — both valid booking paths and random strings.
 */
const pathArb = fc.oneof(
  fc.constant("/bookings"),
  fc.constant("/bookings/test-id-123"),
  fc.constant("/"),
  fc.constant("/unknown"),
  fc.string({ minLength: 1, maxLength: 40 })
    .map((s: string) => "/" + s.replace(/[^a-z0-9\-_/]/gi, "x")),
);

// ---------------------------------------------------------------------------
// Property 3: JSON response format
// ---------------------------------------------------------------------------

/**
 * Feature: deno-aurora-dsql-samples, Property 3: JSON response format
 *
 * For any HTTP request to any booking API endpoint, the response has
 * Content-Type: application/json and a valid JSON body.
 *
 * **Validates: Requirements 7.5**
 */
Deno.test("property: all responses have application/json content-type and valid JSON body", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.constantFrom(...ALL_METHODS),
      pathArb,
      async (method, path) => {
        const opts: RequestInit = { method };

        // POST and PUT need a body to avoid hanging on req.json()
        if (method === "POST" || method === "PUT") {
          opts.body = JSON.stringify({ resource_name: "test" });
          opts.headers = { "Content-Type": "application/json" };
        }

        const req = new Request(`http://localhost:8000${path}`, opts);
        const res = await handleRequest(req, CTX);

        // Content-Type must be application/json
        assertEquals(
          res.headers.get("Content-Type"),
          "application/json",
        );

        // Body must be valid JSON (JSON.parse should not throw)
        const text = await res.text();
        JSON.parse(text); // throws if invalid JSON
      },
    ),
    { numRuns: 100 },
  );
});
